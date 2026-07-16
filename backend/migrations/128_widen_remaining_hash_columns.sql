-- 128_widen_remaining_hash_columns.sql
--
-- Why: migrations/112_cnsa_widen_hash_columns.sql widened the columns known
-- at the time to VARCHAR(128) for the CNSA Suite 1.0 SHA-384 migration, but
-- missed three more VARCHAR(64) (SHA-256-sized) columns still named with a
-- _sha256 suffix. Live end-to-end QA (real Postgres + real backend, not
-- Jest's mocked pg.Pool) surfaced this concretely: every evidence file
-- upload has been throwing a 500 ("value too long for type character
-- varying(64)") because routes/evidence.js's computeFileHash() already
-- writes SHA-384 (96 hex chars) into evidence.integrity_hash_sha256.
-- Widening ai_boms.model_hash_sha256 and organization_content_packs.
-- content_hash_sha256 preemptively for the same reason, following the same
-- pattern as 112.
--
-- Ships in: follow-up to 4.0.0's CNSA cryptographic alignment.
-- Idempotent: guarded by column existence; ALTER TYPE to the same type is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evidence' AND column_name = 'integrity_hash_sha256'
  ) THEN
    ALTER TABLE evidence ALTER COLUMN integrity_hash_sha256 TYPE VARCHAR(128);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_boms' AND column_name = 'model_hash_sha256'
  ) THEN
    ALTER TABLE ai_boms ALTER COLUMN model_hash_sha256 TYPE VARCHAR(128);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organization_content_packs' AND column_name = 'content_hash_sha256'
  ) THEN
    ALTER TABLE organization_content_packs ALTER COLUMN content_hash_sha256 TYPE VARCHAR(128);
  END IF;
END$$;
