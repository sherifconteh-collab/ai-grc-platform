# ControlWeave Community Edition — Release Notes

> This document contains release notes for features available on the **Community tier** of ControlWeave.
> Premium-only features (CMDB, Vulnerability Management, Threat Intelligence, Vendor Risk,
> Enterprise Integrations, etc.) are excluded.
>
> For the full changelog see the private repository. For upgrade information visit
> [controlweave.com/#pricing](https://controlweave.com/#pricing).

---

## [Unreleased]

> Changes staged but not yet released to production.

### Changed

- Sync with ControlWeave public repo — v2.4.2 + add missing dashboard pages ([#79](https://github.com/sherifconteh-collab/ai-grc-platform/pull/79)) — @Copilot

## [2.4.2] — 2026-03-20

> **Released:** 2026-03-20


### Added

#### 🔒 AI Security Hub

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

Security fixes are applied across all tiers. The following improvements shipped in this release to harden the platform against identified vulnerabilities.

- Consolidated AI security view with six GRC-native pillars: OWASP Top 10 for LLMs, NIST AI RMF alignment, EU AI Act readiness, PLOT4ai threat modeling, AI supply-chain risk, and agentic AI (AIUC-1) certification status.


> 💡 **Action required:** Update to this version to benefit from all security patches.
### Fixed
- Community edition license label corrected: MIT → AGPL v3.
- Settings/billing page broken links and incorrect Gemini model name (`gemini-2.5-pro`).
- Pricing page: Enterprise "Contact Sales" now routes to `/contact`; removed CLA gate.
- Community mirror: fixed server startup crash, missing migrations, and self-hosted install guide.
- Toast UX hardened across dashboard pages.

### Changed
- All rate limiters consolidated to use `createRateLimiter` — removes direct `express-rate-limit` imports.
- AI Analysis and Regulatory News moved to community tier (no longer restricted to pro).
- AI Threat Library (PLOT4ai) moved to community tier.
- New AI Security hub added to sidebar (enterprise tier).
- Platform-level LLM fallback keys removed from AI status endpoint (BYOK-only for community).
- `socket.io-parser` pinned to 4.2.6 via overrides for frontend and backend.
- Canonical documentation map added; release notes, security checks, and tier marketing aligned.
- Release notes workflow now auto-triggers on push to `main` with patch version auto-increment.
- fix: CLA workflow — use `contains` instead of `startsWith`, add `recheck` support ([#80](https://github.com/sherifconteh-collab/ai-grc-platform/pull/80)) — @Copilot

---

### Added

#### 📋 AIUC-1 Agentic AI Certification Framework (v2.4.0)

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

ControlWeave supports **25+ compliance frameworks** out of the box. Community-tier organizations can activate up to 2 frameworks simultaneously and benefit from automatic crosswalk mappings between them.

- **`seed-aiuc1-framework.js`** — New seed script adding AIUC-1 as a supported compliance framework in ControlWeave. AIUC-1 is the first independently-audited certification standard purpose-built for agentic (autonomous) AI systems, developed by the Artificial Intelligence Underwriting Company (AIUC) with Schellman as the first accredited auditor.
- **31 controls** across six risk domains: Data & Privacy (DP-1–DP-6), Security (SEC-1–SEC-6), Safety (SAF-1–SAF-5), Reliability (REL-1–REL-5), Accountability (ACC-1–ACC-5), Societal Impact (SOC-1–SOC-5).
- **Crosswalk mappings** to NIST AI RMF 1.0, EU AI Act 2024, and ISO/IEC 42001:2023. OWASP Agentic AI Top 10 crosswalks included when that framework is pre-seeded.
> 🔗 **Crosswalk mapping** automatically surfaces overlapping controls across frameworks so you comply once and satisfy many.

- AIUC-1 added to `seed-frameworks.js` framework list with 13 core crosswalk pairs to existing AI governance frameworks.

- **AI Governance check** (`llmService.js`) updated to include `aiuc_1` alongside `eu_ai_act`, `nist_ai_rmf`, `iso_42001`, and `iso_42005`. Analysis prompt extended with AIUC-1 readiness assessment across all six domains.
- **Enterprise tier** — AIUC-1 gated at enterprise tier consistent with its use case (organizations deploying autonomous AI agents at scale).
- `npm run seed:aiuc1` — new seed script entry in `backend/package.json`.

> 💡 **Getting started:** Go to *Frameworks* in the sidebar → click *Activate* on any framework to begin.
#### 🔔 Self-Service Community License Generation & Admin Notification (v2.3.3)

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

**Notifications** keep your team aware of control status changes, assessment completions, and approaching due dates — delivered in-app and optionally via email.

- `licenseService.js`: added `generateCommunityKey(licensee, seats)` — generates a local RSA-2048 keypair, signs a community-tier JWT (perpetual, no `exp`), returns `{ licenseKey, publicKey }`. Private key is discarded after signing.
- `licenseService.js`: added `setLocalPublicKey(pem)` — stores a PEM public key in-module as fallback when `CONTROLWEAVE_LICENSE_PUBKEY` env var is not set. Used to verify self-generated keys.
- Migration `097_server_license_pubkey.sql`: adds `local_public_key TEXT` column to `server_license` — stores the public key from `generate-community` so self-signed keys survive server restarts without env var changes.
- New endpoint `POST /api/v1/license/generate-community` (platform owner only): generates, activates, and persists a community license key in one step.

> 💡 **Getting started:** Click the bell icon in the top-right corner to view and manage notifications.
#### 🔌 Community License Key Support & Self-Hosted License API (v2.3.2)

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

The **REST API** follows OpenAPI 3.1 and is fully documented at `/docs/openapi.yaml`. Every endpoint requires a JWT bearer token and respects your organization's tier limits.

- `licenseService.js`: Added `'community'` to `VALID_TIERS` — community-tier JWTs are now accepted by `validateLicenseKey()`.
- `edition.js`: Added `community: 'community'` to `LICENSE_TIER_TO_EDITION` — startup validation (`validateEdition()`) now correctly maps a community license to the community edition.
- New route `backend/src/routes/license.js` (`@tier: community`): provides `GET /api/v1/license` (current edition + persistence status) and `POST /api/v1/license/activate` (runtime license key activation with audit log).
> 🗂️ **Audit trail** entries are immutable and include the acting user, timestamp, affected resource, and change delta.

- Migration `096_server_license.sql`: new `server_license` table stores the activated key so it survives restarts.
- `server.js`: new `ensureLicenseFromDb()` startup function loads the DB-persisted license key and restores the edition automatically on restart.
- Frontend: `licenseAPI.getInfo()` and `licenseAPI.activate(key)` added to `src/lib/api.ts`.

> 💡 **Getting started:** See `docs/openapi.yaml` or run the local dev server and visit `http://localhost:3001/api-docs`.

## [2.3.0] — 2026-03-18

> **Released:** 2026-03-18

### Changed
- Fix Security Checks and Build & Release workflow failures ([#77](https://github.com/sherifconteh-collab/ai-grc-platform/pull/77)) — @Copilot
- Harden desktop startup and align Electron packaging with Next.js build output ([#74](https://github.com/sherifconteh-collab/ai-grc-platform/pull/74)) — @Copilot
- Merge PR #70 (desktop startup hardening) and address review feedback ([#73](https://github.com/sherifconteh-collab/ai-grc-platform/pull/73)) — @Copilot
- Sync shared files with the latest public ControlWeave commit ([#71](https://github.com/sherifconteh-collab/ai-grc-platform/pull/71)) — @Copilot
- Point all paid-tier links to controlweave.com; clarify repo is community/self-hosted only ([#55](https://github.com/sherifconteh-collab/ai-grc-platform/pull/55)) — @Copilot

## [2.2.0] — 2026-03-15

> **Released:** 2026-03-15

### Changed
- Fix README inaccuracies and regenerate electron lock file to fix desktop app build ([#53](https://github.com/sherifconteh-collab/ai-grc-platform/pull/53)) — @Copilot
- Add missing frontend components to fix desktop app build ([#52](https://github.com/sherifconteh-collab/ai-grc-platform/pull/52)) — @Copilot
- ci: auto-release desktop installers on PR merge to main ([#51](https://github.com/sherifconteh-collab/ai-grc-platform/pull/51)) — @Copilot
- Fix RELEASE_NOTES.md versioning/tiers, implement BYOK AI infrastructure, remove platform admin LLM page ([#49](https://github.com/sherifconteh-collab/ai-grc-platform/pull/49)) — @Copilot

### Fixed
- Regenerated `electron/package-lock.json` to include `electron-updater` and transitive dependencies — fixes all desktop build failures
- README: corrected framework/control count, removed false AI rate limit claim, fixed MCP code example, fixed tier names, added Desktop deployment option
- SDK README: corrected tier name from "utilities" to "govcloud"

## [2.1.0] — 2026-03-14

> **Released:** 2026-03-14

### Added

#### 🔵 RMF Lifecycle (NIST SP 800-37 Rev 2)

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

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

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

ControlWeave ships with a **built-in AI layer** that any user can activate with their own API key (BYOK). Self-hosted deployments have **unlimited AI requests** across gap analysis, policy generation, crosswalk optimization, compliance forecasting, and remediation playbooks.

- AI Copilot — org-aware conversational assistant with 25+ analysis features (gap analysis, compliance forecast, etc.)
> 🎯 **Gap analysis** compares your current implementation status against a target framework baseline and lists missing controls.

- Per-framework LLM guardrails for BYOK configurations
- AI Governance module — governance dashboard for AI risk management


> 💡 **Getting started:** Go to *Settings* → *LLM Configuration* → enter your API key for Anthropic, OpenAI, Gemini, Grok, Groq, or Ollama.
#### 📋 Compliance Frameworks

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

ControlWeave supports **25+ compliance frameworks** out of the box. Community-tier organizations can activate up to 2 frameworks simultaneously and benefit from automatic crosswalk mappings between them.

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

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

Security fixes are applied across all tiers. The following improvements shipped in this release to harden the platform against identified vulnerabilities.

- PII data labeling and classification for evidence uploads
> 📎 **Evidence** can be uploaded as files (PDF, DOCX, XLSX, images) or linked as external URLs and is versioned automatically.

- Zero Trust Architecture implementation guide (NIST SP 800-207)


> 💡 **Action required:** Update to this version to benefit from all security patches.
#### 🚀 CI/CD & Release Management

> ✅ **Tier availability:** Community · Pro · Enterprise · Gov Cloud

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
- Fix broken pricing links, update license to AGPL-3.0, fix README badges ([#47](https://github.com/sherifconteh-collab/ai-grc-platform/pull/47)) — @Copilot
- feat: bundle PostgreSQL + auto-migrate in Electron desktop installer ([#43](https://github.com/sherifconteh-collab/ai-grc-platform/pull/43)) — @Copilot
- feat: package app as downloadable desktop installer (Electron) ([#41](https://github.com/sherifconteh-collab/ai-grc-platform/pull/41)) — @Copilot
- CI: auto-update docs on merge, NIST 800-160 security gates, SBOM/AIBOM generation ([#39](https://github.com/sherifconteh-collab/ai-grc-platform/pull/39)) — @Copilot
- RMF step tracking is now observational only (not a deployment gate), consistent with NIST SP 800-37 philosophy
- Auth `/me` endpoint now returns `framework_codes` array for client-side feature gating
- Trial period updated from 7 to 14 days across all references
- Branding updated to "From Policy to Proof"
- Enterprise tier framework limit bumped to 20
- Dashboard sidebar reorganized with framework-gated entries (RMF Lifecycle, Auditor Workspace)
- Pricing tiers restructured: Community / Pro / Enterprise / Gov Cloud
- `console.error` replaced with structured logger across all backend routes

### Fixed
- Production build failure — `useSearchParams()` missing Suspense boundary in `register/page.tsx`
- Demo login credentials — passwords updated to comply with 12-char minimum policy
- Authentication middleware — resilient to missing `feature_overrides` column, non-fatal trial check failures
- Deployment configuration — correct builders, `startCommand`, PORT configuration, standalone runtime compatibility
- Docker frontend build — bake correct `NEXT_PUBLIC_API_URL` via `.env.production`
- Pagination offset bug returning duplicate records on page 2+
- Pro tier incorrectly showing unlimited frameworks
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

## [2.0.0] — 2026-02-18

> **Released:** 2026-02-18


### Added
- NERC CIP framework module: initial control library with 47 requirements mapped to NIST 800-53 Rev. 5
- Feature gating system: tiered access control tied to pricing plan (Community / Pro / Enterprise / Gov Cloud)
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

## [1.1.1] — 2026-02-05

> **Released:** 2026-02-05


### Fixed
- Database migration script: resolved foreign key constraint error on `framework_controls` table
- API route `/api/v1/controls`: corrected pagination offset bug returning duplicate records on page 2+



---

## [1.1.0] — 2026-01-22

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
- Legacy CSV import format (v1): will be removed in v2.0.0

### Security
- Implemented field-level encryption for PII in `user_profiles` table
- Rate limiting added to all public API endpoints: 100 req/min per IP



---

## [1.0.0] — 2026-01-05

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

<!-- Generated by generate-public-release-notes.js on 2026-03-14T19:45:21.798Z -->
