module.exports = {
    code: 'iso_27701', name: 'ISO/IEC 27701:2019', version: '2019',
    category: 'Privacy', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Privacy information management system (PIMS). Extension to ISO 27001 and ISO 27002 for privacy information management.', // ip-hygiene:ignore
    controls: [
      { control_id: 'PG-1', title: 'Privacy governance and accountability', description: 'Establish privacy governance and accountability structures within the organization.', priority: '1', control_type: 'strategic' },
      { control_id: 'PRA-1', title: 'Privacy risk assessment', description: 'Conduct privacy risk assessments to identify and evaluate privacy risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'PBD-1', title: 'Privacy by design integration', description: 'Integrate privacy by design principles into systems and processes from the outset.', priority: '1', control_type: 'strategic' },
      { control_id: 'DSR-1', title: 'Data subject rights management', description: 'Implement processes to manage data subject rights requests effectively.', priority: '1', control_type: 'organizational' },
      { control_id: 'PNT-1', title: 'Privacy notice and transparency', description: 'Provide clear and accessible privacy notices to individuals about data processing.', priority: '1', control_type: 'organizational' },
      { control_id: 'CMF-1', title: 'Consent management framework', description: 'Establish a framework for obtaining, recording, and managing consent.', priority: '1', control_type: 'organizational' },
      { control_id: 'DPR-1', title: 'Data processing records', description: 'Maintain records of data processing activities as required by applicable regulations.', priority: '1', control_type: 'organizational' },
      { control_id: 'PIA-1', title: 'Privacy impact assessment', description: 'Conduct privacy impact assessments for new or changed processing activities.', priority: '1', control_type: 'strategic' },
      { control_id: 'CBT-1', title: 'Cross-border data transfer safeguards', description: 'Implement safeguards for cross-border transfers of personal data.', priority: '1', control_type: 'policy' },
      { control_id: 'PIR-1', title: 'Privacy incident response', description: 'Establish incident response procedures specific to privacy breaches.', priority: '1', control_type: 'organizational' },
      { control_id: 'TPA-1', title: 'Third-party privacy assurance', description: 'Obtain assurance from third parties regarding their privacy practices and compliance.', priority: '1', control_type: 'organizational' },
      { control_id: 'PTA-1', title: 'Privacy training and awareness', description: 'Provide privacy training and awareness programs to all relevant personnel.', priority: '2', control_type: 'organizational' },
      { control_id: 'DRE-1', title: 'Data retention and erasure governance', description: 'Establish governance for data retention periods and secure erasure procedures.', priority: '1', control_type: 'policy' },
      { control_id: 'PAC-1', title: 'Privacy audit and continuous improvement', description: 'Conduct privacy audits and drive continuous improvement of the privacy program.', priority: '2', control_type: 'organizational' },
    ]
  };
