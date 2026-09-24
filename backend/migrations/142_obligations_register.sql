-- Migration 142: Compliance obligations register
--
-- Frameworks and controls answer "what good practice says we should do".
-- Obligations answer "what we are actually bound to, by whom, and by when" --
-- the statute, the contract clause, the licence condition, the customer DPA.
-- The platform had the first and not the second, which is why it could show a
-- framework at 94% and still not tell anyone that a contractual breach-
-- notification clause was three weeks overdue.
--
-- The distinction that makes this table worth having separately from controls:
-- an obligation has a *source with authority* (a regulator, a counterparty, a
-- certification body) and usually a recurring deadline. Controls do not expire;
-- obligations do.
--
-- `obligation_attestations` is the recurring half. An obligation with a
-- frequency generates a due date; someone attests that it was met for that
-- period, or records that it was not. The attestation history is what an
-- auditor samples -- a status column alone only ever shows the present, and
-- "we are compliant today" is not evidence of a control operating over a
-- period.
--
-- Ships in the risk and resilience release alongside migrations 139-141, 143.

CREATE TABLE IF NOT EXISTS compliance_obligations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  reference           text,
  title               text NOT NULL,
  description         text,

  -- Where the obligation comes from, and the authority behind it.
  source_type         text NOT NULL DEFAULT 'regulation',
  source_name         text,
  citation            text,
  jurisdiction        text,
  -- Optional link to a framework already loaded in the platform, when the
  -- obligation derives from one (e.g. a certification maintenance requirement).
  framework_id        uuid REFERENCES frameworks (id) ON DELETE SET NULL,

  owner_user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  department_id       uuid REFERENCES departments (id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'active',
  compliance_status   text NOT NULL DEFAULT 'not_assessed',
  criticality         text NOT NULL DEFAULT 'medium',

  -- Recurrence. `frequency` NULL means a one-off obligation with a single
  -- due date.
  frequency           text,
  effective_date      date,
  next_due_date       date,
  last_attested_at    timestamptz,

  penalty_description text,
  tags                text[],
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT compliance_obligations_source_type_check CHECK (source_type IN (
    'regulation', 'statute', 'contract', 'standard', 'certification',
    'internal_policy', 'customer_commitment', 'court_order', 'other')),
  CONSTRAINT compliance_obligations_status_check CHECK (
    status IN ('draft', 'active', 'superseded', 'retired')),
  CONSTRAINT compliance_obligations_compliance_status_check CHECK (
    compliance_status IN ('not_assessed', 'compliant', 'partially_compliant',
                          'non_compliant', 'not_applicable')),
  CONSTRAINT compliance_obligations_criticality_check CHECK (
    criticality IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT compliance_obligations_frequency_check CHECK (
    frequency IS NULL OR frequency IN (
      'daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'biennial'))
);

CREATE INDEX IF NOT EXISTS idx_compliance_obligations_org
  ON compliance_obligations (organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_org_status
  ON compliance_obligations (organization_id, compliance_status);
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_department
  ON compliance_obligations (department_id);

-- The overdue query is the point of the module, so it gets a partial index.
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_due
  ON compliance_obligations (organization_id, next_due_date)
  WHERE next_due_date IS NOT NULL AND status = 'active';

-- SECURITY: references are unique per organization only, never globally.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_obligations_org_reference
  ON compliance_obligations (organization_id, reference)
  WHERE reference IS NOT NULL;

-- Which controls demonstrate that the obligation is met. This is the join that
-- lets an organization answer "what breaks if this control fails" in
-- regulatory terms rather than framework terms.
CREATE TABLE IF NOT EXISTS obligation_control_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  obligation_id     uuid NOT NULL REFERENCES compliance_obligations (id) ON DELETE CASCADE,
  control_id        uuid NOT NULL REFERENCES framework_controls (id) ON DELETE CASCADE,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT obligation_control_links_unique
    UNIQUE (organization_id, obligation_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_obligation_control_links_obligation
  ON obligation_control_links (obligation_id);
CREATE INDEX IF NOT EXISTS idx_obligation_control_links_control
  ON obligation_control_links (organization_id, control_id);

CREATE TABLE IF NOT EXISTS obligation_attestations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  obligation_id     uuid NOT NULL REFERENCES compliance_obligations (id) ON DELETE CASCADE,
  -- The period this attestation covers, not the date it was recorded. Two
  -- separate facts, and auditors care about the first.
  period_start      date,
  period_end        date,
  due_date          date,
  outcome           text NOT NULL,
  notes             text,
  -- Optional pointer to the evidence record supporting the attestation.
  evidence_id       uuid REFERENCES evidence (id) ON DELETE SET NULL,
  attested_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  attested_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT obligation_attestations_outcome_check CHECK (
    outcome IN ('met', 'partially_met', 'not_met', 'not_applicable', 'waived'))
);

CREATE INDEX IF NOT EXISTS idx_obligation_attestations_obligation
  ON obligation_attestations (obligation_id, attested_at DESC);
CREATE INDEX IF NOT EXISTS idx_obligation_attestations_org
  ON obligation_attestations (organization_id, attested_at DESC);

-- Permission seeding.
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('obligations.read', 'obligations', 'read',
   'View the compliance obligations register, attestation history, and control linkage'),
  ('obligations.write', 'obligations', 'write',
   'Create and update obligations, link controls, and record attestations')
ON CONFLICT (name) DO NOTHING;

WITH read_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor', 'user')
), read_perm AS (
  SELECT id FROM permissions WHERE name = 'obligations.read'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT read_roles.id, read_perm.id FROM read_roles, read_perm
ON CONFLICT DO NOTHING;

WITH write_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'admin'
), write_perm AS (
  SELECT id FROM permissions WHERE name = 'obligations.write'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT write_roles.id, write_perm.id FROM write_roles, write_perm
ON CONFLICT DO NOTHING;

COMMENT ON TABLE compliance_obligations IS
  'Externally imposed requirements with a source authority and recurring deadlines. Distinct from controls: obligations expire, controls do not.';
COMMENT ON TABLE obligation_attestations IS
  'Per-period attestation history. Sampled by auditors as evidence of operation over a period, which a status column cannot provide.';

SELECT 'Migration 142 completed.' AS result;
