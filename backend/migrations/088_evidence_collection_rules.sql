-- Migration 088: Evidence Collection Rules
-- Stores scheduled/automated evidence collection configurations

CREATE TABLE IF NOT EXISTS evidence_collection_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  source_type       TEXT NOT NULL CHECK (source_type IN ('splunk', 'connector')),
  -- source_config holds source-specific parameters (e.g. Splunk search query, time range, max_events)
  source_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule          TEXT NOT NULL DEFAULT 'manual'
                      CHECK (schedule IN ('manual', 'daily', 'weekly', 'monthly')),
  -- control_ids: UUIDs of framework_controls rows this rule's evidence should be linked to
  control_ids       UUID[] NOT NULL DEFAULT '{}',
  -- tags: user-defined classification labels used for filtering evidence in the library
  tags              TEXT[] NOT NULL DEFAULT '{}',
  enabled           BOOLEAN NOT NULL DEFAULT true,
  last_run_at       TIMESTAMPTZ,
  last_run_status   TEXT CHECK (last_run_status IN ('success', 'error', 'running')),
  last_run_error    TEXT,
  last_evidence_id  UUID REFERENCES evidence(id) ON DELETE SET NULL,
  next_run_at       TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecr_org ON evidence_collection_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_ecr_next_run ON evidence_collection_rules(next_run_at)
  WHERE enabled = true AND schedule <> 'manual';
