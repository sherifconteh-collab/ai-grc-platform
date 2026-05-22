// @tier: enterprise
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { requireProEdition } = require('../middleware/edition');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { log } = require('../utils/logger');

router.use(authenticate);
router.use(requireProEdition('externalAi'));
router.use(requireTier('enterprise'));

const rateLimiter = createOrgRateLimiter({ label: 'ai-monitoring', max: 120, windowMs: 15 * 60 * 1000 });
router.use(rateLimiter);

// GET /ai/monitoring/dashboard
router.get('/dashboard', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const [rules, events, coverage] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) FROM ai_monitoring_rules WHERE organization_id = $1 AND is_enabled = true',
        [orgId]
      ),
      pool.query(
        "SELECT COUNT(*) FROM ai_monitoring_events WHERE organization_id = $1 AND status = 'open'",
        [orgId]
      ),
      pool.query(
        'SELECT COUNT(DISTINCT ai_agent_id) FROM ai_monitoring_rules WHERE organization_id = $1 AND is_enabled = true',
        [orgId]
      ),
    ]);
    res.json({
      success: true,
      data: {
        active_rules: parseInt(rules.rows[0].count, 10),
        open_events: parseInt(events.rows[0].count, 10),
        monitored_agents: parseInt(coverage.rows[0].count, 10),
      },
    });
  } catch (error) {
    log('error', 'aiMonitoring.dashboard.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai/monitoring/coverage
router.get('/coverage', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const [rules, events, agents] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) FROM ai_monitoring_rules WHERE organization_id = $1 AND is_enabled = true',
        [orgId]
      ),
      pool.query(
        "SELECT COUNT(*) FROM ai_monitoring_events WHERE organization_id = $1 AND status = 'open'",
        [orgId]
      ),
      pool.query(
        'SELECT COUNT(DISTINCT ai_agent_id) FROM ai_monitoring_rules WHERE organization_id = $1 AND is_enabled = true',
        [orgId]
      ),
    ]);
    res.json({
      success: true,
      data: {
        active_rules: parseInt(rules.rows[0].count, 10),
        open_events: parseInt(events.rows[0].count, 10),
        monitored_agents: parseInt(agents.rows[0].count, 10),
      },
    });
  } catch (error) {
    log('error', 'aiMonitoring.coverage.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai/monitoring/rules
router.get('/rules', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const result = await pool.query(
      'SELECT * FROM ai_monitoring_rules WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [orgId, limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'aiMonitoring.rules.list.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai/monitoring/rules
router.post('/rules', requirePermission('ai.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { rule_name, rule_type, description, ai_agent_id, metric_name, threshold_value, threshold_operator, alert_severity } = req.body;
    if (!rule_name || !rule_type) {
      return res.status(400).json({ error: 'rule_name and rule_type are required' });
    }
    const VALID_TYPES = ['threshold', 'pattern', 'anomaly', 'policy_violation'];
    if (!VALID_TYPES.includes(rule_type)) {
      return res.status(400).json({ error: `rule_type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const result = await pool.query(
      `INSERT INTO ai_monitoring_rules
         (organization_id, rule_name, rule_type, description, ai_agent_id, metric_name,
          threshold_value, threshold_operator, alert_severity, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, rule_name, rule_type, description || null, ai_agent_id || null,
       metric_name || null, threshold_value || null, threshold_operator || null,
       alert_severity || 'medium', req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiMonitoring.rules.create.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /ai/monitoring/rules/:id
router.put('/rules/:id', requirePermission('ai.write'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.organization_id;
    const existing = await pool.query(
      'SELECT id FROM ai_monitoring_rules WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Monitoring rule not found' });

    const allowed = ['rule_name','rule_type','description','ai_agent_id','metric_name',
                     'threshold_value','threshold_operator','alert_severity','is_enabled',
                     'block_on_violation','require_human_review'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in req.body) {
        updates.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
    values.push(id, orgId);
    const result = await pool.query(
      `UPDATE ai_monitoring_rules SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiMonitoring.rules.update.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /ai/monitoring/rules/:id
router.delete('/rules/:id', requirePermission('ai.write'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM ai_monitoring_rules WHERE id = $1 AND organization_id = $2 RETURNING id',
      [req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Monitoring rule not found' });
    res.json({ success: true });
  } catch (error) {
    log('error', 'aiMonitoring.rules.delete.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai/monitoring/events
router.get('/events', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { rule_id, severity, status, ai_agent_id } = req.query;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const conditions = ['organization_id = $1'];
    const values = [orgId];
    let idx = 2;

    if (rule_id) { conditions.push(`rule_id = $${idx++}`); values.push(rule_id); }
    if (severity) { conditions.push(`severity = $${idx++}`); values.push(severity); }
    if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
    if (ai_agent_id) { conditions.push(`ai_agent_id = $${idx++}`); values.push(ai_agent_id); }

    values.push(limit);
    const result = await pool.query(
      `SELECT * FROM ai_monitoring_events WHERE ${conditions.join(' AND ')}
       ORDER BY detected_at DESC LIMIT $${idx}`,
      values
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'aiMonitoring.events.list.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai/monitoring/events/:id/review
router.post('/events/:id/review', requirePermission('ai.write'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE ai_monitoring_events
       SET reviewed = true, reviewed_by = $1, reviewed_at = NOW(), status = 'acknowledged'
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [req.user.id, req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiMonitoring.events.review.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai/monitoring/events/:id/resolve
router.post('/events/:id/resolve', requirePermission('ai.write'), async (req, res) => {
  try {
    const { resolution_notes } = req.body || {};
    const result = await pool.query(
      `UPDATE ai_monitoring_events
       SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), resolution_notes = $2
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [req.user.id, resolution_notes || null, req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'aiMonitoring.events.resolve.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /ai/monitoring/baselines/:aiAgentId
router.get('/baselines/:aiAgentId', requirePermission('ai.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT rule_id, metric_name, AVG(metric_value) AS baseline_avg, STDDEV(metric_value) AS baseline_stddev,
              COUNT(*) AS sample_count, MAX(detected_at) AS last_updated
       FROM ai_monitoring_events
       WHERE organization_id = $1 AND ai_agent_id = $2 AND metric_value IS NOT NULL
       GROUP BY rule_id, metric_name`,
      [orgId, req.params.aiAgentId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'aiMonitoring.baselines.get.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai/monitoring/baselines/:aiAgentId/calculate
router.post('/baselines/:aiAgentId/calculate', requirePermission('ai.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT metric_name, AVG(metric_value) AS baseline_avg, STDDEV(metric_value) AS baseline_stddev,
              COUNT(*) AS sample_count
       FROM ai_monitoring_events
       WHERE organization_id = $1 AND ai_agent_id = $2 AND metric_value IS NOT NULL
         AND detected_at > NOW() - INTERVAL '30 days'
       GROUP BY metric_name`,
      [orgId, req.params.aiAgentId]
    );
    res.json({ success: true, data: { baselines: result.rows, calculated_at: new Date() } });
  } catch (error) {
    log('error', 'aiMonitoring.baselines.calculate.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /ai/monitoring/aiboms/:aibomId/enable
router.post('/aiboms/:aibomId/enable', requirePermission('ai.write'), async (req, res) => {
  try {
    res.json({ success: true, data: { aibom_id: req.params.aibomId, continuous_monitoring: true } });
  } catch (error) {
    log('error', 'aiMonitoring.aiboms.enable.failed', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
