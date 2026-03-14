-- Migration 043: Notification preferences per user
-- Allows users to configure which notification types they receive in-app vs email.

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,        -- control_due | assessment_needed | status_change | system | crosswalk
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  email BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences (user_id);
