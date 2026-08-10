-- Migration 157: Make assessment procedures upsertable
--
-- scripts/seed-assessment-procedures.js opened by deleting
-- assessment_plan_procedures, assessment_results and assessment_procedures --
-- in that order. assessment_results holds real customer assessment outcomes:
-- what an assessor actually concluded about a control, which is the output of
-- the work the platform exists to support. Re-seeding the procedure *catalog*
-- is not a reason to destroy that, and a seed script that silently erases
-- assessment history is a data-loss bug rather than a reset.
--
-- Making the seed non-destructive requires procedures to be upsertable, which
-- requires a uniqueness constraint they never had. (procedure_id alone is not
-- unique -- the same identifier shape recurs across frameworks -- so the
-- constraint is on the pair.)
--
-- Rows are deduplicated before the constraint is added, keeping the oldest of
-- each group so any assessment_results referencing a procedure keep pointing
-- at a row that still exists.
--
-- Ships in the AU control family remediation batch (catalog track).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assessment_procedures_control_procedure_key'
  ) THEN
    -- Collapse any pre-existing duplicates, oldest wins.
    DELETE FROM assessment_procedures a
     USING assessment_procedures b
     WHERE a.framework_control_id = b.framework_control_id
       AND a.procedure_id IS NOT DISTINCT FROM b.procedure_id
       AND a.ctid > b.ctid;

    ALTER TABLE assessment_procedures
      ADD CONSTRAINT assessment_procedures_control_procedure_key
      UNIQUE (framework_control_id, procedure_id);
  END IF;
END$$;

COMMENT ON CONSTRAINT assessment_procedures_control_procedure_key ON assessment_procedures IS
  'Lets the procedure seed upsert instead of delete-and-rebuild, so re-seeding the procedure catalog no longer destroys assessment_results.';

SELECT 'Migration 157 completed.' AS result;
