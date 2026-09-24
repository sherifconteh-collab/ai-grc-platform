module.exports = {
    code: 'iso_27018', name: 'ISO/IEC 27018:2019', version: '2019',
    category: 'Privacy', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'PII protection in public cloud. Code of practice for protection of personally identifiable information in public cloud environments.', // ip-hygiene:ignore
    controls: [
      { control_id: 'PC-1', title: 'PII processor consent and purpose limitation', description: 'Process PII only for the purposes specified by the cloud service customer.', priority: '1', control_type: 'policy' },
      { control_id: 'PD-1', title: 'PII data subject rights', description: 'Enable data subjects to exercise their rights regarding their PII in the cloud.', priority: '1', control_type: 'organizational' },
      { control_id: 'PT-1', title: 'PII transparency and notification', description: 'Provide transparent notification about PII processing activities and purposes.', priority: '1', control_type: 'organizational' },
      { control_id: 'PL-1', title: 'PII processing limitation', description: 'Limit PII processing to what is necessary for the specified and legitimate purposes.', priority: '1', control_type: 'policy' },
      { control_id: 'CT-1', title: 'PII cross-border transfer controls', description: 'Implement controls for cross-border transfer of PII in cloud environments.', priority: '1', control_type: 'policy' },
      { control_id: 'SP-1', title: 'PII sub-processor management', description: 'Manage and oversee sub-processors that handle PII on behalf of the cloud processor.', priority: '1', control_type: 'organizational' },
      { control_id: 'PB-1', title: 'PII breach notification', description: 'Notify the cloud service customer of any PII breach in a timely manner.', priority: '1', control_type: 'organizational' },
      { control_id: 'PR-1', title: 'PII retention and disposal', description: 'Implement PII retention and secure disposal policies for cloud-processed data.', priority: '1', control_type: 'organizational' },
      { control_id: 'PE-1', title: 'PII encryption and pseudonymization', description: 'Apply encryption and pseudonymization techniques to protect PII in cloud environments.', priority: '1', control_type: 'technical' },
      { control_id: 'PA-1', title: 'PII access logging and monitoring', description: 'Log and monitor access to PII within cloud services for accountability.', priority: '1', control_type: 'technical' },
      { control_id: 'PV-1', title: 'PII processor compliance verification', description: 'Enable verification of cloud PII processor compliance through audits and attestations.', priority: '1', control_type: 'organizational' },
    ]
  };
