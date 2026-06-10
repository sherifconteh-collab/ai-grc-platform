// @tier: community
/**
 * Audit artifact template management (list/create/upload/update/delete).
 *
 * Extracted verbatim from routes/assessments.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/assessments.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');
const {
  VALID_AUDIT_TEMPLATE_TYPES,
  TEMPLATE_MAX_CHARS,
  templateUpload,
  truncateText,
  normalizeNullableText,
  parseBooleanFlag,
  extractTemplateText,
} = require('./_shared');

// ============================================================
// GET /api/v1/assessments/templates
// List organization audit artifact templates
// ============================================================
router.get('/templates', requirePermission('assessments.read'), async (req, res) => {
  try {
    const artifactType = normalizeNullableText(req.query.artifact_type);
    const includeInactive = parseBooleanFlag(req.query.include_inactive, false);
    const includeContent = parseBooleanFlag(req.query.include_content, false);

    if (artifactType && !VALID_AUDIT_TEMPLATE_TYPES.includes(String(artifactType).toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `artifact_type must be one of: ${VALID_AUDIT_TEMPLATE_TYPES.join(', ')}`
      });
    }

    const params = [req.user.organization_id, req.user.id];
    let idx = 3;
    let query = `
      SELECT
        id,
        organization_id,
        owner_user_id,
        artifact_type,
        template_name,
        template_format,
        source_filename,
        source_mime_type,
        extraction_parser,
        extraction_warnings,
        is_default,
        is_active,
        created_by,
        created_at,
        updated_at,
        LEFT(template_content, 600) AS template_preview
      FROM audit_artifact_templates
      WHERE organization_id = $1
        AND owner_user_id = $2
    `;

    if (!includeInactive) {
      query += ' AND is_active = true';
    }
    if (artifactType) {
      query += ` AND artifact_type = $${idx++}`;
      params.push(String(artifactType).toLowerCase());
    }
    query += ' ORDER BY artifact_type, is_default DESC, updated_at DESC, created_at DESC';

    const rows = await pool.query(query, params);
    const data = rows.rows.map((row) => (
      includeContent
        ? row
        : {
            ...row,
            template_content: undefined
          }
    ));

    if (includeContent) {
      for (const row of data) {
        const full = await pool.query(
          'SELECT template_content FROM audit_artifact_templates WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3 LIMIT 1',
          [row.id, req.user.organization_id, req.user.id]
        );
        row.template_content = full.rows[0]?.template_content || '';
      }
    }

    res.json({ success: true, data });
  } catch (error) {
    log('error', 'list_audit_templates_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to list audit templates' });
  }
});

// ============================================================
// POST /api/v1/assessments/templates
// Create or upload template content as text/json payload
// ============================================================
router.post('/templates', requirePermission('assessments.write'), async (req, res) => {
  try {
    const {
      artifact_type,
      template_name,
      template_content,
      template_format = 'text',
      set_default = false
    } = req.body || {};

    const artifactType = String(artifact_type || '').trim().toLowerCase();
    if (!VALID_AUDIT_TEMPLATE_TYPES.includes(artifactType)) {
      return res.status(400).json({
        success: false,
        error: `artifact_type must be one of: ${VALID_AUDIT_TEMPLATE_TYPES.join(', ')}`
      });
    }
    if (!template_name || !String(template_name).trim()) {
      return res.status(400).json({ success: false, error: 'template_name is required' });
    }
    if (!template_content || !String(template_content).trim()) {
      return res.status(400).json({ success: false, error: 'template_content is required' });
    }

    const clipped = truncateText(String(template_content), TEMPLATE_MAX_CHARS);
    const wantsDefault = parseBooleanFlag(set_default, false);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (wantsDefault) {
        await client.query(
          `UPDATE audit_artifact_templates
           SET is_default = false, updated_at = NOW()
           WHERE organization_id = $1
             AND artifact_type = $2
             AND owner_user_id = $3
             AND is_active = true`,
          [req.user.organization_id, artifactType, req.user.id]
          );
        }

        const inserted = await client.query(
          `INSERT INTO audit_artifact_templates (
           organization_id, artifact_type, template_name, template_content,
           template_format, is_default, is_active, created_by, owner_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
         RETURNING *`,
        [
          req.user.organization_id,
          artifactType,
          String(template_name).trim(),
          clipped.value,
          String(template_format || 'text').trim().toLowerCase(),
          wantsDefault,
          req.user.id,
          req.user.id
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: {
          ...inserted.rows[0],
          was_truncated: clipped.truncated
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    log('error', 'create_audit_template_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to create audit template' });
  }
});

// ============================================================
// POST /api/v1/assessments/templates/upload
// Upload template file (txt/md/pdf/docx) and store parsed content
// ============================================================
router.post(
  '/templates/upload',
  requirePermission('assessments.write'),
  templateUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'file is required' });
      }

      const artifactType = String(req.body?.artifact_type || '').trim().toLowerCase();
      if (!VALID_AUDIT_TEMPLATE_TYPES.includes(artifactType)) {
        return res.status(400).json({
          success: false,
          error: `artifact_type must be one of: ${VALID_AUDIT_TEMPLATE_TYPES.join(', ')}`
        });
      }

      const uploadedName = String(req.body?.template_name || '').trim();
      const defaultName = path.parse(req.file.originalname || 'Audit Template').name || 'Audit Template';
      const templateName = uploadedName || defaultName;
      const wantsDefault = parseBooleanFlag(req.body?.set_default, false);
      const parsed = await extractTemplateText(req.file);
      if (!parsed.text || !parsed.text.trim()) {
        return res.status(400).json({
          success: false,
          error: 'No extractable template text found in uploaded file'
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (wantsDefault) {
          await client.query(
            `UPDATE audit_artifact_templates
             SET is_default = false, updated_at = NOW()
             WHERE organization_id = $1
               AND artifact_type = $2
               AND owner_user_id = $3
               AND is_active = true`,
            [req.user.organization_id, artifactType, req.user.id]
          );
        }

        const inserted = await client.query(
          `INSERT INTO audit_artifact_templates (
           organization_id, artifact_type, template_name, template_content,
           template_format, source_filename, source_mime_type, extraction_parser, extraction_warnings,
           is_default, is_active, created_by, owner_user_id
           )
           VALUES ($1, $2, $3, $4, 'text', $5, $6, $7, $8::jsonb, $9, true, $10, $11)
           RETURNING *`,
          [
            req.user.organization_id,
            artifactType,
            templateName,
            parsed.text,
            req.file.originalname || null,
            req.file.mimetype || null,
            parsed.parser,
            JSON.stringify(parsed.warnings || []),
            wantsDefault,
            req.user.id,
            req.user.id
          ]
        );
        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          data: {
            ...inserted.rows[0],
            extraction: {
              parser: parsed.parser,
              warnings: parsed.warnings,
              char_count: parsed.char_count,
              truncated: parsed.truncated
            }
          }
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      log('error', 'upload_audit_template_error', { error: error?.message || String(error) });
      res.status(500).json({ success: false, error: 'Failed to upload audit template' });
    }
  }
);

// ============================================================
// PATCH /api/v1/assessments/templates/:templateId
// Update template metadata/content/default flag/active flag
// ============================================================
router.patch('/templates/:templateId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { templateId } = req.params;
    const existing = await pool.query(
      `SELECT *
       FROM audit_artifact_templates
       WHERE id = $1 AND organization_id = $2 AND owner_user_id = $3
       LIMIT 1`,
      [templateId, req.user.organization_id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const current = existing.rows[0];
    const {
      template_name,
      template_content,
      is_default,
      is_active
    } = req.body || {};

    const updates = [];
    const params = [req.user.organization_id, templateId, req.user.id];
    let idx = 4;
    if (template_name !== undefined) {
      updates.push(`template_name = $${idx++}`);
      params.push(String(template_name || '').trim() || current.template_name);
    }
    if (template_content !== undefined) {
      const clipped = truncateText(String(template_content || ''), TEMPLATE_MAX_CHARS);
      updates.push(`template_content = $${idx++}`);
      params.push(clipped.value);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(parseBooleanFlag(is_active, true));
    }
    if (is_default !== undefined) {
      updates.push(`is_default = $${idx++}`);
      params.push(parseBooleanFlag(is_default, false));
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    const wantsDefault = is_default !== undefined && parseBooleanFlag(is_default, false);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (wantsDefault) {
        await client.query(
          `UPDATE audit_artifact_templates
           SET is_default = false, updated_at = NOW()
           WHERE organization_id = $1
             AND artifact_type = $2
             AND id <> $3
             AND owner_user_id = $4
             AND is_active = true`,
          [req.user.organization_id, current.artifact_type, templateId, req.user.id]
        );
      }
      updates.push('updated_at = NOW()');
      const updated = await client.query(
        `UPDATE audit_artifact_templates
         SET ${updates.join(', ')}
         WHERE organization_id = $1 AND id = $2 AND owner_user_id = $3
         RETURNING *`,
        params
      );
      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    log('error', 'update_audit_template_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to update audit template' });
  }
});

// ============================================================
// DELETE /api/v1/assessments/templates/:templateId
// Soft-delete template by setting is_active=false
// ============================================================
router.delete('/templates/:templateId', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { templateId } = req.params;
    const updated = await pool.query(
      `UPDATE audit_artifact_templates
       SET is_active = false, is_default = false, updated_at = NOW()
       WHERE organization_id = $1 AND id = $2 AND owner_user_id = $3
       RETURNING id`,
      [req.user.organization_id, templateId, req.user.id]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: { id: templateId, is_active: false } });
  } catch (error) {
    log('error', 'delete_audit_template_error', { error: error?.message || String(error) });
    res.status(500).json({ success: false, error: 'Failed to delete audit template' });
  }
});

module.exports = router;
