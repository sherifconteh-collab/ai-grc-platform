# Risk Register

**Navigate:** sidebar → **Risk** → **Risk Register** (`/dashboard/risks`)

**Permissions:** `risks.read` to view, `risks.write` to create or change anything.

The register is ControlWeave's ISO 31000 / ISO 27005 / NIST SP 800-30 risk
record. It is not the same thing as the compliance posture percentage on the
dashboard: that is one computed number, this is a list of specific things that
could go wrong, each with an owner, a score, a treatment and a review date.

---

## 1. Identifying a risk

**Risk Register → New Risk.**

| Field | Notes |
|---|---|
| Title | Required. Name the failure mode, not the asset — "Single-region hosting fails during a regional outage", not "AWS". |
| Category | One of fourteen: strategic, operational, financial, compliance, cyber, privacy, third_party, legal, reputational, environmental, health_safety, technology, ai, other. |
| Threat source / Vulnerability | The NIST SP 800-30 pair: who or what acts, and what weakness they act on. Optional but they are what make a risk reviewable by someone who did not write it. |
| Owner | Must be a user in your organization. |
| Department | Optional; drives the departmental rollups. |

## 2. Scoring: inherent and residual

Both assessments are **likelihood × impact**, each on a 1–5 scale, so scores
run 1–25. The product is a **stored generated column** — the database computes
`inherent_score` and `residual_score` from their inputs, so a heat-map query
cannot drift from what was entered.

Values outside 1–5 are **rejected, not clamped**. Silently turning a 9 into a 5
produces a register whose numbers nobody can reconcile against what they typed.

**Record both.** Inherent is the exposure with no controls working; residual is
what is left after they do. Keeping them separate is what lets an assessor see
how much the controls actually achieved. A register that only stores residual
cannot answer "was this treatment worth it".

Severity bands used throughout the UI:

| Score | Band |
|---|---|
| 15–25 | Critical |
| 10–14 | High |
| 5–9 | Medium |
| 1–4 | Low |
| unset | Unscored |

The **5×5 heat map** on the register page plots residual position.

## 3. Treatment

Four ISO 31000 strategies: **avoid**, **mitigate**, **transfer**, **accept**.

Individual treatment actions live under the risk (`risk_treatments`) with their
own owner, due date, status and an optional `target_residual_score` — the score
you expect once the action lands. Recording the target is what makes treatment
effectiveness measurable afterwards rather than asserted.

Treatment statuses: `planned`, `in_progress`, `completed`, `cancelled`,
`overdue`.

## 4. Acceptance

Accepting a risk is a **named decision with a rationale**, not a status flick.
It records who accepted it, when, why, and optionally until when.

A lapsed acceptance is surfaced as lapsed rather than left reading "accepted" —
an expiry that quietly does nothing is worse than no expiry.

## 5. Review

`next_review_date` drives the overdue filter; each review snapshots the
assessment as it stood, so later edits do not rewrite history. Outcomes:
`unchanged`, `reassessed`, `escalated`, `de_escalated`, `closed`.

**Remediation completing does not rescore the risk.** When every linked POA&M
is closed, the risk is flagged **review-due** and a human records the
reassessment. This is deliberate: a score that moves on its own destroys the
evidence of what the controls achieved, which is the whole reason inherent and
residual are stored separately.

---

## 6. What a risk connects to

Six link types. Everything a risk touches is reachable from the risk detail
page (`/dashboard/risks/[id]`).

| Link | Answers | Table |
|---|---|---|
| **Controls** | What treats it | `risk_control_links` (140) |
| **Assets** | What is exposed | `risk_asset_links` (140) |
| **Objectives** | What is threatened | `risk_objective_links` (140) |
| **POA&Ms** | What is being *done* about it | `risk_poam_links` (146) |
| **Vendors** | Which third party it arises from | `risk_vendor_links` (148) |
| **Evidence** | What proves it is under management | `risk_evidence_links` (149) |

### Vendors

A vendor's `risk_tier` is a **static classification set at onboarding** — "this
is a critical supplier". It is not a scored, treated, reviewed risk. Linking a
register entry to a vendor is what makes concentration visible.

The two are allowed to disagree, and the disagreement is the point: a vendor
tiered **low** carrying an open **critical** register entry is flagged on the
vendor's TPRM record, because that is the case the tier alone would hide.

### Evidence

Evidence has been linkable to controls for a long time, so a risk's evidence
was reachable only transitively — via its controls, and only when those
controls happened to carry the document. "Show me you are managing the
vendor-concentration risk" is a different question from "show me these controls
exist", and going through controls cannot answer it.

Each link carries a **relevance**, because the same document supports different
risks for different reasons:

| Relevance | Means |
|---|---|
| `assessment` | How the risk was scored or re-scored |
| `treatment` | What is being done about it |
| `monitoring` | Ongoing proof it stays within appetite |
| `acceptance` | The decision record where it was accepted |

Submitting an unrecognized value returns **400 naming the valid options**, not
a database error.

Evidence attached here shows its **PII classification** and
**`retention_until`** date inline — a risk file is somewhere people export
from, and knowing a document is classified `high` before it goes into a report
matters.

### Where linking happens

Linking is **owned by the risk**. Vendors and evidence are attached from the
risk detail page; the vendor and evidence screens show the relationship
read-only. One screen writes each relationship, so there is no second place to
keep consistent.

> **Known gap:** controls, assets and objectives are currently **read-only** on
> the risk detail page in this repository — they display but cannot be attached
> from the UI. Create those links through the API
> (`POST /api/v1/risks/:id/controls|assets|objectives`) until the write UI
> lands. Vendors and evidence are writable.

---

## 7. Seeing risk from the other side

| From | Shows | Where |
|---|---|---|
| An asset | The risks it is exposed to | Assets → asset panel → **Risk Exposure** |
| A vendor | Its register entries, open count, worst residual | TPRM → vendor → **Register Risks** |
| A document | The risks it supports | Evidence → detail drawer → **Risks** tab |

All three are read-only views of the same links.

---

## 8. API

Everything above is available under `/api/v1/risks`. Selected routes:

```
GET    /risks                       list, filterable by category, status,
                                    department, owner, minResidualScore,
                                    reviewOverdue
GET    /risks/summary               register-level counts
GET    /risks/heat-map              5x5 residual matrix
GET    /risks/:id                   full detail incl. all six link types
POST   /risks/:id/accept            acceptance with rationale
POST   /risks/:id/reviews           review, snapshotting the assessment
POST   /risks/:id/treatments        treatment action
POST   /risks/:id/vendors           link a vendor
POST   /risks/:id/evidence          link evidence (with relevance)
DELETE /risks/:id/evidence/:id      unlink
```

`/summary` and `/heat-map` are declared **before** `/:id` so those words are
not parsed as risk identifiers.

Reverse reads live with the other resource: `GET /evidence/:id/risks`,
`GET /cmdb/assets/:assetId/risks`, `GET /cmdb/risk-exposure`.

---

## 9. Verifying it works

```bash
cd backend && npm run qa:e2e:links
```

35 assertions over a running API: both directions of every link type, the
generated-column arithmetic, relevance validation, idempotent re-linking,
unlink, and cross-organization isolation. Needs `API_BASE_URL` and a token;
set `DEMO_PASSWORD` to include the cross-tenant checks.
