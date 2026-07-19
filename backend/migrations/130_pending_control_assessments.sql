-- Migration 130: Pending control assessments (AI-suggested status changes with approval)
--
-- Ships as part of the Phase 4 "Automated Intelligence & Platform Maturity"
-- roadmap: connector -> control auto-assessment. Connected integrations
-- (Splunk today) produce evidence linked to controls, but nothing ever
-- re-evaluated whether that new evidence should change the control's
-- implementation status -- a human had to notice new evidence and
-- manually flip the status. This closes that gap the same way migration
-- 089 (pending_evidence) closed the equivalent gap for evidence creation:
-- the AI proposes, a human with implementations.write approves or rejects,
-- and only approval ever touches control_implementations. Mirrors the
-- established "never auto-accept AI output without human validation"
-- principle already documented in ControlWeaver-Pro's evidence.md and
-- this repo's own pending_evidence route. Ported from ControlWeaver-Pro
-- PR #612 (migration 124 there).

CREATE TABLE IF NOT EXISTS pending_control_assessments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id           UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
    rule_id              UUID REFERENCES evidence_collection_rules(id) ON DELETE SET NULL,
    source_type          TEXT NOT NULL,
    source_summary       TEXT,
    current_status       TEXT NOT NULL,
    ai_suggested_status  TEXT NOT NULL,
    ai_confidence        REAL NOT NULL DEFAULT 0.0 CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    ai_reasoning         TEXT NOT NULL,
    evidence_ids         UUID[] NOT NULL DEFAULT '{}',
    status               TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at          TIMESTAMPTZ,
    review_notes         TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SECURITY: only one open (pending) suggestion per (organization, control)
-- at a time -- a partial unique index rather than a table-wide UNIQUE
-- constraint, since approved/rejected rows are historical and a control
-- can legitimately accumulate many of those over time; only 'pending'
-- rows must stay unique per control so repeated scans can't pile up
-- duplicate suggestions awaiting review.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pca_one_pending_per_control
  ON pending_control_assessments(organization_id, control_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pca_org_status
  ON pending_control_assessments(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pca_rule
  ON pending_control_assessments(rule_id) WHERE rule_id IS NOT NULL;

SELECT 'Migration 130 completed.' AS result;
