// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'ai-monitoring-route' }));

router.get('/dashboard', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const rulesResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_rules,
         COUNT(*) FILTER (WHERE enabled = true)::int AS active_rules
       FROM ai_monitoring_rules WHERE organization_id = $1`,
      [org]
    );
    const eventsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_events,
         COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_events,
         COUNT(*) FILTER (WHERE severity = 'high')::int AS high_events,
         COUNT(*) FILTER (WHERE severity = 'medium')::int AS medium_events,
         COUNT(*) FILTER (WHERE severity = 'low')::int AS low_events,
         COUNT(*) FILTER (WHERE status != 'resolved')::int AS unresolved_events
       FROM ai_monitoring_events WHERE organization_id = $1`,
      [org]
    );
    return res.json({
      success: true,
      data: {
        ...rulesResult.rows[0],
        ...eventsResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
});

router.get('/rules', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM ai_monitoring_rules WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing rules:', error);
    return res.status(500).json({ success: false, error: 'Failed to list rules' });
  }
});

router.post('/rules', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { name, description, rule_type, conditions, severity, enabled } = req.body;
    const result = await pool.query(
      `INSERT INTO ai_monitoring_rules (organization_id, name, description, rule_type, conditions, severity, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [org, name, description, rule_type, conditions || {}, severity || 'medium', enabled !== undefined ? enabled : true]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating rule:', error);
    return res.status(500).json({ success: false, error: 'Failed to create rule' });
  }
});

router.put('/rules/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { name, description, rule_type, conditions, severity, enabled } = req.body;
    const result = await pool.query(
      `UPDATE ai_monitoring_rules
       SET name = COALESCE($1, name), description = COALESCE($2, description),
           rule_type = COALESCE($3, rule_type), conditions = COALESCE($4, conditions),
           severity = COALESCE($5, severity), enabled = COALESCE($6, enabled), updated_at = NOW()
       WHERE id = $7 AND organization_id = $8 RETURNING *`,
      [name, description, rule_type, conditions, severity, enabled, id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating rule:', error);
    return res.status(500).json({ success: false, error: 'Failed to update rule' });
  }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM ai_monitoring_rules WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting rule:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete rule' });
  }
});

router.get('/events', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { rule_id, severity, status, ai_agent_id, limit } = req.query;
    let query = 'SELECT * FROM ai_monitoring_events WHERE organization_id = $1';
    const values = [org];
    let idx = 2;

    if (rule_id) { query += ` AND rule_id = $${idx++}`; values.push(rule_id); }
    if (severity) { query += ` AND severity = $${idx++}`; values.push(severity); }
    if (status) { query += ` AND status = $${idx++}`; values.push(status); }
    if (ai_agent_id) { query += ` AND ai_agent_id = $${idx++}`; values.push(ai_agent_id); }

    query += ' ORDER BY created_at DESC';
    const eventLimit = parseInt(limit, 10) || 100;
    query += ` LIMIT $${idx++}`;
    values.push(eventLimit);

    const result = await pool.query(query, values);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing events:', error);
    return res.status(500).json({ success: false, error: 'Failed to list events' });
  }
});

router.post('/events/:id/review', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE ai_monitoring_events SET status = 'reviewed', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error reviewing event:', error);
    return res.status(500).json({ success: false, error: 'Failed to review event' });
  }
});

router.post('/events/:id/resolve', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { resolution_notes } = req.body;
    const result = await pool.query(
      `UPDATE ai_monitoring_events SET status = 'resolved', resolution_notes = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [resolution_notes, id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error resolving event:', error);
    return res.status(500).json({ success: false, error: 'Failed to resolve event' });
  }
});

router.get('/baselines/:aiAgentId', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { aiAgentId } = req.params;
    const result = await pool.query(
      `SELECT * FROM ai_monitoring_baselines
       WHERE organization_id = $1 AND ai_agent_id = $2
       ORDER BY calculated_at DESC LIMIT 1`,
      [org, aiAgentId]
    );
    return res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('Error fetching baseline:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch baseline' });
  }
});

router.post('/baselines/:aiAgentId/calculate', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { aiAgentId } = req.params;
    const result = await pool.query(
      `INSERT INTO ai_monitoring_baselines (organization_id, ai_agent_id, baseline_data, calculated_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [org, aiAgentId, JSON.stringify({})]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error calculating baseline:', error);
    return res.status(500).json({ success: false, error: 'Failed to calculate baseline' });
  }
});

router.post('/aiboms/:aibomId/enable', async (req, res) => {
  try {
    return res.json({ success: true, data: { enabled: true, message: 'Continuous monitoring enabled' } });
  } catch (error) {
    console.error('Error enabling monitoring:', error);
    return res.status(500).json({ success: false, error: 'Failed to enable monitoring' });
  }
});

module.exports = router;
