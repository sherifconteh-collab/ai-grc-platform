-- Migration 097: Store locally-generated public key alongside license
-- When a platform admin uses POST /api/v1/license/generate-community, the
-- resulting self-signed RSA public key is stored here so the license can be
-- re-validated after a server restart without requiring CONTROLWEAVE_LICENSE_PUBKEY.

ALTER TABLE server_license
  ADD COLUMN IF NOT EXISTS local_public_key TEXT;

COMMENT ON COLUMN server_license.local_public_key IS
  'PEM-encoded RSA public key stored when the license was generated locally via '
  'POST /api/v1/license/generate-community. Used as a fallback verification key '
  'when CONTROLWEAVE_LICENSE_PUBKEY is not set in the environment. '
  'TEXT is appropriate here because PEM is a base64-encoded ASCII format. '
  'No index is needed — the table is a single-row singleton (id = 1).';
