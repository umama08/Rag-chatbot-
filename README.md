# 🤖 MDN JavaScript RAG Chatbot

A **Retrieval-Augmented Generation (RAG)** chatbot that answers JavaScript questions using content scraped directly from [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript). Instead of relying on a language model's general training data, every answer is grounded in real MDN documentation — and the bot will tell you honestly if a question falls outside what it knows.

---

## How It Works

The project is a four-stage pipeline followed by a live Q&A interface:

```
MDN Web Docs
     │
     ▼
1. scraper.py        – Crawls up to 50 MDN JavaScript pages, respects robots.txt,
     │                 extracts clean text, saves → scraped_data.json
     ▼
2. chunker.py        – Splits each page into overlapping ~500-token chunks
     │                 (80-token overlap, sentence-boundary splits) → chunks.json
     ▼
3. embed_and_index.py – Embeds every chunk with all-mpnet-base-v2 (768-dim vectors),
     │                  bulk-inserts into Postgres + builds an HNSW cosine index
     ▼
4. app.py (FastAPI)  – /ask endpoint: embeds the question, retrieves the top-5
     │                  chunks by cosine similarity, calls Groq LLM with the
     │                  retrieved context, returns a plain-language answer + sources
     ▼
5. chat-ui (React/Vite) – Browser UI for asking questions and reading answers
```

> **Scope notice:** The bot only answers from the scraped MDN content. If a question is outside that scope — or the best-matching chunk similarity is below 0.5 — it will say so rather than hallucinate.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Scraping** | Python · `requests` · `BeautifulSoup4` |
| **Chunking** | Pure Python (sentence-boundary splitting, no extra deps) |
| **Embeddings** | `sentence-transformers` — `all-mpnet-base-v2` (768-dim) |
| **Vector DB** | PostgreSQL 16 + `pgvector` (HNSW index, cosine distance) |
| **Backend API** | FastAPI · Uvicorn · `psycopg2-binary` · `python-dotenv` |
| **LLM** | [Groq API](https://console.groq.com) via the `openai` client |
| **Frontend** | React 18 · Vite · plain CSS |
| **Container** | Docker Compose (`pgvector/pgvector:pg16` image) |

---

## Project Structure

```
RAG chatbot/
├── app.py                  # FastAPI backend — /ask endpoint
├── scraper.py              # MDN web scraper
├── chunker.py              # Text chunking with overlap
├── embed_and_index.py      # Embedding generation + Postgres ingestion
├── schema.sql              # DB schema (auto-run by Docker on first start)
├── docker-compose.yml      # Postgres + pgvector container
├── requirements.txt        # Python dependencies (pinned)
├── .env.example            # Environment variable template
├── scraped_data.json       # Output of scraper.py  (generated)
├── chunks.json             # Output of chunker.py  (generated)
└── chat-ui/                # React frontend
    ├── src/
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Setup & Running

### Prerequisites

- **Docker Desktop** (for Postgres)
- **Python 3.10+**
- **Node.js 18+** and npm

---

### 1 — Start the Database

```bash
docker compose up -d
```

This starts a `pgvector/pgvector:pg16` container named `rag_postgres` on port **5432**, creates the `rag_kb` database, and automatically applies `schema.sql` (which enables the `vector` extension and creates the `chunks` table).

---

### 2 — Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```ini
# Get your free API key at https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key_here
GROK_MODEL=openai/gpt-oss-20b

# Must match docker-compose.yml defaults (or your own Postgres instance)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rag_kb
DB_USER=rag
DB_PASSWORD=rag
```

---

### 3 — Install Python Dependencies

```bash
pip install -r requirements.txt
```

---

### 4 — Run the Data Pipeline

Run these three scripts **once** to populate the database. Subsequent restarts of the API server do not need them again unless you want to re-scrape.

```bash
# Step 1 – Scrape up to 50 MDN JavaScript pages (~1 min, rate-limited to 1 req/s)
python scraper.py

# Step 2 – Chunk the scraped text into overlapping segments
python chunker.py

# Step 3 – Embed chunks and load them into Postgres (downloads the model on first run)
python embed_and_index.py
```

---

### 5 — Start the Backend API

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`. You can test it quickly with:

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the difference between let and var?"}'
```

---

### 6 — Start the Frontend

```bash
cd chat-ui
npm install      # first time only
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## API Reference

### `POST /ask`

**Request body:**

```json
{
  "question": "How does async/await work in JavaScript?",
  "history": [
    { "role": "user",      "content": "What is a Promise?" },
    { "role": "assistant", "content": "A Promise is..." }
  ]
}
```

`history` is optional. When provided, the last user message is prepended to the search query for better contextual retrieval.

**Response:**

```json
{
  "answer": "Async/await is syntactic sugar built on top of Promises...",
  "sources": [
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function"
  ]
}
```

If no chunk scores above a **0.5 cosine similarity** threshold the bot returns:
```json
{ "answer": "I don't have enough information to answer that.", "sources": [] }
```

---

## Notes

- The embedding model (`all-mpnet-base-v2`) is downloaded automatically by `sentence-transformers` on first use (~420 MB).
- The HNSW index is built automatically by `embed_and_index.py` after insertion; approximate nearest-neighbour queries are fast even at scale.
- Re-running `embed_and_index.py` truncates the `chunks` table before re-inserting, so it is safe to run multiple times.
