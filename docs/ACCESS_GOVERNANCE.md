# Access Governance

Test, review, and certify who can do what in ControlWeave. The Access Governance
module provides entitlement reporting, separation-of-duties (SoD) analysis,
periodic access review campaigns, and a role capability simulator — the
controls auditors expect for NIST 800-53 AC-2 / AC-5 / AC-6, SOC 2 CC6.x, and
ISO 27001 A.9.

## Accessing the Module

Navigate to **Access Governance** in the left sidebar (under Organization).

Required permissions:

- `access_governance.read` — view entitlements, SoD rules and violations,
  campaigns, and run simulations. Granted to the **admin** and **auditor**
  system roles by default.
- `access_governance.manage` — manage SoD rules and run campaigns.
  Granted to **admin** only by default.

## Entitlements

The Entitlements tab shows a who-has-what report across every user in your
organization: primary role, assigned roles, and effective permissions. Two
over-privilege flags are raised automatically:

- **over-privileged** — the account holds the wildcard (`*`) permission
  (all admins by design; review whether each needs full access)
- **inactive, roles retained** — a deactivated account that still has role
  assignments (dormant-access risk)

The user table pages at 50 rows (`?page=`/`?limit=`, max 100). The four summary
counts above it are deliberately org-wide rather than per-page, so they still
describe your whole posture while you page through the list.

## Separation of Duties

SoD rules define permission combinations that are toxic when held by a single
account. ControlWeave ships five system rules. Administrators can add
organization-specific rules and enable or disable any rule; system rules cannot
be edited or deleted, only toggled.

Three ship **enabled** — they describe administrative combinations no ordinary
account holds, so they fire only on genuinely over-broad grants:

| Rule | Severity |
|---|---|
| `roles.manage` + `audit.write` | critical |
| `users.manage` + `roles.manage` | high |
| `settings.manage` + `audit.write` | high |

Two ship **disabled**, deliberately:

| Rule | Severity |
|---|---|
| `controls.write` + `assessments.write` | medium |
| `evidence.write` + `assessments.write` | medium |

Both describe a real AC-5 self-review conflict, but the platform's built-in
`user` role already grants `controls.write`, `evidence.write` and
`assessments.write` together. Enabled out of the box they would flag every
standard user in the organization — about two violations per person — which
buries the findings that matter. Narrow your roles first, then enable them on
the SoD tab.

The violations panel evaluates every active rule against every user's
effective permissions. Wildcard accounts are excluded from per-rule matching —
they trivially violate everything — and are listed separately instead.

> **Note**: These rules complement, not replace, ControlWeave's built-in
> workflow separation of duties (a workpaper preparer cannot review their own
> workpaper, a policy creator cannot approve their own policy, and so on).

## Access Review Campaigns

Campaigns implement periodic user access certification:

1. **Create** a campaign — every active user's roles, permissions, and current
   SoD violations are snapshotted into review items at that moment.
2. **Activate** it to open the review.
3. **Certify** or **Revoke** each user's access. A reviewer cannot decide their
   own item.
4. **Complete** the campaign once every item is decided. Completion generates
   an evidence record tagged `access-review` / `ac-2`, so the review itself
   becomes reusable audit evidence.

### Scope of the self-review restriction

Be precise about this one when describing the control to an assessor. Deciding
a review item requires `access_governance.manage`, which ships granted only to
`admin` — and admins hold the `*` wildcard, which the shared SoD helper treats
as an authorized override. So in a default configuration the self-review block
never actually fires: an admin **can** certify their own item, and the decision
is recorded with `selfReviewOverride: true` in the audit log.

The restriction becomes enforcing once `access_governance.manage` is granted to
a custom role that does not carry `*`. If an independent-reviewer requirement
matters for your AC-5 story, create such a role and assign reviewers to it
rather than relying on the default admin grant.

So that the generated evidence cannot be read as claiming more independence
than the review actually had, campaign completion counts the items whose
reviewer was also their subject and states it in the evidence description
(for example, "1 of these item(s) were decided by the subject themselves under
an administrator override, so 4 were independently reviewed"). The same count
is available as `decision_counts.self_reviewed`, and each entry in the
generated JSON summary carries a `self_reviewed` boolean.

Revoke decisions are recorded for the certification record; actually removing
roles is a separate step in **Settings → Users & Permissions** so the change
passes the standard role-assignment safeguards.

## Simulator

The Simulator answers "what could this role actually do?" before you assign
it. Pick roles and/or type permission names, and ControlWeave returns:

- an ALLOWED / DENIED verdict for every permission in the catalog
  (positive and negative access testing)
- any SoD rules the proposed combination would violate

Use it to validate custom roles built in **Settings → Roles** before granting
them to anyone.

## Import & AI Analysis

If your organization already maintains its own RBAC documentation — a role
definition spreadsheet, a separation-of-duties matrix, a roles &
responsibilities document — you don't have to re-enter it by hand. Upload it
in the Import & AI tab and let AI do the first pass:

1. **Upload** a PDF, DOCX, TXT, MD, or CSV file (up to 10 MB), tagging it
   as a roles matrix, SoD matrix, roles & responsibilities document, or other.
   Only the extracted text is stored; the original file is processed in memory
   and discarded.
2. **Analyze with AI** — the model reads the document alongside your live
   permission catalog, existing roles, and active SoD rules, and returns:
   - the roles the document defines, with their duties mapped onto real
     platform permissions
   - separation-of-duties conflicts the document reveals, including cases
     where the document's own SoD matrix is being violated by a stated
     assignment
   - suggested platform roles and SoD rules to formalize what the document
     already describes
   - governance gaps and risks worth follow-up
3. **Save analysis** to keep the result attached to the document for later
   reference.
4. **Create role** / **Create SoD rule** — each suggestion has its own button.
   Clicking one makes an explicit create call through the same guarded APIs
   used elsewhere in this module (`POST /roles`, `POST .../sod/rules`); nothing
   is ever applied automatically, and each button disables itself once used so
   you can see what you've already accepted.

Uploading and analyzing documents requires `access_governance.manage`;
`access_governance.read` holders (including auditors) can view previously
uploaded documents and saved analyses but cannot upload, analyze, or apply
suggestions. As with all AI features in ControlWeaver, this uses your
organization's configured LLM provider (BYOK) — no AI provider key means no
analysis, not an error about the document itself.

## Audit Trail

All Access Governance mutations — rule changes, campaign lifecycle events,
document uploads and analysis, and every certify/revoke decision — are written
to the audit log (AU-2) and are visible in **Settings → Audit**.
