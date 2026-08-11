# FedRAMP-Ready Deployment Guide

This guide covers deploying ControlWeaver Pro in a FedRAMP-compliant configuration.
It applies to both **FedRAMP Moderate** and **FedRAMP High** impact levels and
references the `fedramp_moderate` and `fedramp_high` framework controls available
in the platform.

---

## 1. FedRAMP Impact Levels and ControlWeaver Frameworks

| Impact Level | Framework Code       | Description |
|-------------|----------------------|-------------|
| Moderate    | `fedramp_moderate`   | Required for systems processing Moderate-impact federal data. Based on NIST 800-53 Rev 5 Moderate baseline (~38 controls seeded). |
| High        | `fedramp_high`       | Required for highly sensitive federal data. Adds 25 High-only controls beyond Moderate (FRH-* prefix). |

Both frameworks are available in ControlWeaver after running the seed script:

```bash
cd backend && node scripts/seed-frameworks.js
```

An **Authorization to Operate (ATO)** relies on your System Security Plan (SSP) mapping
each seeded control to an implementation status. Use ControlWeaver's control implementation
tracking and evidence management to generate that mapping.

---

## 2. Architecture Requirements (High Baseline)

### 2.1 Network Topology

- Deploy in AWS GovCloud (us-gov-east-1 or us-gov-west-1), Azure Government, or equivalent FedRAMP-authorized IaaS.
- Use a dedicated VPC with no shared compute across tenants.
- Subnet isolation: application tier (private), database tier (isolated, no public route).
- Only inbound port 443 (HTTPS/TLS) exposed externally. All other ingress blocked at the security-group level.
- Database not exposed to the public internet under any circumstances.

### 2.2 Database

- PostgreSQL 17+ required (latest stable recommended).
- Enable AES-256 encryption at rest (AWS RDS: enable storage encryption; use a customer-managed KMS key for High baseline).
- Separate backup region (geographic separation satisfies FRH-CP-6(3) and FRH-CP-9(3)).
- SSL enforced: `sslmode=require` in the connection string.
- TLS 1.2+ for all database connections; disable TLS 1.0/1.1.

### 2.3 TLS and Cipher Suites

- TLS 1.2+ only. Disable TLS 1.0 and TLS 1.1 at the load balancer and application server.
- FIPS 140-2 validated cipher suites (recommended):
  - `TLS_AES_256_GCM_SHA384`
  - `TLS_CHACHA20_POLY1305_SHA256`
  - `ECDHE-RSA-AES256-GCM-SHA384`
- Use a certificate from a FedRAMP-authorized certificate authority.

---

## 3. Environment Variables

All secrets must be injected via environment variables — never hardcoded in source.

### Required

| Variable | Description | FedRAMP Requirement |
|----------|-------------|---------------------|
| `DATABASE_URL` | PostgreSQL connection string with `sslmode=require` | SC-8, SC-28 |
| `JWT_SECRET` | Minimum 32 characters, high entropy | IA-5 |
| `CORS_ORIGIN` | Exact origin of the frontend (no wildcards in production) | SC-8 |
| `ENCRYPTION_KEY` | AES-256 key (32 bytes, hex-encoded) for at-rest field encryption | SC-28(1) |

### Recommended for FedRAMP

| Variable | Recommended Value | Notes |
|----------|-------------------|-------|
| `DB_SSL_MODE` | `require` | Enforces TLS on all DB connections |
| `SESSION_TIMEOUT_MINUTES` | `30` | Satisfies FRH-AC-12 session termination |
| `MFA_REQUIRED` | `true` | Required for all admin accounts under FRH-IA-5(2) |
| `NODE_ENV` | `production` | Disables stack traces in error responses |
| `RATE_LIMIT_WINDOW_MS` | `900000` | 15-minute window |
| `RATE_LIMIT_MAX` | `100` | Requests per window per IP |

> **Audit-record retention** is configured with a `data_retention_policies`
> row of `resource_type = 'audit_logs'`, not an environment variable. An
> `AUDIT_LOG_RETENTION_DAYS` variable was previously recommended here; no
> such variable was ever read by any code. `AUDIT_LOG_MIN_RETENTION_DAYS`
> (default 365) sets the floor a policy cannot go below. See the AU-11 row
> in section 5.

---

## 4. Pre-Flight Security Checklist

Run these checks before declaring the system operational.

### Database Migrations

```bash
cd backend && npm run migrate
```

Verify the following critical migrations are applied:

| Migration | Description | Controls Addressed |
|-----------|-------------|-------------------|
| `013_rbac_bootstrap.sql` | RBAC permissions and roles | AC-2, AC-3, AC-6 |
| `091_totp_2fa.sql` | TOTP-based MFA columns | IA-5(2), FRH-IA-5(2) |
| `104_rls_policies.sql` | Row-Level Security (multi-tenant isolation) | AC-3, SC-28 |
| `106_open_source.sql` | Sets all orgs to `tier=enterprise` | N/A |
| `113_custom_frameworks.sql` | Custom framework builder tables | N/A |
| `114_compliance_snapshots.sql` | Compliance snapshot tracking for ConMon | CA-7 |
| `115_org_hierarchy.sql` | MSP parent-child org hierarchy | AC-2 |

```sql
-- Verify RLS is enabled on core tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('controls','evidence','audit_logs','control_implementations')
ORDER BY tablename;
-- Expected: rowsecurity = true for all rows
```

### RBAC Bootstrap

```bash
# Seed roles and permissions
node scripts/seed-frameworks.js
```

Confirm at least one admin account exists with MFA enrolled before restricting console access.

### MFA Enforcement

For FedRAMP High, all privileged accounts (admin, auditor roles) must use MFA.
The TOTP implementation in migration 091 supports TOTP (RFC 6238).
Enforce MFA at the application level before granting access to any FRH-IA-5(2) scoped resources.

---

## 5. Audit Logging Mapping

The `audit_logs` table provides part of the AU family. The table below states
what the platform implements today and what the deploying organization must
supply. Controls marked **Deployer-supplied** have no platform implementation —
do not claim them on the strength of this table.

| NIST Control | Status | Implementation |
|-------------|--------|----------------|
| AU-2 | Partial | Events are recorded to `audit_logs.event_type`. Most routes write through `services/auditService.js`, but a number of route handlers issue their own `INSERT INTO audit_logs` with a narrower column set, so field coverage is not uniform across event types. `event_type` is free-text — there is no enforced event registry. |
| AU-3 | Partial | Recorded per event: `event_type`, `created_at`, `user_id`, `actor_name`, `organization_id`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, `success`, `outcome`, `failure_reason`, `request_id`, `source_system`. **Not recorded as columns:** HTTP method and request path (captured only inside the `details` JSONB by `middleware/auditLog.js`), and before/after values. `authentication_method` is populated for authentication events only (set explicitly by `auditService.logAuthentication`/`logLogout`); `session_id` has no writer at all — the platform issues stateless JWTs carrying no session identifier, so use `request_id` for per-request correlation. Both columns are documented as such in the schema. |
| AU-4 | **Deployer-supplied** | No audit-log storage-capacity monitoring or alerting exists. Monitor table growth and provision storage externally. |
| AU-5 | Implemented | Audit-write and SIEM-forward failures are reported through the structured logger (`audit.write_failed`, `audit.siem_forward_failed`), so they reach Sentry rather than being swallowed to the console, and are counted per process and surfaced on the operations dashboard as `audit_pipeline`. That counter is deliberately separate from `failures_24h`, which counts audited business events that failed — only `audit_pipeline` tells you the trail itself is incomplete. Routing those alerts to a pager or ticket queue remains deployer-supplied. |
| AU-6 | Implemented | `GET /api/v1/audit/logs` with filtering by user, event type, resource, and date range; `GET /api/v1/audit/stats`; dashboard audit trail at `/dashboard/audit`. Optional SIEM forwarding via `services/siemService.js`. |
| AU-7 | Implemented | `GET /api/v1/audit/export` returns CSV or JSON under `audit.read`, accepting the same filters as `GET /audit/logs` (including a new `outcome` filter) and streaming in keyset batches so a multi-year export is not held in memory. CSV cells are RFC 4180 escaped and formula-prefixed. Each export is itself recorded as an `audit.exported` event. |
| AU-8 | Implemented | `audit_logs.created_at` is `timestamptz` (migration 152), set server-side by `NOW()` and never supplied by the caller, so every record is unambiguously mappable to UTC. Time synchronization (NTP) on the database host remains deployer-supplied. |
| AU-9 | Partial | Append-only is enforced in the database by the triggers in migration `153`: `DELETE` and `TRUNCATE` are rejected, and `UPDATE` is rejected for every column except `siem_forwarded`. Row-level security (`FORCE`, migration `105`) provides tenant isolation. This is tamper-**resistant**, not tamper-**evident** — there is no hash chain or record signature, and the application owns the table, so a privileged code path can disable the trigger. Note also that `organization_id` is `ON DELETE CASCADE`, so deleting an organization still removes its audit history. FRH-AU-9(3) requires cryptographic integrity: supplement with write-once log shipping. |
| AU-10 | Partial | `user_id`, `actor_name`, and `ip_address` are recorded on records written through `auditService`. Note `user_id` is `ON DELETE SET NULL`, so deleting a user detaches the identity from historical records (`actor_name` is retained). No digital signature is applied; FRH-AU-10 requires one — supplement with an external signing service. |
| AU-11 | Implemented | `data_retention_policies` rows with `resource_type = 'audit_logs'` are now enforced by the retention sweep. Two safeguards apply: a floor (`AUDIT_LOG_MIN_RETENTION_DAYS`, default 365, never below a hard 90-day floor) so a policy cannot be set low enough to erase the trail within policy, and an active legal hold on `audit_logs` suspends the purge entirely. The purge opens the append-only window inside a single transaction and writes an `audit.retention_purge` record, so the deletion is visible in the trail it modified. Set the policy to 1095 days for FedRAMP High. |
| AU-12 | Partial | Audit records are generated by route handlers calling `auditService`. The `middleware/auditLog.js` wrapper — the only path that records HTTP method and path — is mounted on a single router (`routes/dataSovereignty.js`) and fires only on 2xx responses, so it does not record failed operations. |

Critical event types that must be logged (verify these exist in your deployment):

- `user.login`, `user.logout`, `user.login_failed`
- `user.password_changed`, `user.mfa_enrolled`, `user.mfa_disabled`
- `control.status_changed`, `evidence.uploaded`, `evidence.deleted`
- `framework.activated`, `framework.deactivated`
- `admin.user_created`, `admin.user_deactivated`, `admin.role_changed`
- `export.controls`, `import.controls`

---

## 6. Backup and Recovery

### Schedule

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Full database dump | Daily | 30 days | Primary region |
| WAL archiving | Continuous | 7 days | Primary region |
| Offsite copy | Weekly | 90 days | Separate geographic region |

FRH-CP-9(3) requires backup storage in a separate facility. Use cross-region S3 replication
(or equivalent) with server-side encryption using the same AES-256 key material.

### Recovery Objectives

| Metric | Target (FedRAMP High) | Mechanism |
|--------|----------------------|-----------|
| RTO | 4 hours | Point-in-time restore from WAL + latest snapshot |
| RPO | 1 hour | Continuous WAL archiving |

### Test Recovery

Run a recovery drill at least quarterly (required for CP-4). Document the drill and
store evidence in ControlWeaver under the `fedramp_high` framework, control `FRH-CP-7(5)`.

---

## 7. Network Controls

### Inbound Rules

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 443 | HTTPS | 0.0.0.0/0 | Application traffic (TLS terminated at load balancer) |
| 22 | SSH | Bastion host IP only | Emergency access (disable in production; use AWS SSM instead) |

All other inbound traffic is denied.

### Outbound Rules

Restrict outbound to only the destinations required:

- Database host (port 5432)
- SMTP relay for email delivery (port 587/465)
- AWS services endpoints (if using GovCloud: `*.us-gov-east-1.amazonaws.com`)
- Integration endpoints (vulnerability scanners, ITSM platforms, cloud security services) — add as needed

### WAF

Deploy a WAF in front of the load balancer with at minimum:

- OWASP Core Rule Set (CRS) 3.3+
- Rate-based rules (block > 1000 requests per 5 minutes from a single IP)
- Geo-restriction to US IP ranges if no non-US users are expected
- SQL injection and XSS rule sets enabled

---

## 8. Incident Response

FedRAMP High requires notification of significant security incidents within **1 hour**
to the Authorizing Official and CISA (per FedRAMP IR-6 and FRH-IR-4(4)).

### ControlWeaver as Evidence Artifact

The `audit_logs` table provides a forensic record of all system events. Export relevant
log segments as evidence using:

```sql
SELECT *
FROM audit_logs
WHERE organization_id = $1
  AND created_at BETWEEN $2 AND $3
ORDER BY created_at ASC;
```

### Incident Notification Contacts

Before going live, populate the following contacts in your SSP:

- CISA 24/7 hotline: +1 888-282-0870
- Your FedRAMP Authorizing Official
- Your ISSO (Information System Security Officer)

### Integration with Your ITSM Platform

The ITSM connector (connector type `servicenow`) can automatically pull incident
records from your ITSM system and link them to control implementations in ControlWeaver,
providing traceability between incidents and control status changes.

---

## 9. Continuous Authorization (ConMon)

FedRAMP requires ongoing monitoring after the initial ATO. Use ControlWeaver's
built-in ConMon tooling:

### Weekly Vulnerability Scans

Run the Qualys VMDR or AWS Security Hub integration to pull findings automatically:

1. Configure the connector in `/dashboard/integrations` (connector type `qualys_vmdr` or `aws_security_hub`).
2. Set the sync schedule to `daily`.
3. Map findings to relevant framework controls.

### Monthly Compliance Snapshots

The `compliance_snapshot` job writes a daily record of per-framework compliance percentages
for all organizations. Ensure it runs at least monthly for ConMon reporting.

```bash
# Trigger a manual snapshot from the backend
cd backend && node scripts/snapshot-compliance.js
```

View historical trends in the executive dashboard at `/dashboard/reports/executive`.

### Scheduled Report Delivery

Configure a monthly executive report for ConMon in `/dashboard/reports`:

1. Create a scheduled report with type `executive`, schedule `monthly`, format `pdf`.
2. Add the ISSO and AO email addresses as recipients.
3. The job queue delivers the report automatically via the `scheduled_report_run` job type.

### Annual Penetration Test

Per FedRAMP, a penetration test is required annually (satisfies `FRH-SI-7(14)` and `CIS-18`).
Store the pen test report as evidence in ControlWeaver:

1. Upload the report under the `fedramp_high` framework.
2. Link it to controls `FRH-SA-10(1)` and `FRH-SI-16`.
3. Set an `expiration_date` of 13 months from the test date to trigger re-test reminders.

### ConMon Deliverables Checklist

| Deliverable | Frequency | ControlWeaver Feature |
|-------------|-----------|----------------------|
| Vulnerability scan results | Monthly | Qualys/Security Hub integration |
| Plan of Action & Milestones (POA&M) | Monthly | Control gap report at `/dashboard/reports` |
| Compliance snapshot | Monthly | `snapshot-compliance.js` |
| Inventory update | Monthly | Asset management (TPRM vendors) |
| Incident reports | As needed | Audit log export + ITSM connector integration |
| Penetration test report | Annual | Evidence upload under `fedramp_high` |

---

## 10. Quick Reference

```bash
# Apply all migrations
cd backend && npm run migrate

# Seed frameworks (includes fedramp_moderate and fedramp_high)
node scripts/seed-frameworks.js

# Take a compliance snapshot
node scripts/snapshot-compliance.js

# Syntax check before deploy
npm run check:syntax

# View audit log for an org (replace $ORG_ID)
psql $DATABASE_URL -c "
  SELECT event_type, action, resource_type, ip_address, created_at
  FROM audit_logs
  WHERE organization_id = '$ORG_ID'
  ORDER BY created_at DESC
  LIMIT 100;
"
```
