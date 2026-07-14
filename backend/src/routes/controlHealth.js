// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

function daysSince(dateValue) {
  if (!dateValue) return null;
  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return null;
  const now = Date.now();
  return Math.max(0, Math.floor((now - dt.getTime()) / (1000 * 60 * 60 * 24)));
}

function scoreControl(row) {
  const implStatus = String(row.implementation_status || 'not_started');
  const baseByStatus = {
    not_started: 10,
    in_progress: 35,
    needs_review: 20,
    implemented: 55,
    satisfied_via_crosswalk: 48,
    verified: 60,
    not_applicable: 40
  };
  let score = baseByStatus[implStatus] ?? 10;
  const factors = [];

  // Evidence freshness
  const evidenceAge = daysSince(row.last_evidence_at);
  if (evidenceAge === null) {
    factors.push({ key: 'evidence', impact: 0, detail: 'No linked evidence' });
  } else if (evidenceAge <= 30) {
    score += 20;
    factors.push({ key: 'evidence', impact: 20, detail: `Fresh evidence (${evidenceAge}d)` });
  } else if (evidenceAge <= 90) {
    score += 12;
    factors.push({ key: 'evidence', impact: 12, detail: `Aging evidence (${evidenceAge}d)` });
  } else if (evidenceAge <= 180) {
    score += 5;
    factors.push({ key: 'evidence', impact: 5, detail: `Old evidence (${evidenceAge}d)` });
  } else {
    factors.push({ key: 'evidence', impact: 0, detail: `Stale evidence (${evidenceAge}d)` });
  }

  // Assessment signal
  const assessStatus = String(row.last_assessment_status || 'not_assessed');
  if (assessStatus === 'satisfied') {
    score += 15;
    factors.push({ key: 'assessment', impact: 15, detail: 'Latest assessment satisfied' });
  } else if (assessStatus === 'not_applicable') {
    score += 8;
    factors.push({ key: 'assessment', impact: 8, detail: 'Assessment marked not applicable' });
  } else if (assessStatus === 'other_than_satisfied') {
    score += 2;
    factors.push({ key: 'assessment', impact: 2, detail: 'Assessment found deficiencies' });
  } else {
    factors.push({ key: 'assessment', impact: 0, detail: 'No assessment history' });
  }

  // Vulnerability/control workflow penalties
  const openControlImpacts = Number(row.open_control_impacts || 0);
  const nonCompliantImpacts = Number(row.non_compliant_impacts || 0);
  const openPoam = Number(row.open_poam_items || 0);

  const impactPenalty = Math.min(25, nonCompliantImpacts * 10) + Math.min(15, Math.max(0, openControlImpacts - nonCompliantImpacts) * 4);
  if (impactPenalty > 0) {
    score -= impactPenalty;
    factors.push({ key: 'vulnerabilities', impact: -impactPenalty, detail: `${openControlImpacts} open impact items` });
  }

  const poamPenalty = Math.min(12, openPoam * 4);
  if (poamPenalty > 0) {
    score -= poamPenalty;
    factors.push({ key: 'poam', impact: -poamPenalty, detail: `${openPoam} open POA&M items` });
  }

  // Active exception adjusts score but caps trust level.
  const hasActiveException = row.has_active_exception === true;
  if (hasActiveException) {
    score += 4;
    factors.push({ key: 'exception', impact: 4, detail: 'Active approved exception present' });
  }

  score = Math.max(0, Math.min(100, score));
  if (hasActiveException && score > 70) {
    score = 70;
  }

  let rating = 'weak';
  if (score >= 80) rating = 'strong';
  else if (score >= 60) rating = 'good';
  else if (score >= 40) rating = 'watch';

  return { score, rating, factors };
}

async function fetchControlRows(orgId, specificControlId = null) {
  const params = [orgId];
  let whereSpecific = '';
  if (specificControlId) {
    params.push(specificControlId);
    whereSpecific = `AND fc.id = $2`;
  }

  // Each related table is joined via a LATERAL subquery scoped to fc.id (and
  // org) rather than a direct one-to-many JOIN. This keeps the aggregates
  // (evidence recency, impact counts, POA&M counts, exception flag)
  // independent of one another — a direct multi-JOIN + GROUP BY approach
  // cross-multiplies rows whenever a control has more than one row in more
  // than one of these tables, inflating COUNT(...) FILTER(...) results.
  const result = await pool.query(
    `SELECT
       fc.id,
       fc.control_id,
       fc.title,
       f.code AS framework_code,
       COALESCE(ci.status, 'not_started') AS implementation_status,
       evstats.last_evidence_at,
       assessstats.last_assessed_at,
       assessstats.last_assessment_status,
       COALESCE(vwstats.open_control_impacts, 0) AS open_control_impacts,
       COALESCE(vwstats.non_compliant_impacts, 0) AS non_compliant_impacts,
       COALESCE(poamstats.open_poam_items, 0) AS open_poam_items,
       COALESCE(excstats.has_active_exception, false) AS has_active_exception
     FROM organization_frameworks ofw
     JOIN frameworks f ON f.id = ofw.framework_id
     JOIN framework_controls fc ON fc.framework_id = f.id
     LEFT JOIN control_implementations ci
       ON ci.organization_id = ofw.organization_id
      AND ci.control_id = fc.id
     LEFT JOIN LATERAL (
       SELECT MAX(e.created_at) AS last_evidence_at
       FROM evidence_control_links ecl
       JOIN evidence e
         ON e.id = ecl.evidence_id
        AND e.organization_id = ofw.organization_id
       WHERE ecl.control_id = fc.id
     ) evstats ON true
     LEFT JOIN LATERAL (
       SELECT
         ar.assessed_at AS last_assessed_at,
         ar.status AS last_assessment_status
       FROM assessment_procedures ap
       JOIN assessment_results ar
         ON ar.assessment_procedure_id = ap.id
        AND ar.organization_id = ofw.organization_id
       WHERE ap.framework_control_id = fc.id
       ORDER BY COALESCE(ar.assessed_at, ar.updated_at, ar.created_at) DESC
       LIMIT 1
     ) assessstats ON true
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE vw.action_status IN ('open','in_progress'))::int AS open_control_impacts,
         COUNT(*) FILTER (
           WHERE vw.action_status IN ('open','in_progress')
             AND vw.control_effect = 'non_compliant'
         )::int AS non_compliant_impacts
       FROM vulnerability_control_work_items vw
       WHERE vw.organization_id = ofw.organization_id
         AND vw.framework_control_id = fc.id
     ) vwstats ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (
         WHERE p.status IN ('open','in_progress','pending_review')
       )::int AS open_poam_items
       FROM poam_items p
       WHERE p.organization_id = ofw.organization_id
         AND p.control_id = fc.id
     ) poamstats ON true
     LEFT JOIN LATERAL (
       SELECT BOOL_OR(
         ce.status = 'active'
         AND (ce.expires_at IS NULL OR ce.expires_at >= CURRENT_DATE)
       ) AS has_active_exception
       FROM control_exceptions ce
       WHERE ce.organization_id = ofw.organization_id
         AND ce.control_id = fc.id
     ) excstats ON true
     WHERE ofw.organization_id = $1
     ${whereSpecific}`,
    params
  );
  return result.rows;
}

// GET /api/v1/control-health
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const rows = await fetchControlRows(orgId);
    const scored = rows.map((row) => ({
      ...row,
      health: scoreControl(row)
    }));

    const summary = {
      total: scored.length,
      strong: scored.filter((r) => r.health.rating === 'strong').length,
      good: scored.filter((r) => r.health.rating === 'good').length,
      watch: scored.filter((r) => r.health.rating === 'watch').length,
      weak: scored.filter((r) => r.health.rating === 'weak').length,
      avg_score: scored.length
        ? Number((scored.reduce((acc, row) => acc + row.health.score, 0) / scored.length).toFixed(1))
        : 0
    };

    res.json({
      success: true,
      data: {
        summary,
        controls: scored
      }
    });
  } catch (error) {
    console.error('Control health list error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute control health' });
  }
});

// GET /api/v1/control-health/:controlId
router.get('/:controlId', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const controlId = req.params.controlId;
    const rows = await fetchControlRows(orgId, controlId);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control not found for organization framework selection' });
    }

    const row = rows[0];
    const scored = { ...row, health: scoreControl(row) };
    res.json({ success: true, data: scored });
  } catch (error) {
    console.error('Control health detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute control health detail' });
  }
});

module.exports = router;
