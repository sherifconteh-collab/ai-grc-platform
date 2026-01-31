/**
 * Organization Management API Routes
 * Handles organization settings and framework selection
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pool from '../config/database.js';
import { logDataModified, logAdminAction } from '../utils/auditLogger.js';

const router = express.Router();

/**
 * GET /api/v1/organizations/:orgId/frameworks
 * Get frameworks selected by an organization
 */
router.get('/:orgId/frameworks', authenticateToken, async (req, res) => {
  try {
    const { orgId } = req.params;

    // Verify user belongs to this organization
    if (req.user.organizationId !== orgId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    const result = await pool.query(
      `SELECT
        f.id,
        f.code,
        f.name,
        f.full_name,
        f.version,
        f.description,
        f.category,
        of.selected_at,
        of.priority,
        COUNT(DISTINCT fc.id) as total_controls,
        COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented_controls,
        COUNT(DISTINCT CASE WHEN ci.status = 'in_progress' THEN ci.id END) as in_progress_controls,
        COUNT(DISTINCT CASE WHEN ci.status = 'not_started' THEN ci.id END) as not_started_controls
      FROM organization_frameworks of
      JOIN frameworks f ON f.id = of.framework_id
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = of.organization_id
      WHERE of.organization_id = $1
      GROUP BY f.id, f.code, f.name, f.full_name, f.version, f.description, f.category, of.selected_at, of.priority
      ORDER BY of.priority ASC, f.name ASC`,
      [orgId]
    );

    const frameworks = result.rows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      fullName: row.full_name,
      version: row.version,
      description: row.description,
      category: row.category,
      selectedAt: row.selected_at,
      priority: row.priority,
      stats: {
        totalControls: parseInt(row.total_controls),
        implemented: parseInt(row.implemented_controls) || 0,
        inProgress: parseInt(row.in_progress_controls) || 0,
        notStarted: parseInt(row.not_started_controls) || 0,
        compliancePercentage: row.total_controls > 0
          ? Math.round((parseInt(row.implemented_controls) || 0) / parseInt(row.total_controls) * 100)
          : 0
      }
    }));

    res.json({
      success: true,
      data: {
        organizationId: orgId,
        frameworks,
        totalFrameworks: frameworks.length
      }
    });

  } catch (error) {
    console.error('Get organization frameworks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get organization frameworks'
    });
  }
});

/**
 * POST /api/v1/organizations/:orgId/frameworks
 * Add frameworks to an organization
 */
router.post('/:orgId/frameworks', authenticateToken, requireRole(['admin']), async (req, res) => {
  const client = await pool.connect();

  try {
    const { orgId } = req.params;
    const { frameworkIds, priority } = req.body;

    // Verify user belongs to this organization
    if (req.user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    if (!frameworkIds || !Array.isArray(frameworkIds) || frameworkIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'frameworkIds array is required'
      });
    }

    await client.query('BEGIN');

    const addedFrameworks = [];

    for (let i = 0; i < frameworkIds.length; i++) {
      const frameworkId = frameworkIds[i];

      // Check if framework exists
      const frameworkCheck = await client.query(
        'SELECT id, code, name FROM frameworks WHERE id = $1',
        [frameworkId]
      );

      if (frameworkCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: `Framework with ID ${frameworkId} not found`
        });
      }

      // Check if already added
      const existingCheck = await client.query(
        'SELECT id FROM organization_frameworks WHERE organization_id = $1 AND framework_id = $2',
        [orgId, frameworkId]
      );

      if (existingCheck.rows.length > 0) {
        continue; // Skip if already added
      }

      // Add framework to organization
      const result = await client.query(
        `INSERT INTO organization_frameworks (organization_id, framework_id, priority, selected_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, selected_at`,
        [orgId, frameworkId, priority || (i + 1)]
      );

      addedFrameworks.push({
        id: frameworkCheck.rows[0].id,
        code: frameworkCheck.rows[0].code,
        name: frameworkCheck.rows[0].name,
        selectedAt: result.rows[0].selected_at
      });
    }

    await client.query('COMMIT');

    // Log the action
    await logAdminAction(
      req.user.id,
      req.user.email,
      'add_frameworks',
      `organization:${orgId}`,
      req.ip,
      req.get('user-agent'),
      {
        frameworkIds,
        frameworkCount: addedFrameworks.length
      }
    );

    res.status(201).json({
      success: true,
      data: {
        addedFrameworks,
        message: `${addedFrameworks.length} framework(s) added successfully`
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add organization frameworks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add frameworks to organization'
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/organizations/:orgId/frameworks/:frameworkId
 * Remove a framework from an organization
 */
router.delete('/:orgId/frameworks/:frameworkId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const client = await pool.connect();

  try {
    const { orgId, frameworkId } = req.params;

    // Verify user belongs to this organization
    if (req.user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    await client.query('BEGIN');

    // Check if framework is selected
    const checkResult = await client.query(
      `SELECT of.id, f.code, f.name
       FROM organization_frameworks of
       JOIN frameworks f ON f.id = of.framework_id
       WHERE of.organization_id = $1 AND of.framework_id = $2`,
      [orgId, frameworkId]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Framework not found in organization'
      });
    }

    const framework = checkResult.rows[0];

    // Delete control implementations for this framework
    await client.query(
      `DELETE FROM control_implementations
       WHERE organization_id = $1
       AND control_id IN (
         SELECT id FROM framework_controls WHERE framework_id = $2
       )`,
      [orgId, frameworkId]
    );

    // Remove framework from organization
    await client.query(
      'DELETE FROM organization_frameworks WHERE organization_id = $1 AND framework_id = $2',
      [orgId, frameworkId]
    );

    await client.query('COMMIT');

    // Log the action
    await logAdminAction(
      req.user.id,
      req.user.email,
      'remove_framework',
      `organization:${orgId}`,
      req.ip,
      req.get('user-agent'),
      {
        frameworkId,
        frameworkCode: framework.code,
        frameworkName: framework.name
      }
    );

    res.json({
      success: true,
      message: `Framework ${framework.name} removed from organization`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Remove organization framework error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove framework from organization'
    });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/v1/organizations/:orgId/frameworks/:frameworkId/priority
 * Update framework priority order
 */
router.put('/:orgId/frameworks/:frameworkId/priority', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { orgId, frameworkId } = req.params;
    const { priority } = req.body;

    // Verify user belongs to this organization
    if (req.user.organizationId !== orgId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    if (priority === undefined || priority < 1) {
      return res.status(400).json({
        success: false,
        error: 'Valid priority value is required (minimum 1)'
      });
    }

    const result = await pool.query(
      `UPDATE organization_frameworks
       SET priority = $1
       WHERE organization_id = $2 AND framework_id = $3
       RETURNING id`,
      [priority, orgId, frameworkId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Framework not found in organization'
      });
    }

    res.json({
      success: true,
      message: 'Framework priority updated successfully'
    });

  } catch (error) {
    console.error('Update framework priority error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update framework priority'
    });
  }
});

/**
 * GET /api/v1/organizations/:orgId
 * Get organization details
 */
router.get('/:orgId', authenticateToken, async (req, res) => {
  try {
    const { orgId } = req.params;

    // Verify user belongs to this organization or is admin
    if (req.user.organizationId !== orgId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this organization'
      });
    }

    const result = await pool.query(
      `SELECT
        o.id,
        o.name,
        o.industry,
        o.created_at,
        o.updated_at,
        COUNT(DISTINCT of.framework_id) as framework_count,
        COUNT(DISTINCT u.id) as user_count
      FROM organizations o
      LEFT JOIN organization_frameworks of ON of.organization_id = o.id
      LEFT JOIN users u ON u.organization_id = o.id AND u.is_active = true
      WHERE o.id = $1
      GROUP BY o.id, o.name, o.industry, o.created_at, o.updated_at`,
      [orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const org = result.rows[0];

    res.json({
      success: true,
      data: {
        id: org.id,
        name: org.name,
        industry: org.industry,
        createdAt: org.created_at,
        updatedAt: org.updated_at,
        stats: {
          frameworkCount: parseInt(org.framework_count),
          userCount: parseInt(org.user_count)
        }
      }
    });

  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get organization details'
    });
  }
});

export default router;
