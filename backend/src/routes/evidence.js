// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { enqueueWebhookEvent } = require('../services/webhookService');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

router.use(authenticate);

async function emitEvidenceEvent(organizationId, eventType, payload) {
  await enqueueWebhookEvent({ organizationId, eventType, payload }).catch(() => {});
}

// GET /api/v1/evidence
router.get('/', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search, tags, limit = 100, offset = 0 } = req.query;

    const params = [orgId, Number(limit) || 100, Number(offset) || 0];
    let whereExtra = '';

    if (search) {
      params.push(`%${search}%`);
      whereExtra += ` AND (e.title ILIKE $${params.length} OR e.description ILIKE $${params.length})`;
    }
    if (tags) {
      params.push(tags);
      whereExtra += ` AND $${params.length} = ANY(e.tags)`;
    }

    const result = await pool.query(
      `SELECT e.*,
              u.email AS uploaded_by_email,
              COALESCE(
                json_agg(json_build_object('control_id', ecl.control_id, 'notes', ecl.notes))
                FILTER (WHERE ecl.id IS NOT NULL), '[]'
              ) AS control_links
       FROM evidence e
       LEFT JOIN users u ON u.id = e.uploaded_by
       LEFT JOIN evidence_control_links ecl ON ecl.evidence_id = e.id
       WHERE e.organization_id = $1 ${whereExtra}
       GROUP BY e.id, u.email
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    const count = await pool.query(
      `SELECT COUNT(*) FROM evidence WHERE organization_id = $1`,
      [orgId]
    );

    res.json({ success: true, data: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('Evidence list error:', err);
    res.status(500).json({ success: false, error: 'Failed to load evidence' });
  }
});

// POST /api/v1/evidence/upload
router.post('/upload', requirePermission('assessments.write'), upload.single('file'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { title, description, tags, pii_classification, data_sensitivity } = req.body || {};
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const parsedTags = tags ? (Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim())) : [];
    const effectiveTitle = title || req.file.originalname;
    // Store file content in binary column (migration 024 adds file_content to evidence)
    const result = await pool.query(
      `INSERT INTO evidence (
         organization_id, title, file_name, file_path, file_size, mime_type,
         file_content, description, tags, pii_classification, data_sensitivity, uploaded_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, title, file_name, file_size, mime_type,
                 description, tags, pii_classification, data_sensitivity, created_at`,
      [
        orgId,
        effectiveTitle,
        req.file.originalname,
        '', // file_path placeholder (no filesystem storage in community edition)
        req.file.size,
        req.file.mimetype,
        req.file.buffer,
        description || null,
        parsedTags,
        pii_classification || null,
        data_sensitivity || null,
        req.user.id
      ]
    );

    const row = result.rows[0];
    await emitEvidenceEvent(orgId, 'evidence.uploaded', { id: row.id, title: row.title });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error('Evidence upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload evidence' });
  }
});

// POST /api/v1/evidence/bulk-upload
router.post('/bulk-upload', requirePermission('assessments.write'), upload.array('files', 20), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const inserted = [];
    for (const file of req.files) {
      const r = await pool.query(
        `INSERT INTO evidence (organization_id, title, file_name, file_path, file_size, mime_type, file_content, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, title, file_name, created_at`,
        [orgId, file.originalname, file.originalname, '', file.size, file.mimetype, file.buffer, req.user.id]
      );
      inserted.push(r.rows[0]);
    }

    res.status(201).json({ success: true, data: inserted, count: inserted.length });
  } catch (err) {
    console.error('Evidence bulk-upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to bulk upload evidence' });
  }
});

// GET /api/v1/evidence/:id
router.get('/:id', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT e.*, u.email AS uploaded_by_email
       FROM evidence e
       LEFT JOIN users u ON u.id = e.uploaded_by
       WHERE e.organization_id = $1 AND e.id = $2`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Evidence get error:', err);
    res.status(500).json({ success: false, error: 'Failed to get evidence' });
  }
});

// GET /api/v1/evidence/:id/download
router.get('/:id/download', requirePermission('assessments.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT file_name, mime_type, file_content FROM evidence WHERE organization_id=$1 AND id=$2`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    const { file_name, mime_type, file_content } = result.rows[0];
    if (!file_content) {
      return res.status(404).json({ success: false, error: 'No file content stored' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.send(file_content);
  } catch (err) {
    console.error('Evidence download error:', err);
    res.status(500).json({ success: false, error: 'Failed to download evidence' });
  }
});

// PUT /api/v1/evidence/:id
router.put('/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { description, tags, pii_classification, pii_types, data_sensitivity } = req.body || {};

    const result = await pool.query(
      `UPDATE evidence
       SET description = COALESCE($3, description),
           tags = COALESCE($4, tags),
           pii_classification = COALESCE($5, pii_classification),
           pii_types = COALESCE($6, pii_types),
           data_sensitivity = COALESCE($7, data_sensitivity),
           updated_at = NOW()
       WHERE organization_id=$1 AND id=$2
       RETURNING id, title, description, tags, pii_classification, data_sensitivity, updated_at`,
      [orgId, req.params.id, description || null, tags || null, pii_classification || null, pii_types || null, data_sensitivity || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Evidence update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update evidence' });
  }
});

// DELETE /api/v1/evidence/:id
router.delete('/:id', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM evidence WHERE organization_id=$1 AND id=$2 RETURNING id, title`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    await emitEvidenceEvent(orgId, 'evidence.deleted', { id: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Evidence delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete evidence' });
  }
});

// POST /api/v1/evidence/:id/link
router.post('/:id/link', requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const evidenceId = req.params.id;
    const { controlIds, notes } = req.body || {};
    if (!Array.isArray(controlIds) || controlIds.length === 0) {
      return res.status(400).json({ success: false, error: 'controlIds array is required' });
    }

    // Verify evidence belongs to org
    const ev = await pool.query(`SELECT id FROM evidence WHERE organization_id=$1 AND id=$2`, [orgId, evidenceId]);
    if (ev.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    const links = [];
    for (const controlId of controlIds) {
      const r = await pool.query(
        `INSERT INTO evidence_control_links (evidence_id, control_id, notes, linked_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (evidence_id, control_id) DO UPDATE SET notes=EXCLUDED.notes, updated_at=NOW()
         RETURNING *`,
        [evidenceId, controlId, notes || null, req.user.id]
      );
      links.push(r.rows[0]);
    }

    res.json({ success: true, data: links });
  } catch (err) {
    console.error('Evidence link error:', err);
    res.status(500).json({ success: false, error: 'Failed to link evidence to controls' });
  }
});

module.exports = router;
