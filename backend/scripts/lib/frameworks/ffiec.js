module.exports = {
    code: 'ffiec', name: 'FFIEC IT Examination Handbook', version: '2024',
    category: 'Financial', tier_required: 'enterprise',
    description: 'Federal Financial Institutions Examination Council IT standards.',
    controls: [
      { control_id: 'FFIEC-AUD-1', title: 'Audit Program', description: 'Establish an IT audit program that provides independent assurance of IT risk management.', priority: '1', control_type: 'organizational' },
      { control_id: 'FFIEC-AUD-2', title: 'Audit Independence', description: 'Ensure IT audit functions maintain independence from IT management and operations.', priority: '2', control_type: 'organizational' },
      { control_id: 'FFIEC-IS-1', title: 'Information Security Program', description: 'Develop and implement an enterprise-wide information security program.', priority: '1', control_type: 'strategic' },
      { control_id: 'FFIEC-IS-2', title: 'Risk Assessment', description: 'Conduct risk assessments to identify threats to institution information assets.', priority: '1', control_type: 'strategic' },
      { control_id: 'FFIEC-IS-3', title: 'Security Controls', description: 'Implement security controls commensurate with the risk profile of the institution.', priority: '1', control_type: 'technical' },
      { control_id: 'FFIEC-BCP-1', title: 'Business Continuity Planning', description: 'Develop and maintain a business continuity plan that addresses technology recovery.', priority: '1', control_type: 'organizational' },
      { control_id: 'FFIEC-BCP-2', title: 'BCP Testing', description: 'Test business continuity plans periodically and update based on results.', priority: '2', control_type: 'organizational' },
      { control_id: 'FFIEC-OPS-1', title: 'IT Operations', description: 'Implement IT operations processes that ensure availability and reliability of systems.', priority: '1', control_type: 'technical' },
      { control_id: 'FFIEC-OPS-2', title: 'Change Management', description: 'Establish change management processes to control modifications to IT systems.', priority: '1', control_type: 'organizational' },
      { control_id: 'FFIEC-AM-1', title: 'Authentication and Access', description: 'Implement authentication and access controls commensurate with the risk of the transaction.', priority: '1', control_type: 'technical' },
      { control_id: 'FFIEC-CYB-1', title: 'Cybersecurity Assessment', description: 'Perform ongoing cybersecurity assessments and maintain an inherent risk profile.', priority: '1', control_type: 'strategic' },
      { control_id: 'FFIEC-CYB-2', title: 'Threat Intelligence', description: 'Gather and analyze threat intelligence to support proactive cybersecurity measures.', priority: '2', control_type: 'technical' },
    ]
  };
