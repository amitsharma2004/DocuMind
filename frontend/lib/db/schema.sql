-- Business Document Intelligence — Postgres Schema
-- Compatible with Supabase (uses standard Postgres features only).

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- documents: tracks every uploaded file and its ingestion status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace     TEXT NOT NULL,         -- Pinecone namespace (user/session ID)
  filename      TEXT NOT NULL,         -- Original filename shown in citations
  file_size     BIGINT,                -- Bytes
  mime_type     TEXT,
  storage_path  TEXT,                  -- S3 / Supabase Storage path
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  chunks_created INT DEFAULT 0,
  error         TEXT,                  -- Error message if status = 'failed'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_namespace ON documents (namespace);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents (status);

-- ---------------------------------------------------------------------------
-- chat_history: full conversation history (all turns, all sessions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace     TEXT NOT NULL,         -- Same namespace as documents
  session_id    TEXT NOT NULL,         -- Groups messages into a conversation
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  confidence    FLOAT,                 -- Max similarity score (assistant messages)
  is_grounded   BOOLEAN,              -- false when confidence guard fired
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_namespace   ON chat_history (namespace);
CREATE INDEX IF NOT EXISTS idx_chat_session     ON chat_history (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_created_at  ON chat_history (created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_documents_updated_at ON documents;
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
