module.exports = {
    code: 'ccpa_cpra', name: 'CCPA / CPRA', version: '2023',
    category: 'Privacy', tier_required: 'govcloud',
    description: 'California Consumer Privacy Act and California Privacy Rights Act. Consumer data rights, opt-out requirements, and privacy risk assessments for California operations.',
    controls: [
      { control_id: 'CCPA-1', title: 'Right to Know / Access', description: 'Consumers have the right to know what personal information is collected and how it is used.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-2', title: 'Right to Delete', description: 'Consumers have the right to request deletion of their personal information.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-3', title: 'Right to Opt-Out of Sale', description: 'Consumers have the right to opt-out of the sale or sharing of their personal information.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-4', title: 'Right to Non-Discrimination', description: 'Businesses shall not discriminate against consumers who exercise their privacy rights.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-5', title: 'Right to Correct', description: 'Consumers have the right to request correction of inaccurate personal information.', priority: '2', control_type: 'policy' },
      { control_id: 'CCPA-6', title: 'Right to Limit Sensitive PI Use', description: 'Consumers have the right to limit the use and disclosure of their sensitive personal information.', priority: '1', control_type: 'policy' },
      { control_id: 'CCPA-7', title: 'Privacy Notice Requirements', description: 'Provide consumers with a clear and conspicuous privacy notice at or before collection.', priority: '1', control_type: 'organizational' },
      { control_id: 'CCPA-8', title: 'Service Provider Agreements', description: 'Establish contractual requirements for service providers processing personal information.', priority: '1', control_type: 'organizational' },
      { control_id: 'CCPA-9', title: 'Data Inventory and Mapping', description: 'Maintain a comprehensive inventory and mapping of personal information data flows.', priority: '1', control_type: 'technical' },
      { control_id: 'CCPA-10', title: 'Consent and Opt-In for Minors', description: 'Obtain opt-in consent before selling personal information of consumers under 16 years of age.', priority: '2', control_type: 'policy' },
      { control_id: 'CPRA-1', title: 'Privacy Risk Assessment (Annual)', description: 'Conduct annual privacy risk assessments for processing that presents significant risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'CPRA-2', title: 'Cybersecurity Audit Requirements', description: 'Perform regular cybersecurity audits for businesses whose processing presents significant risk.', priority: '1', control_type: 'organizational' },
      { control_id: 'CPRA-3', title: 'Automated Decision-Making Opt-Out', description: 'Consumers have the right to opt-out of automated decision-making technology.', priority: '1', control_type: 'policy' },
      { control_id: 'CPRA-4', title: 'Cross-Context Behavioral Advertising', description: 'Establish controls for cross-context behavioral advertising and data sharing practices.', priority: '2', control_type: 'policy' },
    ]
  };
