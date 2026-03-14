-- Migration 089: Pending Evidence (AI-Suggested Evidence with Approval Workflow)
-- When connected integrations produce data, AI analyzes logs against the org's
-- selected frameworks and suggests evidence items.  These land in a staging
-- table until a user approves (promotes to the evidence table) or rejects them.

CREATE TABLE IF NOT EXISTS pending_evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id             UUID REFERENCES evidence_collection_rules(id) ON DELETE SET NULL,
  source_type         TEXT NOT NULL,          -- e.g. 'splunk', 'connector', etc.
  source_summary      TEXT,                   -- human-readable summary of the source data
  ai_title            TEXT NOT NULL,          -- AI-generated evidence title
  ai_description      TEXT NOT NULL,          -- AI-generated explanation of why this is evidence
  ai_confidence       REAL NOT NULL DEFAULT 0.0 CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  suggested_controls  UUID[] NOT NULL DEFAULT '{}',   -- framework_controls the AI mapped this to
  suggested_tags      TEXT[] NOT NULL DEFAULT '{}',
  raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- original source data (Splunk events, etc.)
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,
  promoted_evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,  -- set on approval
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_evidence_org
  ON pending_evidence(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_evidence_rule
  ON pending_evidence(rule_id) WHERE rule_id IS NOT NULL;
