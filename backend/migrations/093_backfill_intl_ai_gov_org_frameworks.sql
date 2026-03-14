-- Migration 093: Backfill international_ai_governance into organization_frameworks
-- for all existing utilities-tier organizations.
--
-- Root cause: migration 087 added the international_ai_governance framework to
-- the frameworks catalog but did not adopt it into existing utilities-tier
-- organizations' organization_frameworks table.  The dashboard stats endpoint
-- queries organization_frameworks, so the framework was invisible to the
-- dashboard even though grc_list_frameworks (which queries the catalog directly)
-- correctly returned all 30 frameworks.
--
-- Fix: for every organization whose tier = 'utilities' that does not already
-- have international_ai_governance in organization_frameworks, insert the row.
-- Idempotent: only orgs missing the framework are targeted (LEFT JOIN filter),
-- so re-running is safe and generates no unnecessary index conflicts.

DO $$
DECLARE
  fw_id        UUID;
  rows_inserted INT;
BEGIN
  SELECT id INTO fw_id
  FROM frameworks
  WHERE code = 'international_ai_governance'
  LIMIT 1;

  IF fw_id IS NULL THEN
    RAISE NOTICE 'Migration 093: international_ai_governance framework not found — skipping backfill (migration 087 may not have run yet).';
    RETURN;
  END IF;

  INSERT INTO organization_frameworks (organization_id, framework_id)
  SELECT o.id, fw_id
  FROM organizations o
  LEFT JOIN organization_frameworks ofw
    ON ofw.organization_id = o.id
   AND ofw.framework_id = fw_id
  WHERE o.tier = 'utilities'
    AND ofw.organization_id IS NULL;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;
  RAISE NOTICE 'Migration 093: backfilled international_ai_governance into organization_frameworks for % utilities-tier organization(s).', rows_inserted;
END $$;
