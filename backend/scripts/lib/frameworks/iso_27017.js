module.exports = {
    code: 'iso_27017', name: 'ISO/IEC 27017:2015', version: '2015',
    category: 'Cloud Security', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Cloud security controls. Provides guidelines for information security controls applicable to cloud services based on ISO 27002.', // ip-hygiene:ignore
    controls: [
      { control_id: 'CSR-1', title: 'Cloud shared responsibility model', description: 'Define and document the shared responsibility model between cloud provider and customer.', priority: '1', control_type: 'strategic' },
      { control_id: 'CDP-1', title: 'Cloud service customer data protection', description: 'Implement data protection controls appropriate for cloud-hosted customer data.', priority: '1', control_type: 'technical' },
      { control_id: 'VM-1', title: 'Virtual machine security', description: 'Implement security controls for virtual machine isolation, hardening, and lifecycle management.', priority: '1', control_type: 'technical' },
      { control_id: 'CNS-1', title: 'Cloud network security isolation', description: 'Implement network segmentation and isolation controls within cloud environments.', priority: '1', control_type: 'technical' },
      { control_id: 'CAC-1', title: 'Cloud administrator access control', description: 'Restrict and manage cloud administrator access with strong authentication and monitoring.', priority: '1', control_type: 'technical' },
      { control_id: 'CML-1', title: 'Cloud service monitoring and logging', description: 'Implement monitoring and logging for cloud service activities and access events.', priority: '1', control_type: 'technical' },
      { control_id: 'CDL-1', title: 'Cloud data location and jurisdiction', description: 'Document and enforce policies regarding the physical location and jurisdiction of cloud data.', priority: '1', control_type: 'policy' },
      { control_id: 'CSP-1', title: 'Cloud service portability', description: 'Establish procedures for cloud service portability and migration of data between providers.', priority: '2', control_type: 'organizational' },
      { control_id: 'CIM-1', title: 'Cloud incident management', description: 'Establish cloud-specific incident management procedures including provider notification.', priority: '1', control_type: 'organizational' },
      { control_id: 'VSM-1', title: 'Virtualization security management', description: 'Manage the security of virtualization infrastructure and hypervisor configurations.', priority: '1', control_type: 'technical' },
      { control_id: 'CSA-1', title: 'Cloud service agreement security', description: 'Establish cloud service agreements that address security responsibilities and requirements.', priority: '1', control_type: 'policy' },
      { control_id: 'CDR-1', title: 'Cloud decommissioning and data removal', description: 'Ensure secure decommissioning and complete removal of data when exiting cloud services.', priority: '2', control_type: 'organizational' },
    ]
  };
