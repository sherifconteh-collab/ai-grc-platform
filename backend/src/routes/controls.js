/**
 * Control Management API Routes
 * Handles framework controls, implementations, and crosswalk mappings
 * KEY FEATURE: Auto-crosswalk when similarity >= 90%
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pool from '../config/database.js';
import { logDataModified, logDataAccess } from '../utils/auditLogger.js';

const router = express.Router();

/**
 * GET /api/v1/controls
 * List all controls with filters
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      frameworkCode,
      priority,
      status,
      search,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        fc.id,
        fc.control_id,
        fc.title,
        fc.description,
        fc.control_type,
        fc.priority,
        f.code as framework_code,
        f.name as framework_name,
        ff.code as function_code,
        ff.name as function_name,
        cat.code as category_code,
        cat.name as category_name,
        ci.status as implementation_status,
        ci.implementation_details,
        ci.implemented_at,
        ci.assigned_to
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN framework_functions ff ON ff.id = fc.function_id
      LEFT JOIN framework_categories cat ON cat.id = fc.category_id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
      WHERE 1=1
    `;

    const params = [req.user.organizationId];
    let paramIndex = 2;

    if (frameworkCode) {
      query += ` AND f.code = $${paramIndex}`;
      params.push(frameworkCode);
      paramIndex++;
    }

    if (priority) {
      query += ` AND fc.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (status) {
      query += ` AND ci.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (fc.control_id ILIKE $${paramIndex} OR fc.title ILIKE $${paramIndex} OR fc.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY f.code, fc.display_order LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    const controls = result.rows.map(row => ({
      id: row.id,
      controlId: row.control_id,
      title: row.title,
      description: row.description,
      controlType: row.control_type,
      priority: row.priority,
      framework: {
        code: row.framework_code,
        name: row.framework_name
      },
      function: row.function_code ? {
        code: row.function_code,
        name: row.function_name
      } : null,
      category: row.category_code ? {
        code: row.category_code,
        name: row.category_name
      } : null,
      implementation: {
        status: row.implementation_status || 'not_started',
        details: row.implementation_details,
        implementedAt: row.implemented_at,
        assignedTo: row.assigned_to
      }
    }));

    res.json({
      success: true,
      data: {
        controls,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: controls.length
        }
      }
    });

  } catch (error) {
    console.error('List controls error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list controls'
    });
  }
});

/**
 * GET /api/v1/controls/:controlId
 * Get single control details with crosswalk mappings
 */
router.get('/:controlId', authenticateToken, async (req, res) => {
  try {
    const { controlId } = req.params;

    // Get control details
    const controlResult = await pool.query(
      `SELECT
        fc.id,
        fc.control_id,
        fc.title,
        fc.description,
        fc.control_type,
        fc.priority,
        fc.implementation_guidance,
        fc.assessment_procedures,
        fc."references",
        f.id as framework_id,
        f.code as framework_code,
        f.name as framework_name,
        f.full_name as framework_full_name,
        ff.code as function_code,
        ff.name as function_name,
        cat.code as category_code,
        cat.name as category_name,
        ci.status as implementation_status,
        ci.implementation_details,
        ci.evidence_url,
        ci.implemented_at,
        ci.assigned_to,
        ci.notes
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN framework_functions ff ON ff.id = fc.function_id
      LEFT JOIN framework_categories cat ON cat.id = fc.category_id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
      WHERE fc.id = $2`,
      [req.user.organizationId, controlId]
    );

    if (controlResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Control not found'
      });
    }

    const control = controlResult.rows[0];

    // Get crosswalk mappings
    const mappingsResult = await pool.query(
      `SELECT
        cm.id as mapping_id,
        cm.similarity_score,
        cm.mapping_type,
        cm.mapping_rationale,
        fc2.id as mapped_control_id,
        fc2.control_id as mapped_control_code,
        fc2.title as mapped_control_title,
        fc2.description as mapped_control_description,
        fc2.priority as mapped_control_priority,
        f2.code as mapped_framework_code,
        f2.name as mapped_framework_name,
        ci2.status as mapped_implementation_status
      FROM control_mappings cm
      JOIN framework_controls fc2 ON (
        CASE
          WHEN cm.source_control_id = $1 THEN fc2.id = cm.target_control_id
          WHEN cm.target_control_id = $1 THEN fc2.id = cm.source_control_id
        END
      )
      JOIN frameworks f2 ON f2.id = fc2.framework_id
      LEFT JOIN control_implementations ci2 ON ci2.control_id = fc2.id AND ci2.organization_id = $2
      WHERE cm.source_control_id = $1 OR cm.target_control_id = $1
      ORDER BY cm.similarity_score DESC, f2.name`,
      [controlId, req.user.organizationId]
    );

    const crosswalkMappings = mappingsResult.rows.map(row => ({
      mappingId: row.mapping_id,
      similarityScore: row.similarity_score,
      mappingType: row.mapping_type,
      rationale: row.mapping_rationale,
      mappedControl: {
        id: row.mapped_control_id,
        controlId: row.mapped_control_code,
        title: row.mapped_control_title,
        description: row.mapped_control_description,
        priority: row.mapped_control_priority,
        framework: {
          code: row.mapped_framework_code,
          name: row.mapped_framework_name
        },
        implementationStatus: row.mapped_implementation_status || 'not_started'
      }
    }));

    // Log access
    await logDataAccess(
      req.user.id,
      req.user.email,
      'control',
      controlId,
      'view',
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      data: {
        control: {
          id: control.id,
          controlId: control.control_id,
          title: control.title,
          description: control.description,
          controlType: control.control_type,
          priority: control.priority,
          implementationGuidance: control.implementation_guidance,
          assessmentProcedures: control.assessment_procedures,
          references: control.references,
          framework: {
            id: control.framework_id,
            code: control.framework_code,
            name: control.framework_name,
            fullName: control.framework_full_name
          },
          function: control.function_code ? {
            code: control.function_code,
            name: control.function_name
          } : null,
          category: control.category_code ? {
            code: control.category_code,
            name: control.category_name
          } : null,
          implementation: {
            status: control.implementation_status || 'not_started',
            details: control.implementation_details,
            evidenceUrl: control.evidence_url,
            implementedAt: control.implemented_at,
            assignedTo: control.assigned_to,
            notes: control.notes
          }
        },
        crosswalkMappings: {
          total: crosswalkMappings.length,
          highConfidence: crosswalkMappings.filter(m => m.similarityScore >= 90).length,
          mediumConfidence: crosswalkMappings.filter(m => m.similarityScore >= 70 && m.similarityScore < 90).length,
          lowConfidence: crosswalkMappings.filter(m => m.similarityScore < 70).length,
          mappings: crosswalkMappings
        }
      }
    });

  } catch (error) {
    console.error('Get control error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get control details'
    });
  }
});

/**
 * PUT /api/v1/controls/:controlId/implementation
 * Update control implementation status
 * KEY FEATURE: Auto-updates mapped controls with similarity >= 90%
 */
router.put('/:controlId/implementation', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const { controlId } = req.params;
    const {
      status,
      implementationDetails,
      evidenceUrl,
      assignedTo,
      notes
    } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const validStatuses = ['not_started', 'in_progress', 'implemented', 'not_applicable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    await client.query('BEGIN');

    // Check if control exists
    const controlCheck = await client.query(
      `SELECT fc.id, fc.control_id, fc.title, f.code as framework_code, f.name as framework_name
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       WHERE fc.id = $1`,
      [controlId]
    );

    if (controlCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Control not found'
      });
    }

    const control = controlCheck.rows[0];

    // Upsert control implementation
    const implementResult = await client.query(
      `INSERT INTO control_implementations
        (control_id, organization_id, status, implementation_details, evidence_url, assigned_to, notes, implemented_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
         CASE WHEN $3 = 'implemented' THEN NOW() ELSE NULL END,
         NOW())
       ON CONFLICT (control_id, organization_id)
       DO UPDATE SET
         status = $3,
         implementation_details = $4,
         evidence_url = $5,
         assigned_to = $6,
         notes = $7,
         implemented_at = CASE WHEN $3 = 'implemented' AND control_implementations.status != 'implemented' THEN NOW() ELSE control_implementations.implemented_at END,
         updated_at = NOW()
       RETURNING id, status, implemented_at`,
      [
        controlId,
        req.user.organizationId,
        status,
        implementationDetails,
        evidenceUrl,
        assignedTo,
        notes
      ]
    );

    const implementation = implementResult.rows[0];

    // KEY FEATURE: Auto-crosswalk logic for implemented controls
    const autoCrosswalkedControls = [];

    if (status === 'implemented') {
      // Find all mapped controls with similarity >= 90%
      const mappingsResult = await client.query(
        `SELECT
          CASE
            WHEN cm.source_control_id = $1 THEN cm.target_control_id
            WHEN cm.target_control_id = $1 THEN cm.source_control_id
          END as mapped_control_id,
          cm.similarity_score,
          fc.control_id as mapped_control_code,
          fc.title as mapped_control_title,
          f.code as mapped_framework_code,
          f.name as mapped_framework_name
        FROM control_mappings cm
        JOIN framework_controls fc ON fc.id = CASE
          WHEN cm.source_control_id = $1 THEN cm.target_control_id
          WHEN cm.target_control_id = $1 THEN cm.source_control_id
        END
        JOIN frameworks f ON f.id = fc.framework_id
        WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
        AND cm.similarity_score >= 90`,
        [controlId]
      );

      // Auto-update mapped controls to "satisfied via crosswalk"
      for (const mapping of mappingsResult.rows) {
        // Check if organization has this framework selected
        const frameworkCheck = await client.query(
          `SELECT 1 FROM organization_frameworks of
           JOIN framework_controls fc ON fc.framework_id = of.framework_id
           WHERE of.organization_id = $1 AND fc.id = $2`,
          [req.user.organizationId, mapping.mapped_control_id]
        );

        if (frameworkCheck.rows.length > 0) {
          // Check current status - only update if not already implemented or in progress
          const currentStatus = await client.query(
            `SELECT status FROM control_implementations
             WHERE control_id = $1 AND organization_id = $2`,
            [mapping.mapped_control_id, req.user.organizationId]
          );

          const shouldUpdate = !currentStatus.rows.length ||
            (currentStatus.rows[0].status !== 'implemented' && currentStatus.rows[0].status !== 'in_progress');

          if (shouldUpdate) {
            await client.query(
              `INSERT INTO control_implementations
                (control_id, organization_id, status, implementation_details, notes, implemented_at, updated_at)
               VALUES ($1, $2, 'satisfied_via_crosswalk', $3, $4, NOW(), NOW())
               ON CONFLICT (control_id, organization_id)
               DO UPDATE SET
                 status = 'satisfied_via_crosswalk',
                 implementation_details = $3,
                 notes = $4,
                 implemented_at = NOW(),
                 updated_at = NOW()`,
              [
                mapping.mapped_control_id,
                req.user.organizationId,
                `Auto-satisfied via crosswalk from ${control.framework_code} ${control.control_id}`,
                `This control was automatically marked as satisfied because you implemented a similar control (${control.framework_code} ${control.control_id}: ${control.title}) with ${mapping.similarity_score}% similarity.`
              ]
            );

            autoCrosswalkedControls.push({
              controlId: mapping.mapped_control_code,
              title: mapping.mapped_control_title,
              framework: {
                code: mapping.mapped_framework_code,
                name: mapping.mapped_framework_name
              },
              similarityScore: mapping.similarity_score
            });
          }
        }
      }
    }

    await client.query('COMMIT');

    // Log the implementation update
    await logDataModified(
      req.user.id,
      req.user.email,
      'control_implementation',
      controlId,
      'update_status',
      req.ip,
      req.get('user-agent'),
      {
        controlCode: control.control_id,
        framework: control.framework_code,
        newStatus: status,
        autoCrosswalkedCount: autoCrosswalkedControls.length
      }
    );

    res.json({
      success: true,
      data: {
        implementation: {
          id: implementation.id,
          status: implementation.status,
          implementedAt: implementation.implemented_at
        },
        autoCrosswalked: {
          enabled: status === 'implemented',
          count: autoCrosswalkedControls.length,
          controls: autoCrosswalkedControls
        },
        message: autoCrosswalkedControls.length > 0
          ? `Control updated! By implementing this control, you've automatically satisfied ${autoCrosswalkedControls.length} other control(s) via crosswalk mapping.`
          : 'Control implementation updated successfully'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update control implementation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update control implementation'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/controls/:controlId/crosswalk
 * Get crosswalk mappings for a specific control
 */
router.get('/:controlId/crosswalk', authenticateToken, async (req, res) => {
  try {
    const { controlId } = req.params;
    const { minSimilarity = 0 } = req.query;

    const result = await pool.query(
      `SELECT
        cm.id as mapping_id,
        cm.similarity_score,
        cm.mapping_type,
        cm.mapping_rationale,
        fc2.id as mapped_control_id,
        fc2.control_id as mapped_control_code,
        fc2.title as mapped_control_title,
        fc2.description as mapped_control_description,
        fc2.priority as mapped_control_priority,
        f2.code as mapped_framework_code,
        f2.name as mapped_framework_name,
        ci2.status as mapped_implementation_status,
        of.id as organization_has_framework
      FROM control_mappings cm
      JOIN framework_controls fc2 ON (
        CASE
          WHEN cm.source_control_id = $1 THEN fc2.id = cm.target_control_id
          WHEN cm.target_control_id = $1 THEN fc2.id = cm.source_control_id
        END
      )
      JOIN frameworks f2 ON f2.id = fc2.framework_id
      LEFT JOIN control_implementations ci2 ON ci2.control_id = fc2.id AND ci2.organization_id = $2
      LEFT JOIN organization_frameworks of ON of.framework_id = f2.id AND of.organization_id = $2
      WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
      AND cm.similarity_score >= $3
      ORDER BY cm.similarity_score DESC, f2.name`,
      [controlId, req.user.organizationId, parseInt(minSimilarity)]
    );

    const mappings = result.rows.map(row => ({
      mappingId: row.mapping_id,
      similarityScore: row.similarity_score,
      mappingType: row.mapping_type,
      rationale: row.mapping_rationale,
      autoSatisfyEligible: row.similarity_score >= 90,
      organizationHasFramework: !!row.organization_has_framework,
      mappedControl: {
        id: row.mapped_control_id,
        controlId: row.mapped_control_code,
        title: row.mapped_control_title,
        description: row.mapped_control_description,
        priority: row.mapped_control_priority,
        framework: {
          code: row.mapped_framework_code,
          name: row.mapped_framework_name
        },
        implementationStatus: row.mapped_implementation_status || 'not_started'
      }
    }));

    res.json({
      success: true,
      data: {
        controlId,
        totalMappings: mappings.length,
        autoSatisfyEligibleCount: mappings.filter(m => m.autoSatisfyEligible && m.organizationHasFramework).length,
        mappings
      }
    });

  } catch (error) {
    console.error('Get crosswalk mappings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get crosswalk mappings'
    });
  }
});

export default router;
