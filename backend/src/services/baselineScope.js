// @tier: community
'use strict';

/**
 * Baseline scoping for compliance denominators.
 *
 * Every compliance percentage in the application divides by the count of every
 * control of every framework the organization has activated. That was already
 * a blunt measure, and `ensureOrgFrameworks` activates all of them, but it
 * became actively misleading with the NIST SP 800-53 Rev 5 enhancement import:
 * the catalog gains 714 controls, all arriving `not_started`, so an
 * organization's posture drops by roughly two thirds overnight without a
 * single control changing state.
 *
 * The fix is not to hide the enhancements -- they are real requirements -- but
 * to measure against the ones actually in scope. NIST SP 800-53B selects 149
 * controls at Low, 287 at Moderate and 370 at High; an organization pursuing
 * Moderate should be measured against its 287, not against all 1,014.
 *
 * Two properties this predicate has to get right:
 *
 * 1. **Frameworks with no baseline data stay fully in scope.** Only 800-53
 *    carries `control_baselines` rows. If the predicate simply required a
 *    matching baseline row, selecting a baseline would silently drop ISO
 *    27001, SOC 2 and every other framework out of the denominator -- turning
 *    a scoping feature into an accidental compliance inflator, which is the
 *    same class of overclaiming this work exists to remove.
 *
 * 2. **An unset baseline changes nothing.** `target_baseline IS NULL` yields
 *    the pre-existing behavior exactly, so this is inert until an
 *    organization opts in.
 */

/**
 * SQL predicate scoping a control to the organization's selected baseline.
 *
 * Assumes `fc` is the `framework_controls` alias in the enclosing query, and
 * that `organizations` is reachable as `o`. Callers that do not already join
 * `organizations` should use `BASELINE_SCOPE_JOIN` below.
 *
 * Takes no bind parameters -- the baseline is read from the joined
 * organization row -- so it can be dropped into an existing query without
 * disturbing its placeholder numbering.
 */
const BASELINE_SCOPE_PREDICATE = `
  AND (
    o.target_baseline IS NULL
    OR EXISTS (
      SELECT 1 FROM control_baselines cb
       WHERE cb.framework_control_id = fc.id
         AND cb.baseline = o.target_baseline
    )
    OR NOT EXISTS (
      SELECT 1
        FROM control_baselines cb2
        JOIN framework_controls fc2 ON fc2.id = cb2.framework_control_id
       WHERE fc2.framework_id = fc.framework_id
    )
  )
`;

/**
 * Join clause making `o.target_baseline` available. Uses the organization id
 * the caller has already bound; pass the placeholder it lives at.
 */
function baselineScopeJoin(orgParamPlaceholder = '$1') {
  return ` JOIN organizations o ON o.id = ${orgParamPlaceholder} `;
}

module.exports = {
  BASELINE_SCOPE_PREDICATE,
  baselineScopeJoin
};
