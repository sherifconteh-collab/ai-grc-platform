// @tier: platform
'use strict';

/**
 * Approval Service — High-Risk Action Staging
 *
 * Stages destructive or irreversible platform admin actions (feature flag
 * disabling, immediate subscription cancellation, etc.) for a second
 * platform-owner approval before execution.
 */

const pool = require('../config/database');

/**
 * Stage a new approval request.
 * @returns {{ id: string, expires_at: Date }}
 */
async function createApproval({
  actionType,
  resourceType = null,
  resourceId = null,
  requestedBy,
  requestedByEmail,
  payload = {}
}) {
  const result = await pool.query(
    `INSERT INTO pending_approvals
       (action_type, resource_type, resource_id, requested_by, requested_by_email, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, expires_at`,
    [actionType, resourceType, resourceId, requestedBy, requestedByEmail, JSON.stringify(payload)]
  );
  return result.rows[0];
}

/**
 * Fetch a single approval by ID.
 * @returns {Object|null}
 */
async function getApproval(id) {
  const result = await pool.query(
    `SELECT * FROM pending_approvals WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * List approvals filtered by status.
 * @returns {Object[]}
 */
async function getPendingApprovals({ status = 'pending', limit = 50, offset = 0 } = {}) {
  const result = await pool.query(
    `SELECT * FROM pending_approvals WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );
  return result.rows;
}

/**
 * Mark an approval as approved. Returns the full record (including payload) so the
 * caller can execute the staged action, or null if not found / already resolved.
 * If the approval is expired, throws an error with code "APPROVAL_REQUEST_EXPIRED".
 * @returns {Object|null}
 */
async function approveAction(id, reviewerId, reviewerEmail, note = null) {
  // Fetch current state to distinguish not-found, already-resolved, and expired.
  const existingResult = await pool.query(
    `SELECT id, status, expires_at FROM pending_approvals WHERE id = $1 LIMIT 1`,
    [id]
  );
  const existing = existingResult.rows[0];

  if (!existing || existing.status !== 'pending') {
    return null;
  }

  // Expired request: mark as expired (idempotent) and throw a distinct error.
  if (existing.expires_at && existing.expires_at <= new Date()) {
    await pool.query(
      `UPDATE pending_approvals SET status = 'expired'
       WHERE id = $1 AND status = 'pending' AND expires_at <= NOW()`,
      [id]
    );
    const error = new Error('Approval request has expired');
    error.code = 'APPROVAL_REQUEST_EXPIRED';
    error.approvalId = id;
    throw error;
  }

  // Fresh pending request: approve, guarding against last-moment expiry.
  const result = await pool.query(
    `UPDATE pending_approvals
     SET status = 'approved', reviewed_by = $2, reviewed_by_email = $3,
         review_note = $4, reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending' AND expires_at > NOW()
     RETURNING *`,
    [id, reviewerId, reviewerEmail, note]
  );
  // In the extremely unlikely event the row changed between SELECT and UPDATE,
  // fall back to null to indicate it could not be approved.
  return result.rows[0] || null;
}

/**
 * Mark an approval as rejected. Returns the full record or null if not found / already resolved.
 * If the approval is expired, throws an error with code "APPROVAL_REQUEST_EXPIRED".
 * @returns {Object|null}
 */
async function rejectAction(id, reviewerId, reviewerEmail, note = null) {
  // Fetch current state to distinguish not-found, already-resolved, and expired.
  const existingResult = await pool.query(
    `SELECT id, status, expires_at FROM pending_approvals WHERE id = $1 LIMIT 1`,
    [id]
  );
  const existing = existingResult.rows[0];

  if (!existing || existing.status !== 'pending') {
    return null;
  }

  // Expired request: mark as expired and throw a distinct error.
  if (existing.expires_at && existing.expires_at <= new Date()) {
    await pool.query(
      `UPDATE pending_approvals SET status = 'expired'
       WHERE id = $1 AND status = 'pending' AND expires_at <= NOW()`,
      [id]
    );
    const error = new Error('Approval request has expired');
    error.code = 'APPROVAL_REQUEST_EXPIRED';
    error.approvalId = id;
    throw error;
  }

  const result = await pool.query(
    `UPDATE pending_approvals
     SET status = 'rejected', reviewed_by = $2, reviewed_by_email = $3,
         review_note = $4, reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending' AND expires_at > NOW()
     RETURNING *`,
    [id, reviewerId, reviewerEmail, note]
  );
  return result.rows[0] || null;
}

/**
 * Expire all pending approvals past their expiry time.
 * Intended to be called lazily (on list requests) to keep the table tidy.
 * @returns {number} number of rows expired
 */
async function expireStaleApprovals() {
  const result = await pool.query(
    `UPDATE pending_approvals SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()`
  );
  return result.rowCount;
}

module.exports = {
  createApproval,
  getApproval,
  getPendingApprovals,
  approveAction,
  rejectAction,
  expireStaleApprovals
};
