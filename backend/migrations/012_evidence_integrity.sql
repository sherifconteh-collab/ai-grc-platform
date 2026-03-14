-- Migration 012: Evidence integrity metadata

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS integrity_hash_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS evidence_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retention_until DATE,
  ADD COLUMN IF NOT EXISTS integrity_verified_at TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evidence_version_positive'
  ) THEN
    ALTER TABLE evidence
      ADD CONSTRAINT evidence_version_positive CHECK (evidence_version >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidence_retention_until
ON evidence (retention_until);

CREATE INDEX IF NOT EXISTS idx_evidence_integrity_hash
ON evidence (integrity_hash_sha256);

SELECT 'Migration 012 completed.' as result;
