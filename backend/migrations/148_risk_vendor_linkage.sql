-- =============================================================================
-- 148_risk_vendor_linkage.sql
--
-- Mirror of ControlWeaver-Pro migration 142. Ships in the same release as 146
-- (risk <-> POA&M) and 147 (POA&M <-> control).
--
-- Migration 140 gave the risk register three link tables -- controls, assets and
-- business objectives -- with the stated intent that the register be "connected
-- to the compliance work rather than parallel to it". Third-party vendors were
-- left out, and they are the one category where the risk is definitionally
-- someone else's to run and ours to carry.
--
-- tprm_vendors already records a risk_tier, but that is a static classification
-- of the vendor, set at onboarding: it says "this is a critical supplier", not
-- "here is the specific thing that could go wrong, its likelihood, its impact,
-- what we are doing about it and when we last looked". Those live in `risks`,
-- with inherent and residual scores and a review cadence. Without this table
-- there is no way to say that a named risk arises from a named vendor, so
-- vendor concentration is invisible to the register and the register is
-- invisible to a vendor review.
--
-- Deliberately a link table rather than a column on either side. A vendor can
-- carry several distinct risks (a data processor might present both a privacy
-- exposure and an availability one), and a single risk can arise from several
-- vendors -- which is exactly the concentration case worth being able to see.
-- =============================================================================

CREATE TABLE IF NOT EXISTS risk_vendor_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES risks (id) ON DELETE CASCADE,
  vendor_id         uuid NOT NULL REFERENCES tprm_vendors (id) ON DELETE CASCADE,

  -- How this vendor contributes to this risk. Free text on purpose: the useful
  -- content here is "sole provider of X, no failover" rather than an enum
  -- nobody would agree on.
  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- SECURITY: org-scoped uniqueness keeps cross-tenant linkage impossible.
  -- Matches risk_control_links, risk_asset_links and risk_objective_links so
  -- all four behave identically.
  CONSTRAINT risk_vendor_links_unique UNIQUE (organization_id, risk_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_vendor_links_risk
  ON risk_vendor_links (risk_id);

-- Org-scoped on the vendor side, because the common read is "what risks does
-- this vendor carry for us", which always filters by organization first.
CREATE INDEX IF NOT EXISTS idx_risk_vendor_links_vendor
  ON risk_vendor_links (organization_id, vendor_id);

COMMENT ON TABLE risk_vendor_links IS
  'Links risk register entries to TPRM vendors, so vendor concentration is visible to the register and register entries are visible during a vendor review.';
