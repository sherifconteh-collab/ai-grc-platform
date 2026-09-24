-- Migration 141: Incident management
--
-- The platform could record that a control existed and that evidence supported
-- it, but had nowhere to record that the control failed. The only incident-
-- shaped table was `ai_vendor_incidents` (third-party AI outages), which is a
-- narrow feed, not a register. So the platform could not answer the question
-- every assessor asks against IR-4/IR-5/IR-6, SOC 2 CC7.3-CC7.5 and ISO 27001
-- A.5.24-A.5.28: show me your incidents, your response timeline, and what you
-- changed afterwards.
--
-- The lifecycle here follows NIST SP 800-61r2's phases rather than a generic
-- ticket status, and the timestamps are separate columns rather than derived
-- from a status history because the intervals between them *are* the metrics:
--
--   detected_at  -> triaged_at    time to triage
--   detected_at  -> contained_at  time to contain (the number regulators ask for)
--   detected_at  -> resolved_at   time to resolve
--   occurred_at  -> detected_at   dwell time, the one that embarrasses people
--
-- Breach handling is first class. `is_breach`, `notification_deadline` and
-- `regulator_notified_at` exist because GDPR Art. 33 gives 72 hours from
-- awareness, and several US state laws and sector rules impose their own
-- clocks. A platform that tracks incidents but not the notification clock has
-- tracked the easy half.
--
-- `incident_timeline` is append-only in practice (the routes never update or
-- delete entries): the chronological record of who did what during response is
-- the artifact that gets handed to an investigator.
--
-- Ships in the risk and resilience release alongside migrations 139, 140, 142-143.

CREATE TABLE IF NOT EXISTS incidents (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  reference                   text,
  title                       text NOT NULL,
  description                 text,
  category                    text NOT NULL DEFAULT 'other',
  severity                    text NOT NULL DEFAULT 'medium',
  status                      text NOT NULL DEFAULT 'new',
  -- How the incident came to attention: monitoring, user report, third party,
  -- audit finding, threat intel.
  detection_source            text,

  occurred_at                 timestamptz,
  detected_at                 timestamptz NOT NULL DEFAULT now(),
  triaged_at                  timestamptz,
  contained_at                timestamptz,
  eradicated_at               timestamptz,
  resolved_at                 timestamptz,
  closed_at                   timestamptz,

  reporter_user_id            uuid REFERENCES users (id) ON DELETE SET NULL,
  owner_user_id               uuid REFERENCES users (id) ON DELETE SET NULL,
  department_id               uuid REFERENCES departments (id) ON DELETE SET NULL,

  impact_summary              text,
  root_cause                  text,
  -- Post-incident activity (NIST 800-61 phase 4). Kept distinct from
  -- root_cause: what happened versus what changes because of it.
  lessons_learned             text,

  -- Breach and notification handling.
  is_breach                   boolean NOT NULL DEFAULT false,
  affected_record_count       integer,
  affected_data_types         text[],
  regulatory_notification_required boolean NOT NULL DEFAULT false,
  notification_deadline       timestamptz,
  regulator_notified_at       timestamptz,
  data_subjects_notified_at   timestamptz,

  estimated_cost              numeric(14, 2),
  tags                        text[],
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT incidents_category_check CHECK (category IN (
    'security', 'privacy', 'availability', 'integrity', 'compliance',
    'third_party', 'physical', 'fraud', 'safety', 'ai', 'other')),
  CONSTRAINT incidents_severity_check CHECK (
    severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT incidents_status_check CHECK (status IN (
    'new', 'triaged', 'investigating', 'contained', 'eradicated',
    'recovered', 'closed', 'false_positive')),
  CONSTRAINT incidents_affected_count_nonnegative CHECK (
    affected_record_count IS NULL OR affected_record_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents (organization_id);
CREATE INDEX IF NOT EXISTS idx_incidents_org_status
  ON incidents (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_org_detected
  ON incidents (organization_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_owner ON incidents (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_department ON incidents (department_id);

-- Open notification clocks are the highest-urgency query in the module, so it
-- gets its own partial index rather than sharing the status index.
CREATE INDEX IF NOT EXISTS idx_incidents_notification_due
  ON incidents (organization_id, notification_deadline)
  WHERE regulatory_notification_required = true AND regulator_notified_at IS NULL;

-- SECURITY: references are unique per organization only, never globally.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_org_reference
  ON incidents (organization_id, reference)
  WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS incident_timeline (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  incident_id       uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  entry_type        text NOT NULL DEFAULT 'note',
  -- When the action happened, which is not always when it was recorded.
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  recorded_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  summary           text NOT NULL,
  detail            text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT incident_timeline_entry_type_check CHECK (entry_type IN (
    'detection', 'triage', 'analysis', 'containment', 'eradication',
    'recovery', 'communication', 'notification', 'status_change',
    'evidence', 'note'))
);

CREATE INDEX IF NOT EXISTS idx_incident_timeline_incident
  ON incident_timeline (incident_id, occurred_at);

CREATE TABLE IF NOT EXISTS incident_risk_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  incident_id       uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  -- Whether this incident is the risk materializing, or merely related. A
  -- materialized risk is evidence the residual assessment was optimistic.
  relationship      text NOT NULL DEFAULT 'materialized',
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT incident_risk_links_relationship_check CHECK (
    relationship IN ('materialized', 'related', 'identified_new_risk')),
  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT incident_risk_links_unique UNIQUE (organization_id, incident_id, risk_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_risk_links_incident
  ON incident_risk_links (incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_risk_links_risk
  ON incident_risk_links (organization_id, risk_id);

CREATE TABLE IF NOT EXISTS incident_control_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  incident_id       uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  control_id        uuid NOT NULL REFERENCES framework_controls (id) ON DELETE CASCADE,
  -- Did this control fail, detect the incident, or contain it? A control that
  -- detected an incident is working; a control that failed is a finding.
  relationship      text NOT NULL DEFAULT 'failed',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT incident_control_links_relationship_check CHECK (
    relationship IN ('failed', 'detected', 'contained', 'related')),
  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT incident_control_links_unique
    UNIQUE (organization_id, incident_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_control_links_incident
  ON incident_control_links (incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_control_links_control
  ON incident_control_links (organization_id, control_id);

CREATE TABLE IF NOT EXISTS incident_asset_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  incident_id       uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  asset_id          uuid NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  impact            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT incident_asset_links_impact_check CHECK (
    impact IS NULL OR
    impact IN ('none', 'degraded', 'unavailable', 'compromised', 'destroyed')),
  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT incident_asset_links_unique UNIQUE (organization_id, incident_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_asset_links_incident
  ON incident_asset_links (incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_asset_links_asset
  ON incident_asset_links (organization_id, asset_id);

-- Permission seeding.
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('incidents.read', 'incidents', 'read',
   'View incidents, response timelines, and incident linkage'),
  ('incidents.write', 'incidents', 'write',
   'Report incidents, advance the response lifecycle, and record timeline entries')
ON CONFLICT (name) DO NOTHING;

WITH read_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor', 'user')
), read_perm AS (
  SELECT id FROM permissions WHERE name = 'incidents.read'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT read_roles.id, read_perm.id FROM read_roles, read_perm
ON CONFLICT DO NOTHING;

-- Write goes to admin and user, not just admin: incident reporting has to be
-- available to whoever noticed the problem, or it gets reported by email
-- instead and never reaches the register at all.
WITH write_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'user')
), write_perm AS (
  SELECT id FROM permissions WHERE name = 'incidents.write'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT write_roles.id, write_perm.id FROM write_roles, write_perm
ON CONFLICT DO NOTHING;

COMMENT ON TABLE incidents IS
  'NIST SP 800-61 incident lifecycle with phase timestamps and breach notification clock (GDPR Art. 33 and equivalents).';
COMMENT ON TABLE incident_timeline IS
  'Chronological response record. Written but never updated or deleted by the routes -- this is the investigator-facing artifact.';

SELECT 'Migration 141 completed.' AS result;
