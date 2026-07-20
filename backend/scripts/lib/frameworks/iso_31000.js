module.exports = {
    code: 'iso_31000', name: 'ISO 31000:2018', version: '2018',
    category: 'Risk Management', tier_required: 'enterprise',
    framework_group: 'iso_27000',
    description: 'Risk management principles and guidelines. Provides a framework for managing risk across all organizational activities.', // ip-hygiene:ignore
    controls: [
      { control_id: 'RMF-1', title: 'Risk management framework establishment', description: 'Establish a risk management framework that integrates into organizational governance.', priority: '1', control_type: 'strategic' },
      { control_id: 'LCR-1', title: 'Leadership commitment to risk management', description: 'Ensure leadership commitment to embedding risk management into all organizational activities.', priority: '1', control_type: 'organizational' },
      { control_id: 'RMP-1', title: 'Risk management policy', description: 'Define a risk management policy that articulates the organization\'s risk management commitment.', priority: '1', control_type: 'policy' },
      { control_id: 'RAP-1', title: 'Risk assessment process design', description: 'Design a systematic risk assessment process covering identification, analysis, and evaluation.', priority: '1', control_type: 'strategic' },
      { control_id: 'RIT-1', title: 'Risk identification techniques', description: 'Apply comprehensive risk identification techniques to uncover sources of risk.', priority: '1', control_type: 'strategic' },
      { control_id: 'RAE-1', title: 'Risk analysis and evaluation', description: 'Analyze and evaluate risks to determine their nature, likelihood, and level of impact.', priority: '1', control_type: 'strategic' },
      { control_id: 'RTP-1', title: 'Risk treatment planning and implementation', description: 'Plan and implement risk treatment options to modify, share, avoid, or retain risks.', priority: '1', control_type: 'strategic' },
      { control_id: 'RMC-1', title: 'Risk monitoring and continuous improvement', description: 'Monitor and review the risk management framework and its outcomes for continuous improvement.', priority: '1', control_type: 'organizational' },
      { control_id: 'RCC-1', title: 'Risk communication and consultation', description: 'Communicate and consult with stakeholders throughout the risk management process.', priority: '2', control_type: 'organizational' },
      { control_id: 'RMI-1', title: 'Risk management integration across processes', description: 'Integrate risk management into all organizational processes, governance, and decision-making.', priority: '1', control_type: 'organizational' },
      { control_id: 'RCB-1', title: 'Risk culture and capability building', description: 'Build risk management culture and capability through training and organizational development.', priority: '2', control_type: 'organizational' },
    ]
  };
