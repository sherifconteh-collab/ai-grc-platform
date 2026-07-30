// @tier: community
/**
 * Crosswalk credit ledger and reversal.
 *
 * ControlWeave already credits mapped controls forward: `routes/controls.js`
 * flips `not_started` targets to `satisfied_via_crosswalk` when a source control
 * is implemented, at the org's configured similarity threshold. This module is
 * the half that was missing — recording *which* source justified each credit, so
 * the credit can be explained to an assessor and withdrawn when the source stops
 * being implemented.
 *
 * Guarantees this module keeps, because it writes compliance status without a
 * human in the loop:
 *
 *   - It never touches human work. Withdrawal only rewrites controls still
 *     sitting at `satisfied_via_crosswalk`. If someone has since implemented the
 *     control themselves, their status stands.
 *   - It is reversible per source. A target justified by two sources keeps its
 *     credit until the last of them stops being implemented.
 *   - It restores what was there. Withdrawal writes back the status recorded at
 *     credit time rather than assuming `not_started`.
 *   - It never credits across tenants. Every query is organization-scoped.
 */
const pool = require('../config/database');
const { log, serializeError } = require('../utils/logger');

// Source statuses that justify crediting mapped controls. A source that leaves
// this set has its credits withdrawn.
const CREDITING_STATUSES = ['implemented', 'verified'];

/**
 * Records credits for targets the caller just credited.
 *
 * `credits` entries are `{ targetControlId, similarityScore, mappingType,
 * previousStatus }`. `previousStatus` is the target's status *before* any
 * crosswalk credit — when the target was already `satisfied_via_crosswalk` from
 * another source, the earlier credit's `previous_status` is reused instead, so
 * withdrawing the last source cannot restore a control to a status that was
 * itself only ever crosswalk credit.
 */
async function recordCredits(executor, { organizationId, sourceControlId, credits, actorUserId }) {
  if (!Array.isArray(credits) || credits.length === 0) return 0;

  const targetIds = credits.map((credit) => credit.targetControlId);
  const priorCredits = await executor.query(
    `SELECT DISTINCT ON (target_control_id) target_control_id, previous_status
     FROM control_crosswalk_credits
     WHERE organization_id = $1 AND target_control_id = ANY($2::uuid[])
     ORDER BY target_control_id, created_at ASC`,
    [organizationId, targetIds]
  );
  const priorByTarget = new Map(
    priorCredits.rows.map((row) => [row.target_control_id, row.previous_status])
  );

  const resolvedPrevious = credits.map((credit) => {
    const observed = credit.previousStatus || 'not_started';
    if (observed !== 'satisfied_via_crosswalk') return observed;
    return priorByTarget.get(credit.targetControlId) || 'not_started';
  });

  const result = await executor.query(
    `INSERT INTO control_crosswalk_credits
       (organization_id, target_control_id, source_control_id, similarity_score,
        mapping_type, previous_status, created_by)
     SELECT $1, t.target_id, $2, t.score, t.mapping_type, t.previous_status, $3
     FROM UNNEST($4::uuid[], $5::int[], $6::text[], $7::text[])
       AS t(target_id, score, mapping_type, previous_status)
     ON CONFLICT (organization_id, target_control_id, source_control_id) DO UPDATE
       SET similarity_score = EXCLUDED.similarity_score,
           mapping_type = EXCLUDED.mapping_type,
           created_at = NOW()`,
    [
      organizationId,
      sourceControlId,
      actorUserId || null,
      targetIds,
      credits.map((credit) => Number(credit.similarityScore) || 0),
      credits.map((credit) => credit.mappingType || null),
      resolvedPrevious
    ]
  );

  return result.rowCount || 0;
}

/**
 * Withdraws this source's credits, restoring only the targets no other
 * still-crediting source justifies.
 */
async function withdrawCredits(executor, { organizationId, sourceControlId }) {
  const credits = await executor.query(
    `DELETE FROM control_crosswalk_credits
     WHERE organization_id = $1 AND source_control_id = $2
     RETURNING target_control_id, previous_status`,
    [organizationId, sourceControlId]
  );

  let restored = 0;
  for (const credit of credits.rows) {
    const stillCredited = await executor.query(
      `SELECT 1
       FROM control_crosswalk_credits ccc
       JOIN control_implementations ci
         ON ci.control_id = ccc.source_control_id
        AND ci.organization_id = ccc.organization_id
       WHERE ccc.organization_id = $1
         AND ccc.target_control_id = $2
         AND ci.status = ANY($3::text[])
       LIMIT 1`,
      [organizationId, credit.target_control_id, CREDITING_STATUSES]
    );

    if (stillCredited.rows.length > 0) continue;

    // Only rewrite a control still sitting on crosswalk credit. If someone has
    // since done the work themselves, leave their status alone.
    const updated = await executor.query(
      `UPDATE control_implementations
       SET status = $3, updated_at = NOW()
       WHERE control_id = $1
         AND organization_id = $2
         AND status = 'satisfied_via_crosswalk'`,
      [credit.target_control_id, organizationId, credit.previous_status || 'not_started']
    );
    restored += updated.rowCount || 0;
  }

  return restored;
}

/**
 * Called when a control's status changes to something that no longer justifies
 * crediting. Runs in its own transaction and never throws into the caller: the
 * user's own status update has already succeeded and must not be rolled back
 * because bookkeeping failed.
 */
async function handleSourceStatusChange({ organizationId, controlId, newStatus, actorUserId }) {
  if (CREDITING_STATUSES.includes(newStatus)) return { withdrawn: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const withdrawn = await withdrawCredits(client, { organizationId, sourceControlId: controlId });

    // AU-2: removing credit changes the organization's compliance posture, so it
    // belongs in the audit log rather than only the application log.
    if (withdrawn > 0) {
      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
         VALUES ($1, $2, 'crosswalk_credit_withdrawn', 'control', $3, $4)`,
        [
          organizationId,
          actorUserId || null,
          controlId,
          JSON.stringify({ new_status: newStatus, controls_restored: withdrawn })
        ]
      );
    }

    await client.query('COMMIT');

    if (withdrawn > 0) {
      log('info', 'crosswalk.credit_withdrawn', {
        organizationId, controlId, newStatus, withdrawn
      });
    }

    return { withdrawn };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'crosswalk.withdraw_failed', {
      organizationId, controlId, newStatus, error: serializeError(error)
    });
    return { withdrawn: 0, error: true };
  } finally {
    client.release();
  }
}

/**
 * Why is this control credited? Used by the control detail view so the
 * provenance is visible rather than implied by a bare status.
 */
async function getCreditsForControl(organizationId, controlId) {
  const result = await pool.query(
    `SELECT ccc.similarity_score,
            ccc.mapping_type,
            ccc.created_at,
            src.control_id AS source_control_ref,
            src.title      AS source_control_title,
            f.code         AS source_framework_code,
            f.name         AS source_framework_name,
            ci.status      AS source_status
     FROM control_crosswalk_credits ccc
     JOIN framework_controls src ON src.id = ccc.source_control_id
     JOIN frameworks f ON f.id = src.framework_id
     LEFT JOIN control_implementations ci
       ON ci.control_id = ccc.source_control_id
      AND ci.organization_id = ccc.organization_id
     WHERE ccc.organization_id = $1 AND ccc.target_control_id = $2
     ORDER BY ccc.similarity_score DESC`,
    [organizationId, controlId]
  );
  return result.rows;
}

module.exports = {
  CREDITING_STATUSES,
  recordCredits,
  withdrawCredits,
  handleSourceStatusChange,
  getCreditsForControl
};
