// @tier: community
/**
 * Incident response domain logic.
 *
 * The important behavior here is that advancing an incident's status is not a
 * simple column write. Each phase transition stamps its own timestamp and
 * appends a timeline entry, because the response record is the artifact that
 * matters — an incident whose status says 'contained' with no record of when
 * or by whom is worth nothing to an investigator or a regulator.
 *
 * Transitions are validated against an explicit graph rather than allowing any
 * status to follow any other. NIST SP 800-61 phases are ordered for a reason:
 * an incident cannot be eradicated before it is contained, and letting the API
 * record that produces response metrics that are quietly nonsense.
 */
const { nextReference } = require('../utils/referenceGenerator');

// Phase timestamps set automatically when a status is first reached. Only set
// when currently null: re-entering a phase (containment that had to be redone)
// must not overwrite the original time, or time-to-contain silently improves
// every time the response gets worse.
const STATUS_TIMESTAMPS = {
  triaged: 'triaged_at',
  contained: 'contained_at',
  eradicated: 'eradicated_at',
  recovered: 'resolved_at',
  closed: 'closed_at'
};

// Timeline entry type recorded for each transition.
const STATUS_TIMELINE_TYPES = {
  triaged: 'triage',
  investigating: 'analysis',
  contained: 'containment',
  eradicated: 'eradication',
  recovered: 'recovery',
  closed: 'status_change',
  false_positive: 'status_change'
};

/**
 * Allowed forward transitions. Reopening is deliberately permitted from
 * 'closed' back to 'investigating': incidents get reopened when new
 * information arrives, and forcing a duplicate record instead would split the
 * timeline of a single event across two rows.
 */
const ALLOWED_TRANSITIONS = {
  new: ['triaged', 'investigating', 'false_positive', 'closed'],
  triaged: ['investigating', 'contained', 'false_positive', 'closed'],
  investigating: ['contained', 'false_positive', 'closed'],
  contained: ['eradicated', 'investigating', 'closed'],
  eradicated: ['recovered', 'investigating', 'closed'],
  recovered: ['closed', 'investigating'],
  closed: ['investigating'],
  false_positive: ['investigating']
};

function canTransition(from, to) {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

function allowedNextStatuses(from) {
  return ALLOWED_TRANSITIONS[from] || [];
}

/**
 * Response duration metrics, in hours, for a single incident. Returns null for
 * any interval whose endpoints are not both known rather than substituting
 * now() — a half-computed metric reads as a real measurement and is worse than
 * an absent one.
 */
function responseMetrics(incident) {
  if (!incident) return null;
  const hoursBetween = (start, end) => {
    if (!start || !end) return null;
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms)) return null;
    return Math.round((ms / 3600000) * 100) / 100;
  };

  return {
    // How long the incident went unnoticed. The uncomfortable one.
    dwell_hours: hoursBetween(incident.occurred_at, incident.detected_at),
    time_to_triage_hours: hoursBetween(incident.detected_at, incident.triaged_at),
    time_to_contain_hours: hoursBetween(incident.detected_at, incident.contained_at),
    time_to_resolve_hours: hoursBetween(incident.detected_at, incident.resolved_at),
    time_to_close_hours: hoursBetween(incident.detected_at, incident.closed_at)
  };
}

/**
 * Whether a regulatory notification clock is running, and how much of it is
 * left. Negative `hours_remaining` means the deadline has passed — surfaced as
 * a negative number rather than clamped to zero so a dashboard can show how
 * far past it the organization is.
 */
function notificationStatus(incident, now = new Date()) {
  if (!incident || !incident.regulatory_notification_required) {
    return { required: false };
  }
  if (incident.regulator_notified_at) {
    return {
      required: true,
      notified: true,
      notified_at: incident.regulator_notified_at,
      // Whether the notification actually made the deadline.
      met_deadline: incident.notification_deadline
        ? new Date(incident.regulator_notified_at) <= new Date(incident.notification_deadline)
        : null
    };
  }
  if (!incident.notification_deadline) {
    return { required: true, notified: false, deadline_set: false };
  }
  const hoursRemaining =
    (new Date(incident.notification_deadline).getTime() - now.getTime()) / 3600000;
  return {
    required: true,
    notified: false,
    deadline_set: true,
    deadline: incident.notification_deadline,
    hours_remaining: Math.round(hoursRemaining * 100) / 100,
    overdue: hoursRemaining < 0
  };
}

function decorateIncident(incident) {
  if (!incident) return incident;
  return {
    ...incident,
    metrics: responseMetrics(incident),
    notification: notificationStatus(incident),
    allowed_next_statuses: allowedNextStatuses(incident.status)
  };
}

async function resolveReference(executor, organizationId, supplied) {
  const trimmed = typeof supplied === 'string' ? supplied.trim() : '';
  if (trimmed) return trimmed;
  return nextReference(executor, 'incident', organizationId);
}

/**
 * Apply a status transition inside an open transaction: stamp the phase
 * timestamp if this is the first time the phase is reached, and append the
 * timeline entry. Returns the updated row, or null when the incident is not
 * found in this organization.
 */
async function applyStatusChange(client, { organizationId, incidentId, toStatus, actorUserId, note }) {
  const { rows: currentRows } = await client.query(
    `SELECT id, status FROM incidents
     WHERE id = $1 AND organization_id = $2
     FOR UPDATE`,
    [incidentId, organizationId]
  );
  if (currentRows.length === 0) return { notFound: true };

  const fromStatus = currentRows[0].status;
  if (!canTransition(fromStatus, toStatus)) {
    return { invalidTransition: true, fromStatus, allowed: allowedNextStatuses(fromStatus) };
  }

  const timestampColumn = STATUS_TIMESTAMPS[toStatus];
  // COALESCE keeps the first time a phase was reached. Written as separate
  // statements per column rather than an interpolated column name so no part
  // of the SQL is assembled from a variable.
  const timestampClause = {
    triaged_at: 'triaged_at = COALESCE(triaged_at, now())',
    contained_at: 'contained_at = COALESCE(contained_at, now())',
    eradicated_at: 'eradicated_at = COALESCE(eradicated_at, now())',
    resolved_at: 'resolved_at = COALESCE(resolved_at, now())',
    closed_at: 'closed_at = COALESCE(closed_at, now())'
  }[timestampColumn];

  const updates = ['status = $3', 'updated_at = now()'];
  if (timestampClause) updates.push(timestampClause);

  const { rows } = await client.query(
    `UPDATE incidents SET ${updates.join(', ')}
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [incidentId, organizationId, toStatus]
  );

  await client.query(
    `INSERT INTO incident_timeline
       (organization_id, incident_id, entry_type, recorded_by, summary, detail, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      organizationId,
      incidentId,
      STATUS_TIMELINE_TYPES[toStatus] || 'status_change',
      actorUserId || null,
      `Status changed from ${fromStatus} to ${toStatus}`,
      note || null,
      JSON.stringify({ from: fromStatus, to: toStatus })
    ]
  );

  return { incident: rows[0], fromStatus };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  STATUS_TIMESTAMPS,
  canTransition,
  allowedNextStatuses,
  responseMetrics,
  notificationStatus,
  decorateIncident,
  resolveReference,
  applyStatusChange
};
