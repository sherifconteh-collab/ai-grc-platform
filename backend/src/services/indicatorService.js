// @tier: community
/**
 * Indicator (KRI / KPI / KCI) domain logic.
 *
 * The whole module turns on one function — `evaluateBreach` — and it is easy
 * to get subtly wrong, which is why it is isolated and unit tested rather than
 * inlined in a route.
 *
 * The trap: threshold comparison depends on direction. For a "lower is better"
 * indicator (failed login attempts) a value at or above the red threshold is a
 * breach. For "higher is better" (patch coverage) a value at or *below* red is
 * the breach. Writing the comparison once for whichever case the author had in
 * mind, and leaving the other to be discovered in production, is the common
 * failure. Both are handled here explicitly and symmetrically.
 *
 * Boundaries are inclusive on the bad side: a value exactly at the red
 * threshold is red. A threshold you can sit exactly on without tripping is not
 * a threshold anyone means.
 */

const BREACH_LEVELS = ['green', 'amber', 'red'];

/**
 * Classify a measurement against an indicator's thresholds.
 *
 * @param {number} value
 * @param {Object} indicator - needs direction, amber_threshold, red_threshold.
 * @returns {'green'|'amber'|'red'} 'green' when no thresholds are configured.
 */
function evaluateBreach(value, indicator) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !indicator) return 'green';

  const amber = indicator.amber_threshold === null || indicator.amber_threshold === undefined
    ? null
    : Number(indicator.amber_threshold);
  const red = indicator.red_threshold === null || indicator.red_threshold === undefined
    ? null
    : Number(indicator.red_threshold);

  const higherIsBetter = indicator.direction === 'higher_is_better';

  // Red is checked first: when thresholds are misconfigured such that a value
  // satisfies both, the worse classification is the safe one to report.
  if (red !== null && Number.isFinite(red)) {
    if (higherIsBetter ? numeric <= red : numeric >= red) return 'red';
  }
  if (amber !== null && Number.isFinite(amber)) {
    if (higherIsBetter ? numeric <= amber : numeric >= amber) return 'amber';
  }
  return 'green';
}

/**
 * Direction of travel between the two most recent readings, from the point of
 * view of whether things are getting better or worse — not whether the number
 * went up. A rising failed-login count is 'worsening'; rising patch coverage
 * is 'improving'.
 */
function trend(currentValue, previousValue, direction) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (current === previous) return 'flat';
  const rising = current > previous;
  const higherIsBetter = direction === 'higher_is_better';
  return rising === higherIsBetter ? 'improving' : 'worsening';
}

const FREQUENCY_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  semiannual: 182,
  annual: 365
};

/**
 * Whether an indicator is overdue for a reading. An indicator that stopped
 * being measured is a worse signal than a red one, because it looks fine on a
 * dashboard while telling you nothing. `ad_hoc` indicators are never overdue.
 */
function isMeasurementOverdue(indicator, now = new Date()) {
  if (!indicator || !indicator.is_active) return false;
  const windowDays = FREQUENCY_DAYS[indicator.measurement_frequency];
  if (!windowDays) return false;
  if (!indicator.latest_measured_at) return true;
  const ageDays = (now.getTime() - new Date(indicator.latest_measured_at).getTime()) / 86400000;
  // One full period of grace beyond the cadence before calling it overdue.
  return ageDays > windowDays * 2;
}

function decorateIndicator(indicator) {
  if (!indicator) return indicator;
  return {
    ...indicator,
    measurement_overdue: isMeasurementOverdue(indicator)
  };
}

/**
 * Record a measurement and keep the denormalized latest-reading columns in
 * step, inside one transaction.
 *
 * The latest columns are only advanced when the new reading is at least as
 * recent as the stored one, so backfilling historic data does not overwrite
 * the current value with an old number.
 */
async function recordMeasurement(client, { organizationId, indicatorId, value, measuredAt, notes, recordedBy }) {
  const { rows: indicatorRows } = await client.query(
    `SELECT id, direction, amber_threshold, red_threshold, latest_measured_at
     FROM indicators
     WHERE id = $1 AND organization_id = $2
     FOR UPDATE`,
    [indicatorId, organizationId]
  );
  if (indicatorRows.length === 0) return null;

  const indicator = indicatorRows[0];
  const breachLevel = evaluateBreach(value, indicator);
  const effectiveMeasuredAt = measuredAt || new Date().toISOString();

  const { rows: measurementRows } = await client.query(
    `INSERT INTO indicator_measurements
       (organization_id, indicator_id, value, measured_at, breach_level, notes, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (indicator_id, measured_at) DO UPDATE
       SET value = EXCLUDED.value,
           breach_level = EXCLUDED.breach_level,
           notes = EXCLUDED.notes,
           recorded_by = EXCLUDED.recorded_by,
           recorded_at = now()
     RETURNING *`,
    [organizationId, indicatorId, value, effectiveMeasuredAt, breachLevel, notes || null, recordedBy || null]
  );

  await client.query(
    `UPDATE indicators
     SET latest_value = $3,
         latest_measured_at = $4::timestamptz,
         latest_breach_level = $5,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2
       AND (latest_measured_at IS NULL OR latest_measured_at <= $4::timestamptz)`,
    [indicatorId, organizationId, value, effectiveMeasuredAt, breachLevel]
  );

  return measurementRows[0];
}

module.exports = {
  BREACH_LEVELS,
  FREQUENCY_DAYS,
  evaluateBreach,
  trend,
  isMeasurementOverdue,
  decorateIndicator,
  recordMeasurement
};
