module.exports = {
    code: 'iso_42001', name: 'ISO/IEC 42001:2023', version: '2023',
    category: 'AI Governance', tier_required: 'enterprise',
    framework_group: 'iso_ai',
    description: 'AI Management System standard. Lifecycle-aligned per NIST 800-160.',
    controls: [
      { control_id: 'ISO42-4.1', title: 'Understanding the Organization', description: 'Determine external and internal issues relevant to the organization\'s AI management system.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-4.2', title: 'Needs and Expectations of Interested Parties', description: 'Determine the needs and expectations of interested parties relevant to the AI management system.', priority: '2', control_type: 'strategic' },
      { control_id: 'ISO42-5.1', title: 'Leadership and Commitment', description: 'Top management shall demonstrate leadership and commitment to the AI management system.', priority: '1', control_type: 'organizational' },
      { control_id: 'ISO42-5.2', title: 'AI Policy', description: 'Establish an AI policy appropriate to the purpose of the organization.', priority: '1', control_type: 'policy' },
      { control_id: 'ISO42-6.1', title: 'Actions to Address AI Risks', description: 'Plan actions to address AI-related risks and opportunities.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-6.2', title: 'AI Objectives and Planning', description: 'Establish AI objectives at relevant functions and levels and plan how to achieve them.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-7.1', title: 'Resources for AI Management', description: 'Determine and provide resources needed for the AI management system.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-7.2', title: 'AI Competence', description: 'Ensure persons doing work under the AI management system are competent.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-8.1', title: 'Operational Planning and Control', description: 'Plan, implement, and control processes needed to meet AI management system requirements.', priority: '1', control_type: 'technical' },
      { control_id: 'ISO42-8.2', title: 'AI Risk Assessment', description: 'Perform AI risk assessments at planned intervals or when significant changes occur.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-8.3', title: 'AI Risk Treatment', description: 'Select and implement AI risk treatment options and prepare a risk treatment plan.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-8.4', title: 'AI Impact Assessment', description: 'Conduct AI system impact assessments to evaluate effects on individuals and society.', priority: '1', control_type: 'strategic' },
      { control_id: 'ISO42-9.1', title: 'Monitoring and Measurement', description: 'Determine what needs to be monitored and measured for AI management system effectiveness.', priority: '1', control_type: 'technical' },
      { control_id: 'ISO42-9.2', title: 'Internal Audit', description: 'Conduct internal audits at planned intervals to verify AI management system conformity.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-10.1', title: 'Nonconformity and Corrective Action', description: 'React to nonconformities by taking corrective action and dealing with consequences.', priority: '2', control_type: 'organizational' },
      { control_id: 'ISO42-10.2', title: 'Continual Improvement', description: 'Continually improve the suitability, adequacy, and effectiveness of the AI management system.', priority: '2', control_type: 'organizational' },
    ]
  };
