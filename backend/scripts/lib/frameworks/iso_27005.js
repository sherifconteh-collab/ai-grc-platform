module.exports = {
    code: 'iso_27005', name: 'ISO/IEC 27005:2022', version: '2022',
    category: 'Information Security', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Information security risk management. Provides guidelines for risk assessment and treatment aligned with ISO 27001 requirements.', // ip-hygiene:ignore
    controls: [
      { control_id: 'RC-1', title: 'Risk context establishment', description: 'Establish the external and internal context for information security risk management.', priority: '1', control_type: 'strategic' },
      { control_id: 'IA-1', title: 'Information asset identification', description: 'Identify information assets, their owners, and their value to the organization.', priority: '1', control_type: 'organizational' },
      { control_id: 'TH-1', title: 'Threat identification and assessment', description: 'Identify and assess threats that could exploit vulnerabilities in information assets.', priority: '1', control_type: 'strategic' },
      { control_id: 'VI-1', title: 'Vulnerability identification', description: 'Identify vulnerabilities that could be exploited by identified threats.', priority: '1', control_type: 'technical' },
      { control_id: 'RA-1', title: 'Risk analysis methodology', description: 'Define and apply a systematic risk analysis methodology for evaluating identified risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'RE-1', title: 'Risk evaluation criteria', description: 'Establish criteria for evaluating the significance of identified information security risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'RT-1', title: 'Risk treatment options', description: 'Select appropriate risk treatment options: modify, retain, avoid, or share risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'RAC-1', title: 'Risk acceptance criteria', description: 'Define criteria for accepting residual risks based on organizational risk appetite.', priority: '1', control_type: 'policy' },
      { control_id: 'RCP-1', title: 'Risk communication plan', description: 'Establish a plan for communicating risk information to relevant stakeholders.', priority: '2', control_type: 'organizational' },
      { control_id: 'RM-1', title: 'Risk monitoring and review', description: 'Monitor and review risks and the effectiveness of risk treatment on an ongoing basis.', priority: '1', control_type: 'organizational' },
      { control_id: 'RD-1', title: 'Residual risk documentation', description: 'Document residual risks and obtain formal acceptance from risk owners.', priority: '2', control_type: 'organizational' },
      { control_id: 'RAI-1', title: 'Risk assessment iteration', description: 'Iterate the risk assessment process to capture changes in the risk environment.', priority: '2', control_type: 'strategic' },
    ]
  };
