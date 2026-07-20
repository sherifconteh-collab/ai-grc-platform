module.exports = {
    code: 'iso_42005', name: 'ISO/IEC 42005:2025', version: '2025',
    category: 'AI Governance', tier_required: 'enterprise',
    framework_group: 'iso_ai',
    description: 'AI system impact assessment guidance. Plan, document, and monitor AI impact assessments across the AI system lifecycle.',
    controls: [
      { control_id: 'IA-1', title: 'Impact Assessment Scope & Objectives', description: 'Define the scope, objectives, and boundaries of the AI system impact assessment.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-2', title: 'Stakeholders & Impacted Parties Identified', description: 'Identify all stakeholders and parties potentially impacted by the AI system.', priority: '1', control_type: 'organizational' },
      { control_id: 'IA-3', title: 'AI System Description & Context', description: 'Document the AI system description, intended purpose, and operational context.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-4', title: 'Data, Model, and Human Oversight Inputs', description: 'Identify data sources, model characteristics, and human oversight inputs for impact analysis.', priority: '1', control_type: 'technical' },
      { control_id: 'IA-5', title: 'Impact Identification (Safety, Fairness, Privacy, Security)', description: 'Identify potential impacts across safety, fairness, privacy, security, and societal dimensions.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-6', title: 'Impact Evaluation & Risk Rating', description: 'Evaluate identified impacts and assign risk ratings based on severity and likelihood.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-7', title: 'Mitigations & Controls Plan', description: 'Develop a plan of mitigations and controls to address identified AI impacts.', priority: '1', control_type: 'policy' },
      { control_id: 'IA-8', title: 'Documentation, Traceability & Accountability', description: 'Maintain documentation ensuring traceability, accountability, and reproducibility of the assessment.', priority: '2', control_type: 'organizational' },
      { control_id: 'IA-9', title: 'Communication & Transparency', description: 'Communicate impact assessment results transparently to relevant stakeholders.', priority: '2', control_type: 'policy' },
      { control_id: 'IA-10', title: 'Monitoring & Lifecycle Updates', description: 'Monitor AI system impacts and update the assessment throughout the system lifecycle.', priority: '2', control_type: 'technical' },
    ]
  };
