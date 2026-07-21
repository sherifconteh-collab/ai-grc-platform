module.exports = {
    code: 'nerc_cip', name: 'NERC CIP', version: '2024',
    category: 'Critical Infrastructure', tier_required: 'govcloud',
    description: 'North American Electric Reliability Corporation Critical Infrastructure Protection.',
    controls: [
      { control_id: 'CIP-002-6', title: 'BES Cyber System Categorization', description: 'Identify and categorize BES Cyber Systems by their impact on the reliable operation of the BES.', priority: '1', control_type: 'strategic' },
      { control_id: 'CIP-003-9', title: 'Security Management Controls', description: 'Specify consistent and sustainable security management controls for BES Cyber Systems.', priority: '1', control_type: 'policy' },
      { control_id: 'CIP-004-7', title: 'Personnel and Training', description: 'Require personnel risk assessments, training, and access management for BES Cyber Systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'CIP-005-7', title: 'Electronic Security Perimeter', description: 'Manage electronic access to BES Cyber Systems by specifying a controlled Electronic Security Perimeter.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-006-6', title: 'Physical Security', description: 'Manage physical access to BES Cyber Systems through defined Physical Security Plans.', priority: '1', control_type: 'physical' },
      { control_id: 'CIP-007-6', title: 'System Security Management', description: 'Manage system security by specifying security patch management, malware prevention, and logging.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-008-6', title: 'Incident Reporting and Response', description: 'Specify incident reporting and response planning requirements for BES Cyber Systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'CIP-009-6', title: 'Recovery Plans', description: 'Ensure recovery plan specifications for BES Cyber Systems following qualifying events.', priority: '1', control_type: 'organizational' },
      { control_id: 'CIP-010-4', title: 'Configuration Change Management', description: 'Prevent and detect unauthorized changes to BES Cyber Systems through configuration management.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-011-3', title: 'Information Protection', description: 'Prevent unauthorized access to BES Cyber System Information through information protection.', priority: '1', control_type: 'technical' },
      { control_id: 'CIP-013-2', title: 'Supply Chain Risk Management', description: 'Mitigate cybersecurity risks to BES Cyber Systems from supply chain compromise.', priority: '1', control_type: 'strategic' },
      { control_id: 'CIP-014-3', title: 'Physical Security', description: 'Identify and protect Transmission stations and substations from physical attack.', priority: '2', control_type: 'physical' },
    ]
  };
