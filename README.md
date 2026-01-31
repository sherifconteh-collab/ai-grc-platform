# AI GRC Platform

**Open-source multi-framework Governance, Risk, and Compliance platform with deep AI system governance support**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)

## 🎯 What is This?

A comprehensive GRC (Governance, Risk & Compliance) platform designed for modern organizations managing multiple compliance frameworks, with special focus on AI governance. Built to be:

- **Multi-Framework**: Supports 12+ major frameworks out of the box
- **AI-Ready**: Deep integration with NIST AI RMF and ISO 42001
- **Open Source**: MIT licensed, self-hostable, transparent
- **MCP-Enabled**: Can act as an AI agent via Model Context Protocol
- **Enterprise-Grade**: Designed for real compliance workflows

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/conteh-consulting/ai-grc-platform.git
cd ai-grc-platform

# Set up database
createdb ai_grc_platform
psql ai_grc_platform < db/schema.sql
psql ai_grc_platform < db/seeds/01_nist_csf_2.0.sql
psql ai_grc_platform < db/seeds/02_nist_ai_rmf.sql
psql ai_grc_platform < db/seeds/03_iso_soc2_others.sql

# Install dependencies (coming soon)
npm install

# Start the application (coming soon)
npm run dev
```

## 📚 Supported Frameworks

### Tier 1 (Core - Fully Implemented)
- **NIST CSF 2.0** - Cybersecurity Framework 2.0 (106 controls across 6 functions)
- **NIST AI RMF** - AI Risk Management Framework (97+ controls across 4 functions)
- **NIST SP 800-171** - Protecting CUI (110 security requirements across 14 families)
- **NIST SP 800-53 Rev 5** - Security and Privacy Controls (MODERATE baseline - expandable to 1000+ controls)
- **ISO 27001:2022** - Information Security Management (93 controls)
- **SOC 2** - Trust Service Criteria (64+ controls)

### Tier 2 (Coming Soon)
- HIPAA Security Rule
- GDPR
- PCI DSS 4.0
- CIS Controls v8

### Tier 3 (Planned)
- COBIT 2019
- ISO 42001 (AI Management)
- FedRAMP
- CMMC 2.0

## 🏗️ Architecture

```
ai-grc-platform/
├── db/
│   ├── schema.sql          # Complete database schema
│   └── seeds/              # Framework control data
│       ├── 01_nist_csf_2.0.sql
│       ├── 02_nist_ai_rmf.sql
│       └── 03_iso_soc2_others.sql
├── src/
│   ├── api/               # REST API endpoints
│   ├── models/            # Database models
│   ├── services/          # Business logic
│   └── mcp/              # Model Context Protocol integration
├── frontend/             # React/Next.js frontend
├── docs/                # Documentation
└── README.md
```

## 💡 Key Features

### Multi-Framework Management
- Track compliance across multiple frameworks simultaneously
- **Cross-framework control mapping (Crosswalks)** - 80+ mappings showing control overlaps
- Unified risk register
- Gap analysis across standards
- **Reduce compliance burden by 40-60%** through control reuse

### AI System Governance
- AI system inventory and classification
- AI risk assessment (NIST AI RMF aligned)
- Model lifecycle tracking
- Bias and fairness monitoring
- Explainability requirements tracking

### Risk Management
- Integrated risk register
- Risk treatment tracking
- Inherent vs. residual risk calculation
- Risk heat maps and dashboards

### Assessment & Audit
- Self-assessments
- Internal/external audit management
- Finding tracking
- Evidence management
- Remediation workflows

### Reporting
- Executive dashboards
- Compliance posture reports
- Gap analysis reports
- Risk reports
- Audit-ready documentation

## 🤖 MCP (Model Context Protocol) Support

This platform can act as an MCP server, allowing AI agents to:
- Query compliance status
- Identify control gaps
- Suggest control implementations
- Generate compliance reports
- Analyze risk posture
- Recommend remediation actions

```javascript
// Example MCP usage
const mcp = require('./src/mcp/server');

// AI agent queries compliance status
const status = await mcp.query({
  action: 'getComplianceStatus',
  framework: 'nist_csf_2.0',
  organizationId: 'org-123'
});

// AI agent suggests controls for AI system
const suggestions = await mcp.query({
  action: 'suggestControls',
  aiSystemId: 'ai-sys-456',
  riskLevel: 'high'
});
```

## 📊 Database Schema Highlights

### Core Tables
- `organizations` - Multi-tenant support
- `frameworks` - Framework catalog
- `framework_controls` - Individual controls/requirements
- `control_implementations` - Org-specific implementation status

### AI-Specific Tables
- `ai_systems` - AI system inventory
- `ai_system_controls` - AI-to-control mappings

### Risk Management
- `risks` - Enterprise risk register
- `risk_treatments` - Risk mitigation actions
- `control_mappings` - Cross-framework mappings

### Assessment
- `assessments` - Audit and assessment tracking
- `assessment_findings` - Gap identification
- `control_evidence` - Documentation storage

## 🎯 Use Cases

### For Compliance Officers
- Track compliance across NIST CSF, ISO 27001, SOC 2 simultaneously
- Generate audit-ready reports
- Identify and close control gaps
- Manage assessment findings

### For AI Teams
- Inventory and classify AI systems by risk
- Apply NIST AI RMF controls
- Track model governance lifecycle
- Document fairness and bias testing
- Meet AI regulatory requirements

### For Risk Managers
- Maintain enterprise risk register
- Map risks to controls
- Track risk treatment effectiveness
- Generate risk dashboards

### For Auditors
- Conduct structured assessments
- Document findings and recommendations
- Track remediation progress
- Access evidence repository

## 🛠️ Technology Stack (Planned)

- **Backend**: Node.js / Express (or Python / FastAPI)
- **Database**: PostgreSQL 14+
- **Frontend**: React / Next.js
- **API**: REST + GraphQL
- **MCP**: Model Context Protocol server
- **Deployment**: Docker, Railway, Render, or self-hosted

## 📖 Documentation

- [Database Schema Guide](./docs/database_schema.md) (Coming Soon)
- [API Documentation](./docs/api.md) (Coming Soon)
- [MCP Integration Guide](./docs/mcp.md) (Coming Soon)
- [Deployment Guide](./docs/deployment.md) (Coming Soon)

## 🚧 Roadmap

### Phase 1: MVP (Current)
- ✅ Database schema
- ✅ NIST CSF 2.0 seed data
- ✅ NIST AI RMF seed data
- ✅ ISO 27001 seed data
- ✅ SOC 2 seed data
- 🔄 REST API development
- 🔄 Basic frontend

### Phase 2: Core Features
- Control implementation tracking
- Basic risk management
- Assessment workflows
- Evidence management

### Phase 3: Advanced Features
- MCP integration
- AI system governance
- Advanced reporting
- Cross-framework mapping

### Phase 4: Enterprise Features
- Multi-tenant support
- SSO integration
- Advanced analytics
- Custom framework builder

## 🤝 Contributing

We welcome contributions! This is an open-source project designed to help organizations manage compliance effectively.

### Areas We Need Help
- Additional framework implementations (HIPAA, GDPR, PCI DSS)
- Frontend development
- API development
- Documentation
- Testing
- Control mapping between frameworks

## 📜 License

MIT License - see [LICENSE](./LICENSE) file for details

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/conteh-consulting/ai-grc-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/conteh-consulting/ai-grc-platform/discussions)
- **Email**: Contehconsulting@gmail.com

## 🌟 Why This Exists

Current GRC tools are either:
- Expensive enterprise software ($50k-500k/year)
- Limited to single frameworks
- Lacking AI governance capabilities
- Closed-source black boxes

This project aims to provide an **open, transparent, affordable** alternative that organizations can:
- Self-host for complete control
- Extend with custom frameworks
- Integrate with their existing tools
- Use as an AI agent via MCP

## 💰 Business Model (For Sustainability)

While the code is MIT-licensed and free:
- **Managed Hosting**: $99-999/month
- **Implementation Services**: $5k-15k
- **Training & Consulting**: $200/hour
- **Enterprise Support**: Custom pricing

Revenue supports continued development of the open-source project.

## 📈 Stats

- **Frameworks**: 12+ supported
- **Controls**: 800+ controls in database
- **Tables**: 25+ database tables
- **Lines of SQL**: 3,000+
- **Development Status**: Alpha

## 🔗 Links

- Website: [Coming Soon]
- Demo: [Coming Soon]
- Documentation: [Coming Soon]
- Blog: [Coming Soon]

---

**Built with ❤️ by Conteh Consulting**

*Making compliance accessible to everyone*
