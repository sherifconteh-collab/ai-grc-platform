// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { decrypt } = require('../utils/encrypt');
const { validateBody, requireFields, isUuid } = require('../middleware/validate');
const { getConfigValue } = require('../services/dynamicConfigService');
const { enqueueWebhookEvent } = require('../services/webhookService');
const crosswalkCredits = require('../services/crosswalkCreditService');
const { createRateLimiter } = require('../middleware/rateLimit');
const { log } = require('../utils/logger');

const STRICT_CROSSWALK_MAPPING_TYPES = ['equivalent', 'exact'];

router.use(authenticate);

// GET /controls/:id
router.get('/:id',
  createRateLimiter({ label: 'control-detail', windowMs: 60 * 1000, max: 120 }),
  requirePermission('controls.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fc.id, fc.control_id,
             COALESCE(occ.title, fc.title) as title,
             COALESCE(occ.description, fc.description) as description,
             fc.control_type, fc.priority,
             f.id as framework_id, f.name as framework_name, f.code as framework_code,
             COALESCE(ci.status, 'not_started') as implementation_status,
             ci.implementation_notes, ci.evidence_location, ci.assigned_to, ci.notes, ci.implementation_date, ci.due_date,
             u.first_name || ' ' || u.last_name as assigned_to_name, u.email as assigned_to_email
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $2
       AND occ.framework_control_id = fc.id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $2
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE fc.id = $1
    `, [req.params.id, req.user.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control not found' });
    }

    const row = result.rows[0];

    // A control marked satisfied without evidence of its own is the first thing
    // an assessor questions, so ship the provenance with it rather than leaving
    // the bare status to speak for itself.
    const crosswalkCreditRows = row.implementation_status === 'satisfied_via_crosswalk'
      ? await crosswalkCredits.getCreditsForControl(req.user.organization_id, req.params.id)
      : [];

    res.json({
      success: true,
      data: {
        ...row,
        assigned_to_email: decrypt(row.assigned_to_email),
        crosswalk_credits: crosswalkCreditRows
      }
    });
  } catch (error) {
    log('error', 'get_control_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to load control' });
  }
});

// PUT /controls/:id/implementation
// Crosswalk propagation makes this one status change fan out into a mapping
// query plus a read-modify-write per credited control, so it costs far more
// than the single row it appears to update.
router.put('/:id/implementation',
  createRateLimiter({ label: 'control-implementation-update', windowMs: 60 * 1000, max: 60 }),
  requirePermission('controls.write'), validateBody((body) => {
  const errors = requireFields(body, ['status']);
  const allowedStatuses = ['not_started', 'in_progress', 'implemented', 'needs_review', 'satisfied_via_crosswalk', 'verified', 'not_applicable'];
  if (body.status && !allowedStatuses.includes(body.status)) {
    errors.push(`status must be one of: ${allowedStatuses.join(', ')}`);
  }
  if (body.assignedTo && !isUuid(body.assignedTo)) {
    errors.push('assignedTo must be a valid UUID');
  }
  return errors;
}), async (req, res) => {
  try {
    const controlId = req.params.id;
    const orgId = req.user.organization_id;
    const {
      status,
      implementationDetails,
      evidenceUrl,
      assignedTo,
      notes,
      propagateEvidence,
      poam_justification,
      framework_specific_type,
      framework_specific_data
    } = req.body;

    // Get current implementation status to detect changes
    const existingResult = await pool.query(
      `SELECT status FROM control_implementations WHERE control_id = $1 AND organization_id = $2 LIMIT 1`,
      [controlId, orgId]
    );
    const previousStatus = existingResult.rows.length > 0 ? existingResult.rows[0].status : 'not_started';

    // Check if this is a transition from non-compliant to compliant
    const nonCompliantStatuses = ['not_started', 'in_progress', 'needs_review'];
    const compliantStatuses = ['implemented', 'satisfied_via_crosswalk', 'verified'];
    const isComplianceChange = nonCompliantStatuses.includes(previousStatus) && compliantStatuses.includes(status);

    // If transitioning to compliant without POA&M justification, require it
    if (isComplianceChange && !poam_justification) {
      return res.status(400).json({
        success: false,
        error: 'When marking a control as compliant, you must provide poam_justification explaining the remediation',
        requires_poam_submission: true
      });
    }

    // Upsert implementation
    const result = await pool.query(`
      INSERT INTO control_implementations (control_id, organization_id, status, implementation_notes, evidence_location, assigned_to, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (control_id, organization_id) DO UPDATE SET
        status = EXCLUDED.status,
        implementation_notes = COALESCE(EXCLUDED.implementation_notes, control_implementations.implementation_notes),
        evidence_location = COALESCE(EXCLUDED.evidence_location, control_implementations.evidence_location),
        assigned_to = COALESCE(EXCLUDED.assigned_to, control_implementations.assigned_to),
        notes = COALESCE(EXCLUDED.notes, control_implementations.notes),
        implementation_date = CASE WHEN EXCLUDED.status = 'implemented' THEN CURRENT_DATE ELSE control_implementations.implementation_date END
      RETURNING *
    `, [controlId, orgId, status, implementationDetails || null, evidenceUrl || null, assignedTo || null, notes || null]);

    // Get control details for POA&M creation
    const controlResult = await pool.query(
      `SELECT fc.control_id, fc.title FROM framework_controls fc WHERE fc.id = $1 LIMIT 1`,
      [controlId]
    );
    const control = controlResult.rows[0];

    // If transitioning to compliant, create or link POA&M
    let poamItem = null;
    if (isComplianceChange && poam_justification) {
      // Check if a POA&M already exists for this control
      const existingPoamResult = await pool.query(
        `SELECT id FROM poam_items 
         WHERE organization_id = $1 AND control_id = $2 AND status IN ('open', 'in_progress', 'pending_review')
         ORDER BY created_at DESC LIMIT 1`,
        [orgId, controlId]
      );

      if (existingPoamResult.rows.length > 0) {
        // Update existing POA&M
        const poamId = existingPoamResult.rows[0].id;
        const updatedPoam = await pool.query(
          `UPDATE poam_items
           SET status = 'pending_auditor_review',
               remediation_plan = COALESCE(remediation_plan, $3),
               closure_notes = $4,
               updated_at = NOW()
           WHERE id = $1 AND organization_id = $2
           RETURNING *`,
          [poamId, orgId, poam_justification, `Control ${control?.control_id} marked as ${status}`]
        );
        poamItem = updatedPoam.rows[0];

        // Add update record
        await pool.query(
          `INSERT INTO poam_item_updates (
             organization_id, poam_item_id, update_type, note, previous_status, new_status, changed_by
           )
           VALUES ($1, $2, 'status_change', $3, 'in_progress', 'pending_auditor_review', $4)`,
          [orgId, poamId, `Control remediated: ${poam_justification}`, req.user.id]
        );
      } else {
        // Create new POA&M
        const newPoam = await pool.query(
          `INSERT INTO poam_items (
             organization_id, title, description, source_type, control_id,
             status, priority, remediation_plan, closure_notes, created_by
           )
           VALUES ($1, $2, $3, 'control', $4, 'pending_auditor_review', 'medium', $5, $6, $7)
           RETURNING *`,
          [
            orgId,
            `Remediation: ${control?.control_id} - ${control?.title}`,
            `Control transitioned from ${previousStatus} to ${status}`,
            controlId,
            poam_justification,
            `Control marked as ${status}`,
            req.user.id
          ]
        );
        poamItem = newPoam.rows[0];

        // Add initial update record
        await pool.query(
          `INSERT INTO poam_item_updates (
             organization_id, poam_item_id, update_type, note, new_status, changed_by
           )
           VALUES ($1, $2, 'status_change', $3, 'pending_auditor_review', $4)`,
          [orgId, poamItem.id, 'POA&M created for control compliance change', req.user.id]
        );
      }

      // Create approval request
      await pool.query(
        `INSERT INTO poam_approval_requests (
           organization_id, poam_item_id, control_id, previous_control_status,
           new_control_status, justification, submitted_by, framework_specific_type,
           framework_specific_data
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orgId,
          poamItem.id,
          controlId,
          previousStatus,
          status,
          poam_justification,
          req.user.id,
          framework_specific_type || 'standard',
          framework_specific_data || {}
        ]
      );

      // Send notification to auditors
      await enqueueWebhookEvent({
        organizationId: orgId,
        eventType: 'control.compliance_change',
        payload: {
          control_id: controlId,
          control_code: control?.control_id,
          previous_status: previousStatus,
          new_status: status,
          poam_id: poamItem.id
        }
      }).catch(() => {});
    }

    // Auto-crosswalk: if implemented, find high-similarity mappings
    let crosswalkedControls = [];
    let propagatedEvidenceLinks = 0;
    let withdrawnCredits = 0;
    const appliedCredits = [];
    if (status === 'implemented') {
      const thresholdConfig = await getConfigValue(orgId, 'crosswalk', 'inheritance_min_similarity', { value: 90 });
      const similarityThreshold = Number(
        thresholdConfig && typeof thresholdConfig === 'object'
          ? thresholdConfig.value
          : thresholdConfig
      ) || 90;

      const evidencePropagationConfig = await getConfigValue(orgId, 'crosswalk', 'auto_propagate_evidence_exact', { value: false });
      const shouldPropagateEvidence = typeof propagateEvidence === 'boolean'
        ? propagateEvidence
        : Boolean(
          evidencePropagationConfig && typeof evidencePropagationConfig === 'object'
            ? evidencePropagationConfig.value
            : evidencePropagationConfig
        );

      const mappings = await pool.query(`
        SELECT 
          cm.id,
          cm.source_control_id,
          cm.target_control_id,
          cm.similarity_score,
          cm.mapping_type,
          CASE 
            WHEN cm.source_control_id = $1 THEN cm.target_control_id
            ELSE cm.source_control_id
          END AS mapped_control_id,
          fc.control_id as mapped_control_code,
          fc.title as mapped_title,
          f.name as framework_name,
          f.code as framework_code
        FROM control_mappings cm
        JOIN framework_controls fc ON fc.id = CASE 
          WHEN cm.source_control_id = $1 THEN cm.target_control_id
          ELSE cm.source_control_id
        END
        JOIN frameworks f ON f.id = fc.framework_id
        WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
          AND cm.similarity_score >= $2
          AND (
            COALESCE(LOWER(cm.mapping_type), '') = ANY($3::text[])
            OR cm.similarity_score = 100
          )
          AND cm.source_control_id != cm.target_control_id
          -- Credit only frameworks the organization is actually pursuing;
          -- satisfying controls in a framework they have not adopted inflates
          -- the posture the dashboards report. Organizations that have never
          -- populated organization_frameworks have declared no scope, so the
          -- original unrestricted behavior stands for them.
          AND (
            NOT EXISTS (SELECT 1 FROM organization_frameworks scope WHERE scope.organization_id = $4)
            OR EXISTS (
              SELECT 1 FROM organization_frameworks scope
              WHERE scope.organization_id = $4 AND scope.framework_id = fc.framework_id
            )
          )
      `, [controlId, similarityThreshold, STRICT_CROSSWALK_MAPPING_TYPES, orgId]);

      for (const mapping of mappings.rows) {
        const mappedControlId = mapping.mapped_control_id;

        // The CTE reads the target's status before the upsert rewrites it, so
        // the ledger can record what to restore on withdrawal and so a target
        // that was already satisfied by someone's own work is not logged as
        // crosswalk credit.
        const credited = await pool.query(`
          WITH prior AS (
            SELECT status FROM control_implementations
            WHERE control_id = $1 AND organization_id = $2
          ),
          upserted AS (
            INSERT INTO control_implementations (control_id, organization_id, status, notes)
            VALUES ($1, $2, 'satisfied_via_crosswalk', $3)
            ON CONFLICT (control_id, organization_id) DO UPDATE SET
              status = CASE WHEN control_implementations.status = 'not_started' THEN 'satisfied_via_crosswalk' ELSE control_implementations.status END,
              notes = CASE WHEN control_implementations.status = 'not_started'
                THEN COALESCE(control_implementations.notes || E'\n', '') || $3
                ELSE control_implementations.notes END
            RETURNING status
          )
          SELECT COALESCE((SELECT status FROM prior), 'not_started') AS previous_status,
                 (SELECT status FROM upserted) AS new_status
        `, [mappedControlId, orgId, `Auto-satisfied via crosswalk (${mapping.similarity_score}% ${mapping.mapping_type || 'mapped'} match)`]);

        if (credited.rows[0]?.new_status === 'satisfied_via_crosswalk') {
          appliedCredits.push({
            targetControlId: mappedControlId,
            similarityScore: mapping.similarity_score,
            mappingType: mapping.mapping_type,
            previousStatus: credited.rows[0].previous_status
          });
        }

        if (shouldPropagateEvidence) {
          const propagated = await pool.query(
            `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
             SELECT DISTINCT ecl.evidence_id, $2::uuid, $3
             FROM evidence_control_links ecl
             JOIN evidence e ON e.id = ecl.evidence_id
             WHERE ecl.control_id = $4::uuid
               AND e.organization_id = $1
             ON CONFLICT (evidence_id, control_id) DO NOTHING`,
            [
              orgId,
              mappedControlId,
              `Auto-propagated via strict crosswalk from control ${controlId}`,
              controlId
            ]
          );
          propagatedEvidenceLinks += propagated.rowCount || 0;
        }

        crosswalkedControls.push({
          controlId: mapping.mapped_control_code,
          title: mapping.mapped_title,
          framework: mapping.framework_name,
          similarity: mapping.similarity_score,
          mappingType: mapping.mapping_type || null
        });
      }

      // Record provenance for every credit applied, so it can be explained to
      // an assessor and withdrawn if this source stops being implemented.
      // Bookkeeping must never fail the status change the user asked for.
      try {
        await crosswalkCredits.recordCredits(pool, {
          organizationId: orgId,
          sourceControlId: controlId,
          credits: appliedCredits,
          actorUserId: req.user.id
        });
      } catch (creditError) {
        log('error', 'crosswalk.record_credits_failed', {
          organizationId: orgId, controlId, error: creditError?.message || String(creditError)
        });
      }
    } else if (crosswalkCredits.CREDITING_STATUSES.includes(previousStatus)) {
      // The source has left a crediting status: withdraw the controls it was
      // holding up, unless another implemented source still justifies them.
      const withdrawal = await crosswalkCredits.handleSourceStatusChange({
        organizationId: orgId,
        controlId,
        newStatus: status,
        actorUserId: req.user.id
      });
      withdrawnCredits = withdrawal.withdrawn || 0;
    }

    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
       VALUES ($1, $2, 'control_status_changed', 'control', $3, $4)`,
      [
        orgId,
        req.user.id,
        controlId,
        JSON.stringify({
          previous_status: previousStatus,
          new_status: status,
          crosswalkedControls: crosswalkedControls.length,
          withdrawnCrosswalkCredits: withdrawnCredits,
          propagatedEvidenceLinks,
          poam_created: !!poamItem
        })
      ]
    );

    res.json({
      success: true,
      data: {
        implementation: result.rows[0],
        crosswalkedControls,
        withdrawnCrosswalkCredits: withdrawnCredits,
        propagatedEvidenceLinks,
        poam_item: poamItem,
        status_change_detected: previousStatus !== status,
        requires_auditor_review: isComplianceChange
      }
    });
  } catch (error) {
    log('error', 'update_implementation_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to update implementation' });
  }
});

// POST /controls/:id/inherit
// Manually trigger inheritance to mapped controls with dynamic threshold support.
// The heaviest route here: several queries per mapped control, and a control
// can carry dozens of mappings. Held well below the ordinary write limit.
router.post('/:id/inherit',
  createRateLimiter({ label: 'control-inherit', windowMs: 60 * 1000, max: 20 }),
  requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const sourceControlId = req.params.id;
    const {
      minSimilarity,
      inheritedStatus,
      includeAlreadyImplemented = false,
      propagateEvidence,
      dryRun = false
    } = req.body || {};

    const configThreshold = await getConfigValue(orgId, 'crosswalk', 'inheritance_min_similarity', { value: 90 });
    const resolvedThreshold = Math.max(
      1,
      Math.min(
        100,
        Number(minSimilarity || (configThreshold && typeof configThreshold === 'object' ? configThreshold.value : configThreshold) || 90)
      )
    );

    const sourceImpl = await pool.query(
      `SELECT status
       FROM control_implementations
       WHERE organization_id = $1
         AND control_id = $2
       LIMIT 1`,
      [orgId, sourceControlId]
    );
    const sourceStatus = sourceImpl.rows[0]?.status || 'in_progress';
    const nextStatus = inheritedStatus || (sourceStatus === 'implemented' ? 'satisfied_via_crosswalk' : sourceStatus);
    const evidencePropagationConfig = await getConfigValue(orgId, 'crosswalk', 'auto_propagate_evidence_exact', { value: false });
    const shouldPropagateEvidence = typeof propagateEvidence === 'boolean'
      ? propagateEvidence
      : Boolean(
        evidencePropagationConfig && typeof evidencePropagationConfig === 'object'
          ? evidencePropagationConfig.value
          : evidencePropagationConfig
      );

    const mappings = await pool.query(
      `SELECT
         CASE
           WHEN cm.source_control_id = $1 THEN cm.target_control_id
           ELSE cm.source_control_id
         END AS target_control_id,
         cm.similarity_score,
         cm.mapping_type,
         fc.control_id AS target_control_code,
         fc.title AS target_control_title
       FROM control_mappings cm
       JOIN framework_controls fc ON fc.id = (
         CASE
           WHEN cm.source_control_id = $1 THEN cm.target_control_id
           ELSE cm.source_control_id
         END
       )
       WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
         AND cm.similarity_score >= $2
         AND (
           COALESCE(LOWER(cm.mapping_type), '') = ANY($3::text[])
           OR cm.similarity_score = 100
         )
         AND cm.source_control_id != cm.target_control_id
       ORDER BY cm.similarity_score DESC`,
      [sourceControlId, resolvedThreshold, STRICT_CROSSWALK_MAPPING_TYPES]
    );

    const processed = [];
    const inheritedCredits = [];
    let propagatedEvidenceLinks = 0;
    for (const mapRow of mappings.rows) {
      const current = await pool.query(
        `SELECT status
         FROM control_implementations
         WHERE organization_id = $1 AND control_id = $2
         LIMIT 1`,
        [orgId, mapRow.target_control_id]
      );
      const currentStatus = current.rows[0]?.status || 'not_started';
      const shouldSkip = !includeAlreadyImplemented && ['implemented', 'verified'].includes(currentStatus);
      processed.push({
        target_control_id: mapRow.target_control_id,
        target_control_code: mapRow.target_control_code,
        target_control_title: mapRow.target_control_title,
        similarity_score: mapRow.similarity_score,
        mapping_type: mapRow.mapping_type,
        previous_status: currentStatus,
        next_status: shouldSkip ? currentStatus : nextStatus,
        skipped: shouldSkip
      });

      if (dryRun || shouldSkip) continue;

      await pool.query(
        `INSERT INTO control_implementations (control_id, organization_id, status, notes, implementation_date)
         VALUES ($1, $2, $3::text, $4, CASE WHEN $3::text = 'implemented' THEN CURRENT_DATE ELSE NULL END)
         ON CONFLICT (control_id, organization_id) DO UPDATE SET
           status = EXCLUDED.status,
           notes = CASE
             WHEN COALESCE(control_implementations.notes, '') = '' THEN EXCLUDED.notes
             ELSE control_implementations.notes || E'\n' || EXCLUDED.notes
           END`,
        [
          mapRow.target_control_id,
          orgId,
          nextStatus,
          `Inherited from mapped control ${sourceControlId} (${mapRow.similarity_score}% ${mapRow.mapping_type || 'mapped'} similarity).`
        ]
      );

      if (shouldPropagateEvidence) {
        const propagated = await pool.query(
          `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
           SELECT DISTINCT ecl.evidence_id, $2::uuid, $3
           FROM evidence_control_links ecl
           JOIN evidence e ON e.id = ecl.evidence_id
           WHERE ecl.control_id = $4::uuid
             AND e.organization_id = $1
           ON CONFLICT (evidence_id, control_id) DO NOTHING`,
          [
            orgId,
            mapRow.target_control_id,
            `Inherited evidence via strict crosswalk from control ${sourceControlId}`,
            sourceControlId
          ]
        );
        propagatedEvidenceLinks += propagated.rowCount || 0;
      }

      await pool.query(
        `INSERT INTO control_inheritance_events (
           organization_id, source_control_id, target_control_id, source_status, inherited_status,
           similarity_score, event_notes, triggered_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orgId,
          sourceControlId,
          mapRow.target_control_id,
          sourceStatus,
          nextStatus,
          mapRow.similarity_score,
          'Manual inheritance trigger',
          req.user.id
        ]
      );

      // control_inheritance_events is an append-only history of what happened.
      // The ledger is the live record of what is currently being credited, which
      // is what withdrawal and assessor-facing provenance read.
      if (nextStatus === 'satisfied_via_crosswalk') {
        inheritedCredits.push({
          targetControlId: mapRow.target_control_id,
          similarityScore: mapRow.similarity_score,
          mappingType: mapRow.mapping_type,
          previousStatus: currentStatus
        });
      }
    }

    if (!dryRun && inheritedCredits.length > 0) {
      try {
        await crosswalkCredits.recordCredits(pool, {
          organizationId: orgId,
          sourceControlId,
          credits: inheritedCredits,
          actorUserId: req.user.id
        });
      } catch (creditError) {
        log('error', 'crosswalk.record_credits_failed', {
          organizationId: orgId, controlId: sourceControlId,
          error: creditError?.message || String(creditError)
        });
      }
    }

    if (!dryRun) {
      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
         VALUES ($1, $2, 'control_inheritance_triggered', 'control', $3, $4::jsonb, true)`,
        [
          orgId,
          req.user.id,
          sourceControlId,
          JSON.stringify({
            threshold: resolvedThreshold,
            inherited_status: nextStatus,
            processed: processed.length,
            updated: processed.filter((p) => !p.skipped).length,
            propagatedEvidenceLinks
          })
        ]
      );

      await enqueueWebhookEvent({
        organizationId: orgId,
        eventType: 'control.inheritance.triggered',
        payload: {
          source_control_id: sourceControlId,
          threshold: resolvedThreshold,
          inherited_status: nextStatus,
          updated: processed.filter((p) => !p.skipped).length
        }
      }).catch(() => {});
    }

    res.json({
      success: true,
      data: {
        source_control_id: sourceControlId,
        threshold: resolvedThreshold,
        inherited_status: nextStatus,
        dry_run: Boolean(dryRun),
        propagatedEvidenceLinks,
        processed
      }
    });
  } catch (error) {
    log('error', 'control_inherit_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to run control inheritance' });
  }
});

// GET /controls/:id/mappings
router.get('/:id/mappings', requirePermission('controls.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        fc2.id, fc2.control_id, COALESCE(occ.title, fc2.title) as title,
        f2.code as framework_code, f2.name as framework_name,
        cm.similarity_score, cm.mapping_type, cm.notes,
        COALESCE(ci.status, 'not_started') as implementation_status
      FROM control_mappings cm
      JOIN framework_controls fc2 ON (
        CASE WHEN cm.source_control_id = $1 THEN fc2.id = cm.target_control_id
             ELSE fc2.id = cm.source_control_id END
      )
      JOIN frameworks f2 ON f2.id = fc2.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $2
       AND occ.framework_control_id = fc2.id
      LEFT JOIN control_implementations ci ON ci.control_id = fc2.id AND ci.organization_id = $2
      WHERE (cm.source_control_id = $1 OR cm.target_control_id = $1)
        AND fc2.id != $1
      ORDER BY cm.similarity_score DESC
    `, [req.params.id, req.user.organization_id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'get_mappings_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to load mappings' });
  }
});

// GET /controls/:id/history
router.get('/:id/history', requirePermission('controls.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.id, al.event_type, al.details, al.created_at,
             u.first_name || ' ' || u.last_name as changed_by
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE (al.resource_id = $1 OR al.resource_id IN (SELECT id FROM control_implementations WHERE control_id = $1 AND organization_id = $2))
        AND al.resource_type = 'control'
        AND al.organization_id = $2
      ORDER BY al.created_at DESC
      LIMIT 50
    `, [req.params.id, req.user.organization_id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'control_history_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to load control history' });
  }
});

module.exports = router;
