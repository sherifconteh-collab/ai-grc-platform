// @tier: community
/**
 * Separation of Duties (SOD) middleware helpers.
 *
 * SOD prevents the same user from performing conflicting roles in a workflow —
 * e.g. the person who creates/submits a resource cannot also approve it.
 *
 * Usage:
 *   const { requireSod } = require('../middleware/sod');
 *
 *   // In a route handler, after fetching the resource:
 *   const sodError = requireSod(resource.created_by, req.user.id, 'creator', 'approver');
 *   if (sodError) return res.status(403).json({ success: false, error: sodError });
 *
 * Admin users (permissions includes '*') bypass SOD checks to allow admin
 * overrides in emergency situations — overrides are always audit-logged by the
 * calling route so the bypass is not invisible.
 */

/**
 * Checks whether the acting user is different from the user who performed an
 * earlier step (e.g. created or submitted the resource).
 *
 * @param {string|null} actorId      - UUID of the user who performed the prior step
 * @param {string}      currentUserId - UUID of the user attempting the current step
 * @param {string}      priorRole     - Human label for the prior role, e.g. 'creator'
 * @param {string}      currentRole   - Human label for the current role, e.g. 'approver'
 * @param {string[]}    permissions   - Permissions array from req.user.permissions.
 *                                      Defaults to [] (SOD enforced) — callers must
 *                                      explicitly pass req.user.permissions to allow
 *                                      the admin override path. Defaulting to [] is
 *                                      intentionally safe-fail: a forgotten argument
 *                                      enforces SOD rather than silently bypassing it.
 * @returns {string|null} Error message string if SOD violated, null if allowed
 */
function requireSod(actorId, currentUserId, priorRole, currentRole, permissions = []) {
  // Admins (wildcard permission) may override SOD — calling route must audit-log this.
  if (permissions.includes('*')) return null;

  // If the prior actor is unknown (null/undefined) there is no constraint.
  if (!actorId) return null;

  if (String(actorId) === String(currentUserId)) {
    return `Separation of duties violation: the ${priorRole} of this item cannot also act as ${currentRole}`;
  }

  return null;
}

module.exports = { requireSod };
