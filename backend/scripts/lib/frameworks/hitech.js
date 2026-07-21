module.exports = {
    code: 'hitech', name: 'HITECH Act', version: '2009',
    category: 'Healthcare', tier_required: 'enterprise',
    description: 'Health Information Technology for Economic and Clinical Health Act. Extends HIPAA enforcement, breach notification, and business associate requirements.', // ip-hygiene:ignore
    controls: [
      // Subtitle D — Privacy and Security of Electronic Health Information
      // Part 1 — Breach Notification (§13400–13410)
      { control_id: 'HITECH-13401', title: 'Unsecured PHI Breach Definition', description: 'Define what constitutes unsecured PHI and establish breach determination criteria.', priority: '1', control_type: 'policy' },
      { control_id: 'HITECH-13401d', title: 'Encryption and Destruction Safe Harbor', description: 'Apply encryption and destruction methods that render PHI unusable as a safe harbor from breach notification.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13402', title: 'Breach Notification to Individuals', description: 'Notify affected individuals without unreasonable delay following a breach of unsecured PHI.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13402d', title: 'Breach Notification Timeliness (60-Day Rule)', description: 'Provide breach notification within 60 days of discovery of the breach.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13402e', title: 'Substitute Breach Notification Methods', description: 'Establish substitute notification methods when direct contact information is insufficient.', priority: '2', control_type: 'organizational' },
      { control_id: 'HITECH-13403', title: 'Breach Notification to Secretary of HHS', description: 'Notify the Secretary of HHS of breaches of unsecured PHI as required by breach size thresholds.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13404', title: 'Breach Notification to Media', description: 'Notify prominent media outlets when a breach affects more than 500 residents of a state.', priority: '2', control_type: 'organizational' },
      { control_id: 'HITECH-13405', title: 'Content of Breach Notification', description: 'Include specified content elements in all breach notifications to individuals.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13407', title: 'Breach Risk Assessment (4-Factor Test)', description: 'Perform a risk assessment using four factors to determine if a breach notification is required.', priority: '1', control_type: 'strategic' },
      { control_id: 'HITECH-13408', title: 'Business Associate Breach Obligations', description: 'Business associates shall notify covered entities of breaches of unsecured PHI.', priority: '1', control_type: 'organizational' },
      // Part 2 — Business Associate and Enforcement (§13410–13424)
      { control_id: 'HITECH-13410', title: 'Business Associate HIPAA Compliance', description: 'Business associates are directly subject to HIPAA Security Rule requirements and penalties.', priority: '1', control_type: 'policy' }, // ip-hygiene:ignore
      { control_id: 'HITECH-13410e', title: 'Electronic Health Record Audit Controls', description: 'Implement audit controls for electronic health record technology to track access and modifications.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13411', title: 'Subcontractor Business Associate Requirements', description: 'Extend business associate agreement requirements to subcontractors handling PHI.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13405a', title: 'Individual Access to Electronic PHI', description: 'Provide individuals with electronic access to their PHI in electronic health records.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13405b', title: 'Individual Access Fee Limitations', description: 'Limit fees charged to individuals for copies of their PHI to reasonable cost-based amounts.', priority: '2', control_type: 'policy' },
      { control_id: 'HITECH-13421', title: 'Increased Civil Monetary Penalties', description: 'Apply increased civil monetary penalties for HIPAA violations based on the level of negligence.', priority: '1', control_type: 'policy' }, // ip-hygiene:ignore
      { control_id: 'HITECH-13422', title: 'Tiered Penalty Structure', description: 'Apply a tiered penalty structure based on the nature and extent of the violation.', priority: '2', control_type: 'policy' },
      { control_id: 'HITECH-13424', title: 'State Attorney General Enforcement', description: 'State attorneys general may bring civil actions on behalf of residents for HIPAA violations.', priority: '2', control_type: 'policy' }, // ip-hygiene:ignore
      // Strengthened Privacy Provisions
      { control_id: 'HITECH-13405c', title: 'Accounting of Disclosures for EHR', description: 'Provide an accounting of disclosures made through an electronic health record.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13406', title: 'Marketing Authorization and Restrictions', description: 'Require written authorization before using PHI for marketing and prohibit remuneration for referrals.', priority: '1', control_type: 'policy' },
      { control_id: 'HITECH-13406a', title: 'Prohibition on Sale of PHI', description: 'Prohibit the sale of PHI without written authorization from the individual.', priority: '1', control_type: 'policy' },
      { control_id: 'HITECH-13405d', title: 'Right to Request Restriction on Disclosures', description: 'Honor individual requests to restrict disclosures of PHI to health plans for self-paid services.', priority: '1', control_type: 'organizational' },
      { control_id: 'HITECH-13405e', title: 'Minimum Necessary Standard Enforcement', description: 'Enforce the minimum necessary standard limiting PHI use, disclosure, and requests.', priority: '1', control_type: 'policy' },
      // Vulnerability Management and Technical Safeguards
      { control_id: 'HITECH-13412', title: 'EHR Technology Security Certification', description: 'Ensure electronic health record technology meets security certification standards.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412a', title: 'EHR Vulnerability Assessment and Patching', description: 'Conduct vulnerability assessments and apply patches to EHR systems in a timely manner.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412b', title: 'EHR Encryption at Rest and in Transit', description: 'Encrypt ePHI at rest and in transit within electronic health record systems.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412c', title: 'EHR Access Logging and Monitoring', description: 'Implement access logging and monitoring for electronic health record systems.', priority: '1', control_type: 'technical' },
      { control_id: 'HITECH-13412d', title: 'EHR Integrity Verification Controls', description: 'Implement integrity verification controls to detect unauthorized EHR modifications.', priority: '1', control_type: 'technical' },
    ]
  };
