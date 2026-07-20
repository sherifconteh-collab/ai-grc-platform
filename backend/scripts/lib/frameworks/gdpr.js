module.exports = {
    code: 'gdpr', name: 'GDPR', version: '2016/679',
    category: 'Privacy', tier_required: 'govcloud',
    description: 'EU General Data Protection Regulation requirements.',
    controls: [
      { control_id: 'GDPR-5', title: 'Principles of Processing', description: 'Personal data shall be processed lawfully, fairly, and transparently in relation to the data subject.', priority: '1', control_type: 'policy' },
      { control_id: 'GDPR-6', title: 'Lawfulness of Processing', description: 'Processing is lawful only if at least one legal basis applies such as consent or legitimate interest.', priority: '1', control_type: 'policy' },
      { control_id: 'GDPR-7', title: 'Conditions for Consent', description: 'Where processing is based on consent, the controller shall demonstrate the data subject consented.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-12', title: 'Transparent Communication', description: 'The controller shall facilitate the exercise of data subject rights with transparent communication.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-13', title: 'Information to Data Subject (Direct)', description: 'When personal data is collected from the data subject, the controller shall provide specified information.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-15', title: 'Right of Access', description: 'The data subject shall have the right to obtain confirmation of processing and access to personal data.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-17', title: 'Right to Erasure', description: 'The data subject shall have the right to obtain erasure of personal data without undue delay.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-20', title: 'Right to Data Portability', description: 'The data subject shall have the right to receive personal data in a structured, machine-readable format.', priority: '2', control_type: 'technical' },
      { control_id: 'GDPR-25', title: 'Data Protection by Design', description: 'The controller shall implement appropriate measures for data protection by design and by default.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-28', title: 'Processor Requirements', description: 'Processing by a processor shall be governed by a contract stipulating data protection obligations.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-30', title: 'Records of Processing Activities', description: 'Each controller shall maintain a record of processing activities under its responsibility.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-32', title: 'Security of Processing', description: 'The controller shall implement appropriate technical and organizational security measures.', priority: '1', control_type: 'technical' },
      { control_id: 'GDPR-33', title: 'Breach Notification to Authority', description: 'The controller shall notify the supervisory authority of a personal data breach within 72 hours.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-34', title: 'Breach Notification to Data Subject', description: 'When a breach is likely to result in high risk, the controller shall notify the data subject.', priority: '1', control_type: 'organizational' },
      { control_id: 'GDPR-35', title: 'Data Protection Impact Assessment', description: 'Carry out a data protection impact assessment where processing is likely to result in high risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'GDPR-37', title: 'Data Protection Officer', description: 'The controller shall designate a data protection officer where required by regulation.', priority: '2', control_type: 'organizational' },
      { control_id: 'GDPR-44', title: 'International Transfers', description: 'Transfers of personal data to third countries shall only take place subject to appropriate safeguards.', priority: '2', control_type: 'organizational' },
    ]
  };
