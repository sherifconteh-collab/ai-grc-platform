-- =============================================================================
-- 149_risk_evidence_linkage.sql
--
-- Mirror of ControlWeaver-Pro migration 143. Ships alongside 146 (risk <->
-- POA&M), 147 (POA&M <-> control) and 148 (risk <-> vendor). The last of the
-- register's unconnected edges.
--
-- Migration 140 connected risks to controls, assets and objectives; 146 added
-- remediation and 148 added third parties. Evidence was the remaining gap.
-- Evidence has been linkable to controls since migration 009/014
-- (evidence_control_links), so today you can show a document demonstrates a
-- control -- but not that it demonstrates you are managing a specific risk.
--
-- Those are genuinely different claims. A control is a thing you do; a risk is
-- a thing that could happen. An auditor asking "show me you are managing the
-- vendor-concentration risk" is not asking which controls exist, they are
-- asking what proves this particular exposure is under management. Going via
-- controls loses that: it can only answer transitively, and only when the risk
-- happens to have controls linked and those controls happen to have evidence.
--
-- `relevance` records why this document is evidence for this risk, because the
-- same document supports different risks for different reasons:
--   'assessment'  -- how the risk was scored or re-scored
--   'treatment'   -- what is being done about it
--   'monitoring'  -- ongoing proof it stays within appetite
--   'acceptance'  -- the decision record where the risk was accepted
--
-- NOTE on convention: this table carries organization_id with a
-- SECURITY-annotated unique constraint, matching risk_control_links,
-- risk_asset_links, risk_objective_links, risk_poam_links and
-- risk_vendor_links. It deliberately does NOT follow evidence_control_links,
-- which predates that convention and has no organization_id at all -- it relies
-- entirely on joining through evidence for tenant scoping. That older table is
-- out of scope here, but it is worth knowing it is the weaker of the two
-- patterns, not the one to copy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS risk_evidence_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  evidence_id       uuid NOT NULL REFERENCES evidence (id) ON DELETE CASCADE,

  relevance         text NOT NULL DEFAULT 'monitoring',
  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT risk_evidence_links_relevance_check CHECK (
    relevance IN ('assessment', 'treatment', 'monitoring', 'acceptance')),

  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  CONSTRAINT risk_evidence_links_unique UNIQUE (organization_id, risk_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_evidence_links_risk
  ON risk_evidence_links (risk_id);

-- Org-scoped on the evidence side: the common read is "what risks does this
-- document support", which always filters by organization first.
CREATE INDEX IF NOT EXISTS idx_risk_evidence_links_evidence
  ON risk_evidence_links (organization_id, evidence_id);

COMMENT ON TABLE risk_evidence_links IS
  'Links risk register entries to evidence, so a risk can be shown to be under management directly rather than only transitively through its controls.';
