# ControlWeave — Project Status

**Version**: 4.2.0  
**Date**: 2026-05-24  
**Status**: Production — Fully Shipped  
**Progress**: 100% (all Phase 1, Phase 2 & Phase 3 features complete)

---

## ✅ Shipped — v4.0.0

### Authentication & Access
- ✅ JWT HS384 + OAuth 2.0 with refresh token rotation (single-use)
- ✅ TOTP two-factor authentication
- ✅ WebAuthn / passkey (ES384 preferred, ES256 fallback)
- ✅ SSO / OIDC integration with session management
- ✅ Concurrent session cap (default 10, configurable)
- ✅ Forgot-password / reset-password self-service flow
- ✅ RBAC — Admin, ISSE, Auditor, Read-Only roles

### Compliance Framework Engine
- ✅ 35+ frameworks seeded (NIST, ISO, SOC 2, HIPAA, GDPR, CCPA, FFIEC, NERC CIP, EU AI Act, AIUC-1, and more)
- ✅ 1,000+ controls across all frameworks
- ✅ 80+ cross-framework crosswalk mappings
- ✅ Auto-crosswalk engine (90%+ similarity threshold)
- ✅ Control management, filtering, and health tracking
- ✅ RMF Lifecycle (NIST SP 800-37 Rev 2) — full 7-step workflow with ATO/DATO/IATT tracking

### AI & Intelligence
- ✅ AI Copilot — 25+ org-aware analysis features (BYOK)
- ✅ RAG (Retrieval-Augmented Generation)
- ✅ Multi-agent orchestration
- ✅ Supported providers: Anthropic Claude 4.x, OpenAI GPT-4.1/o3/o4-mini, Gemini 2.0, Grok, Groq, Ollama (GGUF)
- ✅ Schema-validated structured AI output with few-shot exemplars and one-shot retry
- ✅ AI Monitoring compliance layer (NIST AI 800-4)
- ✅ AI Governance module
- ✅ AI Threat Library — PLOT4ai (100+ threats)
- ✅ BYOK enforcement — `AiProviderSetupModal` and `AiQuotaModal`

### Security & Threat Intelligence
- ✅ Threat Intelligence feeds — NVD, CISA KEV, MITRE ATT&CK, AlienVault OTX
- ✅ Vulnerability Management linked to CMDB assets
- ✅ SBOM ingestion — CycloneDX / SPDX with vulnerability cross-reference
- ✅ CNSA Suite 1.0 + 2.0 — HS384 JWTs, SHA-384, RSA-3072, ML-DSA-65 PQC, AES-256-GCM
- ✅ PostgreSQL Row-Level Security on core tables
- ✅ Redis distributed rate limiting (Lua atomic; in-memory fallback)
- ✅ bcrypt cost 14, 15-character minimum password policy
- ✅ HMAC-SHA-384 webhooks

### Evidence & Audit
- ✅ Evidence management — file upload, URL linking, versioning, PII classification
- ✅ Auto-evidence collection with pending review workflow
- ✅ AU-2 compliant immutable audit log
- ✅ POA&M tracking

### Risk & Compliance Workflows
- ✅ Enterprise risk register
- ✅ Auditor workspace and assessment workflows
- ✅ Policy management with AI gap analysis
- ✅ Vendor / TPRM continuous monitoring
- ✅ CMDB — hardware, software, services, service accounts, AI agents, environments
- ✅ Data Governance module
- ✅ Service Accounts API with scope-based authorization
- ✅ Splunk / SIEM connector for auto-evidence collection
- ✅ Integrations Hub with connector templates

### Reporting & Dashboards
- ✅ Executive compliance dashboard with real-time metrics
- ✅ Dashboard builder for custom views
- ✅ Reports module
- ✅ SSP auto-generation (NIST 800-171, FedRAMP) — Word/PDF export
- ✅ Risk heat maps

### Notifications & Communication
- ✅ In-app notification center with unread tracking
- ✅ Email delivery with per-org SMTP configuration
- ✅ Mobile push notifications (iOS APNs + Android FCM)
- ✅ Regulatory news feed with source filtering

### Infrastructure
- ✅ Automated PostgreSQL backup scheduler with `backup_logs` audit trail
- ✅ Redis response caching via `utils/redisCache.js`
- ✅ Sentry error tracking (optional, `SENTRY_DSN`)
- ✅ Socket.IO realtime dashboard updates
- ✅ MCP server — 21 tools via Model Context Protocol
- ✅ REST API with OpenAPI spec
- ✅ `@controlweave/external-ai-logger` SDK for external AI decision logging

### Desktop App
- ✅ Electron desktop app with embedded PostgreSQL (no setup required)
- ✅ Auto-update via `electron-updater`
- ✅ Builds: Windows .exe, macOS .dmg (arm64 + x64), Linux .AppImage

---

## ✅ Shipped — v4.2.0

### Phase 3 Features

- ✅ Custom Framework Builder — org-defined frameworks with custom controls (`custom_frameworks`, `custom_framework_controls` tables; full CRUD API + UI)
- ✅ CIS Controls v8 seed data — 18 top-level controls with NIST 800-53 Rev 5 and NIST CSF 2.0 crosswalks
- ✅ FedRAMP High Baseline seed data — 25 High-only additions with crosswalk to NIST 800-53 Rev 5
- ✅ FedRAMP deployment guide (`docs/FEDRAMP_DEPLOYMENT_GUIDE.md`) — architecture requirements, env vars, security checklist, audit log mapping, RTO/RPO targets, ConMon deliverables
- ✅ Advanced analytics and reporting — `compliance_snapshots` table, executive dashboard (`/dashboard/reports/executive`), trend API, scheduled reports
- ✅ Multi-tenant improvements — MSP parent/child org hierarchy (`parent_org_id`, `org_delegated_admins`), child org list + summary + delegation APIs, managed orgs dashboard (`/dashboard/platform/managed-orgs`)
- ✅ Continuous monitoring integrations — AWS Security Hub, Qualys VMDR, ITSM/ServiceNow connectors (15 total templates in Integrations Hub)
- ✅ 203 additional crosswalk mappings across CMMC 2.0, NIST 800-171, PCI DSS v4, HIPAA, ISO 27701, GDPR, CCPA/CPRA, NERC CIP

---

## 🚧 Phase 4 — Roadmap

See `PHASE_2_ROADMAP.md` (to be updated) for the full Phase 4 roadmap:

- **v4.3.0**: Phase 3 carry-over — PCI DSS 4.0, COBIT 2019 seed data; PostgreSQL 17+ minimum
- **v5.0.0**: Automated Compliance Intelligence — connector → control auto-assessment, AI evidence scoring, policy-to-control auto-map
- **v5.1.0**: Integration Ecosystem Expansion — Azure Security Center, GCP SCC, GitHub Advanced Security, Jira bidirectional sync, Connector SDK
- **v5.2.0**: Enterprise Governance & Reporting — scheduled report email delivery, auditor external portal, board read-only portal, supplier attestations
- **v5.3.0**: Platform Maturity & DevEx — Helm chart, zero-downtime migrations, SAML 2.0 IdP mode, public REST API with HMAC API keys, GitHub Action compliance gate, FIPS 140-3 crypto, ControlWeave SDK v2
