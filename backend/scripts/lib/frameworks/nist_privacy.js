module.exports = {
    code: 'nist_privacy', name: 'NIST Privacy Framework', version: '1.0',
    category: 'Privacy', tier_required: 'govcloud',
    description: 'Privacy risk management framework integrated with NIST 800-160 lifecycle.',
    controls: [
      { control_id: 'ID-P.01', title: 'Inventory and Mapping - Data Processing Inventory', description: 'Develop and maintain a data processing inventory covering all personal data activities.', priority: '1', control_type: 'technical' },
      { control_id: 'ID-P.02', title: 'Inventory and Mapping - Data Actions Identified', description: 'Data actions including collection, use, sharing, and disposal are identified and documented.', priority: '1', control_type: 'technical' },
      { control_id: 'GV-P.01', title: 'Governance - Privacy Policy', description: 'Establish and communicate a privacy policy that addresses purpose, scope, and compliance.', priority: '1', control_type: 'policy' },
      { control_id: 'GV-P.02', title: 'Governance - Legal Authorities', description: 'Legal authorities for data processing activities are identified and documented.', priority: '1', control_type: 'organizational' },
      { control_id: 'GV-P.03', title: 'Governance - Privacy Risk Strategy', description: 'Establish a privacy risk management strategy aligned with organizational risk tolerance.', priority: '1', control_type: 'strategic' },
      { control_id: 'CT-P.01', title: 'Control - Data Processing Policies', description: 'Data processing policies are established to manage privacy risks.', priority: '1', control_type: 'policy' },
      { control_id: 'CT-P.02', title: 'Control - Data Access Managed', description: 'Data access is managed and limited to authorized purposes and individuals.', priority: '1', control_type: 'technical' },
      { control_id: 'CM-P.01', title: 'Communicate - Individuals Informed', description: 'Individuals are informed about data processing activities and their rights.', priority: '1', control_type: 'organizational' },
      { control_id: 'CM-P.02', title: 'Communicate - Consent Mechanisms', description: 'Mechanisms for obtaining and tracking consent are implemented and maintained.', priority: '1', control_type: 'technical' },
      { control_id: 'PR-P.01', title: 'Protect - Data Protection Safeguards', description: 'Safeguards are implemented to protect personal data from unauthorized access and disclosure.', priority: '1', control_type: 'technical' },
      { control_id: 'PR-P.02', title: 'Protect - Identity Management', description: 'Identity management and access control mechanisms protect data processing activities.', priority: '1', control_type: 'technical' },
    ]
  };
