-- Migration 135: Complete the SOC 2 Trust Services Criteria
--
-- The soc2 framework shipped with 27 controls, every one of them a CC*
-- (Common Criteria) — that is the Security category alone. The other four
-- Trust Services Criteria categories were absent entirely:
--
--   Availability          A1.1  - A1.3   (3)
--   Confidentiality       C1.1  - C1.2   (2)
--   Processing Integrity  PI1.1 - PI1.5  (5)
--   Privacy               P1.1  - P8.1  (18)
--
-- A SOC 2 engagement scoped to anything beyond Security therefore had no
-- controls to assess and no procedures to run. `frameworks.coverage_status`
-- honestly reported 'core_controls', but that is a label on the gap rather
-- than a fix for it.
--
-- Control descriptions are ControlWeave's own paraphrase of each criterion.
-- The AICPA Trust Services Criteria text is copyrighted, so the requirement
-- is preserved but the wording is not reproduced. See the IP hygiene check
-- (scripts/ip-hygiene-check.js), which gates this in CI.
--
-- This adds all 28 missing criteria (TSC 2017, revised points of focus 2022)
-- with the same three-procedure examine/interview/test program the existing
-- CC* controls carry, and moves soc2 to coverage_status = 'comprehensive'.
--
-- Ships in the Access Governance / demo-data release alongside migrations
-- 126-128. Idempotent: re-running inserts nothing new.

-- assessment_procedures had no uniqueness on (framework_control_id,
-- procedure_id), so every `ON CONFLICT DO NOTHING` insert in this table was a
-- silent no-op guard: re-running any procedure seeder duplicated its rows
-- instead of skipping them. Deduplicate defensively (a deployed database may
-- already carry duplicates from a re-run seeder), then add the constraint so
-- the ON CONFLICT clauses below — and in every other seeder — actually work.
DELETE FROM assessment_procedures ap
USING assessment_procedures keep
WHERE ap.framework_control_id = keep.framework_control_id
  AND ap.procedure_id = keep.procedure_id
  AND ap.id > keep.id;

CREATE UNIQUE INDEX IF NOT EXISTS assessment_procedures_control_procedure_key
  ON assessment_procedures (framework_control_id, procedure_id);

DO $$
DECLARE
  v_framework_id   uuid;
  v_control_id     uuid;
  v_row            record;
  v_dash           text;
  v_added          int := 0;
  -- control_id, title, description, priority, control_type
  v_controls       text[][] := ARRAY[
    -- ---------------------------------------------------------------- Availability
    ARRAY['A1.1', 'Capacity Management',
      'Track current processing capacity and utilization across infrastructure, data, and software components, forecast demand, and provision additional capacity in time to keep meeting service commitments.',
      '1', 'operational'],
    ARRAY['A1.2', 'Environmental Protections, Backup, and Recovery Infrastructure',
      'Design, implement, and operate environmental safeguards, data backup processes, and recovery infrastructure so the system can withstand disruption and be restored after it.',
      '1', 'technical'],
    ARRAY['A1.3', 'Recovery Plan Testing',
      'Test recovery procedures on a defined schedule to confirm the system can actually be restored within committed timeframes.',
      '2', 'operational'],
    -- ------------------------------------------------------------- Confidentiality
    ARRAY['C1.1', 'Identification and Maintenance of Confidential Information',
      'Identify which information the organization has committed to keep confidential, and protect it accordingly throughout its lifecycle.',
      '1', 'organizational'],
    ARRAY['C1.2', 'Disposal of Confidential Information',
      'Dispose of confidential information once it is no longer needed, using methods that prevent it being recovered.',
      '1', 'operational'],
    -- -------------------------------------------------------- Processing Integrity
    ARRAY['PI1.1', 'Quality Information About Processing Objectives',
      'Define and communicate what the system processes and what its outputs are meant to be, so users understand the product or service specifications they are relying on.',
      '1', 'organizational'],
    ARRAY['PI1.2', 'System Inputs — Completeness and Accuracy',
      'Control how data enters the system so that inputs are complete and accurate before processing begins.',
      '1', 'technical'],
    ARRAY['PI1.3', 'System Processing',
      'Control processing itself so records are handled completely, accurately, and in the correct sequence.',
      '1', 'technical'],
    ARRAY['PI1.4', 'System Output — Delivery',
      'Deliver or make output available completely, accurately, on time, and only to the intended recipients.',
      '2', 'technical'],
    ARRAY['PI1.5', 'Storage of Inputs, Items in Processing, and Outputs',
      'Store inputs, items in processing, and outputs completely and accurately, and keep them retrievable for as long as specifications require.',
      '2', 'technical'],
    -- --------------------------------------------------------------------- Privacy
    ARRAY['P1.1', 'Notice of Privacy Practices',
      'Publish a privacy notice describing how personal information is handled, and communicate changes to data subjects promptly.',
      '1', 'policy'],
    ARRAY['P2.1', 'Choice and Consent',
      'Tell data subjects what choices they have over the collection, use, retention, disclosure, and disposal of their information, and record the consent obtained.',
      '1', 'policy'],
    ARRAY['P3.1', 'Collection Consistent With Objectives',
      'Collect only the personal information the organization''s stated privacy objectives call for.',
      '1', 'operational'],
    ARRAY['P3.2', 'Explicit Consent for Sensitive Information',
      'Where information requires explicit consent, explain why it is needed and obtain that consent before collecting it.',
      '1', 'operational'],
    ARRAY['P4.1', 'Limitation of Use',
      'Use personal information only for the purposes stated in the privacy notice.',
      '1', 'operational'],
    ARRAY['P4.2', 'Retention of Personal Information',
      'Retain personal information no longer than the stated privacy objectives require.',
      '2', 'operational'],
    ARRAY['P4.3', 'Secure Disposal of Personal Information',
      'Securely destroy personal information at the end of its retention period so it cannot be reconstructed.',
      '1', 'technical'],
    ARRAY['P5.1', 'Data Subject Access',
      'Let authenticated data subjects review the personal information held about them, and provide a copy on request.',
      '1', 'operational'],
    ARRAY['P5.2', 'Correction and Amendment',
      'Correct, amend, or append personal information at a data subject''s request, and pass those corrections to third parties where the organization has committed to do so.',
      '2', 'operational'],
    ARRAY['P6.1', 'Disclosure With Consent',
      'Obtain explicit consent from the data subject before disclosing personal information to a third party.',
      '1', 'operational'],
    ARRAY['P6.2', 'Record of Authorized Disclosures',
      'Keep a complete and timely record of every authorized disclosure of personal information.',
      '2', 'operational'],
    ARRAY['P6.3', 'Record of Unauthorized Disclosures',
      'Keep a complete and timely record of every unauthorized disclosure that is detected or reported.',
      '1', 'operational'],
    ARRAY['P6.4', 'Third-Party Privacy Commitments',
      'Obtain binding privacy commitments from vendors and other third parties before granting them access to personal information.',
      '1', 'organizational'],
    ARRAY['P6.5', 'Third-Party Breach Notification Commitments',
      'Require third parties with access to personal information to notify the organization of actual or suspected unauthorized disclosure.',
      '1', 'organizational'],
    ARRAY['P6.6', 'Breach and Incident Notification',
      'Notify affected data subjects, regulators, and other required parties when a privacy breach or incident occurs.',
      '1', 'operational'],
    ARRAY['P6.7', 'Accounting of Personal Information Held and Disclosed',
      'On request, give a data subject an accounting of the personal information held about them and of the disclosures that have been made.',
      '2', 'operational'],
    ARRAY['P7.1', 'Data Quality',
      'Keep personal information accurate, current, complete, and relevant to the purposes it was collected for.',
      '2', 'operational'],
    ARRAY['P8.1', 'Privacy Complaint and Dispute Handling',
      'Run a process for receiving, investigating, resolving, and communicating the outcome of privacy inquiries, complaints, and disputes, and monitor it for recurring issues.',
      '1', 'organizational']
  ];
BEGIN
  SELECT id INTO v_framework_id FROM frameworks WHERE code = 'soc2';

  IF v_framework_id IS NULL THEN
    RAISE NOTICE 'soc2 framework not seeded yet; migration 129 is a no-op. Run seed:frameworks then re-run.';
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(v_controls, 1) LOOP
    INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
    VALUES (
      v_framework_id,
      v_controls[i][1],
      v_controls[i][2],
      v_controls[i][3],
      v_controls[i][4],
      v_controls[i][5]
    )
    ON CONFLICT (framework_id, control_id) DO NOTHING;
  END LOOP;

  -- Assessment procedures: the same examine / interview / test program the
  -- existing CC* controls carry, so a Privacy- or Availability-scoped
  -- engagement gets a real audit program rather than bare control text.
  -- procedure_id mirrors the established '<CONTROL-WITH-DASHES>-RICH-<X>01'
  -- pattern so it stays unique and recognizable alongside the CC* set.
  FOR v_row IN
    SELECT fc.id, fc.control_id
    FROM framework_controls fc
    WHERE fc.framework_id = v_framework_id
      AND fc.control_id !~ '^CC'
  LOOP
    v_dash := replace(v_row.control_id, '.', '-');

    INSERT INTO assessment_procedures
      (framework_control_id, procedure_id, title, description, procedure_type,
       assessment_method, depth, expected_evidence, frequency_guidance, sort_order)
    VALUES
      (v_row.id, v_dash || '-RICH-E01',
       'Examine evidence for ' || v_row.control_id,
       'Review documented artifacts demonstrating ' || v_row.control_id || ' is defined, implemented, and maintained across the systems in scope for the examination period.',
       'examine', 'document_review', 'focused',
       E'- Policy/standard defining requirements and ownership.\n- Implementation records showing the control is configured and operating.\n- Approval and review records covering the examination period.',
       'Each examination period; refresh whenever the underlying policy or system changes.',
       940),
      (v_row.id, v_dash || '-RICH-I01',
       'Interview control owners for ' || v_row.control_id,
       'Interview responsible personnel to confirm how ' || v_row.control_id || ' operates in practice and how exceptions are identified, escalated, and resolved.',
       'interview', 'personnel_interview', 'focused',
       E'- Named owner(s) and accountable approver(s)\n- Walkthrough of the operating process and tools\n- Examples of recent exceptions and how they were handled',
       'Each examination period.',
       945),
      (v_row.id, v_dash || '-RICH-T01',
       'Test operating effectiveness for ' || v_row.control_id,
       'Select a representative sample of in-scope systems, records, or data subjects and test that ' || v_row.control_id || ' operated effectively throughout the examination period.',
       'test', 'system_test', 'comprehensive',
       E'- Sample records/logs/tickets showing execution and review\n- Evidence of monitoring and follow-up actions for the period\n- Reperformance results or system-generated confirmations',
       'Each examination period; increase sample size where exceptions are found.',
       950)
    ON CONFLICT (framework_control_id, procedure_id) DO NOTHING;
  END LOOP;

  SELECT count(*) INTO v_added
  FROM framework_controls
  WHERE framework_id = v_framework_id AND control_id !~ '^CC';

  -- All five Trust Services Criteria categories are now represented.
  UPDATE frameworks SET coverage_status = 'comprehensive' WHERE id = v_framework_id;

  RAISE NOTICE 'SOC 2: % criteria present outside the Common Criteria set.', v_added;
END $$;

SELECT 'Migration 135 completed.' AS result;
