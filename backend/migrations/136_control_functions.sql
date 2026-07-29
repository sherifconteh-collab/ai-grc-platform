-- Migration 136: Classify controls by function (preventive / detective / corrective)
--
-- `framework_controls.control_type` already records what KIND of control
-- something is (technical, organizational, policy, physical, ...). That is the
-- NIST/ISO control-family axis. It does not answer the question an auditor
-- actually asks when evaluating control design: what does this control DO —
-- stop something happening, notice it happened, or fix it afterwards.
--
-- This adds that second, orthogonal axis across every framework in the
-- catalog, not just one.
--
-- Why an array and not a single value: plenty of real controls are genuinely
-- multi-function. "Monitor access and revoke inappropriate entitlements" is
-- detective AND corrective; forcing a single label would make the filter lie.
--
-- Why so many rows stay NULL: the backfill below only classifies on
-- unambiguous signals. A wrong function label in a GRC tool is worse than an
-- absent one — it would misrepresent control design in an assessment. NULL
-- means "not yet classified", and the column is editable, so admins refine it
-- for their own control set. Frameworks added later start NULL too.
--
-- Ships alongside migrations 132-135.

ALTER TABLE framework_controls
  ADD COLUMN IF NOT EXISTS control_functions text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'framework_controls'::regclass
      AND conname = 'framework_controls_control_functions_check'
  ) THEN
    ALTER TABLE framework_controls
      ADD CONSTRAINT framework_controls_control_functions_check
      CHECK (
        control_functions IS NULL
        OR (
          array_length(control_functions, 1) > 0
          AND control_functions <@ ARRAY['preventive', 'detective', 'corrective']::text[]
        )
      );
  END IF;
END $$;

-- Overlap queries (`control_functions && ARRAY['detective']`) need GIN.
CREATE INDEX IF NOT EXISTS idx_framework_controls_functions
  ON framework_controls USING gin (control_functions);

-- ---------------------------------------------------------------------------
-- Conservative backfill, matched against control TITLE only.
--
-- An earlier pass matched title+description together and was measurably
-- worse: descriptions mention adjacent concepts that are not what the control
-- does. NIST CA-2 "Control Assessments" came out preventive because its
-- description names an authorizing official, and SOC 2 P6.3 "Record of
-- Unauthorized Disclosures" came out preventive because "authoriz" matches
-- inside "unauthorized". Titles are short and state the control's purpose, so
-- they are the higher-precision signal.
--
-- Every pattern is anchored with \y (word boundary) so no keyword can match
-- inside a larger word — that is what stops "unauthorized" reading as
-- "authorized".
--
-- Policy/notice/agreement controls are classified preventive. They are
-- strictly directive, but within a three-value taxonomy preventive is the
-- honest nearest fit.
--
-- Only unclassified rows are touched, so admin edits survive a re-run.
-- ---------------------------------------------------------------------------
WITH signals AS (
  SELECT fc.id, lower(coalesce(fc.title, '')) AS haystack
  FROM framework_controls fc
  WHERE fc.control_functions IS NULL
),
classified AS (
  SELECT
    id,
    (
      -- Preventive: stops the event, or directs behavior so it does not occur.
      CASE WHEN haystack ~ '(\yprevent|\yprohibit|\yrestrict|\yenforce|\yauthoriz|\yauthentic|\yencrypt|least privilege|access control|segregat|separation of duties|\ybaseline|multifactor|multi-factor|\ydeny|\yblock|\yharden|\yallowlist|\ytraining|\ypolicy|\ypolicies|\yconsent|\ynotice|\yagreement)'
           THEN ARRAY['preventive'] ELSE ARRAY[]::text[] END
      ||
      -- Detective: notices that something happened or is out of tolerance.
      CASE WHEN haystack ~ '(\ydetect|\ymonitor|\ylog(s|ging)?\y|audit log|audit trail|\yscan|\yalert|\yaudit\y|\yreview|\yassessment|\yinspect|\ytesting|\ytest\y|\yevaluat|\yoversight|\ysurveil|\ytrack)'
           THEN ARRAY['detective'] ELSE ARRAY[]::text[] END
      ||
      -- Corrective: restores, repairs, or resolves after the fact.
      CASE WHEN haystack ~ '(\yremediat|corrective|\yrespon(se|d)|\yincident|\yrecover|\yrestor|\ycontingency|\ybackup|\ydisaster|\yrepair|\ydisposal|\ydispose|\yresolution)'
           THEN ARRAY['corrective'] ELSE ARRAY[]::text[] END
    ) AS functions
  FROM signals
)
UPDATE framework_controls fc
SET control_functions = c.functions
FROM classified c
WHERE fc.id = c.id
  AND array_length(c.functions, 1) > 0;

DO $$
DECLARE
  v_total       int;
  v_classified  int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE control_functions IS NOT NULL)
    INTO v_total, v_classified
  FROM framework_controls;

  RAISE NOTICE 'control_functions: % of % controls classified (% unclassified, editable).',
    v_classified, v_total, v_total - v_classified;
END $$;

SELECT 'Migration 136 completed.' AS result;
