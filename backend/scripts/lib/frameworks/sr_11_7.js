module.exports = {
    code: 'sr_11_7', name: 'SR 11-7 Model Risk Management', version: '2011-Rev2024',
    category: 'Financial Services AI Governance', tier_required: 'govcloud',
    description: 'Federal Reserve / OCC Supervisory Guidance SR 11-7 on Model Risk Management covering model development, validation, governance, and ongoing monitoring for AI-driven decision-making.',
    controls: [
      { control_id: 'SR117-I-1', title: 'Model Inventory', description: 'Maintain a comprehensive inventory of all models used across the organization.', priority: '1', control_type: 'organizational' },
      { control_id: 'SR117-I-2', title: 'Model Risk Tiering', description: 'Tier models based on materiality, complexity, and potential risk impact.', priority: '1', control_type: 'strategic' },
      { control_id: 'SR117-D-1', title: 'Model Development Standards', description: 'Establish sound model development practices including data quality and methodology standards.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-D-2', title: 'Model Documentation', description: 'Maintain thorough documentation of model design, methodology, assumptions, and limitations.', priority: '1', control_type: 'organizational' },
      { control_id: 'SR117-V-1', title: 'Independent Model Validation', description: 'Conduct independent model validation to evaluate conceptual soundness and performance.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-V-2', title: 'Conceptual Soundness Review', description: 'Review the theoretical basis and assumptions underlying each model for conceptual soundness.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-V-3', title: 'Outcomes Analysis', description: 'Analyze model outcomes against actual results to assess ongoing performance.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-G-1', title: 'Model Risk Policy', description: 'Establish a model risk management policy approved by the board of directors.', priority: '1', control_type: 'policy' },
      { control_id: 'SR117-G-2', title: 'Model Risk Appetite', description: 'Define the organization\'s appetite for model risk and acceptable risk thresholds.', priority: '1', control_type: 'strategic' },
      { control_id: 'SR117-G-3', title: 'Model Risk Reporting', description: 'Report model risk exposure and validation findings to senior management and the board.', priority: '1', control_type: 'organizational' },
      { control_id: 'SR117-G-4', title: 'Ongoing Monitoring', description: 'Continuously monitor model performance and emerging risks throughout the model lifecycle.', priority: '1', control_type: 'technical' },
      { control_id: 'SR117-G-5', title: 'Model Change Management', description: 'Implement a formal change management process for model modifications and updates.', priority: '2', control_type: 'technical' },
      { control_id: 'SR117-G-6', title: 'Vendor Model Oversight', description: 'Exercise appropriate oversight of vendor-supplied models including validation requirements.', priority: '1', control_type: 'strategic' },
      { control_id: 'SR117-G-7', title: 'Model Retirement', description: 'Establish criteria and procedures for the orderly retirement and replacement of models.', priority: '3', control_type: 'organizational' },
    ]
  };
