# ControlWeave Community Edition — Release Notes

> This document contains release notes for features available on the **Free tier** of ControlWeave.
> Premium-only features (CMDB, Vulnerability Management, Threat Intelligence, Vendor Risk,
> Enterprise Integrations, etc.) are excluded.
>
> For the full changelog see the private repository. For upgrade information visit
> [controlweave.com/pricing](https://controlweave.com/pricing).

---

## [Unreleased]


> Changes staged but not yet released to production.

### Added

#### 🔵 RMF Lifecycle (NIST SP 800-37 Rev 2)

> ✅ **Tier availability:** Free · Starter · Professional · Enterprise

The **RMF Lifecycle** module walks your team through the full NIST SP 800-37 Rev 2 process — from system categorization through authorization and continuous monitoring — without leaving ControlWeave.

- Full RMF lifecycle dashboard with 7-step tracking: Prepare → Categorize → Select → Implement → Assess → Authorize → Monitor
- RMF packages linked to organization systems via nullable FK to `organization_systems`
- Authorization decision recording (ATO / DATO / IATT / Denial) with automatic deactivation of prior decisions
- Step transition history with audit trail (user, timestamp, notes, artifacts)
> 🗂️ **Audit trail** entries are immutable and include the acting user, timestamp, affected resource, and change delta.

- CIA triad impact level tracking (Low / Moderate / High) per system categorization
- Sidebar entry gated on NIST 800-53, NIST 800-171, or CMMC 2.0 framework selection
- Migration 085: `rmf_packages`, `rmf_step_history`, `rmf_authorization_decisions` tables with CHECK constraints


> 💡 **Getting started:** Navigate to *RMF Lifecycle* in the sidebar (visible once you activate NIST 800-53, NIST 800-171, or CMMC 2.0).
#### 🤖 AI Platform

> ✅ **Tier availability:** Free · Starter · Professional · Enterprise

ControlWeave ships with a **built-in AI layer** that any user can activate with their own API key (BYOK). Free users receive **10 AI requests per month** across gap analysis, policy generation, crosswalk optimization, compliance forecasting, and remediation playbooks.

- AI Copilot — org-aware conversational assistant with 25+ analysis features (gap analysis, compliance forecast, etc.)
> 🎯 **Gap analysis** compares your current implementation status against a target framework baseline and lists missing controls.

- Per-framework LLM guardrails for BYOK configurations
- Platform fallback LLM defaults and provider model dropdowns
- AI Governance module — governance dashboard for AI risk management


> 💡 **Getting started:** Go to *Settings* → *LLM Configuration* → enter your API key for Anthropic, OpenAI, Gemini, Grok, Groq, or Ollama.
#### 📋 Compliance Frameworks

> ✅ **Tier availability:** Free · Starter · Professional · Enterprise

ControlWeave supports **25+ compliance frameworks** out of the box. Free-tier organizations can activate up to 2 frameworks simultaneously and benefit from automatic crosswalk mappings between them.

- CMMC 2.0 framework module with crosswalk mappings
> 🔗 **Crosswalk mapping** automatically surfaces overlapping controls across frameworks so you comply once and satisfy many.

- HIPAA/HITECH framework module
- MAESTRO framework — 16 attack class controls for AI security
- ISO/IEC AI standards coverage: 23894, 38507, 22989, 23053, 5259, TR 24027, TR 24028, TR 24368
- OWASP Top 10:2025 + NIST AI guidance implementation
- Financial Services compliance workspace
- EU AI Act Article 17 compliance checklist enhancements


> 💡 **Getting started:** Go to *Frameworks* in the sidebar → click *Activate* on any framework to begin.
#### 🔒 Security & Risk Management

> ✅ **Tier availability:** Free · Starter · Professional · Enterprise

Security fixes are applied across all tiers. The following improvements shipped in this release to harden the platform against identified vulnerabilities.

- PII data labeling and classification for evidence uploads
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- Zero Trust Architecture implementation guide (NIST SP 800-207)


> 💡 **Action required:** Update to this version to benefit from all security patches.
#### 🚀 CI/CD & Release Management

> ✅ **Tier availability:** Free · Starter · Professional · Enterprise

**CI/CD and Release Management** improvements keep the development pipeline reliable and auditable — branch naming enforcement, automated release notes, and hardened security scanning.

- CM branch naming convention enforcement via GitHub Actions (`<type>/CW-<number>/<short-desc>`)
- Release workflow — tag-triggered GitHub Release creation from CHANGELOG.md
- Docs pipeline automation — screenshots, quality checklist, auto-close
- CodeQL v4 upgrade with dedicated scanning workflow
- Gitleaks configuration for secrets detection (with false positive handling)
- Container security scan pipeline fixes
- IP hygiene CI checks for marketing copy


> 💡 **Getting started:** See `.github/workflows/` for the full pipeline definitions.
### Changed
- CI: auto-update docs on merge, NIST 800-160 security gates, SBOM/AIBOM generation ([#39](https://github.com/sherifconteh-collab/ai-grc-platform/pull/39)) — @Copilot
- RMF step tracking is now observational only (not a deployment gate), consistent with NIST SP 800-37 philosophy
- Auth `/me` endpoint now returns `framework_codes` array for client-side feature gating
- Trial period updated from 7 to 14 days across all references
- Branding updated to "From Policy to Proof"
- Professional tier framework limit bumped to 20
- Dashboard sidebar reorganized with framework-gated entries (RMF Lifecycle, Auditor Workspace)
- Pricing tiers restructured: Starter / Professional / Enterprise / Utilities
- `console.error` replaced with structured logger across all backend routes

### Fixed
- Production build failure — `useSearchParams()` missing Suspense boundary in `register/page.tsx`
- Demo login credentials — passwords updated to comply with 12-char minimum policy
- Authentication middleware — resilient to missing `feature_overrides` column, non-fatal trial check failures
- Railway deployment — correct builders, `startCommand`, PORT configuration, standalone runtime compatibility
- Docker frontend build — bake correct `NEXT_PUBLIC_API_URL` via `.env.production`
- Pagination offset bug returning duplicate records on page 2+
- Professional tier incorrectly showing unlimited frameworks
- Menu path consistency: Settings → External Contacts
- Sidebar rail full-height with internal scroll
- CW emblem centering within branding
- Aria-current logic in Breadcrumbs and format-safe date parsing
- Vulnerability suppression — removed hardcoded MEDIUM severity filter so accepted items at any severity are hidden
- IP hygiene CI failures from marketing copy
- SARIF upload gracefully skipped when GitHub Code Scanning is not enabled
- `articles` variable renamed to `articleRequirements` for clarity in EU AI Act page
- Missing `keywords` property in `soc-2/page.tsx` metadata restored

### Security
- **12-finding security audit remediation:**
  - Permission escalation — enforced `assessments.write` / `settings.write` on 10 organization mutation routes
  - Open redirect — validated Stripe billing `returnUrl` against allowlist
  - Multer DoS — added file size (50 MB) and file count (10) limits
  - RAG error leakage — sanitized internal error messages in AI responses
  - Billing webhook disclosure — masked internal errors in Stripe webhook handler
  - Billing rate limiting — per-IP throttling on payment endpoints
  - ILIKE wildcard injection — escape `%` and `_` in user-supplied SQL LIKE patterns
  - Portal session returnUrl — restrict to configured `FRONTEND_URL`
  - Threat intelligence filtering — sanitize output before returning to client
  - Frontend `alert()` replaced with inline error messages
  - Reasoning memory cache cap — prevent unbounded memory growth
  - Multi-agent timeout — enforce configurable execution deadline
  - Model router stats cap — prevent stats object from growing without bound
- CM branch naming enforcement — regex validation on all PRs and pushes (excludes `main`, `staging`, `release/*`)
- Multi-layer edition security to prevent community bypass of Pro features
- Hardened security pipeline: removed 3 redundant workflows, consolidated into single enhanced pipeline
- Pruned 144 stale remote branches for repository hygiene



---

## [0.3.0] — 2026-02-18

> **Released:** 2026-02-18


### Added
- NERC CIP framework module: initial control library with 47 requirements mapped to NIST 800-53 Rev. 5
- Feature gating system: tiered access control tied to pricing plan (Starter / Professional / Enterprise)
- EU AI Act Article 17 compliance checklist: 22-point evidence collection workflow
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- PostgreSQL 18 schema: `evidence_items`, `control_mappings`, `audit_events` tables
- GitHub Actions CI pipeline: lint + test on push to `main` and `develop`

### Changed
- Pricing tiers revised: $179 / $799 / $2,999 per month (previously $149 / $699 / $2,499)
- Dashboard navigation restructured: Controls → Evidence → Reports → Settings
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- NIST AI RMF mapping updated to align with January 2026 NIST publication errata

### Fixed
- Evidence upload widget: file size validation now correctly rejects files > 50MB
- Control status badge: no longer shows "Unknown" when evidence count = 0



---

## [0.2.1] — 2026-02-05

> **Released:** 2026-02-05


### Fixed
- Database migration script: resolved foreign key constraint error on `framework_controls` table
- API route `/api/v1/controls`: corrected pagination offset bug returning duplicate records on page 2+



---

## [0.2.0] — 2026-01-22

> **Released:** 2026-01-22


### Added
- NIST 800-53 Rev. 5 full control library: 1,007 controls with baseline overlays (Low / Moderate / High)
- Evidence ingestion pipeline: bulk upload via CSV with field mapping UI
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- Audit trail: immutable log of all evidence submissions, status changes, and user actions
> 🗂️ **Audit trail** entries are immutable and include the acting user, timestamp, affected resource, and change delta.

- User roles: Admin, ISSE, Auditor, Read-Only with RBAC enforcement at API layer
> 🛡️ **RBAC** is enforced at the API layer — every endpoint checks the caller's role permissions before returning data.

- Branding assets: ControlWeave logo, color palette (#0D1B2A / #2E75B6), favicon

### Changed
- API authentication: migrated from API key to OAuth 2.0 with JWT
- Evidence status workflow: Pending → Under Review → Accepted / Rejected (previously binary)
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.


### Deprecated
- Legacy CSV import format (v1): will be removed in v0.4.0

### Security
- Implemented field-level encryption for PII in `user_profiles` table
- Rate limiting added to all public API endpoints: 100 req/min per IP



---

## [0.1.0] — 2026-01-05

> **Released:** 2026-01-05


### Added
- Initial project scaffolding: Next.js frontend, Node.js API, PostgreSQL database
- NIST AI RMF framework: Govern, Map, Measure, Manage categories with evidence placeholders
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- Basic dashboard: control status overview, evidence count, completion percentage
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- Authentication: email/password login with bcrypt hashing
- VS Code dev environment: ESLint, Prettier, Husky pre-commit hooks configured
- README.md: project overview, setup instructions, environment variable reference



---

<!-- Generated by generate-public-release-notes.js on 2026-03-12T10:49:40.051Z -->
