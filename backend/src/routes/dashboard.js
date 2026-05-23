// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { normalizeTier, tierLevel } = require('../config/tierPolicy');

router.use(authenticate);

const { getCached } = require('../utils/redisCache');
const DASHBOARD_CACHE_TTL_MS = Math.max(1000, parseInt(process.env.DASHBOARD_CACHE_TTL_MS || '30000', 10));
const DASHBOARD_CACHE_TTL_S = Math.ceil(DASHBOARD_CACHE_TTL_MS / 1000);

function toInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

// cw: prefix isolates dashboard keys from other apps sharing the same Redis instance
async function withDashboardCache(key, producer) {
  let isCached = true;
  const data = await getCached(`cw:dashboard:${key}`, DASHBOARD_CACHE_TTL_S, async () => {
    isCached = false;
    return await producer();
  });
  return { data, cached: isCached };
}

function getPeriodDays(period) {
  const normalized = String(period || '30d').toLowerCase();
  if (normalized === '7d') return 7;
  if (normalized === '90d') return 90;
  if (normalized === '1y') return 365;
  return 30;
}

async function queryDashboardStats(orgId) {
  const overallResult = await pool.query(`
    SELECT
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status IN ('implemented', 'verified') THEN ci.id END) as implemented,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as satisfied_via_crosswalk,
      COUNT(DISTINCT fc.id) as total_applicable
    FROM organization_frameworks of2
    JOIN framework_controls fc ON fc.framework_id = of2.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
  `, [orgId]);

  const overall = overallResult.rows[0] || {};
  const totalControls = toInt(overall.total_controls);
  const implemented = toInt(overall.implemented);
  const crosswalked = toInt(overall.satisfied_via_crosswalk);
  const compliancePercentage = totalControls > 0
    ? Math.round(((implemented + crosswalked) / totalControls) * 1000) / 10
    : 0;

  const frameworkResult = await pool.query(`
    SELECT
      f.id, f.name, f.code,
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status IN ('implemented', 'verified') THEN ci.id END) as implemented,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalked
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.id, f.name, f.code
    ORDER BY f.name
  `, [orgId]);

  const frameworks = frameworkResult.rows.map((fw) => {
    const total = toInt(fw.total_controls);
    const implementedCount = toInt(fw.implemented);
    const crosswalkedCount = toInt(fw.crosswalked);
    return {
      id: fw.id,
      name: fw.name,
      code: fw.code,
      totalControls: total,
      implemented: implementedCount,
      crosswalked: crosswalkedCount,
      compliancePercentage: total > 0
        ? Math.round(((implementedCount + crosswalkedCount) / total) * 1000) / 10
        : 0
    };
  });

  return {
    overall: {
      totalControls,
      implemented,
      satisfiedViaCrosswalk: crosswalked,
      totalApplicable: totalControls,
      compliancePercentage
    },
    frameworks
  };
}

async function queryPriorityActions(orgId) {
  const result = await pool.query(`
    SELECT fc.id, fc.control_id, fc.title, fc.priority, f.name as framework_name, f.code as framework_code,
           COALESCE(ci.status, 'not_started') as status
    FROM organization_frameworks of2
    JOIN framework_controls fc ON fc.framework_id = of2.framework_id
    JOIN frameworks f ON f.id = fc.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
      AND (ci.status IS NULL OR ci.status = 'not_started')
      AND fc.priority IN ('P1', 'high', 'critical')
    ORDER BY fc.priority, f.name
    LIMIT 20
  `, [orgId]);

  return result.rows;
}

async function queryRecentActivity(orgId, options = {}) {
  const limit = Math.min(Math.max(1, toInt(options.limit) || 20), 100);
  const offset = Math.max(0, toInt(options.offset) || 0);
  const eventType = options.eventType || null;

  const params = [orgId, limit, offset];
  let eventFilter = '';
  if (eventType) {
    params.push(eventType);
    eventFilter = `AND al.event_type = $${params.length}`;
  }

  const result = await pool.query(`
    SELECT al.id, al.event_type, al.resource_type, al.details, al.created_at,
           u.first_name, u.last_name, u.email
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.organization_id = $1
    ${eventFilter}
    ORDER BY al.created_at DESC
    LIMIT $2 OFFSET $3
  `, params);

  return result.rows;
}

async function queryImplementationsActivity(orgId, limit = 10) {
  const result = await pool.query(`
    SELECT al.id, al.event_type, al.details, al.created_at as changed_at,
           u.first_name || ' ' || u.last_name as changed_by_name,
           COALESCE(al.details->>'status', '') as new_status,
           COALESCE(al.details->>'old_status', '') as old_status,
           al.details->>'notes' as notes,
           fc.control_id as control_code, fc.title as control_title
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN framework_controls fc ON fc.id = al.resource_id
    WHERE al.organization_id = $1
      AND al.resource_type = 'control'
    ORDER BY al.created_at DESC
    LIMIT $2
  `, [orgId, limit]);

  return result.rows;
}

async function queryComplianceTrend(orgId, period = '30d') {
  const days = getPeriodDays(period);
  const result = await pool.query(`
    SELECT
      DATE(ci.created_at) as date,
      COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented,
      COUNT(DISTINCT ci.id) as total_changes
    FROM control_implementations ci
    WHERE ci.organization_id = $1
      AND ci.created_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE(ci.created_at)
    ORDER BY date
  `, [orgId, days.toString()]);

  return result.rows;
}

async function queryCrosswalkImpact(orgId) {
  const result = await pool.query(`
    SELECT
      f.name as framework_name, f.code as framework_code,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalk_count,
      COUNT(DISTINCT fc.id) as total_controls
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.name, f.code
    HAVING COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) > 0
    ORDER BY crosswalk_count DESC
  `, [orgId]);

  return result.rows;
}

function getRecommendations(dimensions) {
  const recs = [];
  for (const d of dimensions) {
    if (d.score < 30) {
      recs.push({ dimension: d.name, priority: 'critical', message: `${d.name} is very low (${d.score}%). Focus on improving ${d.description.toLowerCase()}.` });
    } else if (d.score < 60) {
      recs.push({ dimension: d.name, priority: 'medium', message: `${d.name} needs improvement (${d.score}%). Continue working on ${d.description.toLowerCase()}.` });
    }
  }
  return recs;
}

// Control health scoring constants (aligned with controlHealth.js)
const HEALTH_BASE_SCORES = {
  not_started: 10,
  in_progress: 35,
  needs_review: 20,
  implemented: 55,
  satisfied_via_crosswalk: 48,
  verified: 60,
  not_applicable: 40
};
const EVIDENCE_FRESH_DAYS = 30;
const EVIDENCE_AGING_DAYS = 90;
const EVIDENCE_OLD_DAYS = 180;
const EVIDENCE_FRESH_BONUS = 20;
const EVIDENCE_AGING_BONUS = 12;
const EVIDENCE_OLD_BONUS = 5;
const ASSESSMENT_SATISFIED_BONUS = 15;
const ASSESSMENT_NA_BONUS = 8;
const ASSESSMENT_DEFICIENCY_BONUS = 2;
const NON_COMPLIANT_PENALTY_PER_ITEM = 10;
const NON_COMPLIANT_PENALTY_CAP = 25;
const ADDITIONAL_IMPACT_PENALTY_PER_ITEM = 4;
const ADDITIONAL_IMPACT_PENALTY_CAP = 15;
const POAM_PENALTY_PER_ITEM = 4;
const POAM_PENALTY_CAP = 12;
const EXCEPTION_BONUS = 4;
const EXCEPTION_SCORE_CAP = 70;
const RATING_STRONG_THRESHOLD = 80;
const RATING_GOOD_THRESHOLD = 60;
const RATING_WATCH_THRESHOLD = 40;

function scoreControlForSummary(row) {
  const implStatus = String(row.implementation_status || 'not_started');
  let score = HEALTH_BASE_SCORES[implStatus] ?? HEALTH_BASE_SCORES.not_started;

  const lastEvidenceAt = row.last_evidence_at;
  if (lastEvidenceAt) {
    const evidenceAge = Math.max(0, Math.floor((Date.now() - new Date(lastEvidenceAt).getTime()) / (1000 * 60 * 60 * 24)));
    if (evidenceAge <= EVIDENCE_FRESH_DAYS) score += EVIDENCE_FRESH_BONUS;
    else if (evidenceAge <= EVIDENCE_AGING_DAYS) score += EVIDENCE_AGING_BONUS;
    else if (evidenceAge <= EVIDENCE_OLD_DAYS) score += EVIDENCE_OLD_BONUS;
  }

  const assessStatus = String(row.last_assessment_status || 'not_assessed');
  if (assessStatus === 'satisfied') score += ASSESSMENT_SATISFIED_BONUS;
  else if (assessStatus === 'not_applicable') score += ASSESSMENT_NA_BONUS;
  else if (assessStatus === 'other_than_satisfied') score += ASSESSMENT_DEFICIENCY_BONUS;

  const nonCompliantImpacts = Number(row.non_compliant_impacts || 0);
  const openControlImpacts = Number(row.open_control_impacts || 0);
  const openPoam = Number(row.open_poam_items || 0);

  const nonCompliantPenalty = Math.min(NON_COMPLIANT_PENALTY_CAP, nonCompliantImpacts * NON_COMPLIANT_PENALTY_PER_ITEM);
  const additionalImpactPenalty = Math.min(ADDITIONAL_IMPACT_PENALTY_CAP, Math.max(0, openControlImpacts - nonCompliantImpacts) * ADDITIONAL_IMPACT_PENALTY_PER_ITEM);
  score -= nonCompliantPenalty + additionalImpactPenalty;
  score -= Math.min(POAM_PENALTY_CAP, openPoam * POAM_PENALTY_PER_ITEM);

  const hasActiveException = row.has_active_exception === true;
  if (hasActiveException) score += EXCEPTION_BONUS;
  score = Math.max(0, Math.min(100, score));
  if (hasActiveException && score > EXCEPTION_SCORE_CAP) score = EXCEPTION_SCORE_CAP;

  let rating = 'weak';
  if (score >= RATING_STRONG_THRESHOLD) rating = 'strong';
  else if (score >= RATING_GOOD_THRESHOLD) rating = 'good';
  else if (score >= RATING_WATCH_THRESHOLD) rating = 'watch';

  return { score, rating };
}

async function queryMaturityScore(orgId) {
  const controlsResult = await pool.query(`
    SELECT
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalked,
      COUNT(DISTINCT CASE WHEN ci.status = 'in_progress' THEN ci.id END) as in_progress,
      COUNT(DISTINCT CASE WHEN ci.assigned_to IS NOT NULL THEN ci.id END) as assigned
    FROM organization_frameworks of2
    JOIN framework_controls fc ON fc.framework_id = of2.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
  `, [orgId]);

  const frameworksResult = await pool.query(
    'SELECT COUNT(*) as count FROM organization_frameworks WHERE organization_id = $1',
    [orgId]
  );

  const evidenceResult = await pool.query(
    'SELECT COUNT(*) as count FROM evidence WHERE organization_id = $1',
    [orgId]
  );

  const assessmentResult = await pool.query(`
    SELECT COUNT(*) as count FROM assessment_results ar
    JOIN assessment_procedures ap ON ap.id = ar.assessment_procedure_id
    JOIN framework_controls fc ON fc.id = ap.framework_control_id
    JOIN organization_frameworks of2 ON of2.framework_id = fc.framework_id
    WHERE of2.organization_id = $1
  `, [orgId]);

  const c = controlsResult.rows[0] || {};
  const total = Math.max(toInt(c.total_controls), 1);
  const implemented = toInt(c.implemented);
  const crosswalked = toInt(c.crosswalked);
  const assigned = toInt(c.assigned);
  const frameworks = toInt(frameworksResult.rows[0]?.count);
  const evidence = toInt(evidenceResult.rows[0]?.count);
  const assessments = toInt(assessmentResult.rows[0]?.count);

  const compliancePct = ((implemented + crosswalked) / total) * 100;
  const coveragePct = Math.min((assigned / total) * 100, 100);
  const evidencePct = Math.min((evidence / Math.max(implemented, 1)) * 50, 100);
  const assessmentPct = Math.min((assessments / Math.max(total * 0.1, 1)) * 100, 100);
  const frameworkPct = Math.min((frameworks / 3) * 100, 100);

  const dimensions = [
    { name: 'Implementation', score: Math.round(compliancePct), weight: 0.35, description: 'Percentage of controls implemented or crosswalked' },
    { name: 'Assignment', score: Math.round(coveragePct), weight: 0.15, description: 'Controls assigned to responsible owners' },
    { name: 'Evidence', score: Math.round(evidencePct), weight: 0.20, description: 'Evidence documentation collected per implemented control' },
    { name: 'Assessment', score: Math.round(assessmentPct), weight: 0.15, description: 'Assessment procedures completed and results recorded' },
    { name: 'Coverage', score: Math.round(frameworkPct), weight: 0.15, description: 'Compliance frameworks adopted by the organization' },
  ];

  const weightedScore = dimensions.reduce((sum, d) => sum + (d.score * d.weight), 0);

  let level;
  let label;
  if (weightedScore >= 80) { level = 5; label = 'Optimizing'; }
  else if (weightedScore >= 60) { level = 4; label = 'Managed'; }
  else if (weightedScore >= 40) { level = 3; label = 'Defined'; }
  else if (weightedScore >= 20) { level = 2; label = 'Repeatable'; }
  else { level = 1; label = 'Initial'; }

  const maturityScore = Math.round((weightedScore / 100) * 4 + 1);

  return {
    overallScore: Math.min(maturityScore, 5),
    overallPercentage: Math.round(weightedScore),
    level,
    label,
    dimensions,
    recommendations: getRecommendations(dimensions)
  };
}

// GET /dashboard/overview
router.get('/overview', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const period = String(req.query.period || '30d');
    const cacheKey = `${orgId}:overview:${period}:withMaturity`;
    const { data, cached } = await withDashboardCache(cacheKey, async () => {
      const statsPromise = queryDashboardStats(orgId);
      const activityPromise = queryImplementationsActivity(orgId, 10);
      const trendPromise = queryComplianceTrend(orgId, period);
      const maturityPromise = queryMaturityScore(orgId);

      const [stats, activity, trend, maturity] = await Promise.all([
        statsPromise,
        activityPromise,
        trendPromise,
        maturityPromise
      ]);

      return {
        stats,
        activity,
        trend,
        maturity
      };
    });

    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard overview' });
  }
});

// GET /dashboard/stats
router.get('/stats', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { data, cached } = await withDashboardCache(`${orgId}:stats`, () => queryDashboardStats(orgId));
    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dashboard stats' });
  }
});

// GET /dashboard/priority-actions
router.get('/priority-actions', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { data, cached } = await withDashboardCache(`${orgId}:priority-actions`, () => queryPriorityActions(orgId));
    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Priority actions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load priority actions' });
  }
});

// GET /dashboard/recent-activity
router.get('/recent-activity', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit) || 20));
    const offset = Math.max(0, toInt(req.query.offset) || 0);
    const eventType = req.query.event_type != null ? String(req.query.event_type) : null;
    const cacheKey = `${orgId}:recent-activity:${limit}:${offset}:${eventType || 'all'}`;
    const { data, cached } = await withDashboardCache(cacheKey, () =>
      queryRecentActivity(orgId, { limit, offset, eventType })
    );
    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to load recent activity' });
  }
});

// GET /dashboard/compliance-trend
router.get('/compliance-trend', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const period = String(req.query.period || '30d');
    const { data, cached } = await withDashboardCache(
      `${orgId}:trend:${period}`,
      () => queryComplianceTrend(orgId, period)
    );
    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Compliance trend error:', error);
    res.status(500).json({ success: false, error: 'Failed to load compliance trend' });
  }
});

// GET /dashboard/crosswalk-impact
router.get('/crosswalk-impact', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { data, cached } = await withDashboardCache(`${orgId}:crosswalk-impact`, () => queryCrosswalkImpact(orgId));
    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Crosswalk impact error:', error);
    res.status(500).json({ success: false, error: 'Failed to load crosswalk impact' });
  }
});

// GET /dashboard/crosswalked-controls — list individual controls satisfied via crosswalk
router.get('/crosswalked-controls', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(`
      SELECT
        fc.id, fc.control_id, fc.title, fc.description,
        f.name as framework_name, f.code as framework_code,
        ci.status, ci.notes, COALESCE(ci.implementation_date::timestamp, ci.created_at) as updated_at
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE ci.organization_id = $1
        AND ci.status = 'satisfied_via_crosswalk'
      ORDER BY f.code, fc.control_id
    `, [orgId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Crosswalked controls error:', error);
    res.status(500).json({ success: false, error: 'Failed to load crosswalked controls' });
  }
});

// GET /dashboard/maturity-score (Professional+ only)
router.get('/maturity-score', requireTier('enterprise'), requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { data, cached } = await withDashboardCache(`${orgId}:maturity-score`, () => queryMaturityScore(orgId));
    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Maturity score error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate maturity score' });
  }
});

// GET /dashboard/compliance-summary — per-framework compliance breakdown with status distribution
router.get('/compliance-summary', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { data, cached } = await withDashboardCache(`${orgId}:compliance-summary`, async () => {
      const result = await pool.query(`
        SELECT
          f.id AS framework_id,
          f.name AS framework_name,
          f.code AS framework_code,
          COUNT(DISTINCT fc.id) AS total_controls,
          COUNT(DISTINCT CASE WHEN ci.status IN ('implemented', 'verified') THEN ci.id END) AS implemented,
          COUNT(DISTINCT CASE WHEN ci.status IN ('in_progress', 'needs_review') THEN ci.id END) AS in_progress,
          COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) AS crosswalked,
          COUNT(DISTINCT CASE WHEN ci.status = 'not_applicable' THEN ci.id END) AS not_applicable,
          COUNT(DISTINCT CASE WHEN ci.status IS NULL OR ci.status = 'not_started' THEN fc.id END) AS not_started
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.name, f.code
        ORDER BY f.name
      `, [orgId]);

      const frameworks = result.rows.map((fw) => {
        const total = toInt(fw.total_controls);
        const impl = toInt(fw.implemented);
        const cross = toInt(fw.crosswalked);
        const inProg = toInt(fw.in_progress);
        const na = toInt(fw.not_applicable);
        const notStarted = toInt(fw.not_started);
        const compliant = impl + cross;
        return {
          frameworkId: fw.framework_id,
          frameworkName: fw.framework_name,
          frameworkCode: fw.framework_code,
          totalControls: total,
          implemented: impl,
          inProgress: inProg,
          crosswalked: cross,
          notApplicable: na,
          notStarted: notStarted,
          compliancePercentage: total > 0
            ? Math.round((compliant / total) * 1000) / 10
            : 0,
          statusDistribution: {
            implemented: impl,
            in_progress: inProg,
            satisfied_via_crosswalk: cross,
            not_applicable: na,
            not_started: notStarted
          }
        };
      });

      const totalControls = frameworks.reduce((s, fw) => s + fw.totalControls, 0);
      const totalCompliant = frameworks.reduce((s, fw) => s + fw.implemented + fw.crosswalked, 0);

      return {
        overallCompliancePercentage: totalControls > 0
          ? Math.round((totalCompliant / totalControls) * 1000) / 10
          : 0,
        totalFrameworks: frameworks.length,
        totalControls,
        totalCompliant,
        frameworks
      };
    });

    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Compliance summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to load compliance summary' });
  }
});

// GET /dashboard/control-health-summary — aggregate control health distribution
router.get('/control-health-summary', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { data, cached } = await withDashboardCache(`${orgId}:control-health-summary`, async () => {
      const result = await pool.query(`
        SELECT
          fc.id,
          COALESCE(ci.status, 'not_started') AS implementation_status,
          MAX(e.created_at) AS last_evidence_at,
          latest_ar.status AS last_assessment_status,
          COUNT(DISTINCT vw.id) FILTER (WHERE vw.action_status IN ('open','in_progress'))::int AS open_control_impacts,
          COUNT(DISTINCT vw.id) FILTER (
            WHERE vw.action_status IN ('open','in_progress')
              AND vw.control_effect = 'non_compliant'
          )::int AS non_compliant_impacts,
          COUNT(DISTINCT p.id) FILTER (
            WHERE p.status IN ('open','in_progress','pending_review')
          )::int AS open_poam_items,
          BOOL_OR(
            ce.status = 'active'
            AND (ce.expires_at IS NULL OR ce.expires_at >= CURRENT_DATE)
          ) AS has_active_exception
        FROM organization_frameworks ofw
        JOIN frameworks f ON f.id = ofw.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci
          ON ci.organization_id = ofw.organization_id
         AND ci.control_id = fc.id
        LEFT JOIN evidence_control_links ecl ON ecl.control_id = fc.id
        LEFT JOIN evidence e
          ON e.id = ecl.evidence_id
         AND e.organization_id = ofw.organization_id
        LEFT JOIN vulnerability_control_work_items vw
          ON vw.organization_id = ofw.organization_id
         AND vw.framework_control_id = fc.id
        LEFT JOIN poam_items p
          ON p.organization_id = ofw.organization_id
         AND p.control_id = fc.id
        LEFT JOIN control_exceptions ce
          ON ce.organization_id = ofw.organization_id
         AND ce.control_id = fc.id
        LEFT JOIN LATERAL (
          SELECT ar2.status
          FROM assessment_procedures ap2
          JOIN assessment_results ar2 ON ar2.assessment_procedure_id = ap2.id
          WHERE ap2.framework_control_id = fc.id
            AND ar2.organization_id = $1
          ORDER BY COALESCE(ar2.assessed_at, ar2.updated_at, ar2.created_at) DESC
          LIMIT 1
        ) latest_ar ON true
        WHERE ofw.organization_id = $1
        GROUP BY fc.id, ci.status, latest_ar.status
      `, [orgId]);

      let strong = 0, good = 0, watch = 0, weak = 0;
      let totalScore = 0;
      for (const row of result.rows) {
        const health = scoreControlForSummary(row);
        totalScore += health.score;
        if (health.rating === 'strong') strong++;
        else if (health.rating === 'good') good++;
        else if (health.rating === 'watch') watch++;
        else weak++;
      }

      const total = result.rows.length;
      return {
        total,
        strong,
        good,
        watch,
        weak,
        averageScore: total > 0 ? Number((totalScore / total).toFixed(1)) : 0
      };
    });

    res.json({ success: true, data, cached });
  } catch (error) {
    console.error('Control health summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to load control health summary' });
  }
});

// GET /dashboard/cache-metrics — dashboard cache configuration
router.get('/cache-metrics', requirePermission('dashboard.read'), async (req, res) => {
  res.json({
    success: true,
    data: {
      ttlMs: DASHBOARD_CACHE_TTL_MS,
      backend: (process.env.REDIS_URL || process.env.REDIS_HOST) ? 'redis' : 'none'
    }
  });
});

module.exports = router;
