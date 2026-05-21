# Align repo with ControlWeave 4.0 — full parity (de-tier + feature port)

## Context

This repo (`ai-grc-platform`) is **ControlWeave Community Edition v3.5.0** — MIT
`LICENSE` file, tier gating (`community`/`pro`/`enterprise`/`govcloud`), and
"Community Edition" branding. Upstream `sherifconteh-collab/ControlWeave` is
**v4.0.0**: fully open source under a **dual license (AGPL-3.0 + commercial)**,
all paid features free, all tier enforcement made **no-ops**.

User decisions:
1. **Version + branding** → 4.0.0, drop "Community Edition" framing.
2. **De-tier** → unlock all features by no-op'ing the gates (keep structure).
3. **Relicense** → replace MIT `LICENSE` with upstream's dual-license text.
4. **Neuter billing** like upstream (410 + redirects + open-source banner).
5. **Full feature parity** — finish stubbed features and build absent ones,
   **porting real implementations from upstream** (source commit
   `ControlWeave@c26c1c5`, itself a mirror of `ControlWeaver-Pro@306d1df`).

## BLOCKER (must resolve before feature port)

The source commit `c26c1c5` is a **1,004-file / ~269,551-line bulk import** — it
cannot be retrieved via WebFetch (WebFetch returns AI summaries, not verbatim
code). The agent's GitHub tools are **scoped to `ai-grc-platform` only**; reading
`ControlWeave`/`ControlWeaver-Pro` is denied.

To port faithfully, read access to the source repo is required. Resolution:
- **(Chosen)** Reconfigure the environment's allowed repositories to include
  `sherifconteh-collab/ControlWeave` (or `ControlWeaver-Pro`) and start a **fresh
  session** (a session's scope is locked at creation). Then read only the ~20
  relevant files and port them.
- Alternative: paste the specific feature files (~20, not 270k lines) into chat.

The de-tier / branding / version / license / billing / migration work below does
**not** need upstream source and can proceed independently — but the user chose
"do it all together," so execution waits until the source is reachable.

## Feature parity inventory (audited)

**Already real — unlock only (no code):** RMF, PLOT4AI, Threat Intel, TPRM,
CMDB, Vulnerabilities, Evidence (+ auto-collection, pending), Data Governance,
AI Monitoring, SSO, Contacts (has a bug: `contacts.js` uses undefined `org`
instead of `orgId`), Integrations Hub.

**Partial — real but specific endpoints stubbed (need finishing/port):**
- RAG (`backend/src/routes/rag.js`): semantic search + indexing stubbed.
- SBOM (`sbom.js`): upload/parse stubbed.
- Vendor Security (`vendorSecurity.js`): refresh + monitor stubbed.
- SIEM (`siem.js`): connectivity test stubbed.
- Splunk (`splunk.js`): test + import-evidence stubbed.
- Reports (`reports.js`): PDF/Excel generation stubbed.

**Hollow — UI exists, backend pure stub, NO DB tables (need backend + schema):**
- AI Governance (`aiGovernance.js` is all `_stubs` handlers; frontend
  `dashboard/ai-governance/page.tsx` is a real shell).

**Absent — no route file (need full build: route + schema + maybe UI):**
- Realtime, State AI Laws, International AI Laws, Service Accounts API,
  Public Contact. (Note: `086_state_ai_laws_enhancement.sql` /
  `087_international_ai_laws_enhancement.sql` exist but base tables unconfirmed.)

## Approach

### A. De-tier (no upstream source needed) — no-op the gates
- `backend/src/middleware/edition.js`: `requireProEdition`→always `next()`;
  `blockProFeaturesInCommunity`→always `next()`; `isFeatureAvailable`→`true`;
  `getEditionInfo`→report unlocked (`isPro:true`). Leave license plumbing.
  (No backend tests assert the old 403s — verified.)
- `frontend/src/lib/access.ts`: `hasTierAtLeast`→`true` for any authed user
  (unlocks `Sidebar.tsx` `minTier` items + per-page guards).

### B. Billing teardown (match 4.0)
- `backend/src/routes/billing.js`: subscription/checkout endpoints → `410 Gone`.
- Frontend: billing/pricing pages redirect to `/dashboard`
  (`dashboard/license/page.tsx`); landing pricing in `app/page.tsx` →
  open-source banner; remove "upgrade to Pro" copy
  (`dashboard/frameworks/page.tsx` ~211) and `controlweave.com/#pricing` link
  in `components/AiQuotaModal.tsx`.

### C. Migration `backend/migrations/107_open_source_detier.sql`
Idempotent (per `.claude/rules/migrations.md`), header explaining 4.0.0 ship:
`UPDATE organizations SET tier='enterprise'`; set `billing_status='comped'` if
column exists (guarded). Mirrors upstream's tier-transition migration.

### D. Version → 4.0.0 (per `.claude/rules/releases.md`)
- `version` 4.0.0 in backend/frontend/electron `package.json`; regenerate all
  three lockfiles; fix stale `electron/package-lock.json` (3.3.0). README badge
  `v3.5.0`→`v4.0.0`. `controlweave-sdk` keeps its own `1.0.0`.

### E. RELEASE_NOTES.md
- Title → `# ControlWeave — Release Notes`; replace Community/#pricing preamble
  with the open-source statement; add `## [4.0.0] — 2026-05-21` folding in
  `[Unreleased]` and documenting de-tier, billing 410, dual license, migration
  107, and the ported features.

### F. Branding pass (drop "Community Edition")
README title + tier qualifiers (lines ~3/271/292/636/670/683); frontend
`register/page.tsx`, `app/page.tsx` (~739), `dashboard/license/page.tsx`;
docs `SELF_HOSTED_INSTALL.md`, `CLA.md`, `STAGING_ENVIRONMENT.md`, `CLAUDE.md`
line 9; `.github/workflows/sbom.yml` edition metadata.

### G. LICENSE relicense
Replace `LICENSE` (MIT) with upstream's verbatim dual-license file
(`ControlWeave — Dual License`, Conteh Consulting LLC, AGPL-3.0 + commercial).
`package.json` license fields already `AGPL-3.0` (no change).

### H. Feature port (NEEDS upstream source — see BLOCKER)
Once source is reachable, port from `ControlWeave@c26c1c5` only the relevant
files for each gap above:
- Finish partial stubs: real handlers for RAG search/index, SBOM upload/parse,
  Vendor refresh/monitor, SIEM/Splunk test, Reports PDF/Excel.
- AI Governance: port backend route + add migration for its tables; wire UI.
- Absent features: port Realtime, State/International AI Laws, Service Accounts
  API routes + any missing schema; mount in `server.js` (replace `safeRequire`
  null fallbacks). Fix the `contacts.js` `org`/`orgId` bug while there.
- Each ported route file: keep `// @tier:` header convention, parameterized
  `pool.query`, and conventions in `.claude/rules/`.

## Verification
- Backend: `cd backend && npm run check:syntax && npm run build && npx jest`;
  `npm audit --audit-level=moderate` (exit 0) after lockfile regen.
- Frontend: `cd frontend && npm run typecheck`; `npm audit --audit-level=moderate`.
- Manual backend: `GET /edition` unlocked; formerly-Pro routes no longer 403;
  billing endpoints 410; each ported/finished feature returns real data
  (RAG search, SBOM upload, AI Governance CRUD, State AI Laws list, etc.).
- Manual frontend: gated sidebar items + pages render; billing/pricing redirect.
- Confirm 4.0.0 across package.json + lockfiles, RELEASE_NOTES `[4.0.0]`, and
  `LICENSE` shows dual-license text.

## Handoff
This plan was authored in a session whose tools were scoped to `ai-grc-platform`
only, so the upstream feature port could not run there. It is committed to the
repo so the follow-up session (with `sherifconteh-collab/ControlWeave` in scope)
can execute the full effort — de-tier + port + branding + license — in one pass.

## Git
Branch `claude/controlweave-alignment-92cfC`; descriptive commit(s); push
`-u origin claude/controlweave-alignment-92cfC`. No PR unless requested.
