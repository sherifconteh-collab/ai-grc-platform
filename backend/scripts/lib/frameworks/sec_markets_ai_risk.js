module.exports = {
    code: 'sec_markets_ai_risk', name: 'SEC AI Risk Management for RIAs & Broker-Dealers', version: '2024',
    category: 'Financial Services AI Governance', tier_required: 'govcloud',
    description: 'SEC guidance on conflicts-of-interest, fiduciary duty, and explainability requirements for AI-driven investment advice and automated compliance programmes.',
    controls: [
      { control_id: 'SEC-AI-1', title: 'Conflicts of Interest Disclosure', description: 'Identify and disclose conflicts of interest arising from the use of AI in investment advice.', priority: '1', control_type: 'organizational' },
      { control_id: 'SEC-AI-2', title: 'Fiduciary Duty and Explainability', description: 'Ensure AI-driven advice meets fiduciary duty requirements with explainable recommendations.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-3', title: 'Robo-Advisory Risk Assessment', description: 'Assess and manage risks specific to robo-advisory services and automated investment platforms.', priority: '1', control_type: 'strategic' },
      { control_id: 'SEC-AI-4', title: 'Cybersecurity and Data Privacy', description: 'Implement cybersecurity and data privacy protections for AI systems handling client data.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-5', title: 'AI Model Governance Policy', description: 'Establish an AI model governance policy covering development, validation, and deployment.', priority: '1', control_type: 'policy' },
      { control_id: 'SEC-AI-6', title: 'Customer Disclosure and Consent', description: 'Provide clear disclosure and obtain consent from customers regarding AI-driven services.', priority: '1', control_type: 'organizational' },
      { control_id: 'SEC-AI-7', title: 'Human Oversight and Override', description: 'Ensure human oversight and the ability to override AI-driven decisions when necessary.', priority: '1', control_type: 'organizational' },
      { control_id: 'SEC-AI-8', title: 'Periodic Model Validation', description: 'Conduct periodic validation of AI models to ensure continued accuracy and compliance.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-9', title: 'Books and Records Retention', description: 'Maintain books and records related to AI model inputs, outputs, and decision rationale.', priority: '1', control_type: 'technical' },
      { control_id: 'SEC-AI-10', title: 'Systemic Risk Monitoring', description: 'Monitor AI systems for potential systemic risks to market stability and investor protection.', priority: '2', control_type: 'strategic' },
    ]
  };
