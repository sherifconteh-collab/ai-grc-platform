// @tier: community
/**
 * Compliance obligation domain logic.
 *
 * The one non-obvious piece is due-date advancement. When an obligation with a
 * frequency is attested, the next due date has to move — and it has to move
 * relative to the *due date*, not to the attestation date. Advancing from
 * "when it was done" lets a repeatedly-late annual obligation drift its own
 * deadline forward a few weeks every year until it no longer lands in the
 * period the regulator expects. Advancing from the due date keeps the schedule
 * anchored and simply shows the attestation as late.
 */
const { nextReference } = require('../utils/referenceGenerator');

const FREQUENCY_MONTHS = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  biennial: 24
};

const FREQUENCY_DAYS = {
  daily: 1,
  weekly: 7
};

/**
 * Next due date for a recurring obligation, anchored to the current due date.
 *
 * @param {string} frequency
 * @param {Date|string|null} currentDueDate - anchor; falls back to `from`.
 * @param {Date} from - used only when there is no anchor to advance.
 * @returns {Date|null} null for one-off obligations.
 */
function advanceDueDate(frequency, currentDueDate, from = new Date()) {
  if (!frequency) return null;
  const anchor = currentDueDate ? new Date(currentDueDate) : new Date(from);
  if (Number.isNaN(anchor.getTime())) return null;

  const next = new Date(anchor.getTime());
  if (FREQUENCY_DAYS[frequency]) {
    next.setUTCDate(next.getUTCDate() + FREQUENCY_DAYS[frequency]);
  } else if (FREQUENCY_MONTHS[frequency]) {
    // setUTCMonth clamps 31 Jan + 1 month to 3 March rather than 28 February,
    // so the day is pinned back afterwards. An obligation due on the 31st in a
    // 30-day month is due on the 30th, not on the 1st of the following month.
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + FREQUENCY_MONTHS[frequency]);
    const lastDayOfMonth = new Date(Date.UTC(
      next.getUTCFullYear(), next.getUTCMonth() + 1, 0
    )).getUTCDate();
    next.setUTCDate(Math.min(day, lastDayOfMonth));
  } else {
    return null;
  }

  // If the obligation was missed for several periods, walk forward until the
  // next due date is in the future. Otherwise a long-neglected obligation gets
  // a due date that is still in the past and never leaves the overdue list
  // even after someone finally attests to it.
  let guard = 0;
  while (next < from && guard < 500) {
    const advanced = advanceDueDate(frequency, next, from);
    if (!advanced || advanced <= next) break;
    next.setTime(advanced.getTime());
    guard += 1;
  }

  return next;
}

/**
 * How an obligation's compliance status should read after an attestation.
 *
 * `waived` returns null, which the caller COALESCEs into "leave the status
 * alone". A waiver is a decision to set the requirement aside for a period; it
 * is neither evidence of compliance nor of breach, so it must not overwrite
 * whatever the last substantive attestation established. `not_applicable` does
 * map to a status, because "this does not apply to us" is itself a finding
 * about the obligation rather than a one-period exception.
 */
function complianceStatusForOutcome(outcome) {
  switch (outcome) {
    case 'met': return 'compliant';
    case 'partially_met': return 'partially_compliant';
    case 'not_met': return 'non_compliant';
    case 'not_applicable': return 'not_applicable';
    default: return null;
  }
}

function decorateObligation(obligation, now = new Date()) {
  if (!obligation) return obligation;
  const due = obligation.next_due_date ? new Date(obligation.next_due_date) : null;
  const daysUntilDue = due
    ? Math.ceil((due.getTime() - now.getTime()) / 86400000)
    : null;

  return {
    ...obligation,
    days_until_due: daysUntilDue,
    overdue: Boolean(
      due && obligation.status === 'active' && due < now
    ),
    // 30 days is the conventional warning window used elsewhere in this
    // platform for expiring evidence; kept consistent so one dashboard does
    // not warn earlier than another.
    due_soon: Boolean(
      due && obligation.status === 'active' &&
      daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 30
    )
  };
}

async function resolveReference(executor, organizationId, supplied) {
  const trimmed = typeof supplied === 'string' ? supplied.trim() : '';
  if (trimmed) return trimmed;
  return nextReference(executor, 'obligation', organizationId);
}

module.exports = {
  FREQUENCY_MONTHS,
  FREQUENCY_DAYS,
  advanceDueDate,
  complianceStatusForOutcome,
  decorateObligation,
  resolveReference
};
