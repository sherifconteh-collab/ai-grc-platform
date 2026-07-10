// @tier: community
/**
 * Classroom mode – guided training scenarios.
 *
 * Scenarios are ordered step checklists pointing at real dashboard pages.
 * Rows with organization_id IS NULL are built-in global templates (seeded in
 * migration 118) and are immutable; instructors author org-local scenarios
 * and can view per-student progress.
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
  label: 'training',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
}));

const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);
const MAX_STEPS = 50;

function trimStr(val, maxLen = 255) {
  if (val === null || val === undefined) return null;
  return String(val).trim().slice(0, maxLen) || null;
}

/**
 * Validate a client-supplied steps array. Returns { value } (JSON string)
 * or { error }.
 */
function normalizeSteps(raw) {
  if (raw === undefined || raw === null) return { value: JSON.stringify([]) };
  if (!Array.isArray(raw)) return { error: 'steps must be an array' };
  if (raw.length > MAX_STEPS) return { error: `steps exceeds ${MAX_STEPS} entries` };

  const cleaned = [];
  for (const step of raw) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      return { error: 'each step must be an object with a title' };
    }
    const title = trimStr(step.title);
    if (!title) return { error: 'each step must have a title' };
    cleaned.push({
      title,
      description: trimStr(step.description, 2000),
      hint: trimStr(step.hint, 500),
      target_page: trimStr(step.target_page, 255)
    });
  }
  return { value: JSON.stringify(cleaned) };
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }
  return [];
}

/** Fetch a scenario visible to the org (own or global template). */
async function fetchVisibleScenario(scenarioId, orgId) {
  const result = await pool.query(
    `SELECT * FROM training_scenarios
     WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL)`,
    [scenarioId, orgId]
  );
  return result.rows[0] || null;
}

// ===========================================================================
// GET /training/scenarios — org scenarios + global templates, with progress
// ===========================================================================
router.get('/scenarios', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ts.*,
              (ts.organization_id IS NULL) AS is_template,
              p.completed_steps, p.started_at AS progress_started_at, p.completed_at
       FROM training_scenarios ts
       LEFT JOIN training_scenario_progress p
         ON p.scenario_id = ts.id AND p.user_id = $2 AND p.organization_id = $1
       WHERE (ts.organization_id = $1 OR ts.organization_id IS NULL)
         AND ts.is_active = true
       ORDER BY (ts.organization_id IS NULL) ASC, ts.created_at DESC`,
      [req.user.organization_id, req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'training.scenarios.list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load training scenarios' });
  }
});

// ===========================================================================
// POST /training/scenarios — create an org-local scenario (instructor)
// ===========================================================================
router.post('/scenarios', requirePermission('assessments.write'), async (req, res) => {
  try {
    const title = trimStr(req.body.title);
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const difficulty = trimStr(req.body.difficulty)?.toLowerCase() || 'beginner';
    if (!VALID_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        success: false,
        error: `difficulty must be one of: ${Array.from(VALID_DIFFICULTIES).join(', ')}`
      });
    }

    const steps = normalizeSteps(req.body.steps);
    if (steps.error) {
      return res.status(400).json({ success: false, error: steps.error });
    }

    const result = await pool.query(
      `INSERT INTO training_scenarios (
         organization_id, title, description, difficulty, steps, created_by
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [
        req.user.organization_id, title,
        trimStr(req.body.description, 5000), difficulty, steps.value, req.user.id
      ]
    );

    log('info', 'training.scenario.created', {
      scenarioId: result.rows[0].id,
      orgId: req.user.organization_id,
      userId: req.user.id
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'training.scenario.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create training scenario' });
  }
});

// ===========================================================================
// PUT /training/scenarios/:id — update an org-local scenario
// ===========================================================================
router.put('/scenarios/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scenario = await fetchVisibleScenario(req.params.id, orgId);
    if (!scenario) {
      return res.status(404).json({ success: false, error: 'Training scenario not found' });
    }
    if (scenario.organization_id === null) {
      return res.status(403).json({ success: false, error: 'Built-in scenario templates cannot be modified' });
    }

    const title = req.body.title !== undefined ? trimStr(req.body.title) : scenario.title;
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const difficulty = req.body.difficulty !== undefined
      ? trimStr(req.body.difficulty)?.toLowerCase()
      : scenario.difficulty;
    if (!VALID_DIFFICULTIES.has(difficulty)) {
      return res.status(400).json({
        success: false,
        error: `difficulty must be one of: ${Array.from(VALID_DIFFICULTIES).join(', ')}`
      });
    }

    let stepsValue = JSON.stringify(parseJsonArray(scenario.steps));
    if (req.body.steps !== undefined) {
      const steps = normalizeSteps(req.body.steps);
      if (steps.error) {
        return res.status(400).json({ success: false, error: steps.error });
      }
      stepsValue = steps.value;
    }

    const result = await pool.query(
      `UPDATE training_scenarios SET
         title = $3,
         description = $4,
         difficulty = $5,
         steps = $6::jsonb,
         is_active = $7,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        req.params.id, orgId, title,
        req.body.description !== undefined ? trimStr(req.body.description, 5000) : scenario.description,
        difficulty, stepsValue,
        req.body.is_active !== undefined ? Boolean(req.body.is_active) : scenario.is_active
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'training.scenario.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update training scenario' });
  }
});

// ===========================================================================
// DELETE /training/scenarios/:id — delete an org-local scenario
// ===========================================================================
router.delete('/scenarios/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scenario = await fetchVisibleScenario(req.params.id, orgId);
    if (!scenario) {
      return res.status(404).json({ success: false, error: 'Training scenario not found' });
    }
    if (scenario.organization_id === null) {
      return res.status(403).json({ success: false, error: 'Built-in scenario templates cannot be deleted' });
    }

    await pool.query(
      `DELETE FROM training_scenarios WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId]
    );

    log('info', 'training.scenario.deleted', {
      scenarioId: req.params.id,
      orgId,
      userId: req.user.id
    });

    res.json({ success: true, message: 'Training scenario deleted' });
  } catch (error) {
    log('error', 'training.scenario.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete training scenario' });
  }
});

// ===========================================================================
// POST /training/scenarios/:id/progress — upsert the caller's progress
// ===========================================================================
router.post('/scenarios/:id/progress', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scenario = await fetchVisibleScenario(req.params.id, orgId);
    if (!scenario) {
      return res.status(404).json({ success: false, error: 'Training scenario not found' });
    }

    const stepCount = parseJsonArray(scenario.steps).length;
    const raw = req.body.completed_steps;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ success: false, error: 'completed_steps must be an array of step indexes' });
    }
    const completedSteps = [...new Set(raw.map(n => Number(n)))]
      .filter(n => Number.isInteger(n) && n >= 0 && n < stepCount)
      .sort((a, b) => a - b);
    const isComplete = stepCount > 0 && completedSteps.length === stepCount;

    const result = await pool.query(
      `INSERT INTO training_scenario_progress (
         organization_id, scenario_id, user_id, completed_steps, completed_at
       ) VALUES ($1, $2, $3, $4::jsonb, CASE WHEN $5 THEN NOW() ELSE NULL END)
       ON CONFLICT (scenario_id, user_id) DO UPDATE SET
         completed_steps = EXCLUDED.completed_steps,
         completed_at = CASE WHEN $5 THEN COALESCE(training_scenario_progress.completed_at, NOW()) ELSE NULL END,
         updated_at = NOW()
       RETURNING *`,
      [orgId, req.params.id, req.user.id, JSON.stringify(completedSteps), isComplete]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'training.progress.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update progress' });
  }
});

// ===========================================================================
// GET /training/scenarios/:id/progress — instructor view of org progress
// ===========================================================================
router.get('/scenarios/:id/progress', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const scenario = await fetchVisibleScenario(req.params.id, orgId);
    if (!scenario) {
      return res.status(404).json({ success: false, error: 'Training scenario not found' });
    }

    const result = await pool.query(
      `SELECT p.*, u.first_name || ' ' || u.last_name AS user_name, u.email
       FROM training_scenario_progress p
       JOIN users u ON u.id = p.user_id
       WHERE p.scenario_id = $1 AND p.organization_id = $2
       ORDER BY p.updated_at DESC
       LIMIT 200`,
      [req.params.id, orgId]
    );

    res.json({
      success: true,
      data: {
        scenario_id: scenario.id,
        title: scenario.title,
        step_count: parseJsonArray(scenario.steps).length,
        participants: result.rows
      }
    });
  } catch (error) {
    log('error', 'training.progress.list_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load progress' });
  }
});

module.exports = router;
module.exports.normalizeSteps = normalizeSteps;
