-- Migration 073: TPRM questionnaire email delivery and open tracking
-- Adds vendor email, secure access token, and opened-at tracking to questionnaires

ALTER TABLE tprm_questionnaires
  ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS access_token VARCHAR(128) UNIQUE,
  ADD COLUMN IF NOT EXISTS response_token VARCHAR(128),
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

UPDATE tprm_questionnaires
SET access_token = COALESCE(access_token, response_token),
    response_token = COALESCE(response_token, access_token),
    vendor_email = COALESCE(vendor_email, recipient_email),
    recipient_email = COALESCE(recipient_email, vendor_email)
WHERE access_token IS NULL
   OR response_token IS NULL
   OR vendor_email IS NULL
   OR recipient_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_token ON tprm_questionnaires(access_token)
  WHERE access_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tprm_questionnaires_response_token ON tprm_questionnaires(response_token)
  WHERE response_token IS NOT NULL;

COMMENT ON COLUMN tprm_questionnaires.vendor_email IS 'Email address the questionnaire was sent to';
COMMENT ON COLUMN tprm_questionnaires.access_token IS 'Cryptographically random token for unauthenticated vendor access';
COMMENT ON COLUMN tprm_questionnaires.opened_at IS 'Timestamp when the vendor first opened the questionnaire link';
COMMENT ON COLUMN tprm_questionnaires.reminder_sent_at IS 'Timestamp of the most recent reminder email sent to the vendor';

SELECT 'Migration 073 completed.' AS result;
