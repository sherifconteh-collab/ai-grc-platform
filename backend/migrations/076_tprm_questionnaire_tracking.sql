-- Migration 076: TPRM questionnaire email delivery and open tracking
-- Adds vendor email, secure access token, and opened-at tracking to questionnaires

ALTER TABLE tprm_questionnaires
  ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS access_token VARCHAR(128) UNIQUE,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_tprm_questionnaires_token ON tprm_questionnaires(access_token)
  WHERE access_token IS NOT NULL;

COMMENT ON COLUMN tprm_questionnaires.vendor_email IS 'Email address the questionnaire was sent to';
COMMENT ON COLUMN tprm_questionnaires.access_token IS 'Cryptographically random token for unauthenticated vendor access';
COMMENT ON COLUMN tprm_questionnaires.opened_at IS 'Timestamp when the vendor first opened the questionnaire link';
COMMENT ON COLUMN tprm_questionnaires.reminder_sent_at IS 'Timestamp of the most recent reminder email sent to the vendor';

SELECT 'Migration 076 completed.' AS result;
