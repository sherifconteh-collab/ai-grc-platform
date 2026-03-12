// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

function canManageView(user, viewRow) {
  if (!user || !viewRow) return false;
  if (user.role === 'admin') return true;
  return viewRow.user_id === user.id || viewRow.created_by === user.id;
}

// GET /api/v1/dashboard-builder/views
router.get('/views', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const scope = String(req.query.scope || 'all'); // mine, shared, all

    const clauses = ['organization_id = $1'];
    const params = [orgId];

    if (scope === 'mine') {
      clauses.push('user_id = $2');
      params.push(userId);
    } else if (scope === 'shared') {
      clauses.push('is_shared = true');
    } else {
      clauses.push('(user_id = $2 OR is_shared = true)');
      params.push(userId);
    }

    const viewsResult = await pool.query(
      `SELECT *
       FROM dashboard_views
       WHERE ${clauses.join(' AND ')}
       ORDER BY is_default DESC, updated_at DESC`,
      params
    );

    const viewIds = viewsResult.rows.map((v) => v.id);
    let widgetsByView = {};
    if (viewIds.length > 0) {
      const widgetsResult = await pool.query(
        `SELECT *
         FROM dashboard_widgets
         WHERE dashboard_view_id = ANY($1::uuid[])
         ORDER BY position_row, position_col, created_at`,
        [viewIds]
      );
      widgetsByView = widgetsResult.rows.reduce((acc, row) => {
        if (!acc[row.dashboard_view_id]) acc[row.dashboard_view_id] = [];
        acc[row.dashboard_view_id].push(row);
        return acc;
      }, {});
    }

    res.json({
      success: true,
      data: viewsResult.rows.map((view) => ({
        ...view,
        widgets: widgetsByView[view.id] || []
      }))
    });
  } catch (error) {
    console.error('Dashboard builder list views error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard views' });
  }
});

// POST /api/v1/dashboard-builder/views
router.post('/views', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const {
      name,
      description = null,
      is_shared = false,
      is_default = false,
      layout = {}
    } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'name is required (min 2 chars)' });
    }

    if (is_default) {
      await pool.query(
        `UPDATE dashboard_views
         SET is_default = false
         WHERE organization_id = $1 AND user_id = $2`,
        [orgId, userId]
      );
    }

    const insert = await pool.query(
      `INSERT INTO dashboard_views (
         organization_id, user_id, name, description, is_shared, is_default, layout, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [orgId, userId, name, description, Boolean(is_shared), Boolean(is_default), JSON.stringify(layout || {}), userId]
    );

    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (error) {
    console.error('Dashboard builder create view error:', error);
    res.status(500).json({ success: false, error: 'Failed to create dashboard view' });
  }
});

// PATCH /api/v1/dashboard-builder/views/:id
router.patch('/views/:id', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const viewId = req.params.id;

    const existing = await pool.query(
      `SELECT *
       FROM dashboard_views
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, viewId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dashboard view not found' });
    }
    if (!canManageView(req.user, existing.rows[0])) {
      return res.status(403).json({ success: false, error: 'Not allowed to modify this dashboard view' });
    }

    const patch = req.body || {};
    if (patch.is_default === true) {
      await pool.query(
        `UPDATE dashboard_views
         SET is_default = false
         WHERE organization_id = $1
           AND user_id = $2`,
        [orgId, req.user.id]
      );
    }

    const updated = await pool.query(
      `UPDATE dashboard_views
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           is_shared = COALESCE($5, is_shared),
           is_default = COALESCE($6, is_default),
           layout = COALESCE($7::jsonb, layout),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        viewId,
        patch.name || null,
        patch.description || null,
        patch.is_shared === undefined ? null : Boolean(patch.is_shared),
        patch.is_default === undefined ? null : Boolean(patch.is_default),
        patch.layout === undefined ? null : JSON.stringify(patch.layout)
      ]
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error('Dashboard builder update view error:', error);
    res.status(500).json({ success: false, error: 'Failed to update dashboard view' });
  }
});

// DELETE /api/v1/dashboard-builder/views/:id
router.delete('/views/:id', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const viewId = req.params.id;

    const existing = await pool.query(
      `SELECT *
       FROM dashboard_views
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, viewId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dashboard view not found' });
    }
    if (!canManageView(req.user, existing.rows[0])) {
      return res.status(403).json({ success: false, error: 'Not allowed to delete this dashboard view' });
    }

    await pool.query(
      `DELETE FROM dashboard_views
       WHERE organization_id = $1 AND id = $2`,
      [orgId, viewId]
    );

    res.json({ success: true, message: 'Dashboard view deleted' });
  } catch (error) {
    console.error('Dashboard builder delete view error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete dashboard view' });
  }
});

// POST /api/v1/dashboard-builder/views/:id/widgets
router.post('/views/:id/widgets', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const viewId = req.params.id;
    const {
      widget_type,
      title,
      widget_config = {},
      position_row = 0,
      position_col = 0,
      width = 1,
      height = 1
    } = req.body || {};

    if (!widget_type || !title) {
      return res.status(400).json({ success: false, error: 'widget_type and title are required' });
    }

    const viewResult = await pool.query(
      `SELECT *
       FROM dashboard_views
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, viewId]
    );
    if (viewResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dashboard view not found' });
    }
    if (!canManageView(req.user, viewResult.rows[0])) {
      return res.status(403).json({ success: false, error: 'Not allowed to modify this dashboard view' });
    }

    const insert = await pool.query(
      `INSERT INTO dashboard_widgets (
         dashboard_view_id, widget_type, title, widget_config,
         position_row, position_col, width, height
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
       RETURNING *`,
      [
        viewId,
        widget_type,
        title,
        JSON.stringify(widget_config || {}),
        Number(position_row) || 0,
        Number(position_col) || 0,
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1)
      ]
    );

    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (error) {
    console.error('Dashboard builder create widget error:', error);
    res.status(500).json({ success: false, error: 'Failed to create dashboard widget' });
  }
});

// PATCH /api/v1/dashboard-builder/widgets/:widgetId
router.patch('/widgets/:widgetId', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const widgetId = req.params.widgetId;
    const patch = req.body || {};

    const existing = await pool.query(
      `SELECT w.*, v.organization_id, v.user_id, v.created_by
       FROM dashboard_widgets w
       JOIN dashboard_views v ON v.id = w.dashboard_view_id
       WHERE w.id = $1 AND v.organization_id = $2
       LIMIT 1`,
      [widgetId, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dashboard widget not found' });
    }
    if (!canManageView(req.user, existing.rows[0])) {
      return res.status(403).json({ success: false, error: 'Not allowed to modify this dashboard widget' });
    }

    const update = await pool.query(
      `UPDATE dashboard_widgets
       SET title = COALESCE($2, title),
           widget_config = COALESCE($3::jsonb, widget_config),
           position_row = COALESCE($4, position_row),
           position_col = COALESCE($5, position_col),
           width = COALESCE($6, width),
           height = COALESCE($7, height),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        widgetId,
        patch.title || null,
        patch.widget_config === undefined ? null : JSON.stringify(patch.widget_config),
        patch.position_row === undefined ? null : Number(patch.position_row),
        patch.position_col === undefined ? null : Number(patch.position_col),
        patch.width === undefined ? null : Math.max(1, Number(patch.width)),
        patch.height === undefined ? null : Math.max(1, Number(patch.height))
      ]
    );

    res.json({ success: true, data: update.rows[0] });
  } catch (error) {
    console.error('Dashboard builder update widget error:', error);
    res.status(500).json({ success: false, error: 'Failed to update dashboard widget' });
  }
});

// DELETE /api/v1/dashboard-builder/widgets/:widgetId
router.delete('/widgets/:widgetId', requirePermission('dashboard.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const widgetId = req.params.widgetId;

    const existing = await pool.query(
      `SELECT w.id, v.organization_id, v.user_id, v.created_by
       FROM dashboard_widgets w
       JOIN dashboard_views v ON v.id = w.dashboard_view_id
       WHERE w.id = $1 AND v.organization_id = $2
       LIMIT 1`,
      [widgetId, orgId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Dashboard widget not found' });
    }
    if (!canManageView(req.user, existing.rows[0])) {
      return res.status(403).json({ success: false, error: 'Not allowed to delete this dashboard widget' });
    }

    await pool.query('DELETE FROM dashboard_widgets WHERE id = $1', [widgetId]);
    res.json({ success: true, message: 'Dashboard widget deleted' });
  } catch (error) {
    console.error('Dashboard builder delete widget error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete dashboard widget' });
  }
});

module.exports = router;
