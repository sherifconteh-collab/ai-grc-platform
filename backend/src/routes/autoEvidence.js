// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'auto-evidence-route' }));

const AVAILABLE_SOURCES = [
  { type: 'splunk', name: 'Splunk', enabled: false },
  { type: 'microsoft_sentinel', name: 'Microsoft Sentinel', enabled: false },
  { type: 'aws_cloudtrail', name: 'AWS CloudTrail', enabled: false },
  { type: 'crowdstrike', name: 'CrowdStrike', enabled: false },
  { type: 'jira', name: 'Jira', enabled: false },
  { type: 'servicenow', name: 'ServiceNow', enabled: false },
  { type: 'github', name: 'GitHub', enabled: false },
  { type: 'connector', name: 'Custom Connector', enabled: false }
];

// GET /sources - Static list of available source types
router.get('/sources', async (_req, res) => {
  try {
    res.json({ success: true, data: AVAILABLE_SOURCES });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /rules - List all rules for the org
router.get('/rules', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT id, name, description, source_type, source_config, schedule,
              control_ids, tags, enabled, last_run_at, created_at, updated_at
       FROM auto_evidence_rules WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /rules - Create rule
router.post('/rules', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, description, source_type, source_config, schedule, control_ids, tags, enabled } = req.body;
    const result = await pool.query(
      `INSERT INTO auto_evidence_rules
        (organization_id, name, description, source_type, source_config, schedule,
         control_ids, tags, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [orgId, name, description, source_type, JSON.stringify(source_config || {}), schedule,
       control_ids || [], tags || [], enabled !== false]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /rules/:id - Update rule fields
router.patch('/rules/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const allowed = ['name', 'description', 'source_type', 'source_config', 'schedule', 'control_ids', 'tags', 'enabled'];
    const setClauses = [];
    const values = [req.params.id, orgId];
    let paramIdx = 3;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        const val = (field === 'source_config') ? JSON.stringify(req.body[field]) : req.body[field];
        setClauses.push(`${field} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = NOW()');
    const result = await pool.query(
      `UPDATE auto_evidence_rules SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /rules/:id - Delete rule
router.delete('/rules/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM auto_evidence_rules WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, data: { id: result.rows[0].id, message: 'Rule deleted' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /rules/:id/run - Stub: trigger rule execution
router.post('/rules/:id/run', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `UPDATE auto_evidence_rules SET last_run_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [req.params.id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, data: { rule_id: result.rows[0].id, message: 'Rule execution queued', collected: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
