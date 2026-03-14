// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'rmf-route' }));

const VALID_RMF_STEPS = ['prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor'];

router.get('/summary', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total_packages,
         jsonb_object_agg(COALESCE(current_step, 'unknown'), step_count) AS by_step,
         jsonb_object_agg(COALESCE(status, 'unknown'), status_count) AS by_status
       FROM (
         SELECT current_step, COUNT(*)::int AS step_count, NULL AS status, NULL::int AS status_count
         FROM rmf_packages WHERE organization_id = $1 GROUP BY current_step
         UNION ALL
         SELECT NULL, NULL, status, COUNT(*)::int
         FROM rmf_packages WHERE organization_id = $1 GROUP BY status
       ) sub, (SELECT COUNT(*)::int AS total_packages FROM rmf_packages WHERE organization_id = $1) t`,
      [org]
    );
    // Simpler approach
    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM rmf_packages WHERE organization_id = $1',
      [org]
    );
    const stepResult = await pool.query(
      'SELECT current_step, COUNT(*)::int AS count FROM rmf_packages WHERE organization_id = $1 GROUP BY current_step',
      [org]
    );
    const statusResult = await pool.query(
      'SELECT status, COUNT(*)::int AS count FROM rmf_packages WHERE organization_id = $1 GROUP BY status',
      [org]
    );

    const byStep = {};
    stepResult.rows.forEach(r => { byStep[r.current_step] = r.count; });
    const byStatus = {};
    statusResult.rows.forEach(r => { byStatus[r.status] = r.count; });

    return res.json({
      success: true,
      data: {
        total_packages: totalResult.rows[0].total,
        by_step: byStep,
        by_status: byStatus
      }
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch summary' });
  }
});

router.get('/packages', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM rmf_packages WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing packages:', error);
    return res.status(500).json({ success: false, error: 'Failed to list packages' });
  }
});

router.get('/packages/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM rmf_packages WHERE id = $1 AND organization_id = $2',
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching package:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch package' });
  }
});

router.post('/packages', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { system_name, system_description, system_id } = req.body;
    const result = await pool.query(
      `INSERT INTO rmf_packages (organization_id, system_name, system_description, system_id, current_step, status)
       VALUES ($1, $2, $3, $4, 'prepare', 'active') RETURNING *`,
      [org, system_name, system_description, system_id]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating package:', error);
    return res.status(500).json({ success: false, error: 'Failed to create package' });
  }
});

router.put('/packages/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { system_name, system_description, system_id, current_step, status, authorization_status } = req.body;
    const result = await pool.query(
      `UPDATE rmf_packages
       SET system_name = COALESCE($1, system_name),
           system_description = COALESCE($2, system_description),
           system_id = COALESCE($3, system_id),
           current_step = COALESCE($4, current_step),
           status = COALESCE($5, status),
           authorization_status = COALESCE($6, authorization_status),
           updated_at = NOW()
       WHERE id = $7 AND organization_id = $8 RETURNING *`,
      [system_name, system_description, system_id, current_step, status, authorization_status, id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating package:', error);
    return res.status(500).json({ success: false, error: 'Failed to update package' });
  }
});

router.delete('/packages/:id', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM rmf_packages WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, org]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error('Error deleting package:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete package' });
  }
});

router.post('/packages/:id/transition', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;
    const { to_step, action, notes, status } = req.body;

    if (!VALID_RMF_STEPS.includes(to_step)) {
      return res.status(400).json({
        success: false,
        error: `Invalid RMF step. Must be one of: ${VALID_RMF_STEPS.join(', ')}`
      });
    }

    const fields = ['current_step = $1', 'updated_at = NOW()'];
    const values = [to_step];
    let idx = 2;

    if (status) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }

    values.push(id, org);
    const result = await pool.query(
      `UPDATE rmf_packages SET ${fields.join(', ')}
       WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error transitioning package:', error);
    return res.status(500).json({ success: false, error: 'Failed to transition package' });
  }
});

router.get('/packages/:id/history', async (req, res) => {
  try {
    return res.json({ success: true, data: [] });
  } catch (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

router.post('/packages/:id/authorization', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { id } = req.params;

    // Verify package belongs to org
    const pkg = await pool.query(
      'SELECT id FROM rmf_packages WHERE id = $1 AND organization_id = $2',
      [id, org]
    );
    if (pkg.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    const { authorization_type, authorized_by, authorization_date, expiration_date, conditions, status } = req.body;
    const result = await pool.query(
      `INSERT INTO rmf_authorizations (package_id, authorization_type, authorized_by, authorization_date, expiration_date, conditions, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, authorization_type, authorized_by, authorization_date, expiration_date, conditions, status || 'active']
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating authorization:', error);
    return res.status(500).json({ success: false, error: 'Failed to create authorization' });
  }
});

module.exports = router;
