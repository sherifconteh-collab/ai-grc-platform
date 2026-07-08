-- Migration 118: Classroom mode (guided training scenarios)
-- Why: lets schools and audit firms run guided, hands-on GRC training inside the
-- platform. Scenarios are ordered step checklists that point at real dashboard pages;
-- instructors author org-local scenarios and track per-student progress. Three
-- built-in templates (organization_id IS NULL) are seeded with fixed UUIDs so the
-- seed is idempotent. Ships in release 4.3.0.

-- ============================================================
-- 1) Scenarios (org-local, or global templates when organization_id IS NULL)
-- ============================================================
CREATE TABLE IF NOT EXISTS training_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  title VARCHAR(255) NOT NULL,
  description TEXT,
  difficulty VARCHAR(20) NOT NULL DEFAULT 'beginner',
  -- Array of { title, description, hint, target_page }
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT training_scenarios_difficulty_valid CHECK (
    difficulty IN ('beginner', 'intermediate', 'advanced')
  ),
  CONSTRAINT training_scenarios_steps_is_array CHECK (
    jsonb_typeof(steps) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS idx_training_scenarios_org
ON training_scenarios (organization_id, is_active);

-- ============================================================
-- 2) Per-user progress
-- ============================================================
CREATE TABLE IF NOT EXISTS training_scenario_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES training_scenarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Array of completed step indexes (integers)
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- SECURITY: one progress row per user per scenario; rows are additionally always
  -- read and written org-scoped so cross-tenant progress can never surface.
  CONSTRAINT training_progress_unique UNIQUE (scenario_id, user_id),

  CONSTRAINT training_progress_steps_is_array CHECK (
    jsonb_typeof(completed_steps) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS idx_training_progress_org
ON training_scenario_progress (organization_id, scenario_id);

-- ============================================================
-- 3) Built-in scenario templates (fixed UUIDs; idempotent seed)
-- ============================================================
INSERT INTO training_scenarios (id, organization_id, title, description, difficulty, steps)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001', NULL,
    'Run an internal audit engagement',
    'Walk an internal audit from planning through sign-off using the assessments module.',
    'beginner',
    '[
      {"title": "Create an engagement", "description": "Create an internal_audit engagement in the planning stage.", "hint": "Assessments > New Engagement", "target_page": "/dashboard/assessments"},
      {"title": "Add a PBC request", "description": "Create a Prepared-by-Client item with a priority and due date.", "hint": "Open the engagement and use the PBC tab.", "target_page": "/dashboard/assessments"},
      {"title": "Draft a workpaper", "description": "Add a workpaper documenting one control test.", "hint": "Workpapers move draft -> in_review -> finalized.", "target_page": "/dashboard/assessments"},
      {"title": "Record a finding", "description": "Log a finding with a severity level and link it to a control.", "hint": "Findings support low/medium/high/critical.", "target_page": "/dashboard/assessments"},
      {"title": "Complete a sign-off", "description": "Record an auditor sign-off and move the engagement to reporting.", "hint": "Signoffs live on the engagement detail view.", "target_page": "/dashboard/assessments"}
    ]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000002', NULL,
    'Take a system to ATO',
    'Carry an information system through the RMF lifecycle to authorization, leveraging a COTS product.',
    'intermediate',
    '[
      {"title": "Register a system", "description": "Add an organization system to inventory.", "hint": "Organization > Systems.", "target_page": "/dashboard/vendor-risk"},
      {"title": "Create an RMF package", "description": "Create an RMF package linked to your system and set its FIPS-199 categorization.", "hint": "RMF > Create RMF Package.", "target_page": "/dashboard/rmf"},
      {"title": "Add a COTS product", "description": "Record a COTS/SaaS product with an authorization status (e.g. FedRAMP Authorized).", "hint": "Vendor Risk > COTS Products.", "target_page": "/dashboard/vendor-risk"},
      {"title": "Leverage the product", "description": "Add a leveraged authorization to your package, inheriting controls from the COTS product.", "hint": "Package detail > Leveraged Authorizations.", "target_page": "/dashboard/rmf"},
      {"title": "Advance to Authorize", "description": "Transition the package through the RMF steps to authorize.", "hint": "Use the step tracker on the package detail view.", "target_page": "/dashboard/rmf"},
      {"title": "Record the ATO", "description": "Record an ATO decision with an authorizing official and expiration date.", "hint": "Package detail > Record Authorization Decision.", "target_page": "/dashboard/rmf"}
    ]'::jsonb
  ),
  (
    'a1000000-0000-4000-8000-000000000003', NULL,
    'Perform a vendor risk review',
    'Assess a third-party vendor end to end in the TPRM module.',
    'beginner',
    '[
      {"title": "Add a vendor", "description": "Create a TPRM vendor with a type and risk tier.", "hint": "TPRM > Add Vendor.", "target_page": "/dashboard/tprm"},
      {"title": "Attach a compliance document", "description": "Upload or record a vendor compliance report with an expiration date.", "hint": "Vendor detail > Documents.", "target_page": "/dashboard/tprm"},
      {"title": "Send a questionnaire", "description": "Issue a security questionnaire to the vendor.", "hint": "Vendor detail > Questionnaires.", "target_page": "/dashboard/tprm"},
      {"title": "Set the review status", "description": "Move the vendor to approved or conditional based on your review.", "hint": "Review statuses include pending_review, in_review, approved.", "target_page": "/dashboard/tprm"}
    ]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE training_scenarios IS 'Guided training scenarios (classroom mode); NULL organization_id marks built-in templates.';

SELECT 'Migration 118: Classroom mode tables created.' AS result;
