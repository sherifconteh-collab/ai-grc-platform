# Release Notes

## v2.2.0 — Security Hardening & CI/CD (March 2026)

**Patch release** syncing security remediations, CI/CD improvements, and bug fixes from the upstream [ControlWeave](https://github.com/sherifconteh-collab/ControlWeave) platform.

---

### 🔒 Security Hardening (12-Finding Audit Remediation)

A full security audit was completed across the platform. All 12 findings have been remediated in this release:

- **Permission escalation** — Enforced `assessments.write` / `settings.write` permissions on 10 organization mutation routes
- **Open redirect** — Validated billing `returnUrl` against an allowlist before redirecting
- **Multer DoS** — Added file size (50 MB) and file count (10) limits on upload endpoints
- **RAG error leakage** — Sanitized internal error messages in AI responses before returning to client
- **Billing webhook disclosure** — Masked internal error details in webhook handler responses
- **Billing rate limiting** — Added per-IP throttling on payment and billing endpoints
- **ILIKE wildcard injection** — Escaped `%` and `_` characters in user-supplied SQL LIKE patterns
- **Portal session returnUrl** — Restricted return URLs to configured `FRONTEND_URL` only
- **Threat intelligence filtering** — Sanitized output before returning threat data to client
- **Frontend `alert()` calls** — Replaced all `alert()` calls with inline error messages
- **Reasoning memory cache** — Capped unbounded memory growth in reasoning cache
- **Multi-agent timeout** — Enforced configurable execution deadline for multi-agent operations
- **Model router stats** — Capped stats object size to prevent unbounded memory growth

---

### 🚀 CI/CD & Release Management

- **Branch naming enforcement** — GitHub Actions enforces `<type>/CW-<number>/<short-desc>` convention on all PRs and pushes (excludes `main`, `staging`, `release/*`)
- **Release workflow** — Tag-triggered GitHub Release creation from `CHANGELOG.md` / release notes
- **CodeQL v4 upgrade** — Dedicated CodeQL scanning workflow updated to v4
- **Gitleaks configuration** — Improved secrets detection with false positive handling
- **Container security scan** — Fixed container security pipeline failures
- **IP hygiene CI** — Automated checks for hardcoded IPs in marketing copy

---

### 🐛 Bug Fixes

- **Production build failure** — Fixed `useSearchParams()` missing `Suspense` boundary in `register/page.tsx`
- **Demo login credentials** — Updated to comply with the 12-character minimum password policy
- **Authentication middleware** — Resilient to missing `feature_overrides` column and non-fatal trial check failures
- **Railway deployment** — Corrected builders, `startCommand`, PORT configuration, and standalone runtime compatibility
- **Docker frontend build** — Correctly bake `NEXT_PUBLIC_API_URL` via `.env.production`
- **Pagination offset** — Fixed duplicate record bug on page 2+ of paginated endpoints
- **Professional tier framework limit** — Corrected display to reflect actual tier limits (was incorrectly showing "unlimited")
- **Sidebar rail** — Fixed full-height layout with internal scroll on all screen sizes
- **Aria-current logic** — Fixed Breadcrumbs and date parsing in framework navigation
- **Vulnerability suppression** — Removed hardcoded MEDIUM severity filter so accepted items at any severity are hidden
- **EU AI Act page** — Renamed `articles` variable to `articleRequirements` for clarity
- **SOC 2 metadata** — Restored missing `keywords` property in `soc-2/page.tsx`

---

### 🔧 Improvements

- Trial period updated from 7 to **14 days** across all references
- Pricing tiers restructured: **Starter / Professional / Enterprise / Utilities**
- Professional tier framework limit bumped to **20 simultaneously active frameworks**
- `console.error` replaced with structured logger across all backend routes
- Auth `/me` endpoint now returns `framework_codes` array for client-side feature gating
- Sidebar reorganized with framework-gated entries (RMF Lifecycle, Auditor Workspace)
- Multi-layer edition security to prevent community bypass of Pro features
- Pruned stale remote branches for repository hygiene

---

## v2.1.0 — Community Edition Sync (March 2026)

**Major release** syncing the open-source community edition with the upstream [ControlWeave](https://github.com/sherifconteh-collab/ControlWeave) platform. This release adds 100+ new files across backend routes, services, middleware, migrations, and scripts — significantly expanding platform capabilities.

---

### 🆕 New Features

#### 🔄 RMF Lifecycle Management (NIST SP 800-37 Rev 2)
- Full seven-step workflow: Prepare → Categorize → Select → Implement → Assess → Authorize → Monitor
- RMF packages linked to organization systems
- Authorization decision tracking (ATO / DATO / IATT / Denial) with automatic deactivation of prior decisions
- Step transition history with complete audit trail (user, timestamp, notes, artifacts)
- CIA triad impact level tracking (Low / Moderate / High) per system categorization

#### 🤖 AI Copilot (BYOK — Bring Your Own Key)
- Org-aware conversational assistant with 25+ analysis capabilities
- Gap analysis, compliance forecasting, policy generation, remediation playbooks
- Multi-provider support: Anthropic (Claude), OpenAI, Google Gemini, Grok, Groq, Ollama (local)
- Per-framework LLM guardrails for BYOK configurations
- AI Governance module for managing AI risk across the organization

#### 📋 POA&M (Plan of Action & Milestones)
- Full POA&M lifecycle tracking with due dates and status
- Framework-specific POA&M views
- Integration with assessment findings and remediation workflows

#### 📄 Policy Management
- Policy creation, versioning, and lifecycle tracking
- AI-powered policy gap analysis
- Smart remediation suggestions for identified policy gaps
- Exception management workflows

#### 🏗️ Auditor Workspace & Assessments
- Dedicated auditor workspace with structured assessment workflows
- Control verification tracking (verified / not verified / requires remediation)
- Assessment procedures with findings documentation
- Evidence review and approval workflows

#### 📊 Dashboard Builder
- Custom dashboard creation with configurable widgets
- Dynamic configuration system for personalized views
- Executive compliance dashboards with real-time metrics
- Control health tracking and risk heat maps

#### 🔔 Notification & Webhook System
- In-app notification system with read/unread tracking
- Email notification support via configurable SMTP
- Webhook system for external system integration
- Event-driven notification triggers

#### 🛡️ Advanced RBAC (Role-Based Access Control)
- Custom role creation with granular permission management
- Batch permission assignment using set-based database operations
- Separation of duties (SoD) enforcement middleware
- Auditor role templates for common workflows

#### 📎 Evidence Management
- Upload evidence as files (PDF, DOCX, XLSX, images) or link external URLs
- Automatic versioning of all evidence items
- PII data labeling and classification
- Bulk upload via CSV with field mapping

#### 🔗 Auto-Crosswalk Technology
- Implement one control → automatically satisfies mapped controls across frameworks
- 90%+ similarity threshold for defensible mappings
- 80+ cross-framework control mappings
- Reduces compliance burden by 40-60% through control reuse

#### 🔒 TOTP Two-Factor Authentication
- Time-based One-Time Password (TOTP) support
- QR code setup flow for authenticator apps
- Backup codes for account recovery

#### 📡 OpenClaw Webhook Integration
- Secure webhook receiver for OpenClaw contract analysis events
- HMAC signature verification using raw request body bytes
- Automated compliance mapping from contract analysis results

#### 🖥️ MCP (Model Context Protocol) Server
- AI agent integration via Model Context Protocol
- Query compliance status, identify gaps, suggest implementations
- Secure MCP server variant with authentication
- Tool registry for extensible MCP capabilities

#### 📈 Performance Monitoring
- Server performance metrics endpoint (admin-only)
- Database health monitoring with connection pool stats
- System resource utilization tracking
- Performance analytics dashboard

---

### 🔧 Improvements

#### Security Enhancements
- **Rate limiting**: Global API rate limiter on all `/api/v1` routes, plus per-route limiters on sensitive endpoints (audit reads at 120 req/min)
- **Request context**: Correlation IDs and request tracing middleware
- **Input validation**: Centralized validation middleware using schema-based validation
- **Security configuration**: Centralized security config (`security.js`) for Helmet, CORS, and session settings
- **Edition gating**: Community/Pro edition enforcement middleware — features correctly gated by tier

#### Authentication & Authorization
- JWT + OAuth 2.0 with refresh token rotation
- RBAC table existence check caches `false` only for definitive Postgres `42P01` errors, not transient DB issues
- Field-level encryption for PII data

#### Database & Data
- Database migrations system (`001_initial_schema.sql`, `010_assessment_procedures.sql`, `011_notifications.sql`)
- Seed scripts for frameworks, controls, and assessment procedures
- `DB_PORT` properly parsed as integer for robust PostgreSQL configuration
- Connection pool settings with configurable min/max/idle timeout

#### Backend Architecture
- Converted to CommonJS module system for broad compatibility
- Routes refactored into focused files (27 route modules)
- Services layer for business logic separation (17 service modules)
- Centralized tier policy configuration (`tierPolicy.js`)
- Dynamic configuration service for runtime settings

#### Developer Experience
- IP hygiene checker for scanning hardcoded IPs
- Database checker and Railway config validator scripts
- Syntax checking utilities
- Mirror sync allowlist for controlled upstream merges

---

### 📚 New API Routes

| Route Module | Endpoints | Description |
|---|---|---|
| `ai.js` | AI Copilot | Conversational AI assistant with 25+ analysis features |
| `assessments.js` | Assessment CRUD | Assessment lifecycle and findings management |
| `auditFields.js` | Dynamic Fields | Configurable audit field definitions |
| `auditorWorkspace.js` | Auditor Tools | Dedicated auditor workflow endpoints |
| `controlHealth.js` | Health Metrics | Control implementation health tracking |
| `dashboardBuilder.js` | Custom Dashboards | Create and manage custom dashboard views |
| `dynamicConfig.js` | Configuration | Runtime configuration management |
| `exceptions.js` | Exception Mgmt | Policy and control exception workflows |
| `frameworks.js` | Framework CRUD | Framework catalog management |
| `help.js` | Help System | In-app help and documentation |
| `issueReport.js` | Issue Tracking | Report and track platform issues |
| `notifications.js` | Notifications | In-app and email notification management |
| `openclawWebhook.js` | OpenClaw | Contract analysis webhook receiver |
| `ops.js` | Operations | Operational health and status endpoints |
| `performance.js` | Performance | Server metrics and monitoring (admin-only) |
| `poam.js` | POA&M | Plan of Action & Milestones tracking |
| `policies.js` | Policy Mgmt | Policy lifecycle and gap analysis |
| `roles.js` | RBAC | Role and permission management |
| `totp.js` | 2FA | TOTP setup and verification |
| `webhooks.js` | Webhooks | External system webhook management |

---

### 🛡️ New Middleware

| Middleware | Purpose |
|---|---|
| `auditLog.js` | AU-2 compliant immutable audit logging |
| `edition.js` | Community/Pro edition feature gating |
| `performanceMonitoring.js` | Request timing and performance metrics |
| `rateLimit.js` | Configurable rate limiting with Retry-After headers |
| `requestContext.js` | Request correlation IDs and tracing |
| `sod.js` | Separation of duties enforcement |
| `validate.js` | Schema-based input validation |

---

### 🔄 Migration Guide

This release is backward-compatible for existing installations:

1. **Database**: Run new migrations in `backend/migrations/` to add assessment procedure and notification tables
2. **Dependencies**: Run `npm install` in both `backend/` and `frontend/` to pick up updated dependencies
3. **Environment**: No new required environment variables — all new features use sensible defaults
4. **Seed Data**: Optionally run `npm run seed` to load expanded framework and assessment procedure data

---

### 📦 Dependencies

- All dependencies audited: **0 known vulnerabilities**
- All licenses verified: MIT, Apache-2.0, BSD, ISC, and other permissive licenses
- Node.js 20+ required (LTS recommended)

---

### 💎 Want More?

This community edition is fully functional and MIT licensed. For enterprise-grade capabilities, visit **[ControlWeave.com](https://controlweave.com)** for premium tiers including:

- CMDB with asset lifecycle tracking
- Vulnerability management and automated scanning
- Threat intelligence feeds and risk correlation
- Vendor risk management (TPRM)
- Enterprise integrations (Splunk, SIEM, SSO/SAML)
- Advanced reporting and analytics
- Multi-tenant management
- Unlimited frameworks

👉 **[Get started at ControlWeave.com](https://controlweave.com/pricing)**

---

*Built with ❤️ by Conteh Consulting — From Policy to Proof*
