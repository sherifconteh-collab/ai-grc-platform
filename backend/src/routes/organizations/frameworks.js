// @tier: community
/**
 * Organization framework selection routes: GET/POST /:orgId/frameworks and
 * DELETE /:orgId/frameworks/:frameworkId (with crosswalk rehydration and
 * optional evidence propagation).
 *
 * Extracted verbatim from routes/organizations.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/organizations.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { validateBody, isUuid } = require('../../middleware/validate');
const { getConfigValue } = require('../../services/dynamicConfigService');
const { log } = require('../../utils/logger');
const {
  verifyOrgAccess,
  logOrganizationEvent,
  rehydrateImplementationsForFrameworkSelection,
} = require('./_helpers');

// GET /organizations/:orgId/frameworks
router.get('/:orgId/frameworks', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;

    const result = await pool.query(`
      SELECT f.id, f.name, f.code, f.version, f.description, f.category, f.tier_required,
             of2.created_at as added_at,
             COUNT(fc.id) as control_count
      FROM organization_frameworks of2
      JOIN frameworks f ON f.id = of2.framework_id
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      WHERE of2.organization_id = $1
      GROUP BY f.id, of2.created_at
      ORDER BY f.name
    `, [orgId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.frameworks.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load organization frameworks' });
  }
});

// POST /organizations/:orgId/frameworks
router.post('/:orgId/frameworks', requirePermission('frameworks.manage'), validateBody((body) => {
  const errors = [];
  if (!Array.isArray(body.frameworkIds)) {
    errors.push('frameworkIds array is required');
  } else if (body.frameworkIds.some((id) => typeof id !== 'string' || !isUuid(id))) {
    errors.push('frameworkIds must contain valid UUID values');
  }
  if (body.propagateEvidence !== undefined && typeof body.propagateEvidence !== 'boolean') {
    errors.push('propagateEvidence must be a boolean when provided');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;
    const { frameworkIds, propagateEvidence } = req.body;
    const desiredFrameworkIds = Array.from(
      new Set((frameworkIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0))
    );

    const evidencePropagationConfig = await getConfigValue(orgId, 'crosswalk', 'auto_propagate_evidence_exact', { value: false });
    const shouldPropagateEvidence = typeof propagateEvidence === 'boolean'
      ? propagateEvidence
      : Boolean(
        evidencePropagationConfig && typeof evidencePropagationConfig === 'object'
          ? evidencePropagationConfig.value
          : evidencePropagationConfig
      );

    if (desiredFrameworkIds.length > 0) {
      const availableFrameworks = await pool.query(
        `SELECT id::text AS id
         FROM frameworks
         WHERE id::text = ANY($1::text[]) AND is_active = true`,
        [desiredFrameworkIds]
      );

      if (availableFrameworks.rows.length !== desiredFrameworkIds.length) {
        return res.status(400).json({
          success: false,
          error: 'One or more framework IDs are invalid or inactive'
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existingFrameworks = await client.query(
        `SELECT framework_id::text AS framework_id
         FROM organization_frameworks
         WHERE organization_id = $1`,
        [orgId]
      );
      const existingFrameworkIds = existingFrameworks.rows.map((row) => row.framework_id);
      const existingSet = new Set(existingFrameworkIds);
      const desiredSet = new Set(desiredFrameworkIds);
      const addedFrameworkIds = desiredFrameworkIds.filter((id) => !existingSet.has(id));
      const removedFrameworkIds = existingFrameworkIds.filter((id) => !desiredSet.has(id));

      if (desiredFrameworkIds.length === 0) {
        await client.query(
          'DELETE FROM organization_frameworks WHERE organization_id = $1',
          [orgId]
        );
      } else {
        await client.query(
          `DELETE FROM organization_frameworks
           WHERE organization_id = $1
             AND NOT (framework_id::text = ANY($2::text[]))`,
          [orgId, desiredFrameworkIds]
        );

        for (const fwId of desiredFrameworkIds) {
          await client.query(
            'INSERT INTO organization_frameworks (organization_id, framework_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [orgId, fwId]
          );
        }
      }

      const { rehydratedCount, propagatedEvidenceLinks } = await rehydrateImplementationsForFrameworkSelection({
        client,
        organizationId: orgId,
        userId: req.user.id,
        addedFrameworkIds,
        propagateEvidence: shouldPropagateEvidence
      });

      await client.query('COMMIT');

      await logOrganizationEvent({
        organizationId: orgId,
        userId: req.user.id,
        eventType: 'organization.frameworks.updated',
        resourceType: 'organization',
        resourceId: orgId,
        details: {
          added_framework_ids: addedFrameworkIds,
          removed_framework_ids: removedFrameworkIds,
          rehydrated_controls: rehydratedCount,
          propagated_evidence_links: propagatedEvidenceLinks,
          history_preserved: true,
          strict_crosswalk_only: true
        }
      });

      // Return updated list
      const result = await client.query(`
        SELECT f.id, f.name, f.code, f.version, f.description,
               COUNT(fc.id) as control_count
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        LEFT JOIN framework_controls fc ON fc.framework_id = f.id
        WHERE of2.organization_id = $1
        GROUP BY f.id
        ORDER BY f.name
      `, [orgId]);

      res.json({
        success: true,
        data: result.rows,
        metadata: {
          rehydrated_controls: rehydratedCount,
          propagated_evidence_links: propagatedEvidenceLinks,
          strict_crosswalk_only: true,
          history_preserved: true
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    log('error', 'organizations.frameworks.add_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to add frameworks' });
  }
});

// DELETE /organizations/:orgId/frameworks/:frameworkId
router.delete('/:orgId/frameworks/:frameworkId', requirePermission('frameworks.manage'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;
    const { frameworkId } = req.params;

    await pool.query(
      'DELETE FROM organization_frameworks WHERE organization_id = $1 AND framework_id = $2',
      [orgId, frameworkId]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization.framework.removed',
      resourceType: 'organization',
      resourceId: orgId,
      details: {
        removed_framework_id: frameworkId,
        history_preserved: true
      }
    });

    res.json({
      success: true,
      message: 'Framework removed',
      metadata: {
        history_preserved: true
      }
    });
  } catch (error) {
    log('error', 'organizations.frameworks.remove_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to remove framework' });
  }
});

module.exports = router;
