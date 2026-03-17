# ControlWeave — Community Edition

**Open-source AI-powered GRC platform with multi-framework compliance management, crosswalk intelligence, and BYOK AI analysis**

> 🏢 **Enterprise Tier**: Looking for CMDB, Vendor Risk, Threat Intelligence, and more? Visit [controlweave.com](https://controlweave.com).

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-v2.2.0-green.svg)](./RELEASE_NOTES.md)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](./CONTRIBUTING.md)

---

<a id="desktop-app"></a>
### 📥 Download the Desktop App

Everything is bundled — PostgreSQL included. No setup required. Just install and run.

> [![Download for Windows](https://img.shields.io/badge/⬇_Download_for_Windows-_.exe-blue?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest)&nbsp;&nbsp;[![Download for macOS](https://img.shields.io/badge/⬇_Download_for_macOS-_.dmg-blue?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest)&nbsp;&nbsp;[![Download for Linux](https://img.shields.io/badge/⬇_Download_for_Linux-_.AppImage-blue?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest)

After installing, launch ControlWeave — the app opens automatically and walks you through creating your first account. Updates are delivered automatically so you always stay on the latest version. Releases are published automatically whenever a version bump is merged to `main`.

<details>
<summary>Build from source</summary>

```bash
# 1. Install dependencies
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cd electron && npm install && cd ..

# 2. Build the Next.js frontend
cd frontend && npm run build && cd ..

# 3. Build the desktop installer for your platform
cd electron
npm run dist:win      # → .exe   (Windows)
npm run dist:mac      # → .dmg   (macOS)
npm run dist:linux    # → .AppImage (Linux)
```

The resulting installer is in `electron/dist/`.
</details>

<details>
<summary>System requirements &amp; release notes</summary>

- Windows 10+, macOS 10.13+, or Ubuntu 18.04+ (or equivalent)
- 2 GB RAM · ~500 MB disk space
- [All releases](https://github.com/sherifconteh-collab/ai-grc-platform/releases) · [Release notes](./RELEASE_NOTES.md)
</details>

---

<!-- LAST_UPDATED: 2026-03-16 | PR #55: Point all paid-tier links to controlweave.com; clarify repo is community/self-hosted only -->

## 🎯 What is This?

A comprehensive GRC (Governance, Risk & Compliance) platform designed for modern organizations managing multiple compliance frameworks, with special focus on AI governance. Supports NIST 800-53, ISO 27001, SOC 2, NIST AI RMF, and 30+ frameworks with 1,000+ controls. Built to be:

- **Multi-Framework**: Supports 30+ major frameworks out of the box
- **AI-Powered**: Built-in AI Copilot with BYOK (Bring Your Own Key) LLM support
- **AI-Ready**: Deep integration with NIST AI RMF, ISO 42001, and MAESTRO
- **Open Source**: AGPL-3.0 licensed, self-hostable, transparent
- **MCP-Enabled**: Can act as an AI agent via Model Context Protocol
- **Enterprise-Grade**: Designed for real compliance workflows

## ✅ Current Status

The platform is **fully functional** with a growing feature set. Phase 1 is complete and Phase 2 features are landing:

- 🔐 User authentication (JWT-based with OAuth 2.0, refresh tokens, TOTP 2FA)
- 📊 Compliance dashboard with real-time metrics
- 🎯 Framework selection (30+ frameworks, 1,000+ controls)
- 📋 Control management, filtering, and health tracking
- 🔗 **Auto-crosswalk** (90%+ similarity auto-satisfies mapped controls across frameworks)
- 📜 AU-2 compliant immutable audit logging
- 🤖 **AI Copilot** — org-aware conversational assistant with 25+ analysis features (gap analysis, compliance forecast, policy generation, remediation playbooks)
- 🔄 **RMF Lifecycle** — full NIST SP 800-37 Rev 2 seven-step workflow (Prepare → Categorize → Select → Implement → Assess → Authorize → Monitor)
- 🛡️ RBAC with Admin, ISSE, Auditor, and Read-Only roles
- 📎 Evidence management with versioning and PII classification
- 🏗️ Auditor workspace and assessment workflows
- 🔒 Enterprise security (Helmet, CORS, rate limiting, bcrypt, field-level encryption)
- 📡 Webhook and notification system
- 📄 Policy management with gap analysis

## 🚀 Quick Start (Development)

> The steps below are for developers who want to run from source. If you just want to use ControlWeave, [download the installer](#desktop-app) instead.

### Prerequisites

- **Node.js** 20+ — [download](https://nodejs.org)
- **PostgreSQL** 14+ — [download](https://www.postgresql.org/download/) (or use `brew install postgresql` on macOS / `sudo apt install postgresql` on Ubuntu)

### 1. Create the database

```bash
# Start PostgreSQL if it isn't running
# macOS:  brew services start postgresql
# Linux:  sudo systemctl start postgresql

createdb controlweave        # create the application database
```

### 2. Backend

```bash
cd backend
npm install

# Create your .env from the example and set DATABASE_URL
cp .env.example .env
# Edit .env — update the DATABASE_URL line:
#   DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/controlweave
# On macOS/Linux you can often use your OS username with no password:
#   DATABASE_URL=postgresql://localhost:5432/controlweave

npm run migrate              # creates tables and schema
npm start                    # starts API on port 3001
# Frameworks and controls are auto-seeded on first launch
```

### 3. Frontend (in a new terminal)

```bash
cd frontend
npm install
npm run dev                  # starts Next.js on port 3000
```

**First login:** Visit http://localhost:3000/register to create your account!

> 💡 For detailed setup including environment variables and advanced configuration, see [QUICKSTART.md](./QUICKSTART.md) and [QUICK_START.md](./QUICK_START.md).

## 📚 Supported Frameworks

### Tier 1 — Core (Fully Implemented)
- **NIST CSF 2.0** — Cybersecurity Framework 2.0 (106 controls across 6 functions)
- **NIST AI RMF** — AI Risk Management Framework (97+ controls across 4 functions)
- **NIST SP 800-171** — Protecting CUI (110 security requirements across 14 families)
- **NIST SP 800-53 Rev 5** — Security and Privacy Controls (1,000+ controls with Low/Moderate/High baseline overlays)
- **ISO 27001:2022** — Information Security Management (93 controls)
- **SOC 2** — Trust Service Criteria (64+ controls)

### Tier 2 — Available
- **CMMC 2.0** — Cybersecurity Maturity Model Certification with crosswalk mappings
- **HIPAA / HITECH** — Health Information Privacy and Security
- **NERC CIP** — Critical Infrastructure Protection (47 requirements mapped to NIST 800-53)
- **OWASP Top 10:2025** — Web Application Security with NIST AI guidance
- **EU AI Act** — Article 17 compliance checklist with 22-point evidence workflow
- **MAESTRO** — 16 attack-class controls for AI security
- **FISCAM** — Federal Information System Controls Audit Manual
- **FFIEC** — Federal Financial Institutions Examination Council

### Tier 3 — AI & International Standards
- **ISO/IEC 23894** — AI Risk Management
- **ISO/IEC 38507** — Governance of AI
- **ISO/IEC 22989** — AI Concepts and Terminology
- **ISO/IEC 23053** — Framework for AI Systems Using ML
- **ISO/IEC 5259** — Data Quality for AI
- **ISO/IEC TR 24027** — Bias in AI Systems
- **ISO/IEC TR 24028** — Trustworthiness in AI
- **ISO/IEC TR 24368** — AI Ethics Overview

### Tier 4 — Planned / In Progress
> Available now at [ControlWeave.com](https://controlweave.com)

- GDPR
- PCI DSS 4.0
- CIS Controls v8
- COBIT 2019
- FedRAMP
- Financial Services compliance workspace

## 💡 Key Features

### 🤖 AI Platform (BYOK — Bring Your Own Key)

The platform ships with a **built-in AI layer** that any user can activate with their own API key. Self-hosted deployments have no usage limits.

- **AI Copilot** — org-aware conversational assistant with 25+ analysis capabilities:
  - Gap analysis comparing current implementation against target baselines
  - Compliance forecasting and trend projection
  - Policy generation from control requirements
  - Remediation playbook creation
  - Crosswalk optimization suggestions
- **Supported providers**: Anthropic (Claude), OpenAI, Google Gemini, Grok, Groq, Ollama (local)
- **Per-framework LLM guardrails** for BYOK configurations
- **AI Governance module** — dashboard for managing AI risk across your organization

> 💡 **Getting started:** Go to *Settings → LLM Configuration → enter your API key* for any supported provider.

### 🔄 RMF Lifecycle (NIST SP 800-37 Rev 2)

Full RMF lifecycle management without leaving the platform:

- 7-step tracking dashboard: **Prepare → Categorize → Select → Implement → Assess → Authorize → Monitor**
- RMF packages linked to organization systems
- Authorization decision recording (ATO / DATO / IATT / Denial) with automatic deactivation of prior decisions
- Step transition history with full audit trail (user, timestamp, notes, artifacts)
- CIA triad impact level tracking (Low / Moderate / High) per system categorization

> 💡 **Getting started:** Navigate to *RMF Lifecycle* in the sidebar (visible once you activate NIST 800-53, NIST 800-171, or CMMC 2.0).

### 🔗 Auto-Crosswalk Technology

- **When you implement ONE control, the platform automatically satisfies similar controls across other frameworks**
- Example: Implement NIST CSF "GV.OC-01" → Auto-satisfies ISO 27001 "A.5.1.1" + SOC 2 "CC1.1"
- 90%+ similarity threshold ensures defensible mappings
- **Reduce compliance burden by 40-60%** through control reuse

### 📋 Multi-Framework Compliance Management
- Track compliance across 30+ frameworks simultaneously
- **Cross-framework control mapping (Crosswalks)** — 80+ mappings showing control overlaps
- Unified risk register
- Gap analysis across standards
- Framework-gated sidebar navigation

### 📎 Evidence Management
- Upload evidence as files (PDF, DOCX, XLSX, images) or link external URLs
- Automatic versioning of all evidence items
- PII data labeling and classification
- Bulk upload via CSV with field mapping UI

### 🛡️ Assessment & Audit
- Auditor workspace with dedicated workflows
- Control verification (verified / not verified / requires remediation)
- Assessment procedures and findings tracking
- Immutable audit trail for every action
- Remediation workflows with POA&M (Plan of Action & Milestones)

### 📊 Dashboards & Reporting
- Executive compliance dashboard with real-time metrics
- Security posture overview
- Control health tracking
- Dashboard builder for custom views
- Risk heat maps

### 🔐 Security & Access Control
- RBAC with Admin, ISSE, Auditor, and Read-Only roles
- JWT + OAuth 2.0 authentication with refresh tokens
- TOTP two-factor authentication
- Field-level encryption for PII
- Rate limiting on all public API endpoints
- Separation of duties enforcement
- Webhook integrations for external systems
- Notification system (in-app and email)

### 📄 Policy Management
- Policy creation and lifecycle tracking
- AI-powered policy gap analysis
- Smart remediation suggestions
- Exception management workflows

### 🏗️ Developer & Integration Features
- Full REST API for all operations ([OpenAPI spec](./docs/openapi.yaml))
- MCP server for AI agent integration
- Webhook system for event-driven integrations
- ControlWeave SDK for programmatic access
- Dynamic configuration system

## 🎯 What Makes This Different?

**This is NOT a clone of Vanta, Drata, SecureFrame, or other commercial GRC tools.**

### Unique Differentiators:

1. **100% Open Source & Free**
   - AGPL-3.0 licensed — open source with copyleft protections (see [LICENSE](./LICENSE))
   - Self-hostable — your data stays on your infrastructure
   - No per-user fees, no vendor lock-in
   - Commercial tools cost $30K–200K/year

2. **Auto-Crosswalk Technology** ⭐
   - Implement one control, automatically satisfy mapped controls across frameworks
   - 90%+ similarity threshold ensures defensible mappings
   - Commercial tools make you implement the same control multiple times

3. **Built-in AI Copilot**
   - BYOK model — bring your own Anthropic, OpenAI, Gemini, Grok, Groq, or Ollama key
   - 25+ org-aware analysis features
   - No separate AI tool subscription needed

4. **AI Governance Focus**
   - Deep NIST AI RMF integration
   - MAESTRO attack-class controls for AI security
   - ISO/IEC AI standards coverage (23894, 38507, 22989, 23053, 5259, and more)
   - EU AI Act Article 17 compliance checklist
   - Purpose-built for modern AI systems compliance

5. **RMF Lifecycle Management**
   - Full NIST SP 800-37 Rev 2 seven-step workflow
   - ATO / DATO / IATT authorization tracking
   - CIA triad impact classification

6. **Automated SSP Generation**
   - Generate System Security Plans (NIST 800-171, FedRAMP) from your implementations
   - Export to Word/PDF
   - Pre-filled based on actual control implementations

7. **Developer-First**
   - REST API for everything with OpenAPI spec
   - MCP server for AI agent integration
   - ControlWeave SDK for programmatic access
   - Webhook system for event-driven workflows

### What We're NOT Trying to Be:
- ❌ Not a continuous monitoring tool (use Wiz, Orca, Lacework for that)
- ❌ Not a pen testing tool (use Cobalt, Pentest, HackerOne)
- ❌ Not a vendor risk management tool (use SecurityScorecard, BitSight)
- ✅ We're a **compliance management and evidence organization platform**

### Comparison:

| Feature | ControlWeave | Vanta/Drata | Hyperproof | OneTrust |
|---------|--------------|-------------|------------|----------|
| Cost | **Free** | $30K–200K/yr | $50K–150K/yr | $100K+/yr |
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Self-Hosted | ✅ | ❌ | ❌ | ❌ |
| Frameworks | 30+ | 10–15 | 10–20 | 20+ |
| Auto-Crosswalk | ✅ | ❌ | ❌ | ❌ |
| Built-in AI Copilot | ✅ (BYOK) | ❌ | ❌ | ❌ |
| AI Governance (NIST AI RMF) | ✅ | ❌ | ❌ | ❌ |
| RMF Lifecycle | ✅ | ❌ | ❌ | ❌ |
| SBOM Integration | ✅ | ❌ | ❌ | ❌ |
| SSP Auto-Generation | ✅ | ❌ | Paid Add-on | Paid Add-on |
| CMDB Integration | ✅ | Partial | ❌ | Partial |
| MCP/API-First | ✅ | API Only | Limited API | Limited API |

## 🤖 MCP (Model Context Protocol) Support

This platform can act as an MCP server, allowing AI agents to:
- Query compliance status
- Identify control gaps
- Suggest control implementations
- Generate compliance reports
- Analyze risk posture
- Recommend remediation actions

The MCP server lives in `backend/scripts/mcp-server-secure.js` and exposes 21 tools. See [`docs/MCP_SETUP.md`](./docs/MCP_SETUP.md) for full configuration.

**Example tool registrations (from the server source):**

```javascript
// Health check (no auth required)
server.registerTool('grc_health', {
  description: 'Check AI GRC backend health and database connectivity.',
  inputSchema: {}
}, async () => { /* ... */ });

// List compliance frameworks (auth required)
server.registerTool('grc_list_frameworks', { /* ... */ }, async () => {
  return await apiRequest('GET', '/frameworks');
});

// AI-powered compliance query
server.registerTool('grc_ai_query', { /* ... */ }, async ({ prompt }) => {
  return await apiRequest('POST', '/ai/query', { prompt });
});
```

## 📦 ControlWeave External AI Logger SDK

The `controlweave-sdk` package lets external systems log AI decisions directly into ControlWeave for governance tracking and audit trails.

```bash
npm install @controlweave/external-ai-logger
```

```javascript
const { ControlWeaveLogger } = require('@controlweave/external-ai-logger');

const logger = new ControlWeaveLogger({
  apiKey: process.env.CONTROLWEAVE_API_KEY,
  baseUrl: 'https://your-controlweave-host/api/v1'
});

// Log a single AI decision
await logger.logDecision({
  feature: 'incident_triage',
  input_data: { alertId: 'A-123' },
  output_data: { priority: 'high' },
  external_provider: 'openai',
  external_model: 'gpt-4.1',
  external_decision_id: 'ext-789',
  risk_level: 'medium'
});

// Log multiple decisions in bulk
await logger.logBatch([decision1, decision2]);
```

SDK features:
- **BYOK-compatible** — Uses your API key generated in *Settings → Platform Admin*
- **TypeScript types** — Full `index.d.ts` type definitions included
- **Batch logging** — Log multiple AI decisions in a single call
- **Available for Enterprise and Gov Cloud tiers** — External SDK ingestion requires org tier eligibility

See [`controlweave-sdk/README.md`](./controlweave-sdk/README.md) for full setup instructions.

## 🏗️ Architecture

```
controlweave/
├── backend/
│   ├── src/
│   │   ├── routes/          # REST API endpoints (auth, controls, frameworks,
│   │   │                    #   assessments, audit, AI, policies, webhooks, etc.)
│   │   ├── services/        # Business logic (framework, policy, risk scoring,
│   │   │                    #   audit, notification, remediation, etc.)
│   │   ├── middleware/      # Auth, RBAC, audit logging, rate limiting,
│   │   │                    #   edition gating, validation
│   │   ├── config/          # Database and security configuration
│   │   └── utils/           # Logging, encryption, TOTP, AI security
│   ├── migrations/          # Database migrations
│   └── scripts/             # Seed data, migration runners, MCP server, utilities
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages (dashboard, frameworks, controls,
│   │   │                    #   assessments, audit, AI analysis, settings, etc.)
│   │   ├── components/      # Sidebar, DashboardLayout, AICopilot
│   │   └── lib/             # API client, access control, branding, billing
│   └── public/              # Static assets, branding, PWA manifest
├── controlweave-sdk/        # External AI Logger SDK (@controlweave/external-ai-logger)
├── db/
│   ├── schema.sql           # Complete database schema
│   └── seeds/               # Framework control data (8 seed files)
├── docs/                    # Documentation and guides
├── start.sh                 # One-command startup script
└── README.md
```

## 📊 Database Schema Highlights

### Core Tables
- `organizations` — Multi-tenant support
- `users` — Authentication and profiles with field-level PII encryption
- `frameworks` — Framework catalog (30+ frameworks)
- `framework_controls` — Individual controls/requirements
- `control_implementations` — Org-specific implementation status

### AI-Specific Tables
- `ai_systems` — AI system inventory and classification
- `ai_system_controls` — AI-to-control mappings

### RMF Lifecycle Tables
- `rmf_packages` — RMF packages linked to organization systems
- `rmf_step_history` — Step transition history with audit trail
- `rmf_authorization_decisions` — ATO/DATO/IATT/Denial tracking

### Risk & Evidence
- `risks` — Enterprise risk register
- `risk_treatments` — Risk mitigation actions
- `control_mappings` — Cross-framework mappings
- `evidence_items` — Versioned evidence storage with PII classification
- `control_evidence` — Evidence-to-control linkage

### Assessment & Audit
- `assessments` — Audit and assessment tracking
- `assessment_findings` — Gap identification
- `audit_events` — Immutable audit log

### Policy & Operations
- `policies` — Policy lifecycle management
- `notifications` — In-app notification system
- `webhooks` — External integration events

## 🎯 Use Cases

### For Compliance Officers
- Track compliance across 30+ frameworks simultaneously
- Leverage auto-crosswalk to reduce compliance burden by 40-60%
- Use AI Copilot for gap analysis and compliance forecasting
- Generate audit-ready reports and documentation

### For AI Teams
- Inventory and classify AI systems by risk
- Apply NIST AI RMF, MAESTRO, and ISO/IEC AI standards
- Track model governance lifecycle
- Document fairness and bias testing
- Meet EU AI Act Article 17 requirements

### For Risk Managers
- Maintain enterprise risk register
- Map risks to controls across frameworks
- Track risk treatment effectiveness
- Use AI-powered risk scoring and remediation suggestions

### For Auditors
- Dedicated auditor workspace with structured workflows
- Conduct assessments with verification tracking
- Document findings and recommendations
- Access versioned evidence repository
- Generate POA&M reports

### For RMF Practitioners
- Full NIST SP 800-37 seven-step lifecycle management
- Track authorization decisions (ATO/DATO/IATT)
- Manage CIA triad impact classifications
- Maintain step transition audit trail

## 🛠️ Technology Stack

- **Backend**: Node.js / Express
- **Database**: PostgreSQL 14+
- **Frontend**: Next.js (React) with TypeScript and Tailwind CSS
- **Authentication**: JWT + OAuth 2.0 with TOTP 2FA
- **AI**: BYOK multi-provider support (Anthropic, OpenAI, Gemini, Grok, Groq, Ollama)
- **API**: REST with OpenAPI specification
- **MCP**: Model Context Protocol server
- **Deployment**: Desktop (Electron) or self-hosted

## 📖 Documentation

- [Complete App Walkthrough](./docs/COMPLETE_APP_WALKTHROUGH.md)
- [Crosswalk Guide](./docs/CROSSWALK_GUIDE.md)
- [How Crosswalks Work](./docs/HOW_CROSSWALKS_WORK.md)
- [Database Architecture](./docs/DATABASE_ARCHITECTURE.md)
- [Framework Coverage](./docs/FRAMEWORK_COVERAGE.md)
- [MCP Setup Guide](./docs/MCP_SETUP.md)
- [GitHub Repository Guide](./docs/GITHUB_REPOSITORY_GUIDE.md)
- [OpenAPI Specification](./docs/openapi.yaml)
- [Quick Start Guide](./QUICKSTART.md)
- [API Testing Guide](./QUICK_START.md)
- [Release Notes](./RELEASE_NOTES.md)
- [Phase 2 Roadmap](./PHASE_2_ROADMAP.md)
- [Project Status](./PROJECT_STATUS.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

## 🚧 Roadmap

### Phase 1: Foundation ✅
- ✅ Complete PostgreSQL schema (140+ tables)
- ✅ 30+ framework seed data (1,000+ controls)
- ✅ Cross-framework crosswalk mappings (80+)
- ✅ REST API with full CRUD operations
- ✅ JWT + OAuth 2.0 authentication with TOTP 2FA
- ✅ RBAC (Admin, ISSE, Auditor, Read-Only)
- ✅ Next.js frontend with dashboard
- ✅ AU-2 compliant immutable audit logging
- ✅ Auto-crosswalk engine

### Phase 2: Advanced Features 🔄
- ✅ AI Copilot with BYOK LLM support (25+ analysis features)
- ✅ RMF Lifecycle management (NIST SP 800-37)
- ✅ Auditor workspace and assessment workflows
- ✅ Evidence management with PII classification
- ✅ Policy management with AI gap analysis
- ✅ Notification and webhook systems
- ✅ POA&M tracking
- ✅ Security posture dashboard
- 🔄 SBOM integration for AI model supply chain
- 🔄 SSP auto-generation (NIST 800-171, FedRAMP)
- 🔄 CMDB (Configuration Management Database)

### Phase 3: Enterprise & Scale
- Custom framework builder
- SSO integration
- Advanced analytics and reporting
- Multi-tenant improvements
- Continuous monitoring integrations

## 🤝 Contributing

We welcome contributions! This is an open-source project designed to help organizations manage compliance effectively. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

### Quick Ways to Contribute

- 🐛 **Report bugs** — [Open an issue](https://github.com/sherifconteh-collab/ai-grc-platform/issues/new?template=bug_report.md)
- 💡 **Suggest features** — [Start a discussion](https://github.com/sherifconteh-collab/ai-grc-platform/discussions)
- 📝 **Improve docs** — Fix typos, add examples, clarify setup steps
- 🧪 **Add tests** — Coverage is always welcome
- 🌐 **Add frameworks** — GDPR, PCI DSS 4.0, CIS Controls v8, and more are on the roadmap
- 🔌 **Extend the SDK** — Contribute to the `controlweave-sdk` for new integrations

## 📜 License

AGPL-3.0 License — see [LICENSE](./LICENSE) file for details.

By contributing, you agree to the [Contributor License Agreement](./CLA.md). Signing is automated — the CLA bot (see [`.github/workflows/cla.yml`](./.github/workflows/cla.yml)) will prompt you on your first PR.

## 💎 Want Premium Features?

This community edition gives you a fully functional GRC platform. If you need enterprise-grade capabilities, visit **[ControlWeave.com](https://controlweave.com)** for premium tiers that include:

- 🏢 **CMDB** — Full configuration management database with asset lifecycle tracking
- 🔍 **Vulnerability Management** — Automated scanning and remediation workflows
- 🕵️ **Threat Intelligence** — Real-time threat feeds and risk correlation
- 🤝 **Vendor Risk Management (TPRM)** — Third-party risk assessments and monitoring
- 🔗 **Enterprise Integrations** — Splunk, SIEM, SSO/SAML, and more
- 📊 **Advanced Reporting** — Custom dashboards, executive reports, and analytics
- 🏗️ **Multi-tenant Management** — Platform administration across organizations
- 🎯 **Unlimited Frameworks** — No limits on simultaneously active frameworks

👉 **[Get started at ControlWeave.com](https://controlweave.com/#pricing)**

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/sherifconteh-collab/ai-grc-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sherifconteh-collab/ai-grc-platform/discussions)
- **Email**: Contehconsulting@gmail.com
- **Premium Features**: [ControlWeave.com](https://controlweave.com) — CMDB, Vendor Risk, Threat Intel, and more

## 🌟 Why This Exists

Current GRC tools are either:
- Expensive enterprise software ($50k–500k/year)
- Limited to single frameworks
- Lacking AI governance capabilities
- Closed-source black boxes

This project aims to provide an **open, transparent, affordable** alternative that organizations can:
- Self-host for complete control
- Extend with custom frameworks
- Integrate with their existing tools via API, MCP, or webhooks
- Use AI to accelerate compliance work (BYOK)

**From Policy to Proof** — Making compliance accessible to everyone.

## 📈 Stats

- **Frameworks**: 30+ supported
- **Controls**: 1,000+ controls in database
- **Crosswalks**: 80+ cross-framework mappings
- **AI Features**: 25+ analysis capabilities
- **LLM Providers**: 6 supported (Anthropic, OpenAI, Gemini, Grok, Groq, Ollama)
- **Tables**: 140+ database tables
- **API Routes**: 60+ route modules
- **Services**: 19 service modules
- **MCP Tools**: 21 tools exposed via Model Context Protocol
- **SDK**: `@controlweave/external-ai-logger` for external AI decision logging
- **Security**: 14-day trial, all 12 audit findings remediated in v2.2.0
- **Development Status**: Active — community / self-hosted edition of [ControlWeave.com](https://controlweave.com)

## 🔗 Links

- **Community Repository**: [ai-grc-platform](https://github.com/sherifconteh-collab/ai-grc-platform) *(you are here)*
- **Premium Product**: [ControlWeave.com](https://controlweave.com) — CMDB, Vendor Risk, Threat Intel, and more
- **Release Notes**: [RELEASE_NOTES.md](./RELEASE_NOTES.md)
- Documentation: See [docs/](./docs/) folder

---

**Built with ❤️ by Conteh Consulting**

*ControlWeave — From Policy to Proof*
