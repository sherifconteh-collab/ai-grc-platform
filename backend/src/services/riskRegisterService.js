// @tier: community
/**
 * Risk register domain logic.
 *
 * Kept out of the route file because three things here are decisions rather
 * than plumbing, and each is the kind of thing that quietly goes wrong:
 *
 *   1. Severity banding. A 1-25 score means nothing to a board; "high" does.
 *      The band boundaries live in one place so the register, the heat map and
 *      any report agree.
 *   2. Review snapshots. A review has to record what the assessment *was* at
 *      review time, because the risk row will be edited afterwards and the
 *      review would otherwise silently describe the current state.
 *   3. Acceptance expiry. An accepted risk with a lapsed `accepted_until` is
 *      not accepted any more; it is an unmanaged risk with a stale label, and
 *      the register has to say so rather than keep showing 'accepted'.
 */
const pool = require('../config/database');
const { nextReference } = require('../utils/referenceGenerator');

// Score is likelihood x impact on 1-5 scales, so 1-25. Boundaries chosen to
// match the conventional 5x5 matrix colouring: the top row/column is critical,
// the low-low corner is low.
const SEVERITY_BANDS = [
  { band: 'low', max: 4 },
  { band: 'medium', max: 9 },
  { band: 'high', max: 15 },
  { band: 'critical', max: 25 }
];

const CREATABLE_FIELDS = [
  'title', 'description', 'category', 'threat_source', 'vulnerability',
  'inherent_likelihood', 'inherent_impact', 'residual_likelihood', 'residual_impact',
  'treatment_strategy', 'status', 'owner_user_id', 'department_id',
  'identified_date', 'next_review_date', 'tags'
];

/**
 * Map a 1-25 score to its severity band. Returns null for an unscored risk
 * rather than defaulting to 'low' — "not yet assessed" and "assessed as low"
 * are different facts and conflating them hides work that has not been done.
 */
function severityBand(score) {
  if (score === null || score === undefined) return null;
  const numeric = Number(score);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  const match = SEVERITY_BANDS.find((entry) => numeric <= entry.max);
  return match ? match.band : 'critical';
}

/**
 * Whether a risk's acceptance has lapsed. An acceptance with no end date does
 * not expire; one with a past `accepted_until` does.
 */
function isAcceptanceExpired(risk, now = new Date()) {
  if (!risk || risk.status !== 'accepted' || !risk.accepted_until) return false;
  return new Date(risk.accepted_until) < now;
}

/**
 * Decorate a risk row with the derived fields every consumer needs, so the
 * banding logic is not reimplemented in the frontend, in reports, and in the
 * dashboard with three different sets of boundaries.
 */
function decorateRisk(risk) {
  if (!risk) return risk;
  const inherentBand = severityBand(risk.inherent_score);
  const residualBand = severityBand(risk.residual_score);
  return {
    ...risk,
    inherent_severity: inherentBand,
    residual_severity: residualBand,
    // Positive means controls reduced the risk. Null when either side is
    // unassessed — a reduction figure computed against a missing inherent
    // score would be an invented number.
    risk_reduction:
      risk.inherent_score !== null && risk.inherent_score !== undefined &&
      risk.residual_score !== null && risk.residual_score !== undefined
        ? Number(risk.inherent_score) - Number(risk.residual_score)
        : null,
    acceptance_expired: isAcceptanceExpired(risk),
    review_overdue: Boolean(
      risk.next_review_date &&
      risk.status !== 'closed' &&
      new Date(risk.next_review_date) < new Date()
    )
  };
}

/**
 * Allocate a reference for a new risk unless the caller supplied one.
 */
async function resolveReference(executor, organizationId, supplied) {
  const trimmed = typeof supplied === 'string' ? supplied.trim() : '';
  if (trimmed) return trimmed;
  return nextReference(executor, 'risk', organizationId);
}

/**
 * The 5x5 heat map, plus the counts a risk committee actually opens the page
 * for. Runs as one grouped query rather than 25 counts.
 */
async function getHeatMap(organizationId) {
  const { rows } = await pool.query(
    `SELECT residual_likelihood AS likelihood,
            residual_impact     AS impact,
            COUNT(*)::int       AS count
     FROM risks
     WHERE organization_id = $1
       AND status <> 'closed'
       AND residual_likelihood IS NOT NULL
       AND residual_impact IS NOT NULL
     GROUP BY residual_likelihood, residual_impact`,
    [organizationId]
  );

  const cells = rows.map((row) => ({
    likelihood: row.likelihood,
    impact: row.impact,
    count: row.count,
    severity: severityBand(row.likelihood * row.impact)
  }));

  const bySeverity = cells.reduce((acc, cell) => {
    acc[cell.severity] = (acc[cell.severity] || 0) + cell.count;
    return acc;
  }, { low: 0, medium: 0, high: 0, critical: 0 });

  return { cells, bySeverity, total: cells.reduce((sum, c) => sum + c.count, 0) };
}

/**
 * Register-level summary: status mix, unassessed count, overdue reviews,
 * lapsed acceptances, and overdue treatments. One round trip per concern
 * rather than one per risk.
 */
async function getSummary(organizationId) {
  const [statusRows, attentionRows, treatmentRows] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM risks WHERE organization_id = $1 GROUP BY status`,
      [organizationId]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE residual_score IS NULL AND status <> 'closed')::int
           AS unassessed,
         COUNT(*) FILTER (WHERE next_review_date < CURRENT_DATE AND status <> 'closed')::int
           AS reviews_overdue,
         COUNT(*) FILTER (WHERE status = 'accepted' AND accepted_until < CURRENT_DATE)::int
           AS acceptances_expired,
         COUNT(*) FILTER (WHERE owner_user_id IS NULL AND status <> 'closed')::int
           AS unowned
       FROM risks WHERE organization_id = $1`,
      [organizationId]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled'))::int AS open,
         COUNT(*) FILTER (WHERE due_date < CURRENT_DATE
                            AND status NOT IN ('completed', 'cancelled'))::int AS overdue
       FROM risk_treatments WHERE organization_id = $1`,
      [organizationId]
    )
  ]);

  const byStatus = statusRows.rows.reduce((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});

  return {
    byStatus,
    total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    attention: attentionRows.rows[0],
    treatments: treatmentRows.rows[0]
  };
}

/**
 * Record a periodic review. The snapshot is taken inside the same transaction
 * as the risk update so it cannot capture a state that never existed, and
 * `last_reviewed_at` / `next_review_date` move together with it.
 */
async function recordReview(client, { organizationId, riskId, reviewedBy, outcome, notes, nextReviewDate }) {
  const { rows: riskRows } = await client.query(
    `SELECT id, reference, title, status, inherent_likelihood, inherent_impact,
            inherent_score, residual_likelihood, residual_impact, residual_score,
            treatment_strategy, owner_user_id
     FROM risks
     WHERE id = $1 AND organization_id = $2
     FOR UPDATE`,
    [riskId, organizationId]
  );
  if (riskRows.length === 0) return null;

  const snapshot = riskRows[0];
  const { rows: reviewRows } = await client.query(
    `INSERT INTO risk_reviews
       (organization_id, risk_id, reviewed_by, outcome, notes, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [organizationId, riskId, reviewedBy || null, outcome, notes || null, JSON.stringify(snapshot)]
  );

  await client.query(
    `UPDATE risks
     SET last_reviewed_at = now(),
         next_review_date = COALESCE($3::date, next_review_date),
         updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [riskId, organizationId, nextReviewDate || null]
  );

  return reviewRows[0];
}

module.exports = {
  SEVERITY_BANDS,
  CREATABLE_FIELDS,
  severityBand,
  isAcceptanceExpired,
  decorateRisk,
  resolveReference,
  getHeatMap,
  getSummary,
  recordReview
};
