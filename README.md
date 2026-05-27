# ControlWeave

**Open-source AI-powered GRC platform with multi-framework compliance management, crosswalk intelligence, threat intelligence, and BYOK AI analysis**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0_or_commercial-blue.svg)](./LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-v4.2.2-green.svg)](./RELEASE_NOTES.md)
[![CNSA](https://img.shields.io/badge/CNSA-1.0%20%2B%202.0%20(PQC)-purple.svg)](#-security)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](./CONTRIBUTING.md)

---

<a id="desktop-app"></a>
### 📥 Download the Desktop App

Everything is bundled — PostgreSQL included. No setup required. Just install and run.

Desktop builds ship the full open-source feature set. All previously tier-gated capabilities — CMDB, Service Accounts, AI Governance, Threat Intelligence, SSO, Data Governance, Vulnerability Management, State/International AI Laws, Realtime, Reports — are unlocked. Includes the **CNSA Suite 1.0 + 2.0** cryptographic stack (HS384 JWTs, SHA-384 hashing, RSA-3072 key exchange, hybrid ML-DSA-65 post-quantum license signing), PostgreSQL Row-Level Security, Redis-backed rate limiting and caching, automated database backups, refresh token rotation, and bundled backend/Next.js runtime dependencies.

> [![Download for Windows](https://img.shields.io/badge/⬇_Download_for_Windows-_.exe-blue?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest)&nbsp;&nbsp;[![Download for macOS](https://img.shields.io/badge/⬇_Download_for_macOS-_.dmg-blue?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest)&nbsp;&nbsp;[![Download for Linux](https://img.shields.io/badge/⬇_Download_for_Linux-_.AppImage-blue?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/sherifconteh-collab/ai-grc-platform/releases/latest)

After installing, launch ControlWeave — the app opens directly into the self-hosted sign-in or account-creation flow, and organization invite links land on a dedicated acceptance page. Updates are delivered automatically on packaged release builds, and local unpacked validation runs skip updater checks cleanly when update metadata is absent. Releases are published automatically whenever a version bump is merged to `main`.

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

<!-- LAST_UPDATED: 2026-05-27 | PR #189: chore(deps-dev): bump tmp from 0.2.5 to 0.2.7 in /electron in the npm_and_yarn group across 1 directory -->

## 🎯 What is This?

A comprehensive GRC (Governance, Risk & Compliance) platform designed for modern organizations managing multiple compliance frameworks, with deep focus on AI governance and threat intelligence. Supports NIST 800-53, ISO 27001, SOC 2, NIST AI RMF, CIS Controls v8, FedRAMP, and 30+ frameworks with 1,000+ controls. Built to be:

- **Multi-Framework**: 30+ major compliance frameworks out of the box
- **AI-Powered**: Built-in AI Copilot with BYOK (Bring Your Own Key) LLM support across 6 providers and 8+ models
- **Threat-Intelligent**: Live feeds from NVD, CISA KEV, MITRE, and AlienVault OTX
- **AI-Ready**: Deep integration with NIST AI RMF, ISO 42001, MAESTRO, and AIUC-1
- **Open Source**: AGPL-3.0 licensed, self-hostable, transparent
- **MCP-Enabled**: Acts as an AI agent via Model Context Protocol (21 tools)
- **Enterprise-Grade**: PostgreSQL RLS, Redis caching, automated backups, SSO, Sentry

## ✅ Current Status — v4.2.0 (All Features Shipped)

The platform is **fully functional** with the complete v4.2.0 feature set. Every capability is available — no tier gating, no feature flags.

### Core Platform
- 🔐 User authentication (JWT HS384, OAuth 2.0, refresh token rotation, TOTP 2FA; WebAuthn/passkey endpoints present, ES384 preferred)
- 📊 Compliance dashboard with real-time metrics and custom dashboard builder
- 🎯 Framework selection (30+ frameworks, 1,000+ controls)
- 📋 Control management, filtering, and health tracking
- 🔗 **Auto-crosswalk** (90%+ similarity auto-satisfies mapped controls across frameworks)
- 📜 AU-2 compliant immutable audit logging
- 🛡️ RBAC with Admin, ISSE, Auditor, and Read-Only roles

### AI & Intelligence
- 🤖 **AI Copilot** — org-aware conversational assistant with 25+ analysis features (gap analysis, compliance forecast, policy generation, remediation playbooks)
- 🧠 **RAG (Retrieval-Augmented Generation)** — context-aware AI answers grounded in your control implementations and evidence
- 🕵️ **Multi-Agent Orchestration** — coordinate multiple AI agents for complex compliance analysis tasks
- 📰 **Regulatory News Feed** — live regulatory updates with source filtering and read/archive tracking
- 🛡️ **AI Threat Library (PLOT4ai)** — 100+ AI threats with category, AI type, role, and phase filtering
- 📚 **NIST Publication Browser** — searchable publication library with control mappings

### Security & Risk
- 🔍 **Threat Intelligence** — live feeds from NVD, CISA KEV, MITRE ATT&CK, and AlienVault OTX with cross-referencing
- 🐛 **Vulnerability Management** — track, triage, and remediate vulnerabilities linked to your asset inventory
- 📦 **SBOM Ingestion** — CycloneDX / SPDX parsing with vulnerability cross-reference
- 🔑 **Service Accounts API** — non-interactive API tokens with scope-based authorization
- 📡 **Splunk / SIEM Connectors** — automated evidence collection from log sources
- 🤝 **Vendor / TPRM** — third-party risk management with continuous monitoring webhooks

### Infrastructure & Operations
- 🗄️ **CMDB** — configuration management database with asset, environment, service-account, password-vault, AI-agent, and environment inventory; baselines, change control, dependency maps
- 📊 **Data Governance** — data classification, lineage tracking, and governance policy enforcement
- 🤖 **AI Monitoring** — compliance layer for AI system monitoring aligned to NIST AI 800-4
- 🔌 **Integrations Hub** — connector templates and instances for enterprise integrations
- 🔐 **SSO (Single Sign-On)** — OpenID Connect / OIDC integration with session management
- ⚡ **Realtime** — Socket.IO-backed live dashboard updates and presence
- 🔔 **Mobile Push Notifications** — iOS (APNs) and Android (FCM) device token lifecycle
- 📧 **Forgot / Reset Password** — full self-service password recovery flow
- 🔁 **Refresh Token Rotation** — single-use refresh tokens; concurrent session cap (configurable, default 10)
- 🐛 **Sentry Integration** — optional error tracking via `SENTRY_DSN`
- 🗄️ **Redis** — distributed rate limiting (Lua atomic INCR+EXPIRE) and response caching; falls back to in-memory when Redis is not configured
- 🔒 **PostgreSQL Row-Level Security** — org-scoped RLS on core tables for defense-in-depth multi-tenant isolation
- 💾 **Automated DB Backups** — cron-scheduled `pg_dump` with audit trail in `backup_logs`

## 🚀 Quick Start (Development)

> The steps below are for developers who want to run from source. If you just want to use ControlWeave, [download the installer](#desktop-app) instead.

### Prerequisites

- **Node.js** 20+ — [download](https://nodejs.org)
- **PostgreSQL** 14+ — [download](https://www.postgresql.org/download/) (or use `brew install postgresql` on macOS / `sudo apt install postgresql` on Ubuntu)
- **Redis** (optional) — enables distributed rate limiting and response caching

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

> 💡 For detailed setup including environment variables and advanced configuration, see [QUICKSTART.md](./QUICKSTART.md).

### Optional: Redis

Add `REDIS_URL=redis://localhost:6379` to `backend/.env` to enable distributed rate limiting and response caching. The platform runs without Redis — it falls back silently to in-memory rate limiting.

### Optional: Sentry

Add `SENTRY_DSN=<your-dsn>` to `backend/.env` to enable error tracking and exception reporting.

## 📚 Supported Frameworks (35+)

### Core Security & Compliance
- **NIST CSF 2.0** — Cybersecurity Framework 2.0 (106 controls across 6 functions)
- **NIST SP 800-53 Rev 5** — Security and Privacy Controls (1,000+ controls with Low/Moderate/High baseline overlays)
- **NIST SP 800-171 Rev 3** — Protecting Controlled Unclassified Information (110 requirements)
- **NIST Privacy Framework 1.0** — Privacy risk management across the enterprise
- **NIST SP 800-207** — Zero Trust Architecture reference model and implementation guide
- **ISO/IEC 27001:2022** — Information Security Management (93 controls)
- **ISO/IEC 27002:2022** — Information security controls guidance
- **ISO/IEC 27005:2022** — Information security risk management
- **ISO/IEC 27017:2015** — Cloud services security controls
- **ISO/IEC 27018:2019** — Protection of PII in public clouds
- **ISO/IEC 27701:2019** — Privacy information management (PIMS)
- **ISO 31000:2018** — Risk management principles and guidelines
- **SOC 2 Type II** — Trust Service Criteria (64+ controls)
- **CMMC 2.0 (Level 2)** — Cybersecurity Maturity Model Certification with crosswalk mappings
- **HIPAA Security Rule** — Health Information Privacy and Security
- **HITECH Act** — Health Information Technology for Economic and Clinical Health
- **NERC CIP** — Critical Infrastructure Protection (47 requirements mapped to NIST 800-53)
- **FFIEC IT Examination Handbook** — Federal Financial Institutions Examination Council
- **FISCAM** — Federal Information System Controls Audit Manual

### AI & Emerging Technology
- **NIST AI RMF 1.0** — AI Risk Management Framework (97+ controls across Govern/Map/Measure/Manage)
- **EU AI Act (2024)** — Article 17 compliance checklist with 22-point evidence workflow
- **ISO/IEC 42001:2023** — AI Management System
- **ISO/IEC 42005:2025** — AI System Impact Assessment
- **ISO/IEC 23894** — AI Risk Management
- **ISO/IEC 38507** — Governance of AI
- **ISO/IEC 22989** — AI Concepts and Terminology
- **ISO/IEC 23053** — Framework for AI Systems Using ML
- **ISO/IEC 5259** — Data Quality for AI
- **ISO/IEC TR 24027** — Bias in AI Systems
- **ISO/IEC TR 24028** — Trustworthiness in AI
- **ISO/IEC TR 24368** — AI Ethics Overview
- **AIUC-1** — Agentic AI Certification (31 controls across 6 risk domains) with NIST AI RMF, EU AI Act, and ISO 42001 crosswalks
- **MAESTRO** — 16 attack-class controls for AI security
- **OWASP Top 10:2025** — Web Application Security with NIST AI guidance

### Financial Services
- **FINRA Supervisory Controls for AI (Notice 24-09)** — AI oversight requirements for broker-dealers
- **SEC AI Risk Management for RIAs & Broker-Dealers (2024)** — SEC guidance on AI use in investment advice
- **SR 11-7 Model Risk Management** — Federal Reserve / OCC model risk management guidance

### Privacy & Data Governance
- **GDPR (2016/679)** — EU General Data Protection Regulation
- **CCPA / CPRA** — California Consumer Privacy Act and Privacy Rights Act

### Jurisdiction-Level AI Law Tracking
- **US State AI Governance Laws** — 47 controls covering 12+ US state AI law jurisdictions (CO, TX, UT, IL, NY, CA, and more)
- **International AI Governance Laws** — EU AI Act, UK, Canada, Japan, Singapore, Australia, and 30+ jurisdictions

### Added in v4.2.0
- **CIS Controls v8** (`cis_controls_v8`) — 18 Implementation Groups with crosswalk mappings to NIST 800-53 Rev 5 and NIST CSF 2.0
- **FedRAMP High Baseline** (`fedramp_high`) — 25 High-only additions (AC, AU, IA, SC, SI, SA, CP, IR, PE, PS, RA, PL families) with crosswalk to NIST 800-53 Rev 5

### Roadmap (not yet seeded)
- PCI DSS 4.0
- COBIT 2019

## 💡 Key Features

### 🤖 AI Platform (BYOK — Bring Your Own Key)

The platform ships with a **built-in AI layer** that any user can activate with their own API key. Self-hosted deployments have no usage limits. All AI features — Copilot, RAG, Multi-Agent Orchestration, Regulatory News, AI Threat Library (PLOT4ai), AI Governance, External AI Logger SDK — are unlocked.

- **AI Copilot** — org-aware conversational assistant with 25+ analysis capabilities:
  - Gap analysis comparing current implementation against target baselines
  - Compliance forecasting and trend projection
  - Policy generation from control requirements
  - Remediation playbook creation
  - Crosswalk optimization suggestions
  - Audit readiness assessment
  - Training recommendations
- **RAG (Retrieval-Augmented Generation)** — AI answers grounded in your own control implementations, evidence, and policies for more accurate, context-specific results
- **Multi-Agent Orchestration** — coordinate specialized AI agents across complex, multi-step compliance analysis tasks with configurable execution deadlines
- **Schema-validated AI output** — JSON Schema validation with one-shot retry and error injection; structured outputs persisted in `ai_decision_log.structured`
- **Few-shot exemplars** — curated `{input, output}` pairs with chain-of-thought instructions for consistent, high-quality AI responses
- **Task profiles** — `reasoning`, `extraction`, `ideation`, `chat` profiles automatically select the right model and temperature per feature

**Supported providers and models:**

| Provider | Models |
|---|---|
| Anthropic (Claude) | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-3-5-haiku-20241022` |
| OpenAI | `gpt-4.1`, `gpt-4.1-mini`, `o3`, `o4-mini` |
| Google Gemini | `gemini-2.0-flash-lite`, Gemini 2.x family |
| Grok | xAI Grok family |
| Groq | Llama, Mixtral, and extended Groq model catalog |
| Ollama (local) | Any model — quantized GGUF supported for reduced memory footprint |

- **BYOK-required enforcement** — when no API key is configured, the UI surfaces `AiProviderSetupModal` automatically, guiding users to add a free provider (Gemini, Groq, Ollama)
- **Per-framework LLM guardrails** for BYOK configurations
- **AI Governance module** — dashboard for managing AI risk and compliance across your organization
- **AI Monitoring** — NIST AI 800-4 compliance layer with cross-feature navigation across 8 monitoring dashboard pages

> 💡 **Getting started:** Go to *Settings → LLM Configuration → enter your API key* for any supported provider.

### 🔍 Threat Intelligence

Live, automated threat data ingested from multiple authoritative sources and cross-referenced against your asset inventory and control implementations:

- **NVD (National Vulnerability Database)** — CVE feeds with severity scoring
- **CISA KEV (Known Exploited Vulnerabilities)** — prioritized exploited vulnerability catalog
- **MITRE ATT&CK** — adversary tactics and techniques
- **AlienVault OTX** — open threat exchange indicators of compromise

Threat data surfaces directly in the Vulnerability Management module and links back to affected assets in the CMDB.

### 🐛 Vulnerability Management

Track, triage, and remediate vulnerabilities end-to-end:

- Vulnerability inventory linked to CMDB assets and services
- Severity-based prioritization with CVSS scoring
- Remediation workflow with POA&M integration
- Cross-reference with SBOM for AI model supply-chain risk
- Evidence collection for remediation verification

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

### 🗄️ CMDB (Configuration Management Database)

Full asset and configuration inventory:

- **Asset types**: hardware, software, services, service accounts, password vaults, AI agents, environments
- **Baselines** — capture and compare configuration states
- **Change control** — track and approve changes to managed assets
- **Dependency maps** — visualize service and asset relationships
- **Audit trail** — every change logged to the immutable audit log

### 📊 Data Governance

- Data classification and labeling (PII, sensitive, public)
- Data lineage tracking across pipelines and systems
- Governance policy enforcement and exception management
- Integration with evidence management for compliance evidence

### 🔐 SSO (Single Sign-On)

- OpenID Connect / OIDC provider integration
- SSO session tokens honor configured refresh-token lifetime
- SSO callback returns tokens in URL fragment (no query-string logging or referrer leakage)
- Org-switching triggers session rotation
- Platform admin coverage for passkey email lookup and SSO contract assertions

### 📎 Evidence Management
- Upload evidence as files (PDF, DOCX, XLSX, images) or link external URLs
- Automatic versioning of all evidence items
- PII data labeling and classification
- Bulk upload via CSV with field mapping UI
- Auto-evidence collection and pending review workflow

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
- Reports module with export capabilities

### 🔐 Security & Access Control
- RBAC with Admin, ISSE, Auditor, and Read-Only roles
- JWT HS384 + OAuth 2.0 authentication with refresh token rotation
- TOTP two-factor authentication
- WebAuthn / passkey passwordless authentication (ES384 preferred, ES256 fallback)
- **Concurrent session cap** — oldest sessions evicted when limit exceeded (configurable, default 10)
- **CNSA Suite 1.0 + 2.0** cryptography: HS384 JWTs, SHA-384 hashing, RSA-3072 license keys, hybrid ML-DSA-65 PQC signing, AES-256-GCM PII encryption, HMAC-SHA-384 searchable index, HMAC-SHA-384 webhooks
- 15-character minimum password policy with complexity rules
- Redis-backed distributed rate limiting (Lua atomic INCR+EXPIRE; in-memory fallback)
- **PostgreSQL Row-Level Security** — `FORCE ROW SECURITY` on core tables; `withOrgContext()` wraps transactions for defense-in-depth isolation
- Timing-safe webhook signature comparison (prevents timing-oracle attacks)
- Separation of duties enforcement
- Per-organization SMTP configuration (org settings → env vars → platform settings)
- Webhook integrations with HMAC-SHA-384 signatures
- Notification system (in-app bell with unread tracking + email delivery)

### 📄 Policy Management
- Policy creation and lifecycle tracking
- AI-powered policy gap analysis
- Smart remediation suggestions
- Exception management workflows

### 📰 Regulatory News & AI Threat Library
- Live regulatory news feed with source filtering and read/archive tracking
- **PLOT4ai AI Threat Library** — browse 100+ AI threats by category, AI type, role, and development phase
- **State AI laws tracker** — 47 controls covering 12+ US state AI law jurisdictions
- **International AI laws tracker** — EU AI Act, UK, Canada, Japan, and 30+ jurisdictions

### 📚 NIST Publication Browser
- Searchable NIST publication library with full text
- Publication-to-control mappings linking publications to framework controls
- Integrated within the Frameworks section for quick reference

### 🔔 Notification System
- In-app notification center with bell icon and unread count tracking
- Notification types: control due, assessment needed, status change, crosswalk, system
- Mark read / mark all read functionality
- Email delivery with per-org SMTP configuration
- User-configurable preferences for in-app vs. email delivery
- Mobile push notifications (iOS APNs + Android FCM) via device token lifecycle

### 🧩 Custom Compliance Framework Builder *(v4.2.0)*
- Create fully custom compliance frameworks with org-defined controls
- Full CRUD for frameworks and individual controls (priority, type, sort order)
- Publish frameworks to make them available org-wide, or keep in draft
- Clone any existing framework as a starting point
- Row-Level Security enforced at the database layer — one org can never see another's custom frameworks
- Frontend builder at `/dashboard/frameworks/custom`

### 📈 Advanced Analytics & Scheduled Reporting *(v4.2.0)*
- **Compliance snapshots** — daily cron captures per-org, per-framework compliance percentage for historical trending
- **Executive dashboard** — cross-framework compliance summary with 30/90/180/365-day trend selector at `/dashboard/reports/executive`
- **Scheduled reports** — configure recurring report delivery (daily/weekly/monthly/quarterly) with format and recipient lists
- Manual report trigger API (`POST /api/v1/reports/scheduled/:id/run`)
- Per-framework trend endpoint (`GET /api/v1/reports/trend/framework/:id`)

### 🏢 MSP Multi-Tenant Org Hierarchy *(v4.2.0)*
- Organizations can have parent–child relationships (`parent_org_id`)
- MSP dashboard at `/dashboard/platform/managed-orgs` — view child org list, compliance summaries, delegated admins
- **Delegated admin** — parent-org users can be granted access to manage child orgs without full auth
- Child org compliance snapshots visible to parent/delegated admins
- Full audit trail on delegation grants and revocations

### 🔌 Continuous Monitoring Connectors *(v4.2.0)*
- **AWS Security Hub** — pull findings from Security Hub, map severity to NIST/CIS controls
- **Qualys VMDR** — import vulnerability detections mapped to CIS Controls v8 and NIST 800-53
- **ITSM / ServiceNow** — link incident and change records to control implementation evidence
- 15 total connector templates in the Integrations Hub (was 12); all with 30 s timeout hardening and HTTP status validation

### 🏗️ Developer & Integration Features
- Full REST API for all operations ([OpenAPI spec](./docs/openapi.yaml))
- MCP server for AI agent integration (21 tools)
- **Integrations Hub** — 15 connector templates: Splunk, SIEM, BitSight, AWS Security Hub, Qualys VMDR, ITSM/ServiceNow, and more
- Webhook system for event-driven integrations
- ControlWeave SDK for programmatic access
- Dynamic configuration system
- WebSocket real-time updates

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

3. **Built-in AI Copilot with RAG & Multi-Agent**
   - BYOK model — bring your own Anthropic, OpenAI, Gemini, Grok, Groq, or Ollama key
   - 25+ org-aware analysis features including gap analysis, regulatory news, and AI threat library
   - RAG grounding for more accurate, context-specific compliance answers
   - Multi-agent orchestration for complex analysis tasks
   - Latest models: Claude 4.x, GPT-4.1, o3/o4-mini, Gemini 2.0 Flash Lite
   - Local model support via Ollama (including quantized GGUF)
   - No separate AI tool subscription needed

4. **Live Threat Intelligence**
   - Automated feeds from NVD, CISA KEV, MITRE ATT&CK, AlienVault OTX
   - Vulnerability management linked to asset inventory
   - SBOM ingestion for supply-chain risk visibility
   - Commercial tools charge extra for threat intel

5. **AI Governance Focus**
   - Deep NIST AI RMF integration
   - MAESTRO attack-class controls for AI security
   - ISO/IEC AI standards coverage (42001, 42005, 23894, 38507, 22989, 23053, 5259, and more)
   - EU AI Act Article 17 compliance checklist
   - AIUC-1 Agentic AI Certification (31 controls)
   - State AI laws tracking (12+ US jurisdictions) and International AI laws tracking
   - AI Monitoring compliance layer (NIST AI 800-4)
   - Purpose-built for modern AI systems compliance

6. **RMF Lifecycle Management**
   - Full NIST SP 800-37 Rev 2 seven-step workflow
   - ATO / DATO / IATT authorization tracking
   - CIA triad impact classification

7. **Enterprise Infrastructure — Included Free**
   - PostgreSQL Row-Level Security for multi-tenant org isolation
   - Redis distributed rate limiting and response caching
   - Automated database backups with audit trail
   - SSO / OIDC integration
   - Sentry error tracking support
   - Refresh token rotation with concurrent session caps

8. **Developer-First**
   - REST API for everything with OpenAPI spec
   - MCP server for AI agent integration
   - ControlWeave SDK for programmatic access
   - Webhook system for event-driven workflows

### What We're NOT Trying to Be:
- ❌ Not a continuous monitoring tool (use Wiz, Orca, Lacework for that)
- ❌ Not a pen testing tool (use Cobalt, Pentest, HackerOne)
- ✅ We're a **compliance management, evidence organization, and AI governance platform**

### Comparison:

| Feature | ControlWeave | Vanta/Drata | Hyperproof | OneTrust |
|---------|--------------|-------------|------------|----------|
| Cost | **Free** | $30K–200K/yr | $50K–150K/yr | $100K+/yr |
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Self-Hosted | ✅ | ❌ | ❌ | ❌ |
| Frameworks | 35+ | 10–15 | 10–20 | 20+ |
| Auto-Crosswalk | ✅ 280+ mappings | ❌ | ❌ | ❌ |
| Custom Framework Builder | ✅ | ❌ | Paid Add-on | ❌ |
| Built-in AI Copilot | ✅ BYOK | ❌ | ❌ | ❌ |
| RAG + Multi-Agent AI | ✅ | ❌ | ❌ | ❌ |
| Threat Intelligence | ✅ (NVD, CISA, MITRE, OTX) | Partial | ❌ | ❌ |
| Vulnerability Management | ✅ | Partial | ❌ | ❌ |
| AI Governance (NIST AI RMF) | ✅ | ❌ | ❌ | ❌ |
| RMF Lifecycle | ✅ | ❌ | ❌ | ❌ |
| SSO / OIDC | ✅ | ✅ | Paid Add-on | ✅ |
| SBOM Integration | ✅ | ❌ | ❌ | ❌ |
| CMDB | ✅ | Partial | ❌ | Partial |
| Data Governance | ✅ | ❌ | ❌ | ✅ |
| MSP Multi-Tenant Hierarchy | ✅ | ❌ | Paid Add-on | ❌ |
| Continuous Monitoring Connectors | ✅ 15 templates | Partial | ❌ | ❌ |
| Executive Dashboard + Trend Analytics | ✅ | Paid Add-on | Paid Add-on | ✅ |
| PostgreSQL RLS | ✅ | N/A | N/A | N/A |
| Redis Rate Limiting | ✅ | N/A | N/A | N/A |
| MCP/API-First | ✅ | API Only | Limited API | Limited API |
| SSP Auto-Generation | ✅ | ❌ | Paid Add-on | Paid Add-on |

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

See [`controlweave-sdk/README.md`](./controlweave-sdk/README.md) for full setup instructions.

## 🏗️ Architecture

```
controlweave/
├── backend/
│   ├── src/
│   │   ├── routes/          # REST API endpoints (auth, controls, frameworks,
│   │   │                    #   assessments, audit, AI, policies, webhooks,
│   │   │                    #   notifications, regulatory news, PLOT4ai,
│   │   │                    #   threat-intel, CMDB, data-governance, SSO, etc.)
│   │   ├── services/        # Business logic (framework, policy, risk scoring,
│   │   │                    #   audit, notification, email, LLM, remediation,
│   │   │                    #   threat-intel feeds, backup scheduler, etc.)
│   │   ├── middleware/      # Auth, RBAC, audit logging, Redis rate limiting,
│   │   │                    #   validation, separation of duties, RLS context
│   │   ├── config/          # Database, Redis, and security configuration
│   │   └── utils/           # Logging, encryption, TOTP, AI security, password
│   │                        #   policy, Redis cache, Sentry integration
│   ├── migrations/          # Database migrations (115)
│   └── scripts/             # Seed data, migration runners, MCP server, utilities
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages (dashboard, frameworks, controls,
│   │   │                    #   assessments, audit, AI analysis, settings,
│   │   │                    #   notifications, regulatory news, PLOT4ai,
│   │   │                    #   threat-intel, CMDB, data-governance, SSO, etc.)
│   │   ├── components/      # Sidebar, DashboardLayout, AICopilot,
│   │   │                    #   NotificationBell, AiProviderSetupModal,
│   │   │                    #   AiQuotaModal, MarkdownContent, StructuredOutput
│   │   └── lib/             # API client, access control, branding, token store
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
- `users` — Authentication and profiles with AES-256-GCM PII encryption and HMAC-SHA-384 email hashing
- `frameworks` — Framework catalog (30+ frameworks)
- `framework_controls` — Individual controls/requirements
- `control_implementations` — Org-specific implementation status

### AI-Specific Tables
- `ai_systems` — AI system inventory and classification
- `ai_system_controls` — AI-to-control mappings
- `ai_decision_log` — AI feature decisions with `structured JSONB` for validated output
- `ai_usage_log` — Per-org AI usage tracking

### RMF Lifecycle Tables
- `rmf_packages` — RMF packages linked to organization systems
- `rmf_step_history` — Step transition history with audit trail
- `rmf_authorization_decisions` — ATO/DATO/IATT/Denial tracking

### Infrastructure & Security Tables
- `backup_logs` — Automated backup audit trail
- `device_push_tokens` — Mobile push token lifecycle with `UNIQUE(token)` cross-account protection
- `server_license` — Persisted license key with `local_public_key` for self-signed community keys

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
- `notifications` — In-app notification system with type-based filtering
- `notification_preferences` — Per-user delivery preferences (in-app vs. email)
- `webhooks` — External integration events
- `llm_configurations` — Per-org LLM API key storage (encrypted) for BYOK providers
- `integrations_hub_connectors` — Integration hub connector templates and instances

### v4.2.0 Tables
- `custom_frameworks` — Org-defined compliance frameworks with RLS
- `custom_framework_controls` — Controls within custom frameworks
- `compliance_snapshots` — Daily per-org, per-framework compliance percentage snapshots for trending
- `scheduled_reports` — Recurring report delivery configuration
- `org_delegated_admins` — MSP delegated admin grants (parent → child org)

## 🎯 Use Cases

### For Compliance Officers
- Track compliance across 30+ frameworks simultaneously
- Leverage auto-crosswalk to reduce compliance burden by 40-60%
- Use AI Copilot with RAG for grounded gap analysis and compliance forecasting
- Generate audit-ready reports and documentation

### For AI Teams
- Inventory and classify AI systems by risk
- Apply NIST AI RMF, MAESTRO, and ISO/IEC AI standards
- Track model governance lifecycle with AI Monitoring (NIST AI 800-4)
- Document fairness and bias testing
- Meet EU AI Act Article 17 requirements
- Certify agentic AI systems with AIUC-1

### For Risk Managers
- Maintain enterprise risk register
- Map risks to controls across frameworks
- Prioritize vulnerabilities with live CISA KEV and NVD intelligence
- Track risk treatment effectiveness
- Use AI-powered risk scoring and remediation suggestions

### For Security Engineers
- Ingest SBOMs (CycloneDX / SPDX) for supply-chain visibility
- Cross-reference CVEs against your asset inventory via CMDB
- Automate evidence collection via Splunk / SIEM connectors
- Manage TPRM with continuous monitoring webhooks
- Enforce PostgreSQL RLS and Redis rate limiting for defense-in-depth

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

- **Backend**: Node.js / Express 5
- **Database**: PostgreSQL 14+ with Row-Level Security (RLS)
- **Cache / Rate Limiting**: Redis (optional; in-memory fallback)
- **Frontend**: Next.js 16.2.4 (React 19) with TypeScript and Tailwind CSS
- **Authentication**: JWT HS384 + OAuth 2.0, TOTP 2FA, WebAuthn/passkey (ES384), SSO/OIDC, refresh token rotation
- **AI**: BYOK multi-provider (Anthropic Claude 4.x, OpenAI GPT-4.1/o3/o4-mini, Gemini 2.0, Grok, Groq, Ollama with GGUF); RAG; Multi-Agent Orchestration
- **Threat Intel**: NVD, CISA KEV, MITRE ATT&CK, AlienVault OTX
- **API**: REST with OpenAPI specification
- **MCP**: Model Context Protocol server (21 tools)
- **Real-time**: WebSocket support via Socket.IO
- **Error Tracking**: Sentry (optional, via `SENTRY_DSN`)
- **Backups**: Automated `pg_dump` via `node-cron`
- **Deployment**: Desktop (Electron with embedded PostgreSQL) or self-hosted

## 📖 Documentation

- [Complete App Walkthrough](./docs/COMPLETE_APP_WALKTHROUGH.md)
- [FedRAMP Deployment Guide](./docs/FEDRAMP_DEPLOYMENT_GUIDE.md) *(v4.2.0)*
- [Crosswalk Guide](./docs/CROSSWALK_GUIDE.md)
- [How Crosswalks Work](./docs/HOW_CROSSWALKS_WORK.md)
- [Database Architecture](./docs/DATABASE_ARCHITECTURE.md)
- [Framework Coverage](./docs/FRAMEWORK_COVERAGE.md)
- [MCP Setup Guide](./docs/MCP_SETUP.md)
- [Self-Hosted Install Guide](./docs/SELF_HOSTED_INSTALL.md)
- [GitHub Repository Guide](./docs/GITHUB_REPOSITORY_GUIDE.md)
- [OpenAPI Specification](./docs/openapi.yaml)
- [Quick Start Guide](./QUICKSTART.md)
- [Release Notes](./RELEASE_NOTES.md)
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

### Phase 2: Advanced Features ✅ (All Complete in v4.0.0)
- ✅ AI Copilot with BYOK LLM support (25+ analysis features)
- ✅ RAG (Retrieval-Augmented Generation) for grounded AI answers
- ✅ Multi-agent orchestration for complex compliance tasks
- ✅ Latest AI models: Claude 4.x, GPT-4.1/o3/o4-mini, Gemini 2.0, Groq expansion
- ✅ Quantized GGUF model support for Ollama
- ✅ Schema-validated structured AI output with few-shot exemplars
- ✅ RMF Lifecycle management (NIST SP 800-37)
- ✅ Auditor workspace and assessment workflows
- ✅ Evidence management with PII classification and auto-collection
- ✅ Policy management with AI gap analysis
- ✅ Notification and webhook systems (HMAC-SHA-384)
- ✅ Mobile push notifications (iOS APNs + Android FCM)
- ✅ POA&M tracking
- ✅ Security posture dashboard
- ✅ AI Analysis, Regulatory News, and AI Threat Library (PLOT4ai)
- ✅ NIST publication browser with control mappings
- ✅ Dashboard builder for custom views
- ✅ Reports module
- ✅ Per-org SMTP email configuration
- ✅ WebAuthn / passkey authentication (ES384 preferred, ES256 fallback)
- ✅ AIUC-1 Agentic AI Certification framework (31 controls)
- ✅ State AI laws tracking (12+ US jurisdictions)
- ✅ International AI laws tracking (EU AI Act, UK, Canada, Japan, 30+ jurisdictions)
- ✅ CMDB (full asset / environment / service account / AI agent inventory)
- ✅ Service Accounts API with scope-based authorization
- ✅ SBOM ingestion (CycloneDX / SPDX)
- ✅ Vulnerability Management linked to CMDB assets
- ✅ Threat Intelligence feeds (NVD, CISA KEV, MITRE, AlienVault OTX)
- ✅ Vendor / TPRM continuous monitoring
- ✅ Splunk / SIEM connector for auto-evidence collection
- ✅ Integrations Hub with connector templates
- ✅ SSO / OIDC integration
- ✅ Data Governance module
- ✅ AI Monitoring compliance layer (NIST AI 800-4)
- ✅ Realtime dashboard updates via Socket.IO
- ✅ Redis distributed rate limiting and response caching
- ✅ PostgreSQL Row-Level Security for defense-in-depth isolation
- ✅ Automated database backup scheduler with audit trail
- ✅ Refresh token rotation + concurrent session cap
- ✅ Sentry error tracking integration
- ✅ Hybrid post-quantum license signing (RSA-3072 + ML-DSA-65)
- ✅ CNSA Suite 1.0 + 2.0 full cryptographic alignment
- ✅ SSP auto-generation (NIST 800-171, FedRAMP) — export to Word/PDF
- ✅ Forgot-password / reset-password self-service flow

### Phase 3: Enterprise & Scale ✅ (All Complete in v4.2.0)
- ✅ Custom framework builder (org-defined frameworks with full CRUD, publish, and clone)
- ✅ Advanced analytics and reporting (compliance snapshots, executive dashboard, scheduled reports)
- ✅ Multi-tenant MSP hierarchy (parent/child orgs, delegated admin)
- ✅ Continuous monitoring integrations (AWS Security Hub, Qualys VMDR, ITSM/ServiceNow)
- ✅ CIS Controls v8 and FedRAMP High Baseline seed data (203 new crosswalk mappings)
- ✅ FedRAMP-ready deployment guide (`docs/FEDRAMP_DEPLOYMENT_GUIDE.md`)

### Phase 4: Automated Intelligence & Platform Maturity (Planned)
- Connector → control auto-assessment (AI-driven status updates from connector findings)
- AI evidence scoring (relevance confidence + gap description)
- Policy-to-control auto-mapping via RAG
- Azure Security Center, GCP SCC, GitHub Advanced Security connectors
- Jira bidirectional POA&M sync
- Scheduled report email delivery
- Auditor external portal (time-limited read-only audit links)
- Helm chart / Kubernetes deployment
- Public REST API with HMAC-SHA-384 API keys

## 🤝 Contributing

We welcome contributions! This is an open-source project designed to help organizations manage compliance effectively. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

### Quick Ways to Contribute

- 🐛 **Report bugs** — [Open an issue](https://github.com/sherifconteh-collab/ai-grc-platform/issues/new?template=bug_report.md)
- 💡 **Suggest features** — [Start a discussion](https://github.com/sherifconteh-collab/ai-grc-platform/discussions)
- 📝 **Improve docs** — Fix typos, add examples, clarify setup steps
- 🧪 **Add tests** — Coverage is always welcome
- 🌐 **Add frameworks** — PCI DSS 4.0, COBIT 2019, and more are on the roadmap
- 🔌 **Extend the SDK** — Contribute to the `controlweave-sdk` for new integrations

## 📜 License

Dual-licensed — see [LICENSE](./LICENSE) for full terms.

- **AGPL-3.0** for open-source / self-hosted use.
- **Commercial license** (Conteh Consulting LLC) for proprietary embedding or hosted service offerings.

By contributing, you agree to the [Contributor License Agreement](./CLA.md). Signing is automated — the CLA bot (see [`.github/workflows/cla.yml`](./.github/workflows/cla.yml)) will prompt you on your first PR.

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/sherifconteh-collab/ai-grc-platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sherifconteh-collab/ai-grc-platform/discussions)
- **Email**: Contehconsulting@gmail.com

## 🌟 Why This Exists

Current GRC tools are either:
- Expensive enterprise software ($50k–500k/year)
- Limited to single frameworks
- Lacking AI governance capabilities
- Closed-source black boxes
- Missing threat intelligence and vulnerability management

This project aims to provide an **open, transparent, affordable** alternative that organizations can:
- Self-host for complete control
- Extend with custom frameworks
- Integrate with their existing tools via API, MCP, or webhooks
- Use AI (with RAG and multi-agent support) to accelerate compliance work (BYOK)
- Get live threat intelligence without a separate subscription

**From Policy to Proof** — Making compliance accessible to everyone.

## 📈 Stats

- **Frameworks**: 37+ supported (including CIS Controls v8 and FedRAMP High added in v4.2.0)
- **Controls**: 1,000+ controls in database
- **Crosswalks**: 280+ cross-framework mappings (203 new mappings added in v4.2.0)
- **Connector Templates**: 15 in the Integrations Hub (AWS Security Hub, Qualys VMDR, ServiceNow added in v4.2.0)
- **AI Features**: 25+ analysis capabilities (BYOK) with RAG and multi-agent support
- **LLM Providers**: 6 supported (Anthropic, OpenAI, Gemini, Grok, Groq, Ollama)
- **AI Models**: Claude 4.x, GPT-4.1/o3/o4-mini, Gemini 2.0 Flash Lite, Groq expanded catalog
- **Tables**: 160+ database tables (custom_frameworks, custom_framework_controls, compliance_snapshots, scheduled_reports, org_delegated_admins added in v4.2.0)
- **Migrations**: 115 sequential, idempotent migrations
- **API Routes**: 70+ route modules
- **Services**: 49 service modules
- **MCP Tools**: 21 tools exposed via Model Context Protocol
- **SDK**: `@controlweave/external-ai-logger` for external AI decision logging
- **Threat Intel Feeds**: 4 (NVD, CISA KEV, MITRE ATT&CK, AlienVault OTX)
- **Security**: CNSA Suite 1.0 + 2.0 — HS384 JWTs, SHA-384 hashing, RSA-3072, hybrid ML-DSA-65 PQC, AES-256-GCM PII encryption, HMAC-SHA-384 webhooks, PostgreSQL RLS, Redis rate limiting, bcrypt cost 14, 15-char password policy
- **Development Status**: Active

## 🔒 Security

ControlWeave 4.0 aligns its cryptographic stack with **NSA Commercial National Security Algorithm (CNSA) Suite 1.0 and 2.0**:

| Surface | CNSA Algorithm |
|---|---|
| JWT session tokens | HMAC-SHA-384 (HS384) |
| Token / refresh-token hashing | SHA-384 |
| Webhook signatures | HMAC-SHA-384 (legacy SHA-256 accepted transitionally) |
| Field-level PII encryption | AES-256-GCM |
| Searchable PII index | HMAC-SHA-384 |
| License signing — classical | RSA-3072 + SHA-384 |
| License signing — post-quantum | **ML-DSA-65 (CRYSTALS-Dilithium)** via `@noble/post-quantum` |
| Passwords | bcrypt cost 14 |
| WebAuthn / passkeys | ES384 preferred, ES256 fallback (hardware-constrained) |

The hybrid RSA-3072 + ML-DSA-65 license envelope means licenses remain verifiable in a post-quantum world while staying backward-compatible with classical verifiers.

**Additional security controls:**

- **PostgreSQL Row-Level Security** (`FORCE ROW SECURITY`) on `controls`, `control_implementations`, `evidence`, `audit_engagements`, `audit_logs`, and `users` — org-scoped at the database layer, not just the application layer
- **`withOrgContext(orgId, fn)`** — wraps transactions with `SET LOCAL app.org_id` for defense-in-depth isolation
- **JWT algorithm-confusion hardening** — explicit `algorithms: ['HS384','HS256']` passed to every `jwt.verify` call (rotation window only; HS256 drops once pre-cutover tokens expire)
- **Refresh token rotation** — single-use refresh tokens; old token invalidated on rotation
- **Concurrent session cap** — oldest sessions evicted to limit credential-stuffing blast radius
- **Timing-safe webhook verification** — `crypto.timingSafeEqual` prevents timing-oracle attacks
- **Redis rate limiting** — Lua atomic INCR+EXPIRE prevents race conditions in distributed deployments

See [`backend/src/utils/encrypt.js`](./backend/src/utils/encrypt.js) `auditEncryptionStrength()` for the self-audit. Report vulnerabilities via [SECURITY.md](./SECURITY.md).

## 🔗 Links

- **Repository**: [ai-grc-platform](https://github.com/sherifconteh-collab/ai-grc-platform)
- **Release Notes**: [RELEASE_NOTES.md](./RELEASE_NOTES.md)
- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)
- **Self-hosted install**: [docs/SELF_HOSTED_INSTALL.md](./docs/SELF_HOSTED_INSTALL.md)
- **MCP setup**: [docs/MCP_SETUP.md](./docs/MCP_SETUP.md)
- Documentation: See [docs/](./docs/) folder

---

**Built with ❤️ by Conteh Consulting**

*ControlWeave — From Policy to Proof*
