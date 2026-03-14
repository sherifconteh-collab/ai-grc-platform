-- Migration 048: Dashboard and activity hot-path indexes
-- Improves query latency for dashboard overview, activity feed, and trend endpoints.

CREATE INDEX IF NOT EXISTS idx_control_implementations_org_created
  ON control_implementations(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_control_implementations_org_assigned
  ON control_implementations(organization_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_resource_created
  ON audit_logs(organization_id, resource_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_frameworks_org_framework
  ON organization_frameworks(organization_id, framework_id);

DO $$
BEGIN
  IF to_regclass('public.evidence') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evidence_org_created ON evidence(organization_id, created_at DESC)';
  END IF;
END
$$;
