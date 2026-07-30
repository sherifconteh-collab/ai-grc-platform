-- Migration 133: RBAC document import for AI-assisted access governance
--
-- Why: organizations that already maintain their own RBAC documentation --
-- role definition spreadsheets, separation-of-duties matrices, roles &
-- responsibilities documents -- need a way to bring that material into the
-- access governance module (migration 132) and have AI analyze it: extract
-- the documented roles and duties, map them to the platform's permission
-- catalog, detect SoD conflicts, and propose platform roles / SoD rules that
-- an administrator can then create through the existing (guarded) roles and
-- sod_rules APIs. Only the extracted text is retained -- the uploaded file
-- itself is processed in memory and discarded, so there is no file-serving
-- surface or retention obligation for the original document.
-- Ported from the sibling ControlWeaver-Pro repo's access governance module.

CREATE TABLE IF NOT EXISTS rbac_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SECURITY: multi-tenant isolation -- every query filters organization_id.
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT,
  document_type TEXT NOT NULL DEFAULT 'other'
    CHECK (document_type IN ('roles_matrix', 'sod_matrix', 'roles_responsibilities', 'other')),
  extracted_text TEXT NOT NULL,
  -- Last AI analysis result (schema-validated rbac_analysis output),
  -- persisted explicitly by the reviewing administrator
  analysis JSONB,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_documents_org ON rbac_documents (organization_id, created_at DESC);

SELECT 'Migration 133 completed.' AS result;
