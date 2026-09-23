import os
import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from pgvector.psycopg2 import register_vector
from openai import OpenAI

# Load environment variables from .env file (does nothing if file is absent)
load_dotenv()

# ── Database ──────────────────────────────────────────────────────────────────
_DB_HOST = os.environ.get("DB_HOST", "localhost")
_DB_PORT = os.environ.get("DB_PORT", "5432")
_DB_NAME = os.environ.get("DB_NAME", "rag_kb")
_DB_USER = os.environ.get("DB_USER", "rag")
_DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_URI = f"postgresql://{_DB_USER}:{_DB_PASSWORD}@{_DB_HOST}:{_DB_PORT}/{_DB_NAME}"

# ── LLM (Groq) ────────────────────────────────────────────────────────────────
MODEL_NAME = "all-mpnet-base-v2"
GROK_BASE_URL = "https://api.groq.com/openai/v1"
GROK_MODEL = os.environ.get("GROK_MODEL", "openai/gpt-oss-20b")

_GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or os.environ.get("GROK_API_KEY")
if not _GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is not set. "
        "Add it to your .env file or set it as an environment variable."
    )

app = FastAPI(title="RAG Chatbot API")

# Allow requests from the React dev server (and any localhost port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize embedding model globally
embedding_model = SentenceTransformer(MODEL_NAME)

class QuestionRequest(BaseModel):
    question: str
    history: list[dict] = []

@app.post("/ask")
def ask(request: QuestionRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question field cannot be empty.")

    # 1. Prepare search query with context
    search_query = question
    if request.history:
        last_user_msg = next((msg["content"] for msg in reversed(request.history) if msg.get("role") == "user"), "")
        if last_user_msg:
            search_query = f"{last_user_msg} {question}"

    # Embed the search query
    question_embedding = embedding_model.encode(search_query).tolist()

    # 2. Connect to Postgres & query 5 nearest neighbors by cosine distance
    conn = None
    try:
        conn = psycopg2.connect(DB_URI)
        register_vector(conn)
        cur = conn.cursor()

        query = """
            SELECT source_url, title, content, 1 - (embedding <=> %s::vector) AS similarity
            FROM chunks
            ORDER BY embedding <=> %s::vector
            LIMIT 5;
        """
        cur.execute(query, (question_embedding, question_embedding))
        rows = cur.fetchall()
        cur.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        if conn:
            conn.close()

    if not rows:
        return {
            "answer": "I don't have enough information to answer that.",
            "sources": []
        }

    # 3. Check if best match similarity is below 0.5
    best_similarity = rows[0][3]
    if best_similarity < 0.5:
        return {
            "answer": "I don't have enough information to answer that.",
            "sources": []
        }

    # 4. Extract retrieved chunks content & unique source URLs
    retrieved_chunks = []
    sources = []
    for row in rows:
        source_url, title, content, similarity = row
        retrieved_chunks.append(f"Title: {title}\nURL: {source_url}\nContent: {content}")
        if source_url and source_url not in sources:
            sources.append(source_url)

    context_text = "\n\n---\n\n".join(retrieved_chunks)

    # 5. Connect to LLM API (Groq)
    client = OpenAI(
        api_key=_GROQ_API_KEY,
        base_url=GROK_BASE_URL
    )

    system_prompt = (
        "You are a helpful, conversational teacher answering questions based strictly on the provided MDN document chunks.\n"
        "Follow these rules:\n"
        "1. Base every answer STRICTLY on the provided context. Do not add outside knowledge, but DO synthesize the information in your own words rather than copying it verbatim.\n"
        "2. Write in a natural, plain-language, conversational tone as if explaining a concept to a beginner. Do NOT use dense technical jargon (like 'temporal dead zone' or 'immutable binding') without immediately explaining it in simple terms.\n"
        "3. Keep your default answer very brief (1 short paragraph of 3-4 sentences). Do NOT output bulleted lists, tables, or technical breakdowns unless the user explicitly asks for 'detail' or 'all differences'.\n"
        "4. If the user asks a comparative question (e.g., 'difference between X and Y'), give a simple, high-level summary paragraph. Avoid exhaustively listing every technical difference unless requested.\n"
        "5. If the context does not contain enough information to answer the question, say so."
    )

    user_prompt = f"Context:\n{context_text}\n\nQuestion: {question}"

    api_messages = [{"role": "system", "content": system_prompt}]
    for msg in request.history:
        api_messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    api_messages.append({"role": "user", "content": user_prompt})

    try:
        response = client.chat.completions.create(
            model=GROK_MODEL,
            messages=api_messages,
            temperature=0.2
        )
        answer_text = response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API error: {str(e)}")

    return {
        "answer": answer_text,
        "sources": sources
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
