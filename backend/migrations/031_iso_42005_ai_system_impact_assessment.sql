-- ISO/IEC 42005:2025 - AI system impact assessment guidance
-- Adds a lightweight "framework" representation so orgs can select it and track progress.

DO $$
DECLARE
  fw_id UUID;
BEGIN
  SELECT id INTO fw_id FROM frameworks WHERE code = 'iso_42005' LIMIT 1;

  IF fw_id IS NULL THEN
    INSERT INTO frameworks (code, name, version, description, category, tier_required, is_active)
    VALUES (
      'iso_42005',
      'ISO/IEC 42005:2025',
      '2025',
      'AI system impact assessment guidance. Use it to plan, document, and monitor AI impact assessments across the AI system lifecycle.',
      'AI Governance',
      'enterprise',
      true
    )
    RETURNING id INTO fw_id;
  END IF;

  -- Only insert default controls if this framework has none yet.
  IF NOT EXISTS (SELECT 1 FROM framework_controls WHERE framework_id = fw_id) THEN
    INSERT INTO framework_controls (framework_id, control_id, title, priority, control_type)
    VALUES
      (fw_id, 'IA-1', 'Impact Assessment Scope & Objectives', '1', 'strategic'),
      (fw_id, 'IA-2', 'Stakeholders & Impacted Parties Identified', '1', 'organizational'),
      (fw_id, 'IA-3', 'AI System Description & Context', '1', 'strategic'),
      (fw_id, 'IA-4', 'Data, Model, and Human Oversight Inputs', '1', 'technical'),
      (fw_id, 'IA-5', 'Impact Identification (Safety, Fairness, Privacy, Security)', '1', 'strategic'),
      (fw_id, 'IA-6', 'Impact Evaluation & Risk Rating', '1', 'strategic'),
      (fw_id, 'IA-7', 'Mitigations & Controls Plan', '1', 'policy'),
      (fw_id, 'IA-8', 'Documentation, Traceability & Accountability', '2', 'organizational'),
      (fw_id, 'IA-9', 'Communication & Transparency', '2', 'policy'),
      (fw_id, 'IA-10', 'Monitoring & Lifecycle Updates', '2', 'technical');
  END IF;
END $$;

SELECT 'Migration 031 completed.' as result;

