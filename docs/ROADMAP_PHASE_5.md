# ControlWeave Roadmap — Phase 5: Scale, Ecosystem & Standards Depth

> **Naming note**: this repo's own `PHASE_2_ROADMAP.md` uses a different,
> earlier numbering scheme (Phase 1 & 2 shipped as of v4.0.0, Phase 3
> "Upcoming"). This document is **not** that series — it's the
> ai-grc-platform counterpart to `ControlWeaver-Pro`'s
> `docs/ROADMAP_PHASE_5.md`, continuing the informal "Phase 4: Automated
> Intelligence & Platform Maturity" workstream tracked across both repos'
> recent PR/session history (auditor external portal, connector-to-control
> AI auto-assessment, and — once ported here — the GitHub evidence
> connector). Kept under the same `ROADMAP_PHASE_5.md` name as the CW-Pro
> doc for cross-repo consistency, even though it doesn't line up with this
> repo's own Phase 1-3 numbering.

## Where Phase 4 actually stands (this repo)

| Item | Status |
|---|---|
| Connector-to-control AI auto-assessment | ✅ Ported (PR #222) |
| Scheduled report email delivery | ✅ Ported (PR #221) |
| GitHub evidence connector | ⬜ Not yet ported — `autoEvidenceCollection.js` already lists `github` in `ALLOWED_SOURCE_TYPES` as a config-only stub (byte-identical to the bug ControlWeaver-Pro just fixed), but has no real `githubService.js`/`routes/github.js` yet |
| AI evidence scoring | ⬜ Not started |
| Policy-to-control RAG mapping enhancement | ⬜ Not started |
| Jira bidirectional POA&M sync | ⬜ Not started |
| Public REST API with HMAC-SHA-384 signed keys | ⬜ Not started |
| Helm chart / Kubernetes deployment | ⬜ Not started |

The GitHub connector port (once complete, mirroring ControlWeaver-Pro
#624) should also carry over the same fixes discovered along the way
there: the `evidence_collection_rules.source_type` CHECK constraint here
likely has the identical `('splunk', 'connector')`-only gap (verify
against this repo's migration history before assuming), the Auto-Evidence
rule creation form may have the same "always submits `source_config: {}`"
bug, and any Splunk/GitHub token storage should go through this repo's
`utils/encrypt.js` equivalent rather than storing plaintext with
`is_encrypted: true` set incorrectly — check `services/splunkService.js`
here for the same anti-pattern found and fixed in ControlWeaver-Pro before
assuming it's already correct.

## Phase 5 scope

### 5.1 Multi-cloud evidence connectors

Once the GitHub connector is ported, extend the same pattern to Azure and
GCP — `README.md` already lists "Azure Security Center, GCP SCC, GitHub
Advanced Security connectors" under its own forward-looking section, so
this isn't new scope, just execution. Wrap `JSON.parse()` on external API
responses in try-catch with a raw-body snippet surfaced in the error
(same hardening applied to ControlWeaver-Pro's GitHub connector this
cycle), and validate the repository/org identifier format before building
request URLs.

### 5.2 AI evidence scoring (carried from Phase 4)

Same scope as the ControlWeaver-Pro item — score AI-suggested evidence
for relevance/confidence before it reaches human review. Check whether
this repo's AI quality-gate equivalent (if present) already has a scoring
mechanism to reuse before building a second one.

### 5.3 Policy-to-control RAG mapping enhancement (carried from Phase 4)

Extend RAG-indexed policy documents to propose control-linkage candidates
automatically, gated behind human approval — consistent with this
platform's existing pending-evidence approval pattern.

### 5.4 Jira bidirectional POA&M sync (carried from Phase 4)

Push POA&M items to Jira and pull status/close-date changes back. Needs
its own settings surface with write-scoped credentials, distinct from the
read-only Jira Auto-Evidence source type that already exists as a
config-only stub.

### 5.5 Public REST API with HMAC-SHA-384 signed keys (carried from Phase 4)

A machine-to-machine API surface, signed per the CNSA Suite 1.0 floor.
Verify signatures against the raw, unparsed request body (captured before
body-parsing middleware runs) — never `JSON.stringify` a re-parsed object
for signature comparison, since key order/whitespace differences cause
intermittent verification failures.

### 5.6 Helm chart / Kubernetes deployment (carried from Phase 4)

Same scope as ControlWeaver-Pro's item — verify whether this repo's
WebSocket/Socket.io layer has the same single-instance in-memory-adapter
default before assuming a multi-replica Helm deployment would work
out of the box.

### 5.7 Framework catalog completion, Waves 1-4

Tracked in `docs/FRAMEWORK_CATALOG_COMPLETION_PLAN.md` and issues
#217 (Waves 1-4) / #218 (seed-script refactor), cross-linked with
ControlWeaver-Pro's #566/#567. NIST 800-53 and CMMC 2.0 completion work
done on the ControlWeaver-Pro side (PRs #576/#586) should be ported here
too — this repo's `seed-frameworks.js` NIST 800-53 entry is still at the
smaller pre-completion count. Same blockers apply as documented on the
CW-Pro side: FedRAMP OSCAL source returns HTTP 403 (issue #580 there),
CIS Controls v8's official OSCAL catalog is CC BY-NC-ND licensed (no
derivative works), PCI SSC's site is network-policy-blocked. When seeding
crosswalk mappings, verify both source and target control IDs actually
exist in the database before inserting (a mapping to a missing control ID
fails silently), check for logical alignment between mapped controls, and
avoid replacing literal framework-code/name strings with dynamic
references if any CI regression guard depends on grep-matching those
literals.

### 5.8 MCP tool registry — same unfinished-refactor bug as CW-Pro had

**Found while researching this doc, not yet fixed**: `backend/scripts/mcp-tool-registry.js`
defines the full tool set (54 tools, matching ControlWeaver-Pro's count),
but `backend/scripts/mcp-server-secure.js` only hand-codes 21 of them via
individual `server.registerTool(...)` calls — it never requires or loops
over the registry. This is the exact same unfinished refactor that
ControlWeaver-Pro had before it was fixed this cycle (registry replaced/
duplicated the 21 existing tools and added 33 more, but the server was
never updated to consume it dynamically). The fix there (`mcp-server-secure.js`
now loops over `require('./mcp-tool-registry').getTools()`, with `grc_health`
kept special-cased for its `noAuth` bypass) should port directly — same
adapter shape, same schema compatibility. This should be an early Phase 5
item given how mechanical the known fix is.

### 5.9 Stale tier-language cleanup

Same class of issue documented on the ControlWeaver-Pro side — audit any
remaining paid-tier language or dead-code tier conditionals against this
repo's own no-tier-gating policy before assuming everything is already
consistent.

### 5.10 i18n / localization audit

No claims found either way in this repo's own docs; worth the same real
audit (hardcoded strings vs. an actual i18n library) rather than leaving
it unverified.

## Sequencing suggestion

1. Port the GitHub evidence connector (Phase 4 completion) first — 5.1
   (Azure/GCP) depends on the same pattern being established here.
2. 5.8 (MCP registry wiring) — small, mechanical, already solved on the
   sibling repo; do it early rather than let the gap widen further.
3. 5.5 (public API) and 5.6 (Helm/K8s) — infrastructure-shaped, can run in
   parallel with connector work.
4. 5.2/5.3/5.4 (AI scoring, RAG mapping, Jira sync) — after infra items
   land.
5. 5.7 (framework catalog) continues independently, gated on source
   access/licensing per framework, same as the CW-Pro track.
6. 5.9/5.10 as their own small, focused PRs once the above settle.

## Companion repo

See `ControlWeaver-Pro`'s `docs/ROADMAP_PHASE_5.md` for the fuller-scoped
version (this repo is the open-source base; ControlWeaver-Pro carries
additional surfaces like DISA STIG hand-seeds that don't apply here).
