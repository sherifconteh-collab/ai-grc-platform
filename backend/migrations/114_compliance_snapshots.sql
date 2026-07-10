-- Compliance snapshots for historical trending
CREATE TABLE compliance_snapshots (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    framework_id     UUID REFERENCES frameworks(id) ON DELETE CASCADE,
    snapshot_date    DATE NOT NULL,
    total_controls   INTEGER NOT NULL DEFAULT 0,
    implemented      INTEGER NOT NULL DEFAULT 0,
    partial          INTEGER NOT NULL DEFAULT 0,
    not_implemented  INTEGER NOT NULL DEFAULT 0,
    compliance_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_compliance_snapshots_unique
    ON compliance_snapshots (organization_id, framework_id, snapshot_date);
CREATE INDEX idx_compliance_snapshots_org_date
    ON compliance_snapshots (organization_id, snapshot_date DESC);
CREATE INDEX idx_compliance_snapshots_org_framework
    ON compliance_snapshots (organization_id, framework_id, snapshot_date DESC);

-- Scheduled report delivery
CREATE TABLE scheduled_reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    report_type      TEXT NOT NULL
                         CHECK (report_type IN ('compliance_summary', 'framework_gap', 'evidence_status', 'audit_trail', 'executive')),
    schedule         TEXT NOT NULL
                         CHECK (schedule IN ('daily', 'weekly', 'monthly', 'quarterly')),
    format           TEXT NOT NULL DEFAULT 'pdf'
                         CHECK (format IN ('pdf', 'csv', 'json')),
    recipients       JSONB NOT NULL DEFAULT '[]',
    filters          JSONB NOT NULL DEFAULT '{}',
    is_active        BOOLEAN NOT NULL DEFAULT true,
    last_run_at      TIMESTAMPTZ,
    next_run_at      TIMESTAMPTZ,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_reports_org ON scheduled_reports (organization_id);
CREATE INDEX idx_scheduled_reports_next_run ON scheduled_reports (next_run_at)
    WHERE is_active = true;
