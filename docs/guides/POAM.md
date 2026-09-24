# POA&M — Plan of Action & Milestones

**Navigate:** sidebar → **Compliance** → **POA&M** (`/dashboard/poam`)

**Permissions:** `controls.read` to view, `controls.write` to modify.

A POA&M is the record of a known gap and the plan to close it. In federal
programs it is the artifact an assessor asks for; the same structure works for
any framework, and the vocabulary adapts (see §5).

---

## 1. What raises one

Six paths, and it is worth knowing which of them are automatic:

| Trigger | Raises | Notes |
|---|---|---|
| A vulnerability | Automatically | `source_type = 'vulnerability'` |
| A control moving to **compliant** while gaps remain | Gate — blocks until justified | See §2 |
| A control test recorded **other_than_satisfied** | Automatically, as a draft | `source_type = 'assessment'` |
| An assessment procedure recorded **other_than_satisfied** | Automatically, as a draft | `source_type = 'assessment'` |
| An audit finding at medium severity or above | Automatically, as a draft | `source_type = 'audit_finding'` |
| A risk | On request, from the risk detail page | `source_type = 'risk'` |

**Auto-raised items are drafts.** Owner, dates and remediation plan are left
**blank** on purpose. The system records that a gap exists; it does not invent
a plan nobody agreed to. Nothing is ever auto-closed, auto-approved or
auto-assigned.

Auto-raise is **idempotent per (control, source)** — recording the same failing
test twice does not produce two POA&Ms.

## 2. The compliance gate

Moving a control to a compliant state when gaps remain requires a written
`poam_justification`. The API returns **400 with `requires_poam_submission:
true`**; the UI surfaces that as a justification prompt and retries.

The gate applies on **all three** paths that can make that transition:
`PUT /controls/:id`, `PATCH /implementations/:id/status`, and
`PATCH /implementations/:id/test-result`. It used to sit only on the first,
which no screen calls — so the rule was real and simply never fired from the
product. It lives in `services/poamGateService.js` now, once.

## 3. The item

| Field | Notes |
|---|---|
| `due_date` | The current commitment. Editable. |
| `scheduled_completion_date` | The **original** commitment. Set once and never overwritten — that is the entire point of the column. **Slippage** is the delta between the two. |
| `resources_required` | What closing it needs. Federal POA&M submissions ask for this. |
| `priority` | `critical` / `high` / `medium` / `low` |
| Milestones | A federal POA&M is a list of discrete milestones with their own target dates, not one overall date. Full CRUD, reorderable. |
| Updates | An append-only progress timeline. |

## 4. Review workflow

`in_progress` or `pending_review` → **Submit for review** → an auditor decides.

- Review comments must be **at least 10 characters**; the API rejects shorter.
- **Separation of duties is enforced**: the submitter cannot review their own
  item — the API returns 403. The UI disables the panel with an explanation
  rather than letting a review be composed that will be refused.
- The reviewer chain comes from the framework type's `review_levels`.

## 5. Framework vocabulary

Not every framework calls this a POA&M. Seven vocabularies ship, and the
terminology follows the organization's activated frameworks:

| Framework | Term |
|---|---|
| NIST 800-53, FedRAMP | POA&M |
| ISO 27001 | Corrective Action Request |
| SOC 2 | Deficiency |
| FISCAM | Corrective Action Plan |
| HIPAA | Corrective Action Plan |
| PCI DSS | Risk Assessment / Vulnerability |
| *fallback* | Corrective Action Item |

This affects **labels only**. URLs, table names and API paths are unchanged, so
existing links and bookmarks keep working.

`GET /poam/framework-types` serves the vocabulary and is scoped to the
frameworks the organization has actually activated, rather than returning all
seven.

## 6. Controls

One POA&M can span **several controls across different frameworks**, through
`poam_control_links`. The original `control_id` is retained as the originating
control.

## 7. Export

```
GET /api/v1/poam/export?format=csv|pdf[&status=&priority=&controlId=]
```

Carries every linked control and its framework, the framework type, status,
priority, owner, source type and provenance, both dates with computed
**slippage in days**, `resources_required`, the remediation plan, milestone
count and next target date, and any linked risks.

Rate-limited to 10/min — it streams an organization's entire remediation
register in one response — and audit-logged as an AU-2 event.

## 8. API

```
GET    /poam                     list
GET    /poam/export              CSV or PDF
GET    /poam/framework-types     the vocabulary for activated frameworks
GET    /poam/:id                 detail, including updates and linked risks
PATCH  /poam/:id                 update fields
POST   /poam/:id/updates         add a progress note
POST   /poam/:id/controls        link a control
POST   /poam/from-risk/:riskId   raise one from a risk
```

`/export` and `/framework-types` are declared **before** `/:id`, or Express
would parse those words as identifiers — which is exactly what used to happen
to `/framework-types`, making the whole vocabulary unreachable.
