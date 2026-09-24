-- Migration 156: Control hierarchy and baseline membership
--
-- Prepares framework_controls for NIST SP 800-53 Rev 5 control enhancements
-- (714 non-withdrawn ones, against the 300 base controls currently seeded) and
-- for the derived FedRAMP baselines. Adds no controls itself -- this migration
-- exists so the import that follows has somewhere correct to put them.
--
-- Two things are missing today that make enhancements unrepresentable:
--
-- 1. No hierarchy. An enhancement would land as an ordinary sibling row,
--    indistinguishable from a base control by any query. Consumers already
--    compensate by string-parsing control_id -- the controls page derives
--    sub-control status from a /\(\d+\)$/ regex and finds children by string
--    prefix. That works only because the id format happens to encode it, and
--    it silently breaks for any framework that numbers differently.
--
-- 2. No baseline membership. This is the substantive gap. Enhancements are
--    where FedRAMP baselines actually bite: of the controls NIST SP 800-53B
--    selects, the Moderate baseline is 110 enhancements out of 287, and High
--    is 182 out of 370 -- roughly half. Without recording which baseline
--    selects which control, importing 714 enhancements makes every
--    organization's compliance denominator jump by ~3.4x overnight while the
--    numerator stays put, whether or not those controls are in scope for the
--    baseline the organization is actually pursuing. Baseline membership is
--    what turns the enhancements from noise into something an assessor can
--    scope against.
--
-- Baseline membership is a join table rather than three boolean columns
-- because the baselines are not a fixed set: NIST 800-53B Low/Moderate/High
-- and the FedRAMP profiles derived from them already differ, and CNSSI-1253
-- and agency overlays select differently again. A row per (control, baseline,
-- source) extends without a schema change; boolean columns would not.
--
-- Note on what is NOT here: the UNIQUE (framework_id, control_id) constraint
-- was already added by migration 086, so enhancement rows are protected
-- against duplication without further work.
--
-- Ships in the AU control family remediation batch (catalog track).

ALTER TABLE framework_controls
  ADD COLUMN IF NOT EXISTS parent_control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_enhancement BOOLEAN NOT NULL DEFAULT FALSE;

-- Children go with their parent: an enhancement has no meaning without the
-- base control it enhances, so CASCADE is correct here rather than RESTRICT.

CREATE INDEX IF NOT EXISTS idx_framework_controls_parent
  ON framework_controls(parent_control_id)
  WHERE parent_control_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_framework_controls_fw_enhancement
  ON framework_controls(framework_id, is_enhancement);

COMMENT ON COLUMN framework_controls.parent_control_id IS
  'For a control enhancement (e.g. AU-6(3)), the base control it enhances (AU-6). NULL for base controls. Populated from the OSCAL rel="required" link at import time -- never inferred by parsing control_id.';
COMMENT ON COLUMN framework_controls.is_enhancement IS
  'TRUE for control enhancements. Lets queries filter or group enhancements without string-parsing control_id, which only works for frameworks that encode it in the identifier.';

-- Baseline membership -------------------------------------------------------

CREATE TABLE IF NOT EXISTS control_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_control_id UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
  -- 'low' | 'moderate' | 'high' today; left as text so agency overlays and
  -- CNSSI-1253 categorizations can be added without a type change.
  baseline VARCHAR(50) NOT NULL,
  -- Which publication selected it. Distinguishes the NIST 800-53B baselines
  -- from the FedRAMP profiles that derive from them but are not identical.
  baseline_source VARCHAR(100) NOT NULL DEFAULT 'nist_800_53b',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (framework_control_id, baseline, baseline_source)
);

CREATE INDEX IF NOT EXISTS idx_control_baselines_control
  ON control_baselines(framework_control_id);
CREATE INDEX IF NOT EXISTS idx_control_baselines_lookup
  ON control_baselines(baseline, baseline_source);

COMMENT ON TABLE control_baselines IS
  'Which impact baseline selects a given control. Populated from the NIST SP 800-53B LOW/MODERATE/HIGH profiles. Used to scope compliance denominators to the baseline an organization is pursuing rather than the whole catalog.';

-- Organization baseline selection -------------------------------------------
-- Without this, there is nothing to scope against: every compliance
-- percentage in the application counts every control of every activated
-- framework. NULL means unscoped, which preserves today's behavior exactly.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS target_baseline VARCHAR(50);

COMMENT ON COLUMN organizations.target_baseline IS
  'Impact baseline this organization is pursuing (low/moderate/high). NULL means unscoped -- compliance is measured against every control of every activated framework, which is the pre-baseline behavior.';

SELECT 'Migration 156 completed.' AS result;
