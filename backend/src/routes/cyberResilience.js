// @tier: enterprise
/**
 * Cyber Resilience – BC/DR plans, tabletop/DR exercise tracking, and a
 * computed Cyber Resilience Score.
 *
 * Distinct from RMF (authorization posture) and from backup_logs (a
 * platform-admin DB-backup audit trail, migration 106) — this is the
 * org-facing operational-resilience program tracker that folds backup_logs
 * health into a single score alongside plan coverage, test cadence, and
 * RTO/RPO attainment.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');

// Three layers, in this specific order: (1) a cheap per-process IP-based
// limiter first, so unauthenticated requests are bounded before they reach
// authenticate's JWT/DB work (also the middleware CodeQL's static analysis
// can trace as guarding this router); (2) authenticate; (3) the org-scoped
// Redis-backed limiter, which needs req.user for its key and so must run
// after auth -- this is the real production control across instances.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
router.use(authenticate);
router.use(createRateLimiter({
  label: 'cyber-resilience',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
}));

const VALID_PLAN_TYPES = new Set([
  'incident_response', 'business_continuity', 'disaster_recovery', 'ransomware_playbook'
]);
const VALID_PLAN_STATUSES = new Set(['draft', 'active', 'under_review', 'retired']);
const VALID_TEST_TYPES = new Set(['tabletop', 'functional', 'full_scale']);
const VALID_OUTCOMES = new Set(['passed', 'partial', 'failed']);
const DEFAULT_TEST_CADENCE_DAYS = 365;

function trimStr(val, maxLen = 255) {
  if (val === null || val === undefined) return null;
  return String(val).trim().slice(0, maxLen) || null;
}

function toNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function toDateString(val) {
  const trimmed = trimStr(val, 10);
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

async function ensureSystemInOrg(systemId, orgId) {
  if (!systemId) return true;
  const result = await pool.query(
    `SELECT id FROM organization_systems WHERE id = $1 AND organization_id = $2`,
    [systemId, orgId]
  );
  return result.rows.length > 0;
}

/** Fetch a plan org-scoped; sends 404 and returns null when missing. */
async function fetchOrgPlan(req, res) {
  const result = await pool.query(
    `SELECT * FROM resilience_plans WHERE id = $1 AND organization_id = $2`,
    [req.params.id, req.user.organization_id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: 'Resilience plan not found' });
    return null;
  }
  return result.rows[0];
}

// ===========================================================================
// GET /resilience/plans — list plans for the org
// ===========================================================================
router.get('/plans', requirePermission('assessments.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rp.*,
              os.system_name,
              lt.test_date AS last_test_date, lt.outcome AS last_test_outcome,
              (rp.next_test_due IS NOT NULL AND rp.next_test_due < CURRENT_DATE) AS overdue
       FROM resilience_plans rp
       LEFT JOIN organization_systems os ON os.id = rp.system_id
       LEFT JOIN LATERAL (
         SELECT rt.test_date, rt.outcome
         FROM resilience_tests rt
         WHERE rt.resilience_plan_id = rp.id
         ORDER BY rt.test_date DESC
         LIMIT 1
       ) lt ON true
       WHERE rp.organization_id = $1
       ORDER BY rp.updated_at DESC`,
      [req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'resilience.plans.list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load resilience plans' });
  }
});

// ===========================================================================
// POST /resilience/plans — create a plan
// ===========================================================================
router.post('/plans', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const planType = trimStr(req.body.plan_type)?.toLowerCase();
    if (!planType || !VALID_PLAN_TYPES.has(planType)) {
      return res.status(400).json({
        success: false,
        error: `plan_type must be one of: ${Array.from(VALID_PLAN_TYPES).join(', ')}`
      });
    }

    const title = trimStr(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const status = trimStr(req.body.status)?.toLowerCase() || 'draft';
    if (!VALID_PLAN_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${Array.from(VALID_PLAN_STATUSES).join(', ')}`
      });
    }

    const systemId = trimStr(req.body.system_id);
    if (systemId && !(await ensureSystemInOrg(systemId, orgId))) {
      return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
    }

    const rtoTarget = toNumber(req.body.rto_target_hours);
    const rpoTarget = toNumber(req.body.rpo_target_hours);
    if (rtoTarget === undefined || rpoTarget === undefined) {
      return res.status(400).json({ success: false, error: 'rto_target_hours and rpo_target_hours must be numbers' });
    }

    const lastTestedDate = toDateString(req.body.last_tested_date);
    if (lastTestedDate === undefined) {
      return res.status(400).json({ success: false, error: 'last_tested_date must be formatted as YYYY-MM-DD' });
    }
    let nextTestDue = toDateString(req.body.next_test_due);
    if (nextTestDue === undefined) {
      return res.status(400).json({ success: false, error: 'next_test_due must be formatted as YYYY-MM-DD' });
    }
    if (!nextTestDue && lastTestedDate) {
      const computed = new Date(lastTestedDate);
      computed.setDate(computed.getDate() + DEFAULT_TEST_CADENCE_DAYS);
      nextTestDue = computed.toISOString().slice(0, 10);
    }

    const result = await pool.query(
      `INSERT INTO resilience_plans (
         organization_id, system_id, plan_type, title, description, status,
         rto_target_hours, rpo_target_hours, owner_id,
         last_tested_date, next_test_due, document_url, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
       RETURNING *`,
      [
        orgId, systemId, planType, title,
        trimStr(req.body.description, 5000), status,
        rtoTarget, rpoTarget, trimStr(req.body.owner_id),
        lastTestedDate, nextTestDue, trimStr(req.body.document_url, 2000), req.user.id
      ]
    );

    log('info', 'resilience.plan.created', {
      planId: result.rows[0].id,
      planType,
      orgId,
      userId: req.user.id
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'resilience.plan.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create resilience plan' });
  }
});

// ===========================================================================
// PUT /resilience/plans/:id — update a plan
// ===========================================================================
router.put('/plans/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const existing = await fetchOrgPlan(req, res);
    if (!existing) return;

    const planType = req.body.plan_type !== undefined
      ? trimStr(req.body.plan_type)?.toLowerCase()
      : existing.plan_type;
    if (!VALID_PLAN_TYPES.has(planType)) {
      return res.status(400).json({
        success: false,
        error: `plan_type must be one of: ${Array.from(VALID_PLAN_TYPES).join(', ')}`
      });
    }

    const status = req.body.status !== undefined
      ? trimStr(req.body.status)?.toLowerCase()
      : existing.status;
    if (!VALID_PLAN_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${Array.from(VALID_PLAN_STATUSES).join(', ')}`
      });
    }

    const title = req.body.title !== undefined ? trimStr(req.body.title) : existing.title;
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const systemId = req.body.system_id !== undefined ? trimStr(req.body.system_id) : existing.system_id;
    if (systemId && !(await ensureSystemInOrg(systemId, orgId))) {
      return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
    }

    const rtoTarget = req.body.rto_target_hours !== undefined ? toNumber(req.body.rto_target_hours) : existing.rto_target_hours;
    const rpoTarget = req.body.rpo_target_hours !== undefined ? toNumber(req.body.rpo_target_hours) : existing.rpo_target_hours;
    if (rtoTarget === undefined || rpoTarget === undefined) {
      return res.status(400).json({ success: false, error: 'rto_target_hours and rpo_target_hours must be numbers' });
    }

    const lastTestedDate = req.body.last_tested_date !== undefined
      ? toDateString(req.body.last_tested_date)
      : existing.last_tested_date;
    const nextTestDue = req.body.next_test_due !== undefined
      ? toDateString(req.body.next_test_due)
      : existing.next_test_due;
    if (lastTestedDate === undefined || nextTestDue === undefined) {
      return res.status(400).json({ success: false, error: 'dates must be formatted as YYYY-MM-DD' });
    }

    const result = await pool.query(
      `UPDATE resilience_plans SET
         system_id = $3, plan_type = $4, title = $5, description = $6, status = $7,
         rto_target_hours = $8, rpo_target_hours = $9, owner_id = $10,
         last_tested_date = $11, next_test_due = $12, document_url = $13,
         updated_by = $14, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id, orgId, systemId, planType, title,
        req.body.description !== undefined ? trimStr(req.body.description, 5000) : existing.description,
        status, rtoTarget, rpoTarget,
        req.body.owner_id !== undefined ? trimStr(req.body.owner_id) : existing.owner_id,
        lastTestedDate, nextTestDue,
        req.body.document_url !== undefined ? trimStr(req.body.document_url, 2000) : existing.document_url,
        req.user.id
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'resilience.plan.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update resilience plan' });
  }
});

// ===========================================================================
// DELETE /resilience/plans/:id — delete a plan
// ===========================================================================
router.delete('/plans/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM resilience_plans WHERE id = $1 AND organization_id = $2 RETURNING id, title`,
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Resilience plan not found' });
    }

    log('info', 'resilience.plan.deleted', {
      planId: req.params.id,
      orgId: req.user.organization_id,
      userId: req.user.id
    });

    res.json({ success: true, message: 'Resilience plan deleted' });
  } catch (error) {
    log('error', 'resilience.plan.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete resilience plan' });
  }
});

// ===========================================================================
// GET /resilience/plans/:id/tests — test history for a plan
// ===========================================================================
router.get('/plans/:id/tests', requirePermission('assessments.read'), async (req, res) => {
  try {
    const plan = await fetchOrgPlan(req, res);
    if (!plan) return;

    const result = await pool.query(
      `SELECT rt.*, u.first_name || ' ' || u.last_name AS created_by_name
       FROM resilience_tests rt
       LEFT JOIN users u ON u.id = rt.created_by
       WHERE rt.resilience_plan_id = $1 AND rt.organization_id = $2
       ORDER BY rt.test_date DESC`,
      [plan.id, req.user.organization_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'resilience.tests.list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load test history' });
  }
});

// ===========================================================================
// POST /resilience/plans/:id/tests — record a tabletop/DR test result
// ===========================================================================
router.post('/plans/:id/tests', requirePermission('assessments.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;

    await client.query('BEGIN');

    const planResult = await client.query(
      `SELECT * FROM resilience_plans WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [req.params.id, orgId]
    );
    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Resilience plan not found' });
    }
    const plan = planResult.rows[0];

    const testType = trimStr(req.body.test_type)?.toLowerCase();
    if (!testType || !VALID_TEST_TYPES.has(testType)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `test_type must be one of: ${Array.from(VALID_TEST_TYPES).join(', ')}`
      });
    }

    const scenario = trimStr(req.body.scenario, 2000);
    if (!scenario) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'scenario is required' });
    }

    const outcome = trimStr(req.body.outcome)?.toLowerCase();
    if (!outcome || !VALID_OUTCOMES.has(outcome)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `outcome must be one of: ${Array.from(VALID_OUTCOMES).join(', ')}`
      });
    }

    const testDate = toDateString(req.body.test_date);
    if (testDate === undefined) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'test_date must be formatted as YYYY-MM-DD' });
    }
    const resolvedTestDate = testDate || new Date().toISOString().slice(0, 10);
    const actualRto = toNumber(req.body.actual_rto_hours);
    const actualRpo = toNumber(req.body.actual_rpo_hours);
    if (actualRto === undefined || actualRpo === undefined) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'actual_rto_hours and actual_rpo_hours must be numbers' });
    }

    let remediationPoamId = trimStr(req.body.remediation_poam_id);
    if (remediationPoamId) {
      const poamCheck = await client.query(
        `SELECT id FROM poam_items WHERE id = $1 AND organization_id = $2`,
        [remediationPoamId, orgId]
      );
      if (poamCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'remediation_poam_id is invalid for this organization' });
      }
    }

    const participants = Array.isArray(req.body.participants)
      ? req.body.participants.map(p => String(p).trim().slice(0, 255)).filter(Boolean).slice(0, 100)
      : [];

    const inserted = await client.query(
      `INSERT INTO resilience_tests (
         organization_id, resilience_plan_id, test_type, scenario, test_date,
         participants, outcome, actual_rto_hours, actual_rpo_hours, findings,
         remediation_poam_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        orgId, plan.id, testType, scenario, resolvedTestDate,
        JSON.stringify(participants), outcome, actualRto, actualRpo,
        trimStr(req.body.findings, 5000), remediationPoamId, req.user.id
      ]
    );

    const nextTestDue = new Date(resolvedTestDate);
    nextTestDue.setDate(nextTestDue.getDate() + DEFAULT_TEST_CADENCE_DAYS);

    await client.query(
      `UPDATE resilience_plans SET
         last_tested_date = $3, next_test_due = $4, updated_by = $5, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [plan.id, orgId, resolvedTestDate, nextTestDue.toISOString().slice(0, 10), req.user.id]
    );

    await client.query('COMMIT');

    log('info', 'resilience.test.created', {
      planId: plan.id,
      testType,
      outcome,
      orgId,
      userId: req.user.id
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log('error', 'resilience.test.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to record resilience test' });
  } finally {
    client.release();
  }
});

// ===========================================================================
// GET /resilience/score — computed Cyber Resilience Score
// ===========================================================================
router.get('/score', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Component 1: plan coverage — % of active systems with an active plan.
    const coverage = await pool.query(
      `SELECT
         COUNT(*)::int AS total_systems,
         COUNT(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM resilience_plans rp
             WHERE rp.system_id = os.id AND rp.status = 'active'
           )
         )::int AS covered_systems
       FROM organization_systems os
       WHERE os.organization_id = $1 AND os.is_active = true`,
      [orgId]
    );
    const totalSystems = coverage.rows[0]?.total_systems || 0;
    const coveredSystems = coverage.rows[0]?.covered_systems || 0;
    const coverageScore = totalSystems > 0 ? (coveredSystems / totalSystems) * 100 : 0;

    // Component 2: test cadence — % of active plans tested within the last year.
    const cadence = await pool.query(
      `SELECT
         COUNT(*)::int AS total_plans,
         COUNT(*) FILTER (
           WHERE last_tested_date IS NOT NULL
             AND last_tested_date >= CURRENT_DATE - INTERVAL '365 days'
         )::int AS tested_recently
       FROM resilience_plans
       WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );
    const totalPlans = cadence.rows[0]?.total_plans || 0;
    const testedRecently = cadence.rows[0]?.tested_recently || 0;
    const cadenceScore = totalPlans > 0 ? (testedRecently / totalPlans) * 100 : 0;

    // Component 3: RTO/RPO attainment — most recent test per active plan met targets.
    const attainment = await pool.query(
      `SELECT
         COUNT(*)::int AS plans_with_tests,
         COUNT(*) FILTER (
           WHERE lt.actual_rto_hours <= rp.rto_target_hours
             AND lt.actual_rpo_hours <= rp.rpo_target_hours
         )::int AS plans_meeting_targets
       FROM resilience_plans rp
       JOIN LATERAL (
         SELECT actual_rto_hours, actual_rpo_hours
         FROM resilience_tests rt
         WHERE rt.resilience_plan_id = rp.id
           AND rt.actual_rto_hours IS NOT NULL
           AND rt.actual_rpo_hours IS NOT NULL
         ORDER BY rt.test_date DESC
         LIMIT 1
       ) lt ON true
       WHERE rp.organization_id = $1 AND rp.status = 'active'
         AND rp.rto_target_hours IS NOT NULL AND rp.rpo_target_hours IS NOT NULL`,
      [orgId]
    );
    const plansWithTests = attainment.rows[0]?.plans_with_tests || 0;
    const plansMeetingTargets = attainment.rows[0]?.plans_meeting_targets || 0;
    const attainmentScore = plansWithTests > 0 ? (plansMeetingTargets / plansWithTests) * 100 : 0;

    // Component 4: backup health — success rate from the existing backup_logs table.
    const backupHealth = await pool.query(
      `SELECT
         COUNT(*)::int AS total_backups,
         COUNT(*) FILTER (WHERE status = 'success')::int AS successful_backups
       FROM backup_logs
       WHERE started_at >= NOW() - INTERVAL '90 days'`
    );
    const totalBackups = backupHealth.rows[0]?.total_backups || 0;
    const successfulBackups = backupHealth.rows[0]?.successful_backups || 0;
    const backupScore = totalBackups > 0 ? (successfulBackups / totalBackups) * 100 : 0;

    const components = {
      plan_coverage: {
        score: Math.round(coverageScore),
        covered_systems: coveredSystems,
        total_systems: totalSystems
      },
      test_cadence: {
        score: Math.round(cadenceScore),
        tested_recently: testedRecently,
        total_active_plans: totalPlans
      },
      rto_rpo_attainment: {
        score: Math.round(attainmentScore),
        plans_meeting_targets: plansMeetingTargets,
        plans_with_tests: plansWithTests
      },
      backup_health: {
        score: Math.round(backupScore),
        successful_backups: successfulBackups,
        total_backups: totalBackups
      }
    };

    const overallScore = Math.round(
      (coverageScore + cadenceScore + attainmentScore + backupScore) / 4
    );

    res.json({
      success: true,
      data: {
        overall_score: Math.min(100, Math.max(0, overallScore)),
        components
      }
    });
  } catch (error) {
    log('error', 'resilience.score.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to compute resilience score' });
  }
});

module.exports = router;
