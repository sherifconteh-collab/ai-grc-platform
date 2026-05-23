-- Migration 102: Control Response Depth (Phase 5)
-- Adds implementation narrative, test metadata, reviewer trail to control_implementations.
-- Also adds assessment_result_evidence_links junction table for procedure-level evidence.
-- All additions are nullable forward-only — no NOT NULL on existing tables.

-- ============================================================
-- 1. Extend control_implementations with implementation depth
-- ============================================================
ALTER TABLE control_implementations
  ADD COLUMN IF NOT EXISTS implementation_narrative TEXT,
  ADD COLUMN IF NOT EXISTS test_method TEXT
    CHECK (test_method IN ('examine','interview','test','automated','document_review')),
  ADD COLUMN IF NOT EXISTS test_performed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS test_performed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_comments TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT
    CHECK (review_status IN ('pending','approved','returned'));

-- Index for auditor workload queries
CREATE INDEX IF NOT EXISTS idx_control_impl_reviewed_by
  ON control_implementations(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_control_impl_review_status
  ON control_implementations(review_status)
  WHERE review_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_control_impl_org_control
  ON control_implementations(organization_id, control_id);

-- ============================================================
-- 2. New table: assessment_result_evidence_links
-- Attaches evidence directly to a specific procedure result
-- ============================================================
CREATE TABLE IF NOT EXISTS assessment_result_evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_result_id UUID NOT NULL
    REFERENCES assessment_results(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL
    REFERENCES evidence(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  link_notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_result_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_arel_assessment_result
  ON assessment_result_evidence_links(assessment_result_id);

CREATE INDEX IF NOT EXISTS idx_arel_evidence
  ON assessment_result_evidence_links(evidence_id);

CREATE INDEX IF NOT EXISTS idx_arel_org
  ON assessment_result_evidence_links(organization_id);
