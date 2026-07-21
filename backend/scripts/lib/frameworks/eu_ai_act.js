module.exports = {
    code: 'eu_ai_act', name: 'EU AI Act', version: '2024',
    category: 'AI Governance', tier_required: 'govcloud',
    description: 'European Union Artificial Intelligence Act. Full lifecycle governance per NIST 800-160.',
    controls: [
      { control_id: 'AIA-Art6', title: 'Classification Rules for High-Risk AI', description: 'Classify AI systems as high-risk based on their intended purpose and potential impact.', priority: '1', control_type: 'strategic' },
      { control_id: 'AIA-Art9', title: 'Risk Management System', description: 'Establish and implement a risk management system throughout the AI system lifecycle.', priority: '1', control_type: 'strategic' },
      { control_id: 'AIA-Art10', title: 'Data and Data Governance', description: 'Ensure training, validation, and testing data sets meet quality criteria and governance practices.', priority: '1', control_type: 'technical' },
      { control_id: 'AIA-Art11', title: 'Technical Documentation', description: 'Prepare technical documentation demonstrating compliance before an AI system is placed on the market.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art12', title: 'Record Keeping / Logging', description: 'Enable automatic recording of events (logging) throughout the AI system lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'AIA-Art13', title: 'Transparency and Information', description: 'Design high-risk AI systems to be sufficiently transparent to enable users to interpret output.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art14', title: 'Human Oversight', description: 'Design high-risk AI systems to be effectively overseen by natural persons during use.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art15', title: 'Accuracy, Robustness, Cybersecurity', description: 'Ensure high-risk AI systems achieve appropriate levels of accuracy, robustness, and cybersecurity.', priority: '1', control_type: 'technical' },
      { control_id: 'AIA-Art17', title: 'Quality Management System', description: 'Put in place a quality management system to ensure compliance with the AI Act.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art22', title: 'Authorized Representative Obligations', description: 'Authorized representatives shall perform tasks specified in the mandate from the provider.', priority: '3', control_type: 'organizational' },
      { control_id: 'AIA-Art26', title: 'Deployer Obligations', description: 'Deployers of high-risk AI systems shall use such systems in accordance with instructions.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art27', title: 'Fundamental Rights Impact Assessment', description: 'Perform a fundamental rights impact assessment before deploying high-risk AI systems.', priority: '1', control_type: 'strategic' },
      { control_id: 'AIA-Art50', title: 'Transparency for Generative AI', description: 'Providers of generative AI shall ensure transparency about AI-generated content.', priority: '1', control_type: 'organizational' },
      { control_id: 'AIA-Art52', title: 'Prohibited AI Practices', description: 'Certain AI practices that create unacceptable risk are prohibited within the EU.', priority: '1', control_type: 'policy' },
      { control_id: 'AIA-Art72', title: 'Penalties for Non-Compliance', description: 'Non-compliance with the AI Act may result in administrative fines up to 35 million EUR or 7% of turnover.', priority: '2', control_type: 'organizational' },
    ]
  };
