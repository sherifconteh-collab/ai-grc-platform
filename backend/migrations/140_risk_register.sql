-- Migration 140: Risk register
--
-- The README has claimed a "unified risk register" for several releases. It was
-- not true. What existed was `risk_scores` (migration 057): a single computed
-- 0-100 posture number per organization, recalculated from control coverage and
-- vulnerability counts. That is a *score*, not a register. There was no way to
-- record an individual risk, assess it, assign an owner, decide a treatment, or
-- show an assessor the trail from identification to acceptance.
--
-- This migration makes the claim true. It is deliberately modeled on ISO 31000 /
-- ISO 27005 and NIST SP 800-30 rather than invented:
--
--   * Inherent vs residual assessment. Both are stored, both as a
--     likelihood x impact pair on a 1-5 scale with the product persisted as a
--     generated column so 1-25 heat-map queries never drift from their inputs.
--     Recording only the residual figure is the most common way a register
--     stops being auditable -- there is no evidence a control did anything.
--   * Four treatment strategies (ISO 31000): avoid, mitigate, transfer, accept.
--   * Explicit acceptance. `accepted_by` / `accepted_at` / `acceptance_rationale`
--     exist because "we accepted it" is a decision a named person makes on a
--     date, and an auditor will ask which person and which date.
--   * Review cadence. `next_review_date` plus a `risk_reviews` history table:
--     a register nobody revisits is a stale document, and the review history is
--     the evidence that it was revisited.
--
-- Link tables tie risks to the objects already in the platform -- controls
-- (what treats the risk), assets (what is exposed), objectives (what is
-- threatened) -- so the register is connected to the compliance work rather
-- than parallel to it.
--
-- Ships in the risk and resilience release alongside migrations 139, 141-143.

CREATE TABLE IF NOT EXISTS risks (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  reference               text,
  title                   text NOT NULL,
  description             text,
  category                text NOT NULL DEFAULT 'operational',
  -- Free text: threat/vulnerability pairing per NIST SP 800-30 is useful to
  -- record but too varied across organizations to constrain.
  threat_source           text,
  vulnerability           text,

  -- Inherent: before any control is considered.
  inherent_likelihood     smallint,
  inherent_impact         smallint,
  inherent_score          smallint GENERATED ALWAYS AS
                            (inherent_likelihood * inherent_impact) STORED,

  -- Residual: with current controls operating as designed.
  residual_likelihood     smallint,
  residual_impact         smallint,
  residual_score          smallint GENERATED ALWAYS AS
                            (residual_likelihood * residual_impact) STORED,

  treatment_strategy      text,
  status                  text NOT NULL DEFAULT 'identified',
  owner_user_id           uuid REFERENCES users (id) ON DELETE SET NULL,
  department_id           uuid REFERENCES departments (id) ON DELETE SET NULL,

  identified_date         date NOT NULL DEFAULT CURRENT_DATE,
  next_review_date        date,
  last_reviewed_at        timestamptz,

  -- Acceptance is a named decision, not a status flag.
  accepted_by             uuid REFERENCES users (id) ON DELETE SET NULL,
  accepted_at             timestamptz,
  acceptance_rationale    text,
  accepted_until          date,

  closed_at               timestamptz,
  closure_rationale       text,

  tags                    text[],
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT risks_category_check CHECK (category IN (
    'strategic', 'operational', 'financial', 'compliance', 'cyber',
    'privacy', 'third_party', 'legal', 'reputational', 'environmental',
    'health_safety', 'technology', 'ai', 'other')),
  CONSTRAINT risks_status_check CHECK (status IN (
    'identified', 'assessed', 'treatment_planned', 'treated',
    'accepted', 'monitoring', 'closed')),
  CONSTRAINT risks_treatment_strategy_check CHECK (
    treatment_strategy IS NULL OR
    treatment_strategy IN ('avoid', 'mitigate', 'transfer', 'accept')),
  CONSTRAINT risks_inherent_likelihood_range CHECK (
    inherent_likelihood IS NULL OR inherent_likelihood BETWEEN 1 AND 5),
  CONSTRAINT risks_inherent_impact_range CHECK (
    inherent_impact IS NULL OR inherent_impact BETWEEN 1 AND 5),
  CONSTRAINT risks_residual_likelihood_range CHECK (
    residual_likelihood IS NULL OR residual_likelihood BETWEEN 1 AND 5),
  CONSTRAINT risks_residual_impact_range CHECK (
    residual_impact IS NULL OR residual_impact BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_risks_org ON risks (organization_id);
CREATE INDEX IF NOT EXISTS idx_risks_org_status ON risks (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_risks_org_residual
  ON risks (organization_id, residual_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_risks_owner ON risks (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_risks_department ON risks (department_id);
CREATE INDEX IF NOT EXISTS idx_risks_review_due
  ON risks (organization_id, next_review_date)
  WHERE next_review_date IS NOT NULL AND status <> 'closed';

-- SECURITY: risk references (R-001 and the like) are unique per organization
-- only. A global unique index would leak the existence of another tenant's
-- risk through a constraint violation on insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_risks_org_reference
  ON risks (organization_id, reference)
  WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS risk_treatments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id             uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  treatment_type      text NOT NULL DEFAULT 'mitigate',
  status              text NOT NULL DEFAULT 'planned',
  owner_user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  due_date            date,
  started_at          timestamptz,
  completed_at        timestamptz,
  -- What the treatment is expected to move the residual score to. Comparing
  -- this against the risk's residual score after completion is how an
  -- organization finds out whether its treatments actually work.
  target_residual_score smallint,
  estimated_cost      numeric(14, 2),
  actual_cost         numeric(14, 2),
  progress_percent    smallint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT risk_treatments_type_check CHECK (
    treatment_type IN ('avoid', 'mitigate', 'transfer', 'accept')),
  CONSTRAINT risk_treatments_status_check CHECK (
    status IN ('planned', 'in_progress', 'completed', 'cancelled', 'overdue')),
  CONSTRAINT risk_treatments_progress_range CHECK (
    progress_percent BETWEEN 0 AND 100),
  CONSTRAINT risk_treatments_target_range CHECK (
    target_residual_score IS NULL OR target_residual_score BETWEEN 1 AND 25)
);

CREATE INDEX IF NOT EXISTS idx_risk_treatments_risk ON risk_treatments (risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_treatments_org_status
  ON risk_treatments (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_risk_treatments_due
  ON risk_treatments (organization_id, due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'cancelled');

-- Periodic review history. The register's own audit trail: who looked at this
-- risk, when, and whether the assessment changed as a result.
CREATE TABLE IF NOT EXISTS risk_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id             uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  reviewed_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at         timestamptz NOT NULL DEFAULT now(),
  outcome             text NOT NULL DEFAULT 'unchanged',
  notes               text,
  -- Snapshot of the assessment as it stood at review time, so history survives
  -- later edits to the risk row.
  snapshot            jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT risk_reviews_outcome_check CHECK (
    outcome IN ('unchanged', 'reassessed', 'escalated', 'de_escalated', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_risk_reviews_risk
  ON risk_reviews (risk_id, reviewed_at DESC);

-- Controls that treat the risk. `effectiveness` is the assessor's judgment of
-- how well the mapped control actually reduces this specific risk, which is not
-- the same thing as whether the control is implemented.
CREATE TABLE IF NOT EXISTS risk_control_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  control_id        uuid NOT NULL REFERENCES framework_controls (id) ON DELETE CASCADE,
  effectiveness     text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT risk_control_links_effectiveness_check CHECK (
    effectiveness IS NULL OR
    effectiveness IN ('not_assessed', 'ineffective', 'partially_effective', 'effective')),
  -- SECURITY: organization_id participates in the key so a control in one
  -- tenant can never be linked to a risk in another.
  CONSTRAINT risk_control_links_unique UNIQUE (organization_id, risk_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_control_links_risk ON risk_control_links (risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_control_links_control
  ON risk_control_links (organization_id, control_id);

CREATE TABLE IF NOT EXISTS risk_asset_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  asset_id          uuid NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT risk_asset_links_unique UNIQUE (organization_id, risk_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_asset_links_risk ON risk_asset_links (risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_asset_links_asset
  ON risk_asset_links (organization_id, asset_id);

CREATE TABLE IF NOT EXISTS risk_objective_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  objective_id      uuid NOT NULL REFERENCES business_objectives (id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT risk_objective_links_unique UNIQUE (organization_id, risk_id, objective_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_objective_links_risk
  ON risk_objective_links (risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_objective_links_objective
  ON risk_objective_links (organization_id, objective_id);

-- Permission seeding.
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('risks.read', 'risks', 'read',
   'View the risk register, treatments, reviews, and risk linkage'),
  ('risks.write', 'risks', 'write',
   'Create and update risks, record assessments, treatments, acceptances, and reviews')
ON CONFLICT (name) DO NOTHING;

WITH read_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name IN ('admin', 'auditor', 'user')
), read_perm AS (
  SELECT id FROM permissions WHERE name = 'risks.read'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT read_roles.id, read_perm.id FROM read_roles, read_perm
ON CONFLICT DO NOTHING;

WITH write_roles AS (
  SELECT id FROM roles WHERE is_system_role = true AND name = 'admin'
), write_perm AS (
  SELECT id FROM permissions WHERE name = 'risks.write'
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT write_roles.id, write_perm.id FROM write_roles, write_perm
ON CONFLICT DO NOTHING;

COMMENT ON TABLE risks IS
  'ISO 31000 / ISO 27005 risk register. Inherent and residual assessment, treatment strategy, named acceptance, review cadence.';
COMMENT ON TABLE risk_treatments IS
  'Treatment actions against a risk, with target residual score so treatment effectiveness can be measured after completion.';
COMMENT ON TABLE risk_reviews IS
  'Periodic review history. Snapshot column preserves the assessment as it stood at review time.';

SELECT 'Migration 140 completed.' AS result;
