-- Migration 018: Dashboard Builder and Notification Preferences
-- Adds tables for the Customizable dashboard builder and per-user
-- notification preference settings.

-- ============================================================
-- PART 1: dashboard_views
-- User-created or shared dashboard layouts
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_views (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  is_shared       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
  layout          JSONB,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dv_org
  ON dashboard_views(organization_id);

CREATE INDEX IF NOT EXISTS idx_dv_user
  ON dashboard_views(user_id);

-- ============================================================
-- PART 2: dashboard_widgets
-- Individual widget instances within a dashboard view
-- ============================================================

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_view_id UUID      NOT NULL REFERENCES dashboard_views(id) ON DELETE CASCADE,
  widget_type       VARCHAR(100) NOT NULL,
  title             VARCHAR(255),
  widget_config     JSONB,
  position_row      INTEGER   NOT NULL DEFAULT 0,
  position_col      INTEGER   NOT NULL DEFAULT 0,
  width             INTEGER   NOT NULL DEFAULT 4,
  height            INTEGER   NOT NULL DEFAULT 3,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dw_view
  ON dashboard_widgets(dashboard_view_id);

-- ============================================================
-- PART 3: notification_preferences
-- Per-user opt-in/out for in-app and email notifications by type
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(100) NOT NULL, -- control_due / assessment_needed / status_change / system / crosswalk
  in_app     BOOLEAN   NOT NULL DEFAULT TRUE,
  email      BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_np_user
  ON notification_preferences(user_id);

SELECT 'Migration 018 completed.' AS result;
