-- 112_cnsa_widen_hash_columns.sql
--
-- Why: CNSA Suite 1.0 mandates SHA-384+ for integrity hashing. Existing
-- integrity-hash columns were sized VARCHAR(64) for SHA-256 (64 hex chars).
-- SHA-384 produces 96 hex chars, so these columns are widened to VARCHAR(128)
-- (also fits SHA-512) before the application starts writing SHA-384 digests.
-- Existing SHA-256 values remain valid; new writes are SHA-384.
--
-- Ships in: 4.0.0 (CNSA cryptographic alignment).
-- Idempotent: guarded by column existence; ALTER TYPE to the same type is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'policy_uploads' AND column_name = 'file_hash'
  ) THEN
    ALTER TABLE policy_uploads ALTER COLUMN file_hash TYPE VARCHAR(128);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_decision_log' AND column_name = 'input_hash'
  ) THEN
    ALTER TABLE ai_decision_log ALTER COLUMN input_hash TYPE VARCHAR(128);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_decision_log' AND column_name = 'output_hash'
  ) THEN
    ALTER TABLE ai_decision_log ALTER COLUMN output_hash TYPE VARCHAR(128);
  END IF;
END$$;
