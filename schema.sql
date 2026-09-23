CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chunks (
    id BIGSERIAL PRIMARY KEY,
    source_url TEXT,
    title TEXT,
    content TEXT,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
