import json
import os
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from pgvector.psycopg2 import register_vector
from sentence_transformers import SentenceTransformer

# Load environment variables from .env file
load_dotenv()

_DB_HOST = os.environ.get("DB_HOST", "localhost")
_DB_PORT = os.environ.get("DB_PORT", "5432")
_DB_NAME = os.environ.get("DB_NAME", "rag_kb")
_DB_USER = os.environ.get("DB_USER", "rag")
_DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_URI = f"postgresql://{_DB_USER}:{_DB_PASSWORD}@{_DB_HOST}:{_DB_PORT}/{_DB_NAME}"

MODEL_NAME = "all-mpnet-base-v2"
CHUNKS_FILE = "chunks.json"
BATCH_SIZE = 32

def main():
    print(f"Loading sentence-transformers model '{MODEL_NAME}'...", flush=True)
    model = SentenceTransformer(MODEL_NAME)
    
    print(f"Loading chunks from {CHUNKS_FILE}...", flush=True)
    with open(CHUNKS_FILE, "r", encoding="utf-8") as f:
        chunks = json.load(f)
        
    print(f"Total chunks to process: {len(chunks)}", flush=True)
    
    # Connect to Postgres & register vector extension type
    print("Connecting to PostgreSQL database...", flush=True)
    conn = psycopg2.connect(DB_URI)
    conn.autocommit = False
    cur = conn.cursor()
    
    # Register vector type with psycopg2 connection
    register_vector(conn)
    
    # Clean/truncate table to avoid duplicate rows on re-runs
    print("Clearing existing records in 'chunks' table...", flush=True)
    cur.execute("TRUNCATE TABLE chunks;")
    conn.commit()
    
    insert_records = []
    
    print("Generating embeddings in batches...", flush=True)
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        contents = [c["content"] for c in batch]
        
        # Generate embeddings (numpy array)
        embeddings = model.encode(contents, show_progress_bar=False)
        
        for chunk, emb in zip(batch, embeddings):
            insert_records.append((
                chunk.get("url", ""),
                chunk.get("title", ""),
                chunk.get("content", ""),
                emb.tolist()  # Vector array
            ))
            
        print(f"Processed batch {i // BATCH_SIZE + 1}/{(len(chunks) + BATCH_SIZE - 1) // BATCH_SIZE}", flush=True)
        
    print(f"Bulk-inserting {len(insert_records)} records into Postgres 'chunks' table...", flush=True)
    insert_query = """
        INSERT INTO chunks (source_url, title, content, embedding)
        VALUES %s
    """
    execute_values(
        cur, 
        insert_query, 
        insert_records, 
        template="(%s, %s, %s, %s::vector)", 
        page_size=100
    )
    conn.commit()
    print("Insert complete and committed.", flush=True)
    
    # Create HNSW index using vector_cosine_ops if not existing
    print("Creating HNSW index on embedding column...", flush=True)
    hnsw_index_query = """
        CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx 
        ON chunks USING hnsw (embedding vector_cosine_ops);
    """
    cur.execute(hnsw_index_query)
    conn.commit()
    print("HNSW index successfully created/verified.", flush=True)
    
    cur.close()
    conn.close()
    print("Database connection closed. All tasks completed successfully.", flush=True)

if __name__ == "__main__":
    main()
