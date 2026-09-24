-- Migration 144: Real evidence version history (issue #570)
--
-- README claims "evidence management with versioning". What existed was an
-- integer counter: PUT /evidence/:id incremented `evidence.evidence_version`
-- and overwrote the row in place. There was no history table, so a prior
-- version's file, hash, or PII classification could not be retrieved — the
-- number went up but nothing was kept. For a platform whose whole purpose is
-- producing defensible audit evidence, that is the wrong shape:
--
--   1. An auditor examining a control at a point in time needs the evidence as
--      it stood then, not whatever replaced it since.
--   2. Integrity verification only covered the current file. A replaced file's
--      hash was lost, so "this evidence has not been altered" could not be
--      demonstrated across a re-upload.
--   3. Re-classifying evidence (say from pii_classification 'low' to 'high')
--      destroyed the record of what it had been classified as while it was
--      being relied on.
--
-- Each row is an immutable snapshot of the evidence row as it stood *before*
-- an update replaced it. The live `evidence` row remains the current version;
-- this table holds every superseded one.
--
-- Ports migration 133 from the ControlWeaver-Pro repository so the two stay at
-- parity. Ships in the remediation-integration release.

CREATE TABLE IF NOT EXISTS evidence_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id            uuid NOT NULL REFERENCES evidence (id) ON DELETE CASCADE,
  -- SECURITY: denormalized from the parent so every read can be org-scoped
  -- without a join, matching how the rest of the evidence routes filter.
  organization_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  version_number         int  NOT NULL,

  -- File as it was at this version. file_path may point at a file that is
  -- still on disk (re-upload keeps the superseded file) or, for metadata-only
  -- updates, at the same path the current version uses.
  file_name              text,
  file_path              text,
  file_size              bigint,
  mime_type              text,
  integrity_hash_sha256  text,

  -- Metadata as it was at this version, so a reclassification is recoverable.
  description            text,
  tags                   text[],
  evidence_type          text,
  pii_classification     text,
  pii_types              text[],
  data_sensitivity       text,

  -- Who caused this version to be superseded, and why.
  superseded_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  change_note            text,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT evidence_versions_unique UNIQUE (evidence_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_evidence_versions_org_evidence
  ON evidence_versions (organization_id, evidence_id, version_number DESC);

SELECT 'Migration 133 completed.' AS result;
