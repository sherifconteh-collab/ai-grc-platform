# Framework Catalog Completion Plan (Waves 1–4)

This is the completion roadmap referenced by migration
`backend/migrations/123_framework_coverage_status.sql` and by PR
[#209](https://github.com/sherifconteh-collab/ai-grc-platform/pull/209)
(companion:
[ControlWeaver-Pro #544](https://github.com/sherifconteh-collab/ControlWeaver-Pro/pull/544)),
which deliberately scoped the work below **out** of that PR and deferred it
here. Each wave is a separate content-authoring or import-tooling effort and
ships as its own PR (one per wave, per repo).

Two efforts are tracked:

1. **Per-framework catalog completion** — grow each `core_controls` catalog to
   its full official control set (Waves 1–4).
2. **`seed-frameworks.js` per-framework-module refactor** — a prerequisite
   structural change (Wave 0) so the catalog growth doesn't land in a single
   1,400-line array literal.

## How coverage is labeled today

Migration 123 added `frameworks.coverage_status` with three values:

| Value | Meaning |
|---|---|
| `comprehensive` | Verified complete against the official/self-defined catalog |
| `core_controls` | A real, curated subset of the official catalog — the default, and the bucket this plan empties |
| `representative` | Guidance/examination frameworks with no single canonical enumerated control list — intentionally illustrative, **not** targeted for "completion" |

A wave is done for a framework when its seeded control count matches the
official catalog manifest and its `coverage_status` flips to `comprehensive`
via migration.

## Current-state inventory

Counts are what `npm run seed:frameworks` produces once PR #209 lands (the
seed script plus `seed-missing-controls.js`, which it now invokes). Targets
are the official catalog sizes; verify exact figures against the primary
source at implementation time.

### Frameworks this plan completes

| Framework (`code`) | Seeded today | Official target | Wave |
|---|---:|---|---|
| NIST SP 800-53 Rev 5 (`nist_800_53`) | 153 | ~322 base controls, 20 families (withdrawn excluded) | 1 |
| NIST CSF 2.0 (`nist_csf_2.0`) | 76 | 106 subcategories | 1 |
| NIST SP 800-171 Rev 3 (`nist_800_171`) | 24 | 97 requirements | 1 |
| CMMC 2.0 (`cmmc_2.0`) | 50 | L1: 15 / L2: 110 practices (derived from 800-171) | 1 |
| FedRAMP High (`fedramp_high`) | 25 | ~410 controls (Rev 5 baseline, derived from 800-53) | 1 |
| FedRAMP Moderate | *(absent)* | ~323 controls (derived from 800-53) | 1 |
| ISO/IEC 27001:2022 (`iso_27001`) | 82 | 93 Annex A controls | 2 |
| ISO/IEC 27002:2022 (`iso_27002`) | 15 | 93 controls | 2 |
| ISO/IEC 27017:2015 (`iso_27017`) | 12 | 37 cloud-specific controls + extensions | 2 |
| ISO/IEC 27018:2019 (`iso_27018`) | 11 | ~25 PII-cloud extensions | 2 |
| ISO/IEC 27701:2019 (`iso_27701`) | 14 | 49 PIMS controls (Annex A + B) | 2 |
| ISO/IEC 42001:2023 (`iso_42001`) | 16 | 38 Annex A controls | 2 |
| SOC 2 TSC (`soc2`) | 27 | 61 criteria (33 CC + A/PI/C/P) | 2 |
| PCI DSS v4.0 | *(absent)* | 12 requirements, ~270 testable sub-requirements | 3 |
| CIS Controls v8 (`cis_controls_v8`) | 18 | 18 controls → 153 safeguards (IG1/2/3 tagged) | 3 |
| DISA STIGs + CCI | *(absent)* | importer-driven, per-benchmark | 4 |

### Frameworks already `comprehensive` (no work)

`state_ai_governance` (47), `international_ai_governance` (49),
`owasp_llm_top10`, `owasp_agentic_top10` (seeded via migrations 032/050).

### Frameworks staying `representative` (no completion target)

`nist_privacy`, `fiscam`, `ffiec`, `nerc_cip`, `finra_supervisory_ai`,
`sec_markets_ai_risk`, `sr_11_7`, `hitech`, `ccpa_cpra`, `nist_800_207`,
`iso_27005`, `iso_31000`, `iso_42005`, `aiuc_1`. These are examination
handbooks or guidance documents with no canonical enumerated control list.

### Remaining `core_controls` backlog (out of the four waves)

`gdpr` (17; article-level catalog ≈ 99 articles), `hipaa` (17; ~54
standards/implementation specifications), `eu_ai_act` (15; obligations across
113 articles), `nist_ai_rmf` (18; 72 subcategories). Not part of the PR #209
follow-up scope; schedule after Wave 4 or on demand.

## Wave 0 — `seed-frameworks.js` per-framework-module refactor

**Why first:** `backend/scripts/seed-frameworks.js` is a single ~1,400-line
array literal. Waves 1–3 multiply its size several-fold; landing them into the
monolith makes review and merge conflicts unmanageable.

**Shape:**

- One data module per framework: `backend/scripts/lib/frameworks/<code>.js`,
  exporting `{ framework, controls, expectedCount }`. Pure data, no DB code.
  (The existing `scripts/lib/aiuc1-data.js` already follows this pattern —
  generalize it.)
- `seed-frameworks.js` becomes a thin orchestrator: loads every module from
  the directory, runs the existing idempotent upsert loop, then asserts each
  framework's seeded row count matches `expectedCount` and fails loudly on
  mismatch.
- Fold `seed-missing-controls.js` content into the per-framework modules so
  there is one source of truth per framework (keep the script as a shim that
  re-runs the orchestrator, since PR #209 wires it into startup auto-heal).
- Behavior-preserving: `npm run seed:frameworks` output (framework codes,
  control counts, idempotency on re-run) is identical before/after.

**Acceptance:** `npm run check:syntax` and `npx jest` green; a regression test
asserts the module directory's aggregate counts equal the pre-refactor totals.

## Wave 1 — NIST 800-53 Rev 5 completion + baseline derivation

The largest single gap, and three frameworks fall out of it nearly for free.

1. **800-53 base controls to ~322.** Do not hand-type: generate
   `lib/frameworks/nist_800_53.js` from NIST's official OSCAL/CPRT JSON
   catalog (public domain). A small `scripts/import-oscal-80053.js` converter
   maps OSCAL `id/title/statement` → `{ control_id, title, description,
   priority, control_type }`. Withdrawn controls excluded; control
   enhancements deferred (base controls only, matching the PR #209 target).
2. **FedRAMP Low/Moderate/High as derived baselines.** FedRAMP publishes
   OSCAL baseline profiles that select 800-53 control IDs. Represent each
   baseline as a framework whose controls are generated by filtering the
   800-53 module through the baseline's ID list — never a hand-authored
   parallel catalog. Replaces today's hand-picked 25-control `fedramp_high`
   and adds `fedramp_moderate`/`fedramp_low`.
3. **800-171 Rev 3 to 97 requirements; CMMC 2.0 stays pinned to Rev 2 as its
   derivation source.** 800-171 r3 is also published as OSCAL and becomes the
   `comprehensive` `nist_800_171` framework in this wave. CMMC 2.0 L2's 110
   practices, however, map 1:1 to 800-171 **Rev 2**'s 110 requirements (the
   official CMMC 2.0 Level 2 Assessment Guide is written against Rev 2, and
   Rev 3 consolidated down to 97 requirements — there is no 110-item subset of
   Rev 3 to derive L2 from). So `cmmc_2.0` is generated from a pinned Rev 2
   800-171 OSCAL catalog kept alongside the Rev 3 module specifically for this
   derivation, not from the `nist_800_171` framework seeded above. L1 (15)
   derives the same way, also from Rev 2. Re-derive CMMC 2.0 from Rev 3 only
   if/when DoD publishes an updated mapping.
4. **CSF 2.0 top-up to 106 subcategories** (30 missing) — small, hand-authored
   from the public CSF 2.0 core, rides along in this wave.

**Acceptance:** counts match the manifest; migration flips `coverage_status`
to `comprehensive` for `nist_800_53`, `nist_csf_2.0`, `nist_800_171`,
`cmmc_2.0`, and the FedRAMP baselines; existing crosswalks
(`050_seed_default_control_mappings.sql` and ISO crosswalk seeds) still
resolve; re-run idempotency verified.

## Wave 2 — ISO family + SOC 2

**Licensing constraint (hard):** ISO standards are copyrighted. Seed control
**identifiers and titles plus original paraphrased descriptions only** — never
verbatim standard text. This is the existing convention (see
`docs/FRAMEWORK_COVERAGE.md` license note); keep it explicit in every ISO
module header.

- `iso_27001` 82 → 93 Annex A controls (11 missing).
- `iso_27002` 15 → 93 (same control set as 27001 Annex A, guidance-level
  descriptions; consider generating from the 27001 module with adjusted
  descriptions to avoid double authoring).
- `iso_27017` → full cloud control set (30 base + 7 cloud-only extensions).
- `iso_27018` → full PII-protection extension set.
- `iso_27701` → 49 PIMS controls (Annex A controller + Annex B processor).
- `iso_42001` 16 → 38 Annex A AI-management controls.
- `soc2` 27 → 61 TSC criteria (complete CC series + Availability, Processing
  Integrity, Confidentiality, Privacy). AICPA TSC is published openly;
  paraphrase points of focus.

**Acceptance:** counts match; `coverage_status` → `comprehensive` for the six
ISO codes + `soc2`; `seed-iso27001-2022-crosswalks.js` re-run against the full
catalog resolves every mapped ID.

## Wave 3 — PCI DSS v4.0 + CIS Controls v8

- **PCI DSS v4.0 (new framework here).** Seed the 12 requirements expanded to
  testable sub-requirement level (~270 items, e.g. `1.2.5`, `8.3.6`). PCI SSC
  publishes the standard freely; paraphrase requirement text, keep official
  numbering. The sibling repo already carries a 61-control starter
  (`pci_dss_v4`) to converge with.
- **CIS Controls v8** 18 → 153 safeguards, each tagged with its Implementation
  Group (IG1/IG2/IG3) in the description or a metadata field. CIS licenses the
  controls for use with attribution; include the attribution line in the
  module header.

**Acceptance:** counts match; both flip to `comprehensive`; the priority
mapping (`1`/`2`/`3`) follows IG tiers for CIS.

## Wave 4 — DISA STIG + CCI import

STIG catalogs are too large and too frequently revised to hand-author.
Build an importer instead:

- `scripts/import-stig.js`: parses a DISA XCCDF benchmark XML → creates a
  framework (`disa_stig_<benchmark>`) with one control per rule (V-key /
  SV-key, severity → priority).
- CCI list import: DISA's CCI XML maps rules → NIST 800-53 controls; emit
  `control_mappings` rows so every imported STIG crosswalks to the (now
  complete, Wave 1) 800-53 catalog automatically.
- Ship at least one imported benchmark (recommend: PostgreSQL or a web-server
  STIG) as the proof, with the importer documented for users to run against
  any benchmark they need. Imported STIG frameworks register as
  `comprehensive` (complete relative to their benchmark version).
- The sibling ControlWeaver-Pro repo has five hand-authored
  `seed-disa-stig-*.js` scripts; port the importer there and converge those
  seeds onto importer output.

**Acceptance:** importer round-trips a current DISA benchmark; CCI-derived
mappings land in `control_mappings`; re-import of the same benchmark version
is idempotent.

## Conventions for every wave

- Data modules are pure data; the orchestrator owns all DB access
  (parameterized queries only).
- Migrations: next free sequential number at implementation time, idempotent
  (`IF NOT EXISTS` guards), header comment naming the wave and release.
- `docs/FRAMEWORK_COVERAGE.md` inventory table and this document's
  current-state table are updated in the same PR as each wave.
- Version bump per repo release rules (MINOR — additive catalog content).
- Keep parity: every wave lands in both `ai-grc-platform` and
  `ControlWeaver-Pro` (near-identical seed infrastructure), ideally as
  companion PRs like #209/#544.
