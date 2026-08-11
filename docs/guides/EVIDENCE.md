# Evidence

**Navigate:** sidebar → **Compliance** → **Evidence** (`/dashboard/evidence`)

**Permissions:** `evidence.read` to view, `evidence.write` to upload or change.

Evidence is the file that demonstrates a control is implemented or a risk is
under management. It may carry PII, so classification is not optional.

---

## 1. Uploading

Supported: PDF, DOCX, DOC, TXT, MD, CSV. Files are stored outside the
repository and hashed on upload for integrity verification.

Every item **must** be classified:

| Field | Values |
|---|---|
| `pii_classification` | `none`, `low`, `moderate`, `high`, `critical` |
| `data_sensitivity` | `public`, `internal`, `confidential`, `restricted` |
| `pii_types` | name, email, SSN, address, phone, DOB, financial, health, biometric, other |

When in doubt, classify higher. Over-classifying costs a little friction;
under-classifying puts regulated data somewhere it should not be.

`retention_until` records how long the document must be kept. (Note for anyone
porting from the sibling repository: that column is `expires_at` there. Here
`expires_at` belongs to `legal_holds` and is a different thing.)

## 2. Evidence types

A 14-value framework-neutral vocabulary (`evidence_types`) labels documents
consistently regardless of which framework asked for them. Assessment
procedures declare `expected_evidence_types`, so a reviewer can see what kind
of artifact a procedure is looking for.

Pre-existing evidence is left untyped rather than guessed at.

## 3. Version history

Open an item and use the **detail drawer**.

Editing metadata or replacing the file **snapshots the previous state** into
`evidence_versions`, inside the update's own transaction. Before this existed,
"versioning" was an integer that incremented while the prior version was
discarded — the number went up and nothing was kept.

What that buys you:

- The superseded **file and its hash** are both retained, so integrity stays
  demonstrable across a re-upload.
- Each version shows its **PII classification as it was**. A reclassification
  no longer destroys the record of how the document was classified while it was
  being relied on.
- A `change_note` on each update is what makes the history legible.

Prior versions can be downloaded.

## 4. Integrity check

**Detail drawer → Integrity tab → Verify integrity.**

Recomputes the file's **SHA-384** and compares it with the hash recorded at
upload. A mismatch means the stored file changed since it was accepted as
evidence.

SHA-384, not SHA-256 — this repository's CNSA Suite 1.0 floor. The column is
still named `integrity_hash_sha256`; that name records the history, not the
current algorithm, and is worth knowing before someone "corrects" it.

Rate-limited to 30/min: it re-hashes the stored file on every call.

## 5. Linking to controls

Evidence links to controls through `evidence_control_links`. From the evidence
list, use **Link to Controls**.

That table now carries an `organization_id`, matching every other link table in
the schema. It previously had no tenant column at all, so isolation depended on
every individual query remembering to join through `evidence` — correct in
practice, but a property of each query rather than of the schema.

## 6. Linking to risks

**Detail drawer → Risks tab** shows the register risks a document supports.

Linking a document to a control shows the control exists. It does not show that
a particular *risk* is under management — those are different claims, and going
via controls answers the second one only transitively, and only when the risk
happens to have controls linked and those controls happen to carry the
document.

Each link carries a **relevance** — `assessment`, `treatment`, `monitoring` or
`acceptance` — because the same document supports different risks for different
reasons. A penetration test report is assessment evidence for one risk and
monitoring evidence for another.

**Linking is owned by the risk.** Attach evidence from the risk detail page
(`/dashboard/risks/[id]`); this tab is the read side. One screen writes the
relationship.

## 7. AI-suggested evidence

`pendingEvidence` holds evidence proposed automatically from integrated
sources. Every suggestion requires **human review** before acceptance —
pending → approved or rejected. Nothing is auto-accepted.

## 8. API

```
GET    /evidence                          list, filterable by evidence_type
GET    /evidence/types                    the vocabulary
POST   /evidence/upload                   multipart
GET    /evidence/:id                      detail
PUT    /evidence/:id                      update metadata (snapshots a version)
GET    /evidence/:id/versions             superseded versions, newest first
POST   /evidence/:id/versions             replace the file
GET    /evidence/:id/versions/:n/download retrieve a prior version
GET    /evidence/:id/integrity-check      re-hash and compare
GET    /evidence/:id/risks                register risks this document supports
POST   /evidence/:id/link                 link controls
DELETE /evidence/:id                      delete
```

Download and integrity-check are limited to 30/min each — download is the
bulk-exfiltration path for files that may carry PII, and integrity-check
re-hashes on every call.
