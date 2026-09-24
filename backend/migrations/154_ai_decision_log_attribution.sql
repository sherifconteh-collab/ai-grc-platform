-- Migration 154: Attribute AI decision records (NIST AU-3)
--
-- AU-3 requires an audit record to establish the identity of the individuals
-- associated with the event. ai_decision_log could not: it has no user_id and
-- no ip_address column, so attribution stopped at organization_id. On a
-- platform whose AI features produce compliance findings, "some user at this
-- org" is not an adequate answer to who caused a decision -- and the columns
-- that do name people (reviewed_by, bias_reviewed_by, approved_by) all
-- identify post-hoc reviewers rather than the actor who triggered it.
--
-- Also indexes feature, which migration 045 added specifically so a decision
-- record could say which AI feature produced it. The single INSERT in
-- services/llmService.js never populated it, so the column has been NULL on
-- every row; that omission is fixed in the same change as this migration.
--
-- Ships in the AU control family remediation batch.

ALTER TABLE ai_decision_log
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ip_address INET;

CREATE INDEX IF NOT EXISTS idx_ai_decision_log_user ON ai_decision_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_feature ON ai_decision_log(feature);

COMMENT ON COLUMN ai_decision_log.user_id IS
  'AU-3: the user whose request produced this AI decision. ON DELETE SET NULL so deleting a user does not remove the decision record.';
COMMENT ON COLUMN ai_decision_log.ip_address IS
  'AU-3: source address of the request that produced this AI decision.';

SELECT 'Migration 154 completed.' AS result;
