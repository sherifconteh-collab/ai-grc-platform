-- Migration 137: Framework-neutral evidence type taxonomy
--
-- Two halves of the same gap:
--
--   1. `assessment_procedures.expected_evidence` is free prose. It is
--      populated for all 3,366 procedures across every framework, but it is
--      unqueryable — you cannot ask "which procedures want a log export?"
--   2. `evidence` had no type at all. An uploaded artifact carried
--      pii_classification, data_sensitivity, and free-text tags, but nothing
--      saying WHAT IT IS. So there was no way to check whether what a user
--      uploaded is the kind of thing the procedure actually asked for.
--
-- One shared vocabulary fixes both ends. It is deliberately framework-neutral
-- — these are artifact shapes, not SOC 2 or HIPAA or PCI concepts — so every
-- framework in the catalog labels evidence the same way and a single artifact
-- can satisfy procedures across several frameworks at once. That is what makes
-- it work with crosswalks.
--
-- Ships alongside migrations 132-136.

-- ---------------------------------------------------------------------------
-- The shared vocabulary. Kept as a table rather than a CHECK constraint so
-- new types can be added without a schema migration, and so the API can serve
-- the list to populate pickers instead of hardcoding it in the frontend.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_types (
  code         text PRIMARY KEY,
  label        text NOT NULL,
  description  text NOT NULL,
  sort_order   int  NOT NULL DEFAULT 100,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO evidence_types (code, label, description, sort_order) VALUES
  ('policy',          'Policy or Standard',      'Approved policy, standard, or written procedure that defines a requirement.', 10),
  ('configuration',   'Configuration Export',    'System or tool configuration export showing how a control is set.', 20),
  ('log',             'Log or Audit Trail',      'System, application, or audit log export covering a period.', 30),
  ('ticket',          'Ticket or Change Record', 'Change, incident, or service ticket demonstrating a process ran.', 40),
  ('report',          'Assessment or Scan Report','Vulnerability scan, penetration test, audit, or assessment report.', 50),
  ('attestation',     'Attestation or Certificate','Signed attestation, management assertion, or third-party certificate.', 60),
  ('training_record', 'Training Record',         'Completion records for awareness or role-specific training.', 70),
  ('contract',        'Contract or Agreement',   'Vendor agreement, DPA, BAA, or other binding commitment.', 80),
  ('diagram',         'Diagram',                 'Architecture, network, or data-flow diagram.', 90),
  ('inventory',       'Inventory or Register',   'Asset, data, system, vendor, or processing-activity inventory.', 100),
  ('approval',        'Approval or Sign-off',    'Documented approval, authorization, or review sign-off.', 110),
  ('screenshot',      'Screenshot',              'Captured user-interface state. Weaker than a system-generated export.', 120),
  ('interview_notes', 'Interview or Walkthrough Notes','Record of a walkthrough or interview with control owners.', 130),
  ('other',           'Other',                   'Anything the vocabulary above does not describe.', 999)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- Half 1: what a procedure expects. Applies to every framework.
-- ---------------------------------------------------------------------------
ALTER TABLE assessment_procedures
  ADD COLUMN IF NOT EXISTS expected_evidence_types text[];

CREATE INDEX IF NOT EXISTS idx_assessment_procedures_expected_types
  ON assessment_procedures USING gin (expected_evidence_types);

-- ---------------------------------------------------------------------------
-- Half 2: what an uploaded artifact is.
--
-- Nullable with no default: evidence predating this migration genuinely has
-- no type, and guessing one would be worse than admitting it is unlabeled.
-- New uploads are prompted for it at the API layer.
-- ---------------------------------------------------------------------------
ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS evidence_type text REFERENCES evidence_types (code);

CREATE INDEX IF NOT EXISTS idx_evidence_org_type
  ON evidence (organization_id, evidence_type)
  WHERE evidence_type IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill expected_evidence_types from the existing prose, for every
-- framework at once. The prose is templated ("Policy/standard defining
-- requirements...", "Sample records/logs/tickets showing execution...") so
-- matching is reliable here in a way that free-text matching usually is not.
--
-- Only rows that are still unset are touched, so this is re-runnable and does
-- not clobber curation.
-- ---------------------------------------------------------------------------
WITH signals AS (
  SELECT ap.id, lower(coalesce(ap.expected_evidence, '')) AS haystack
  FROM assessment_procedures ap
  WHERE ap.expected_evidence_types IS NULL
),
classified AS (
  SELECT
    id,
    (
      CASE WHEN haystack ~ '(policy|standard|procedure defin|written procedure|documented (process|procedure|program)|process document)' THEN ARRAY['policy'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(configur|system setting|hardening|baseline)'      THEN ARRAY['configuration'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(\ylog|audit trail)'                               THEN ARRAY['log'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(ticket|change record|work order|incident record|incident report|case record)' THEN ARRAY['ticket'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(report|scan result|penetration test)'             THEN ARRAY['report'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(attestation|certificat|assertion)'                THEN ARRAY['attestation'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(training|awareness)'                              THEN ARRAY['training_record'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(contract|agreement|\ydpa\y|\ybaa\y)'              THEN ARRAY['contract'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(diagram|topolog|data.?flow)'                      THEN ARRAY['diagram'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(inventor|register|listing of)'                    THEN ARRAY['inventory'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(approv|sign-?off|authoriz)'                       THEN ARRAY['approval'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(screenshot|screen capture)'                       THEN ARRAY['screenshot'] ELSE ARRAY[]::text[] END
      || CASE WHEN haystack ~ '(walkthrough|interview|named owner)'               THEN ARRAY['interview_notes'] ELSE ARRAY[]::text[] END
    ) AS types
  FROM signals
)
UPDATE assessment_procedures ap
SET expected_evidence_types = c.types
FROM classified c
WHERE ap.id = c.id
  AND array_length(c.types, 1) > 0;

DO $$
DECLARE
  v_total     int;
  v_typed     int;
  v_fw        int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE expected_evidence_types IS NOT NULL)
    INTO v_total, v_typed
  FROM assessment_procedures;

  SELECT count(DISTINCT f.id) INTO v_fw
  FROM assessment_procedures ap
  JOIN framework_controls fc ON fc.id = ap.framework_control_id
  JOIN frameworks f ON f.id = fc.framework_id
  WHERE ap.expected_evidence_types IS NOT NULL;

  RAISE NOTICE 'expected_evidence_types: % of % procedures typed, spanning % frameworks.',
    v_typed, v_total, v_fw;
END $$;

SELECT 'Migration 137 completed.' AS result;
