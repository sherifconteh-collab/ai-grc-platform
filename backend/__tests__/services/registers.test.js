/**
 * Unit tests for the register modules' pure logic.
 *
 * These four functions carry the decisions that are easy to get wrong and
 * impossible to notice in a UI: threshold direction, due-date drift, severity
 * banding, and lifecycle ordering. Everything else in these modules is SQL,
 * which the live QA harness exercises against a real database.
 */
const indicatorService = require('../../src/services/indicatorService');
const obligationService = require('../../src/services/obligationService');
const riskService = require('../../src/services/riskRegisterService');
const incidentService = require('../../src/services/incidentService');

describe('indicatorService.evaluateBreach', () => {
  const lowerIsBetter = { direction: 'lower_is_better', amber_threshold: 500, red_threshold: 1000 };
  const higherIsBetter = { direction: 'higher_is_better', amber_threshold: 90, red_threshold: 80 };

  it('classifies a lower-is-better indicator', () => {
    expect(indicatorService.evaluateBreach(100, lowerIsBetter)).toBe('green');
    expect(indicatorService.evaluateBreach(499, lowerIsBetter)).toBe('green');
    expect(indicatorService.evaluateBreach(500, lowerIsBetter)).toBe('amber');
    expect(indicatorService.evaluateBreach(999, lowerIsBetter)).toBe('amber');
    expect(indicatorService.evaluateBreach(1000, lowerIsBetter)).toBe('red');
    expect(indicatorService.evaluateBreach(50000, lowerIsBetter)).toBe('red');
  });

  it('inverts the comparison for a higher-is-better indicator', () => {
    expect(indicatorService.evaluateBreach(99, higherIsBetter)).toBe('green');
    expect(indicatorService.evaluateBreach(91, higherIsBetter)).toBe('green');
    expect(indicatorService.evaluateBreach(90, higherIsBetter)).toBe('amber');
    expect(indicatorService.evaluateBreach(81, higherIsBetter)).toBe('amber');
    expect(indicatorService.evaluateBreach(80, higherIsBetter)).toBe('red');
    expect(indicatorService.evaluateBreach(0, higherIsBetter)).toBe('red');
  });

  it('reports green when no thresholds are configured', () => {
    expect(indicatorService.evaluateBreach(9999, { direction: 'lower_is_better' })).toBe('green');
  });

  it('reports the worse level when thresholds are misconfigured to overlap', () => {
    // red on the wrong side of amber would let a value satisfy both tests.
    const broken = { direction: 'lower_is_better', amber_threshold: 100, red_threshold: 10 };
    expect(indicatorService.evaluateBreach(500, broken)).toBe('red');
  });

  it('does not throw on non-numeric input', () => {
    expect(indicatorService.evaluateBreach('not a number', lowerIsBetter)).toBe('green');
    expect(indicatorService.evaluateBreach(null, lowerIsBetter)).toBe('green');
    expect(indicatorService.evaluateBreach(5, null)).toBe('green');
  });
});

describe('indicatorService.trend', () => {
  it('reads a rise as worsening when lower is better', () => {
    expect(indicatorService.trend(200, 100, 'lower_is_better')).toBe('worsening');
    expect(indicatorService.trend(100, 200, 'lower_is_better')).toBe('improving');
  });

  it('reads a rise as improving when higher is better', () => {
    expect(indicatorService.trend(95, 90, 'higher_is_better')).toBe('improving');
    expect(indicatorService.trend(80, 90, 'higher_is_better')).toBe('worsening');
  });

  it('reports flat and null appropriately', () => {
    expect(indicatorService.trend(50, 50, 'lower_is_better')).toBe('flat');
    expect(indicatorService.trend(50, undefined, 'lower_is_better')).toBeNull();
  });
});

describe('indicatorService.isMeasurementOverdue', () => {
  it('treats a never-measured active indicator as overdue', () => {
    expect(indicatorService.isMeasurementOverdue({
      is_active: true, measurement_frequency: 'monthly', latest_measured_at: null
    })).toBe(true);
  });

  it('allows one period of grace past the cadence', () => {
    const now = new Date('2026-07-31T00:00:00Z');
    const within = { is_active: true, measurement_frequency: 'monthly', latest_measured_at: '2026-07-01T00:00:00Z' };
    const beyond = { is_active: true, measurement_frequency: 'monthly', latest_measured_at: '2026-04-01T00:00:00Z' };
    expect(indicatorService.isMeasurementOverdue(within, now)).toBe(false);
    expect(indicatorService.isMeasurementOverdue(beyond, now)).toBe(true);
  });

  it('never marks an ad_hoc or inactive indicator overdue', () => {
    expect(indicatorService.isMeasurementOverdue({
      is_active: true, measurement_frequency: 'ad_hoc', latest_measured_at: null
    })).toBe(false);
    expect(indicatorService.isMeasurementOverdue({
      is_active: false, measurement_frequency: 'daily', latest_measured_at: null
    })).toBe(false);
  });
});

describe('obligationService.advanceDueDate', () => {
  const iso = (date) => date.toISOString().slice(0, 10);

  it('advances from the due date, not from today', () => {
    // An annual obligation due 15 Jan, attested late on 3 Mar, is next due
    // 15 Jan — not 3 Mar of the following year. Anchoring to the attestation
    // date is how a schedule silently drifts out of its regulatory period.
    const next = obligationService.advanceDueDate(
      'annual', '2026-01-15', new Date('2026-03-03T00:00:00Z')
    );
    expect(iso(next)).toBe('2027-01-15');
  });

  it('clamps a month-end date rather than spilling into the next month', () => {
    const next = obligationService.advanceDueDate(
      'monthly', '2026-01-31', new Date('2026-01-31T00:00:00Z')
    );
    expect(iso(next)).toBe('2026-02-28');
  });

  it('catches a long-neglected obligation up to a future date', () => {
    const next = obligationService.advanceDueDate(
      'quarterly', '2020-01-01', new Date('2026-07-31T00:00:00Z')
    );
    expect(next.getTime()).toBeGreaterThan(new Date('2026-07-31T00:00:00Z').getTime());
  });

  it('returns null for a one-off obligation', () => {
    expect(obligationService.advanceDueDate(null, '2026-01-15')).toBeNull();
    expect(obligationService.advanceDueDate('fortnightly', '2026-01-15')).toBeNull();
  });

  it('handles day and week cadences', () => {
    expect(iso(obligationService.advanceDueDate('weekly', '2026-07-01', new Date('2026-07-01T00:00:00Z'))))
      .toBe('2026-07-08');
  });
});

describe('obligationService.complianceStatusForOutcome', () => {
  it('maps substantive outcomes to a status', () => {
    expect(obligationService.complianceStatusForOutcome('met')).toBe('compliant');
    expect(obligationService.complianceStatusForOutcome('partially_met')).toBe('partially_compliant');
    expect(obligationService.complianceStatusForOutcome('not_met')).toBe('non_compliant');
    expect(obligationService.complianceStatusForOutcome('not_applicable')).toBe('not_applicable');
  });

  it('leaves the status untouched for a waiver', () => {
    // null is the caller's signal to COALESCE and keep what was there: a
    // waiver is neither evidence of compliance nor of breach.
    expect(obligationService.complianceStatusForOutcome('waived')).toBeNull();
  });
});

describe('riskRegisterService.severityBand', () => {
  it('bands a 1-25 score', () => {
    expect(riskService.severityBand(1)).toBe('low');
    expect(riskService.severityBand(4)).toBe('low');
    expect(riskService.severityBand(5)).toBe('medium');
    expect(riskService.severityBand(9)).toBe('medium');
    expect(riskService.severityBand(10)).toBe('high');
    expect(riskService.severityBand(15)).toBe('high');
    expect(riskService.severityBand(16)).toBe('critical');
    expect(riskService.severityBand(25)).toBe('critical');
  });

  it('distinguishes unassessed from low', () => {
    // Defaulting an unscored risk to 'low' would hide work not yet done.
    expect(riskService.severityBand(null)).toBeNull();
    expect(riskService.severityBand(undefined)).toBeNull();
    expect(riskService.severityBand(0)).toBeNull();
  });
});

describe('riskRegisterService.decorateRisk', () => {
  it('computes reduction only when both sides are assessed', () => {
    expect(riskService.decorateRisk({ inherent_score: 20, residual_score: 8 }).risk_reduction).toBe(12);
    expect(riskService.decorateRisk({ inherent_score: null, residual_score: 8 }).risk_reduction).toBeNull();
  });

  it('flags a lapsed acceptance', () => {
    expect(riskService.isAcceptanceExpired({
      status: 'accepted', accepted_until: '2020-01-01'
    })).toBe(true);
    expect(riskService.isAcceptanceExpired({
      status: 'accepted', accepted_until: null
    })).toBe(false);
    expect(riskService.isAcceptanceExpired({
      status: 'monitoring', accepted_until: '2020-01-01'
    })).toBe(false);
  });
});

describe('incidentService lifecycle', () => {
  it('permits the NIST 800-61 phase order', () => {
    expect(incidentService.canTransition('new', 'triaged')).toBe(true);
    expect(incidentService.canTransition('triaged', 'investigating')).toBe(true);
    expect(incidentService.canTransition('contained', 'eradicated')).toBe(true);
    expect(incidentService.canTransition('eradicated', 'recovered')).toBe(true);
    expect(incidentService.canTransition('recovered', 'closed')).toBe(true);
  });

  it('refuses to skip containment', () => {
    expect(incidentService.canTransition('new', 'recovered')).toBe(false);
    expect(incidentService.canTransition('triaged', 'eradicated')).toBe(false);
  });

  it('allows reopening a closed incident rather than forcing a duplicate', () => {
    expect(incidentService.canTransition('closed', 'investigating')).toBe(true);
    expect(incidentService.canTransition('false_positive', 'investigating')).toBe(true);
  });

  it('treats a no-op transition as allowed', () => {
    expect(incidentService.canTransition('contained', 'contained')).toBe(true);
  });
});

describe('incidentService.responseMetrics', () => {
  it('computes intervals in hours', () => {
    const metrics = incidentService.responseMetrics({
      occurred_at: '2026-07-01T02:00:00Z',
      detected_at: '2026-07-01T08:00:00Z',
      contained_at: '2026-07-01T20:00:00Z'
    });
    expect(metrics.dwell_hours).toBe(6);
    expect(metrics.time_to_contain_hours).toBe(12);
  });

  it('returns null rather than substituting now() for a missing endpoint', () => {
    const metrics = incidentService.responseMetrics({ detected_at: '2026-07-01T08:00:00Z' });
    expect(metrics.time_to_contain_hours).toBeNull();
    expect(metrics.dwell_hours).toBeNull();
  });
});

describe('incidentService.notificationStatus', () => {
  it('reports no clock when notification is not required', () => {
    expect(incidentService.notificationStatus({ regulatory_notification_required: false }))
      .toEqual({ required: false });
  });

  it('reports a running clock with hours remaining', () => {
    const status = incidentService.notificationStatus({
      regulatory_notification_required: true,
      notification_deadline: '2026-07-31T12:00:00Z'
    }, new Date('2026-07-31T00:00:00Z'));
    expect(status.hours_remaining).toBe(12);
    expect(status.overdue).toBe(false);
  });

  it('reports overdue as a negative remainder, not clamped to zero', () => {
    const status = incidentService.notificationStatus({
      regulatory_notification_required: true,
      notification_deadline: '2026-07-30T00:00:00Z'
    }, new Date('2026-07-31T00:00:00Z'));
    expect(status.overdue).toBe(true);
    expect(status.hours_remaining).toBe(-24);
  });

  it('records whether a notification made its deadline', () => {
    expect(incidentService.notificationStatus({
      regulatory_notification_required: true,
      notification_deadline: '2026-07-04T08:00:00Z',
      regulator_notified_at: '2026-07-03T09:00:00Z'
    }).met_deadline).toBe(true);

    expect(incidentService.notificationStatus({
      regulatory_notification_required: true,
      notification_deadline: '2026-07-04T08:00:00Z',
      regulator_notified_at: '2026-07-09T09:00:00Z'
    }).met_deadline).toBe(false);
  });
});
