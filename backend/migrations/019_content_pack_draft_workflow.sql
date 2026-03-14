-- Migration 019: Content pack draft workflow
-- Adds upload/parse/attestation/review lifecycle before importing licensed content packs.

CREATE TABLE IF NOT EXISTS organization_content_pack_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_code VARCHAR(100) NOT NULL,
  pack_name VARCHAR(255),
  pack_version VARCHAR(100),
  source_vendor VARCHAR(255),
  license_reference TEXT,

  report_file_name TEXT NOT NULL,
  report_mime_type VARCHAR(255),
  report_size_bytes BIGINT,
  report_sha256 VARCHAR(64) NOT NULL,

  extracted_text TEXT,
  extracted_char_count INTEGER NOT NULL DEFAULT 0,
  extracted_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  parse_summary JSONB NOT NULL DEFAULT '{}'::jsonb,

  ai_provider VARCHAR(50),
  ai_model VARCHAR(100),
  draft_pack JSONB NOT NULL DEFAULT '{}'::jsonb,

  attestation_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  attestation_statement TEXT,
  attested_by UUID REFERENCES users(id),
  attested_at TIMESTAMP,

  review_required BOOLEAN NOT NULL DEFAULT FALSE,
  review_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
  review_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,

  imported_pack_id UUID REFERENCES organization_content_packs(id),
  imported_at TIMESTAMP,

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_org_content_pack_draft_review_status
    CHECK (review_status IN ('not_required', 'pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_org_content_pack_drafts_org_created
ON organization_content_pack_drafts (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_content_pack_drafts_review
ON organization_content_pack_drafts (organization_id, review_status, review_required);

CREATE INDEX IF NOT EXISTS idx_org_content_pack_drafts_framework
ON organization_content_pack_drafts (organization_id, framework_code);

SELECT 'Migration 019 completed.' AS result;
