module.exports = {
    code: 'fiscam', name: 'FISCAM', version: '2023',
    category: 'Financial Audit', tier_required: 'pro',
    description: 'Federal Information System Controls Audit Manual for financial statement audits.',
    controls: [
      { control_id: 'SM-1', title: 'Security Management - Program', description: 'Establish an information security program that aligns with organizational mission and objectives.', priority: '1', control_type: 'strategic' },
      { control_id: 'SM-2', title: 'Security Management - Risk Assessment', description: 'Conduct risk assessments to identify threats and vulnerabilities to financial information systems.', priority: '1', control_type: 'strategic' },
      { control_id: 'SM-3', title: 'Security Management - Policy', description: 'Develop and maintain information security policies consistent with federal requirements.', priority: '1', control_type: 'policy' },
      { control_id: 'SM-4', title: 'Security Management - Plan of Action', description: 'Develop and maintain a plan of action and milestones to address security weaknesses.', priority: '2', control_type: 'organizational' },
      { control_id: 'AC-FM-1', title: 'Access Control - User Accounts', description: 'Manage user accounts including creation, modification, disabling, and removal.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-FM-2', title: 'Access Control - Authorization', description: 'Establish and enforce authorization controls for system and data access.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-FM-3', title: 'Access Control - Authentication', description: 'Implement authentication mechanisms to verify user identities before granting access.', priority: '1', control_type: 'technical' },
      { control_id: 'AC-FM-4', title: 'Access Control - Network Security', description: 'Implement network security controls to protect financial system communications.', priority: '1', control_type: 'technical' },
      { control_id: 'CC-1', title: 'Configuration Control - Software Changes', description: 'Control software changes through a formal change management process.', priority: '1', control_type: 'technical' },
      { control_id: 'CC-2', title: 'Configuration Control - Hardware/Software Config', description: 'Maintain and document hardware and software configurations for financial systems.', priority: '1', control_type: 'technical' },
      { control_id: 'SC-1', title: 'Segregation of Duties', description: 'Implement segregation of duties to prevent fraud and unauthorized modifications.', priority: '1', control_type: 'organizational' },
      { control_id: 'CP-FM-1', title: 'Contingency Planning', description: 'Develop and test contingency plans to ensure continuity of financial operations.', priority: '1', control_type: 'organizational' },
    ]
  };
