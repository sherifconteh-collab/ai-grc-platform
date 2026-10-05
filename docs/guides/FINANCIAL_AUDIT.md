# Financial Audit Readiness

**Where:** Compliance → Programs → Financial Audit Readiness (`/dashboard/financial-audit`)
**Permissions:** `financial_audit.read` to view, `financial_audit.write` to change. Admins, users and auditors have both by default.

This module supports a SOX 404 management assessment or an OMB Circular A-123 Appendix A assessment. You maintain a risk-control matrix (RCM), test key controls with documented sample sizes, raise findings as NFRs with corrective action plans (CAPs), and track readiness by process and financial statement assertion.

## Frameworks

Four financial audit libraries are installed (migration 162). All four are written by ControlWeave: they paraphrase the published frameworks, and their control identifiers are ControlWeave's own, not official numbering.

| Framework | Code | Content |
|---|---|---|
| FISCAM | `fiscam` | The original 12 family controls, three new families (business process application, interface and data management controls), and 42 control activities (`CWF-` prefix) |
| COSO 2013 | `coso_2013` | The five components and seventeen principles. Points of focus are not included. |
| SOX IT general controls | `sox_itgc` | 22 controls across access to programs and data, program change, program development and computer operations |
| OMB A-123 Appendix A readiness | `omb_a123_appa` | 13 readiness activities, from governance and materiality through to the Statement of Assurance |

Enable them like any other framework. RCM entries can link to a control in any framework.

## Risk-control matrix

Each entry records:
- the process (procure to pay, order to cash, record to report, hire to retire, treasury, fixed assets, inventory, budget execution, IT general, entity level)
- the risk statement and the control
- the financial statement assertions it addresses: existence/occurrence, completeness, rights and obligations, valuation/allocation, presentation and disclosure, accuracy, cutoff
- frequency, control type (manual, automated or IT-dependent manual), nature (preventive or detective)
- whether it is a key control or addresses a fraud risk, and its risk of failure

**Import from CSV** with these columns:

```
control_ref,process,sub_process,assessable_unit,risk_ref,risk_statement,control_description,assertions,frequency,control_type,control_nature,key_control,fraud_risk,risk_level,system_name,framework_code,framework_control
```

- Separate assertions with semicolons.
- A row whose `control_ref` already exists updates that entry.
- `framework_code` plus `framework_control` links the entry to a framework control, for example `fiscam,CWF-AC-03`.
- Invalid rows are reported with their line number; valid rows are still imported.

Removing an entry that has tests retires it instead of deleting it, so test history is kept.

## Testing

Choose **Test** on a matrix entry to plan a test.

| Method | Sample size |
|---|---|
| Walkthrough | One instance. Used for tests of design. |
| Frequency table | From the control's frequency and risk of failure (below). Automated controls use one instance per configured scenario, relying on effective IT general controls. |
| Statistical | Attribute sampling from the binomial distribution: the smallest sample whose upper deviation limit stays within the tolerable rate at the chosen confidence. It reproduces the published tables (59 at 95% confidence / 5% tolerable / 0% expected; 93 at 95/5/1; 22 at 90/10/0). A finite population correction applies when a population is given. |
| Judgmental | Set by the tester. |
| Full population | Every item, up to 500. Larger populations need a data-analytics tool outside ControlWeave; record the result as the test's conclusion and attach the workpaper as evidence. |

Frequency table (ControlWeave defaults following common practice; override the size on any test):

| Frequency | Low risk | Moderate | High risk |
|---|---|---|---|
| Annual | 1 | 1 | 1 |
| Quarterly | 2 | 2 | 2 |
| Monthly | 2 | 2 | 3 |
| Weekly | 5 | 10 | 15 |
| Daily | 20 | 30 | 40 |
| Multiple times a day | 25 | 45 | 60 |

**Sample selection and results**
- When you give a population size, items are picked at random from a seed shown on the test. Anyone can re-run the selection and get the same items.
- Record each sample as pass, exception or N/A. An exception needs a description.

**Concluding the test**
- ControlWeave suggests a conclusion. No exceptions means effective. Any exception in a table-sized sample means ineffective. A statistical sample tolerates the deviations it was planned for.
- Choosing a better conclusion than the suggestion requires notes.
- A completed test must be reviewed by someone other than the tester.
- Reopening a test clears its conclusion and review.

## Findings, NFRs and CAPs

From a completed test with exceptions, choose **Raise finding (NFR)**.
- The finding is filed under an engagement.
- It records the NFR number, fiscal year, auditor, and classification: control deficiency, significant deficiency or material weakness.
- Its description lists each exception.
- Severity follows the classification: medium, high or critical.

You can then open a POA&M item as the finding's corrective action plan. The finding moves to *remediating*, and the CAP is tracked like any other POA&M item.

The API also supports updating NFR fields and linking an existing POA&M item:
- `PATCH /api/v1/financial-audit/findings/:id/nfr`
- `POST /api/v1/financial-audit/findings/:id/cap`

## Readiness

The Readiness tab shows, for the selected fiscal year:
- key controls tested, effective and ineffective, by process
- an assertion grid per process. A **gap** is a transaction cycle with no key control for existence/occurrence, completeness, rights and obligations, valuation/allocation, or presentation and disclosure. IT general and entity-level controls are not counted toward gaps.
- open material weaknesses, significant deficiencies and control deficiencies, with CAPs that are missing or overdue
- an overall position:
  - *ready for an unmodified statement*
  - *qualified* (an open material weakness must be reported)
  - *not ready* (with the reasons listed)

**Export matrix with results (CSV)** produces the matrix with the latest design and operating effectiveness results and NFR references, to support the A-123 Statement of Assurance or the SOX 404 management assessment.

## API

All endpoints are under `/api/v1/financial-audit`:
- `rcm`, `rcm/import`
- `sampling`, `sampling/statistical`
- `tests`, `tests/:id/samples/:n`, `tests/:id/complete`, `tests/:id/review`, `tests/:id/reopen`, `tests/:id/finding`
- `findings/:id/nfr`, `findings/:id/cap`
- `readiness`, `readiness/export`

Every change is audit-logged.
