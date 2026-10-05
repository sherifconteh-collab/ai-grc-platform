# Policies

The **Policies** page (sidebar: Compliance → Policies) is where you write, approve, publish and maintain your organization's security and compliance policies, and prove that employees have read them.

## Who can use it

- Viewing policies and acknowledging published policies requires `controls.read`.
- Creating, editing, approving, publishing and recording reviews requires `controls.write`.
- The author of a policy cannot approve it. Administrators can override this; the override is recorded in the audit log (`policy_updated` with `sod_override: true`).

## Creating a policy

- **New policy**: start an empty draft with a name, type, purpose and scope, effective date, and review frequency (365 days by default). Then add sections, written in Markdown.
- **Generate from frameworks**: builds a draft with one section per control family (for example "AC - Access Control"). Each section is mapped to the matching controls in the frameworks you select. It uses templates, not AI, so it works without an AI provider key. Edit the wording before you submit it.

## Lifecycle

```
draft → under review → approved → published → archived
```

| Step | What happens |
|---|---|
| Submit for review | Moves the draft to review. |
| Approve | Records the approver and date. It must be someone other than the author. |
| Publish | The policy takes effect; employees are notified and can acknowledge it. |
| Archive | Retires the policy. |
| Restore as draft | Starts the next version (1.0 → 1.1). Acknowledgments are tracked per version, so everyone acknowledges again after the next publication. |

Published and archived policies are read-only, so the text an employee acknowledged cannot change underneath them. To change a published policy, archive it and restore it as a draft.

## Sections and control mapping

Expand a section to read it and see the controls it is mapped to, with each control's current implementation status. Saving a section with an existing number replaces its text and keeps its control mappings.

## Reviews

**Record review** logs an annual, triggered, change-driven or ad hoc review, with notes, and says whether the review changed the policy. Recording a review moves the next review date forward. Tick **Notify employees to re-acknowledge** to raise an acknowledgment alert and notify users. Overdue reviews are shown in red on the list and in the "Review overdue" count.

## Acknowledgments (attestation)

When a policy is published, every user sees **I have read and agree to this policy**. The acknowledgments panel shows how many active users have acknowledged the current version. **Show who has acknowledged** lists everyone, with dates. **Export CSV** gives you attestation evidence for auditors, for example for SOC 2 CC1.4 / CC2.2, HIPAA §164.308(a)(5), and NIST 800-53 PL-4.

## Uploaded documents and gap analysis

Upload an existing policy document (PDF, DOC, DOCX or TXT, up to 10 MB). Then run **Gap analysis** against one or more frameworks to see the percentage of controls the document covers, and a list of uncovered controls ordered by severity, with recommended actions.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/policies` | List (filter `status`, `policy_type`) |
| POST | `/api/v1/policies` | Create a draft |
| POST | `/api/v1/policies/generate` | Generate a draft from frameworks |
| GET | `/api/v1/policies/:id` | Policy, sections, recent reviews, attestation summary |
| PATCH | `/api/v1/policies/:id` | Update fields or status |
| POST | `/api/v1/policies/:id/sections` | Add or replace a section (409 when published or archived) |
| POST | `/api/v1/policies/:id/reviews` | Record a review |
| POST | `/api/v1/policies/:id/acknowledge` | Acknowledge the current version |
| GET | `/api/v1/policies/:id/acknowledgments` | Attestation status per active user |
| POST | `/api/v1/policies/upload` | Upload a policy document |
| POST | `/api/v1/policies/uploads/:id/analyze` | Run gap analysis |
| GET | `/api/v1/policies/uploads/:id/gaps` | Gap analysis results |
