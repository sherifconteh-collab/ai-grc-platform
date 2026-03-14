-- Migration 084: Organization RAG Document Store
-- Vector-based Retrieval-Augmented Generation for organization documents.
-- Stores chunked document text with pgvector embeddings so AI analyses
-- can retrieve semantically relevant context from the org's own evidence,
-- policies, and uploaded documents.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        CREATE EXTENSION IF NOT EXISTS vector;

        -- Main table: one row per document chunk with pgvector embedding
        EXECUTE $sql$
            CREATE TABLE IF NOT EXISTS org_document_embeddings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                source_type VARCHAR(50) NOT NULL DEFAULT 'document',
                source_id UUID,
                source_name VARCHAR(500),
                chunk_index INTEGER NOT NULL DEFAULT 0,
                chunk_text TEXT NOT NULL,
                embedding vector(1536),
                token_count INTEGER,
                metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        $sql$;
    ELSE
        RAISE WARNING 'pgvector extension not available; creating fallback schema for org_document_embeddings';

        -- Fallback table keeps migration non-blocking when pgvector is not installed.
        -- Embeddings are stored as JSONB until pgvector becomes available.
        CREATE TABLE IF NOT EXISTS org_document_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            source_type VARCHAR(50) NOT NULL DEFAULT 'document',
            source_id UUID,
            source_name VARCHAR(500),
            chunk_index INTEGER NOT NULL DEFAULT 0,
            chunk_text TEXT NOT NULL,
            embedding JSONB,
            token_count INTEGER,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    END IF;
END $$;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_org_doc_emb_org
    ON org_document_embeddings(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_doc_emb_org_source
    ON org_document_embeddings(organization_id, source_type);
CREATE INDEX IF NOT EXISTS idx_org_doc_emb_source_id
    ON org_document_embeddings(source_id);
CREATE INDEX IF NOT EXISTS idx_org_doc_emb_created
    ON org_document_embeddings(created_at DESC);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'org_document_embeddings'
          AND column_name = 'embedding'
          AND udt_name = 'vector'
    ) THEN
        -- HNSW index for fast approximate nearest-neighbor search on embeddings
        -- cosine distance is standard for text embeddings (OpenAI, Gemini, etc.)
        EXECUTE $sql$
            CREATE INDEX IF NOT EXISTS idx_org_doc_emb_vector
                ON org_document_embeddings
                USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
        $sql$;
    ELSE
        RAISE WARNING 'Skipping idx_org_doc_emb_vector because embedding column is not pgvector type';
    END IF;
END $$;

-- Tracking table: records which documents have been indexed so we can
-- detect stale / re-index needs without re-processing unchanged files.
CREATE TABLE IF NOT EXISTS org_rag_index_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL,
    source_id UUID,
    source_name VARCHAR(500),
    chunk_count INTEGER DEFAULT 0,
    file_hash VARCHAR(128),
    status VARCHAR(20) DEFAULT 'indexed',
    indexed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_org_rag_status_org
    ON org_rag_index_status(organization_id);

COMMENT ON TABLE org_document_embeddings IS 'Chunked document text with vector embeddings for RAG retrieval — one row per chunk';
COMMENT ON COLUMN org_document_embeddings.source_type IS 'Type of source document: document, evidence, policy, control_narrative';
COMMENT ON COLUMN org_document_embeddings.source_id IS 'FK to the source record (evidence.id, policy.id, etc.)';
COMMENT ON COLUMN org_document_embeddings.embedding IS 'Vector embedding when pgvector is available, JSONB fallback otherwise';
COMMENT ON COLUMN org_document_embeddings.chunk_index IS 'Position of this chunk within the source document (0-based)';
COMMENT ON TABLE org_rag_index_status IS 'Tracks which documents have been indexed for RAG and their current status';
