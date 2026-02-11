# ControlWeave Editions

## Overview

ControlWeave is available in two editions:

| | **ControlWeave** (Community) | **ControlWeaver-Pro** (Professional) |
|---|---|---|
| **Repository** | [ControlWeave](https://github.com/sherifconteh-collab/ControlWeave) | [ControlWeaver-Pro](https://github.com/sherifconteh-collab/ControlWeaver-Pro) (Private) |
| **License** | MIT (Open Source) | Commercial License |
| **Price** | Free forever | Starting at $99/month |
| **Target** | Self-hosted, startups, small teams | Managed SaaS, enterprises, teams needing support |

---

## ControlWeave - Community Edition (This Repository)

**Free, open-source, self-hosted GRC platform.**

### Included Features

**Framework Support**
- NIST CSF 2.0 (106 controls)
- NIST AI RMF (97 controls)
- NIST SP 800-171 (110 controls)
- NIST SP 800-53 Rev 5 (MODERATE baseline)
- ISO 27001:2022 (93 controls)
- SOC 2 Trust Service Criteria
- FISCAM
- FFIEC

**Core GRC Features**
- Multi-framework compliance tracking
- Control management and filtering
- Auto-crosswalk technology (90%+ similarity mapping)
- Cross-framework control mappings (80+ mappings)
- Implementation status tracking
- Basic evidence upload and linking
- Compliance dashboard with real-time metrics
- Activity feed

**Authentication & Security**
- JWT authentication (access + refresh tokens)
- Role-based access control (4 system roles: Admin, Auditor, Implementer, Viewer)
- AU-2 compliant audit logging
- Helmet.js security headers
- CORS configuration
- Rate limiting
- bcrypt password hashing (12 rounds)

**Risk Management**
- Risk register
- Likelihood/impact assessment
- Inherent vs residual risk scoring
- Risk-to-control linking

**AI System Governance**
- AI system inventory
- Risk level classification
- NIST AI RMF control mapping

**Developer Features**
- RESTful API (50+ endpoints)
- Full database schema (25+ tables, 528+ controls)
- Complete seed data
- Self-hosting support

---

## ControlWeaver-Pro - Professional Edition

**Managed, enterprise-ready GRC platform with advanced features.**

Everything in ControlWeave Community Edition, plus:

### Professional Features

**Single Sign-On (SSO)**
- SAML 2.0 integration
- OAuth 2.0 / OpenID Connect
- Okta, Azure AD, Google Workspace
- Automatic user provisioning

**Advanced Integrations**
- Jira (sync findings as tickets)
- ServiceNow (ITSM integration)
- Slack (compliance notifications)
- Custom webhook support
- API access with higher rate limits

**Automated SSP Generation**
- Auto-generate System Security Plans (NIST 800-171, FedRAMP)
- Export to Word/PDF
- Pre-filled from control implementations

**SBOM Deep Dive**
- Software Bill of Materials tracking
- Supply chain vulnerability scanning
- AI model dependency tracking
- CVE mapping to controls

**CMDB Integration**
- Asset inventory management
- Hardware/software-to-control mapping
- Automated evidence collection from infrastructure
- Asset coverage gap analysis

**Advanced Analytics & Reporting**
- Custom report builder
- Executive compliance dashboards
- Trend analysis and compliance forecasting
- Risk heat maps
- Audit-ready PDF export
- Scheduled report delivery

**Custom Framework Builder**
- Create proprietary compliance frameworks
- Industry-specific control templates
- Custom control mappings
- Framework versioning

**Enterprise Features**
- Multi-tenant SaaS deployment
- White-label / custom branding
- Custom domain support
- 99.9% uptime SLA
- Automatic backups and disaster recovery
- Feature gating middleware

**AI-Powered Features**
- AI-powered policy generation from evidence
- Risk prediction and scoring
- Automated control gap identification
- Smart remediation recommendations
- Continuous monitoring integration

**Support**
- Priority email support
- Dedicated account manager (Enterprise tier)
- Implementation assistance
- Training and onboarding
- Quarterly health checks

### Pricing

| Plan | Price | Highlights |
|------|-------|------------|
| **Starter** | $99/month | 3 frameworks, email support, auto-backups |
| **Professional** | $299/month | All frameworks, 5 team members, priority support, API access |
| **Enterprise** | $999/month | Unlimited users, SSO, SLA, dedicated support, custom integrations |

---

## Repository Structure

```
GitHub Organization: sherifconteh-collab
|
|-- ControlWeave (public)          <-- This repo (free/community)
|     |-- backend/                  Core API server
|     |-- frontend/                 Next.js dashboard
|     |-- db/                       Schema + seed data
|     |-- docs/                     Documentation
|
|-- ControlWeaver-Pro (private)    <-- Paid/pro features
      |-- backend/
      |   |-- src/middleware/featureGate.js
      |   |-- src/routes/sso.js
      |   |-- src/routes/integrations.js
      |   |-- src/services/sspGenerator.js
      |   |-- src/services/sbomAnalyzer.js
      |   |-- src/services/cmdb.js
      |   |-- src/services/aiPolicies.js
      |   |-- migrations/003_feature_gating.sql
      |-- frontend/
      |   |-- src/app/dashboard/ssp/
      |   |-- src/app/dashboard/sbom/
      |   |-- src/app/dashboard/cmdb/
      |   |-- src/app/dashboard/reports/
      |   |-- src/components/ProBadge.tsx
      |-- deployment/
          |-- docker-compose.prod.yml
          |-- terraform/
          |-- k8s/
```

---

## How It Works

**Self-hosted (Community Edition):**
1. Clone the ControlWeave repo
2. Set up PostgreSQL
3. Run the backend and frontend
4. Full functionality, no restrictions

**Managed SaaS (ControlWeaver-Pro):**
1. Sign up at controlweave.com (coming soon)
2. Choose a plan
3. Start using immediately - no infrastructure needed

**Upgrade Path:**
- Start with ControlWeave Community (free, self-hosted)
- When you need enterprise features, SSO, or managed hosting, upgrade to ControlWeaver-Pro
- All your data and configurations are compatible

---

## FAQ

**Q: Is ControlWeave really free?**
A: Yes. The Community Edition is MIT licensed and free forever. Self-host it, modify it, even use it commercially.

**Q: What if I need a feature from Pro?**
A: Contact us at Contehconsulting@gmail.com for pricing and demos.

**Q: Can I contribute to ControlWeave?**
A: Absolutely! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Q: Will the free version be limited in the future?**
A: No. We follow the open-core model - the community edition will continue to receive updates and improvements.

---

*Built by Conteh Consulting LLC*
