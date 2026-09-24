module.exports = {
    code: 'iso_27002', name: 'ISO/IEC 27002:2022', version: '2022',
    category: 'Information Security', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Information security controls guidance. Companion to ISO 27001 providing detailed implementation guidance for Annex A controls.', // ip-hygiene:ignore
    controls: [
      { control_id: 'AC-1', title: 'Access control management', description: 'Implement access control management policies and processes based on business requirements.', priority: '1', control_type: 'technical' },
      { control_id: 'CR-1', title: 'Cryptographic controls', description: 'Ensure proper and effective use of cryptography to protect confidentiality and integrity.', priority: '1', control_type: 'technical' },
      { control_id: 'PS-1', title: 'Physical security controls', description: 'Prevent unauthorized physical access, damage, and interference to information facilities.', priority: '1', control_type: 'physical' },
      { control_id: 'OS-1', title: 'Operations security monitoring', description: 'Ensure correct and secure operations of information processing facilities.', priority: '1', control_type: 'technical' },
      { control_id: 'CS-1', title: 'Communications security', description: 'Ensure the protection of information in networks and supporting information transfer facilities.', priority: '1', control_type: 'technical' },
      { control_id: 'SD-1', title: 'System acquisition and development', description: 'Ensure information security is designed and implemented within the development lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'SR-1', title: 'Supplier relationship security', description: 'Ensure protection of the organization\'s assets accessible by suppliers.', priority: '1', control_type: 'organizational' },
      { control_id: 'IM-1', title: 'Information security incident management', description: 'Ensure a consistent approach to managing information security incidents.', priority: '1', control_type: 'organizational' },
      { control_id: 'BC-1', title: 'Business continuity management', description: 'Embed information security continuity in the organization\'s business continuity systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'CL-1', title: 'Compliance with legal requirements', description: 'Avoid breaches of legal, statutory, regulatory, or contractual obligations.', priority: '1', control_type: 'policy' },
      { control_id: 'IP-1', title: 'Information security policies', description: 'Provide management direction and support for information security in accordance with requirements.', priority: '1', control_type: 'policy' },
      { control_id: 'HR-1', title: 'Human resource security', description: 'Ensure employees and contractors understand their information security responsibilities.', priority: '1', control_type: 'organizational' },
      { control_id: 'AM-1', title: 'Asset management controls', description: 'Identify organizational assets and define appropriate protection responsibilities.', priority: '1', control_type: 'organizational' },
      { control_id: 'ID-1', title: 'Identity management', description: 'Ensure authorized user access and prevent unauthorized access to systems and services.', priority: '1', control_type: 'technical' },
      { control_id: 'TI-1', title: 'Threat intelligence', description: 'Collect and analyze threat intelligence to support proactive security decisions.', priority: '2', control_type: 'technical' },
    ]
  };
