module.exports = {
    code: 'finra_supervisory_ai', name: 'FINRA Supervisory Controls for AI (Notice 24-09)', version: '2024',
    category: 'Financial Services AI Governance', tier_required: 'govcloud',
    description: 'FINRA Regulatory Notice 24-09 supervisory obligations for AI-generated communications, robo-advisory outputs, and algorithmic trading surveillance.',
    controls: [
      { control_id: 'FINRA-SUP-1', title: 'AI Supervisory Framework', description: 'Establish a supervisory framework for the oversight and governance of AI-driven activities.', priority: '1', control_type: 'policy' },
      { control_id: 'FINRA-SUP-2', title: 'Suitability and Best Interest Alignment', description: 'Ensure AI outputs align with suitability and Regulation Best Interest obligations.', priority: '1', control_type: 'technical' },
      { control_id: 'FINRA-SUP-3', title: 'AI-Generated Communications Review', description: 'Review AI-generated communications to ensure compliance with FINRA content standards.', priority: '1', control_type: 'organizational' },
      { control_id: 'FINRA-SUP-4', title: 'Algorithmic Trading Surveillance', description: 'Monitor algorithmic trading activities for potential market manipulation and anomalies.', priority: '1', control_type: 'technical' },
      { control_id: 'FINRA-SUP-5', title: 'Third-Party AI Vendor Due Diligence', description: 'Conduct due diligence on third-party AI vendors to assess risks and regulatory compliance.', priority: '1', control_type: 'strategic' },
      { control_id: 'FINRA-SUP-6', title: 'AI Incident Response and Escalation', description: 'Establish incident response and escalation procedures for AI-related failures or anomalies.', priority: '1', control_type: 'organizational' },
      { control_id: 'FINRA-SUP-7', title: 'AI Training and Competency', description: 'Provide training to supervisory personnel on AI capabilities, limitations, and risks.', priority: '2', control_type: 'organizational' },
      { control_id: 'FINRA-SUP-8', title: 'Bias and Fairness Testing', description: 'Test AI models for bias and fairness to prevent discriminatory outcomes in financial services.', priority: '1', control_type: 'technical' },
      { control_id: 'FINRA-SUP-9', title: 'AI Model Change Management', description: 'Manage changes to AI models through a formal review and approval process.', priority: '2', control_type: 'technical' },
      { control_id: 'FINRA-SUP-10', title: 'Audit Trail and Recordkeeping', description: 'Maintain audit trails and records for AI-generated decisions and recommendations.', priority: '1', control_type: 'technical' },
    ]
  };
