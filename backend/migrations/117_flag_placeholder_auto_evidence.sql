-- Migration 117: Flag placeholder auto-collected evidence
--
-- Until this release, running an auto-evidence rule for a source with no real
-- collector (Microsoft Sentinel, AWS CloudTrail, CrowdStrike, Jira, the ITSM
-- source, Custom Connector, and GitHub in this edition) still wrote an evidence record: a JSON file saying
-- "status: collected" whose results were whatever sat in the rule config,
-- hashed, stamped integrity-verified and auto-linked to the rule's controls.
-- No external system was ever queried. The route now refuses to run those
-- rules; this migration marks the records it already created so nobody
-- presents them to an auditor as collected evidence.
--
-- Records are matched on the exact description the placeholder path wrote
-- ("Auto-collected from <label> by rule ..."), using the labels of the sources
-- that had no collector. Real Splunk collections are untouched.
-- The records are tagged and relabeled, not deleted: removing evidence (and
-- its control links) is the organization's decision, not the migration's.
--
-- Ships in the production-readiness Phase 1B integrity batch.

UPDATE evidence
SET tags = CASE
      WHEN 'unverified-placeholder' = ANY(COALESCE(tags, ARRAY[]::text[])) THEN tags
      ELSE array_append(COALESCE(tags, ARRAY[]::text[]), 'unverified-placeholder')
    END,
    description = '[UNVERIFIED PLACEHOLDER - no data was collected from the source system] ' || description
WHERE description ~ '^Auto-collected from (Microsoft Sentinel|AWS CloudTrail|CrowdStrike Falcon|Jira|ServiceNow|Custom Connector|GitHub|microsoft_sentinel|aws_cloudtrail|crowdstrike|jira|servicenow|connector|github) by rule "' -- ip-hygiene:ignore
  AND description NOT LIKE '[UNVERIFIED PLACEHOLDER%';
