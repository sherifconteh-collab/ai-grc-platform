-- Migration 143: Risk and control indicators (KRI / KPI / KCI)
--
-- A risk register assessed once a quarter is a snapshot of what people believed
-- three months ago. Indicators are the moving part: a measured value, a
-- threshold, and a direction, sampled on a cadence. When the measurement
-- crosses the threshold the organization learns its residual assessment is out
-- of date *before* the incident rather than after it.
--
-- Three kinds, distinguished because they answer different questions:
--
--   kri  Key Risk Indicator     -- is this risk getting more likely?
--   kpi  Key Performance Indicator -- are we achieving the objective?
--   kci  Key Control Indicator  -- is this control still operating?
--
-- Design notes:
--
--   * `direction` exists because "higher is worse" (failed logins) and "higher
--     is better" (patch coverage) cannot share threshold comparison logic. It
--     is stored rather than inferred so the breach test is a pure function of
--     the row.
--   * Thresholds are amber and red, not a single limit, so an indicator can
--     warn before it breaches. Both are nullable: an indicator that is merely
--     tracked, with no defined tolerance, is still worth recording.
--   * `indicator_measurements` is a time series with a unique key on
--     (indicator, measured_at) so a re-submitted reading updates rather than
--     duplicating. `breach_level` is computed at write time by the service and
--     persisted, because recomputing a historic breach against today's
--     thresholds would rewrite history every time someone retunes a threshold.
--
-- Ships in the risk and resilience release alongside migrations 139-142.

CREATE TABLE IF NOT EXISTS indicators (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  reference           text,
  name                text NOT NULL,
  description         text,
  indicator_type      text NOT NULL DEFAULT 'kri',
  unit                text,

  -- Thresholds. Interpretation depends on `direction`.
  target_value        numeric(18, 4),
  amber_threshold     numeric(18, 4),
  red_threshold       numeric(18, 4),
  direction           text NOT NULL DEFAULT 'lower_is_better',

  measurement_frequency text NOT NULL DEFAULT 'monthly',
  owner_user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  department_id       uuid REFERENCES departments (id) ON DELETE SET NULL,

  -- What the indicator is an indicator *of*. All optional -- an indicator may
  -- watch a risk, an objective, a control, or stand alone.
  risk_id             uuid REFERENCES risks (id) ON DELETE SET NULL,
  objective_id        uuid REFERENCES business_objectives (id) ON DELETE SET NULL,
  control_id          uuid REFERENCES framework_controls (id) ON DELETE SET NULL,

  -- Denormalized latest reading. Kept current by the service on every
  -- measurement write so dashboard list queries do not need a lateral join
  -- against the time series for every row.
  latest_value        numeric(18, 4),
  latest_measured_at  timestamptz,
  latest_breach_level text,

  is_active           boolean NOT NULL DEFAULT true,
  data_source         text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT indicators_type_check CHECK (indicator_type IN ('kri', 'kpi', 'kci')),
  CONSTRAINT indicators_direction_check CHECK (
    direction IN ('lower_is_better', 'higher_is_better')),
  CONSTRAINT indicators_frequency_check CHECK (measurement_frequency IN (
    'daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'ad_hoc')),
  CONSTRAINT indicators_latest_breach_level_check CHECK (
    latest_breach_level IS NULL OR
    latest_breach_level IN ('green', 'amber', 'red')),
  -- SECURITY: names are unique per organization, never globally.
  CONSTRAINT indicators_org_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_indicators_org ON indicators (organization_id);
CREATE INDEX IF NOT EXISTS idx_indicators_org_type
  ON indicators (organization_id, indicator_type);
CREATE INDEX IF NOT EXISTS idx_indicators_risk ON indicators (risk_id);
CREATE INDEX IF NOT EXISTS idx_indicators_objective ON indicators (objective_id);
CREATE INDEX IF NOT EXISTS idx_indicators_control ON indicators (control_id);

-- Breached indicators are the dashboard's first query.
CREATE INDEX IF NOT EXISTS idx_indicators_breached
  ON indicators (organization_id, latest_breach_level)
  WHERE is_active = true AND latest_breach_level IN ('amber', 'red');

CREATE UNIQUE INDEX IF NOT EXISTS idx_indicators_org_reference
  ON indicators (organization_id, reference)
  WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS indicator_measurements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  indicator_id      uuid NOT NULL REFERENCES indicators (id) ON DELETE CASCADE,
  value             numeric(18, 4) NOT NULL,
  measured_at       timestamptz NOT NULL DEFAULT now(),
  -- Persisted rather than derived: retuning a threshold must not silently
  -- rewrite whether past readings were breaches.
  breach_level      text NOT NULL DEFAULT 'green',
  notes             text,
  recorded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT indicator_measurements_breach_level_check CHECK (
    breach_level IN ('green', 'amber', 'red')),
  -- Re-submitting a reading for the same instant corrects it rather than
  -- creating a second row for the same point in time.
  CONSTRAINT indicator_measurements_unique UNIQUE (indicator_id, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_indicator_measurements_indicator
  ON indicator_measurements (indicator_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicator_measurements_org
  ON indicator_measurements (organization_id, measured_at DESC);

-- Permission seeding.
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('indicators.read', 'indicators', 'read',
   'View risk, performance, and control indicators and their measurement history'),
  ('indicators.write', 'indicators', 'write',
   'Create and update indicators, set thresholds, and record measurements')
ON CONFLICT (name) DO NOTHING;

WITH read_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor', 'user')
), read_perm AS (
  SELECT id FROM permissions WHERE name = 'indicators.read'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT read_roles.id, read_perm.id FROM read_roles, read_perm
ON CONFLICT DO NOTHING;

WITH write_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'admin'
), write_perm AS (
  SELECT id FROM permissions WHERE name = 'indicators.write'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT write_roles.id, write_perm.id FROM write_roles, write_perm
ON CONFLICT DO NOTHING;

COMMENT ON TABLE indicators IS
  'KRI / KPI / KCI definitions with amber and red thresholds and an explicit direction so breach logic is a pure function of the row.';
COMMENT ON TABLE indicator_measurements IS
  'Indicator time series. breach_level is persisted at write time so retuning a threshold does not rewrite historic breaches.';

SELECT 'Migration 143 completed.' AS result;
