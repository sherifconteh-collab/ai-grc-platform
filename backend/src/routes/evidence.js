// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'evidence-route' }));

// Configure multer storage
const uploadsDir = path.join(__dirname, '../../../uploads/evidence');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// GET / - List evidence files
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search, tags, limit = 100, offset = 0 } = req.query;

    const params = [orgId];
    const conditions = ['ef.organization_id = $1'];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(ef.file_name ILIKE $${paramIndex} OR ef.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (tags) {
      const tagsArray = Array.isArray(tags) ? tags : tags.split(',');
      conditions.push(`ef.tags ?| $${paramIndex}::text[]`);
      params.push(tagsArray);
      paramIndex++;
    }

    params.push(Math.min(parseInt(limit, 10) || 100, 500));
    const limitIdx = paramIndex++;
    params.push(parseInt(offset, 10) || 0);
    const offsetIdx = paramIndex++;

    const query = `
      SELECT ef.*, u.email AS uploaded_by_email
      FROM evidence_files ef
      LEFT JOIN users u ON ef.uploaded_by = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ef.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      SELECT COUNT(*) FROM evidence_files ef
      WHERE ${conditions.join(' AND ')}
    `;
    const countParams = params.slice(0, conditions.length);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10)
    });
  } catch (error) {
    console.error('Error listing evidence files:', error);
    res.status(500).json({ success: false, error: 'Failed to list evidence files' });
  }
});

// POST /upload - Upload a single evidence file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const { description, tags } = req.body;

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch {
        parsedTags = [];
      }
    }

    const result = await pool.query(
      `INSERT INTO evidence_files (organization_id, file_name, file_path, file_size_bytes, mime_type, description, tags, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        orgId,
        req.file.originalname,
        req.file.filename,
        req.file.size,
        req.file.mimetype,
        description || null,
        JSON.stringify(parsedTags),
        userId
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error uploading evidence file:', error);
    // Clean up uploaded file on failure
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ success: false, error: 'Failed to upload evidence file' });
  }
});

// POST /bulk-upload - Upload multiple evidence files
router.post('/bulk-upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const { description, tags } = req.body;

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch {
        parsedTags = [];
      }
    }

    const valueClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const file of req.files) {
      valueClauses.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      params.push(
        orgId,
        file.originalname,
        file.filename,
        file.size,
        file.mimetype,
        description || null,
        JSON.stringify(parsedTags),
        userId
      );
    }

    const result = await pool.query(
      `INSERT INTO evidence_files (organization_id, file_name, file_path, file_size_bytes, mime_type, description, tags, uploaded_by)
       VALUES ${valueClauses.join(', ')}
       RETURNING *`,
      params
    );
    const results = result.rows;

    res.status(201).json({ success: true, data: results });
  } catch (error) {
    console.error('Error bulk uploading evidence files:', error);
    // Clean up uploaded files on failure
    if (req.files) {
      for (const file of req.files) {
        fs.unlink(file.path, () => {});
      }
    }
    res.status(500).json({ success: false, error: 'Failed to bulk upload evidence files' });
  }
});

// GET /:id - Get single evidence file by id
router.get('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT ef.*, u.email AS uploaded_by_email
       FROM evidence_files ef
       LEFT JOIN users u ON ef.uploaded_by = u.id
       WHERE ef.id = $1 AND ef.organization_id = $2`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error getting evidence file:', error);
    res.status(500).json({ success: false, error: 'Failed to get evidence file' });
  }
});

// GET /:id/download - Download evidence file
router.get('/:id/download', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM evidence_files WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    const evidence = result.rows[0];
    const filePath = path.join(uploadsDir, evidence.file_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream');
    const sanitizedName = evidence.file_name.replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedName}"; filename*=UTF-8''${encodeURIComponent(evidence.file_name)}`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading evidence file:', error);
    res.status(500).json({ success: false, error: 'Failed to download evidence file' });
  }
});

// PUT /:id - Update evidence metadata
router.put('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { description, tags, pii_classification, pii_types, data_sensitivity } = req.body;

    // Verify ownership
    const existing = await pool.query(
      `SELECT id FROM evidence_files WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (tags !== undefined) {
      fields.push(`tags = $${paramIndex++}`);
      params.push(JSON.stringify(tags));
    }
    if (pii_classification !== undefined) {
      fields.push(`pii_classification = $${paramIndex++}`);
      params.push(pii_classification);
    }
    if (pii_types !== undefined) {
      fields.push(`pii_types = $${paramIndex++}`);
      params.push(JSON.stringify(pii_types));
    }
    if (data_sensitivity !== undefined) {
      fields.push(`data_sensitivity = $${paramIndex++}`);
      params.push(data_sensitivity);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);
    params.push(orgId);

    const result = await pool.query(
      `UPDATE evidence_files SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND organization_id = $${paramIndex}
       RETURNING *`,
      params
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating evidence file:', error);
    res.status(500).json({ success: false, error: 'Failed to update evidence file' });
  }
});

// DELETE /:id - Delete evidence file
router.delete('/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM evidence_files WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    const evidence = result.rows[0];
    const filePath = path.join(uploadsDir, evidence.file_path);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('Error deleting file from disk:', err);
      }
    });

    res.json({ success: true, data: { id: evidence.id } });
  } catch (error) {
    console.error('Error deleting evidence file:', error);
    res.status(500).json({ success: false, error: 'Failed to delete evidence file' });
  }
});

// POST /:id/link - Link evidence to controls
router.post('/:id/link', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id } = req.params;
    const { controlIds, notes } = req.body;

    if (!controlIds || !Array.isArray(controlIds) || controlIds.length === 0) {
      return res.status(400).json({ success: false, error: 'controlIds array is required' });
    }

    // Verify evidence belongs to the organization
    const evidence = await pool.query(
      `SELECT id FROM evidence_files WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    if (evidence.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    const valueClauses = [];
    const params = [id];
    let paramIndex = 2;

    for (const controlId of controlIds) {
      valueClauses.push(`($1, $${paramIndex++}, $${paramIndex++})`);
      params.push(controlId, notes || null);
    }

    const result = await pool.query(
      `INSERT INTO control_evidence (evidence_file_id, control_id, notes)
       VALUES ${valueClauses.join(', ')}
       ON CONFLICT DO NOTHING
       RETURNING *`,
      params
    );

    res.status(201).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error linking evidence to controls:', error);
    res.status(500).json({ success: false, error: 'Failed to link evidence to controls' });
  }
});

// DELETE /:id/unlink/:controlId - Unlink evidence from a control
router.delete('/:id/unlink/:controlId', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { id, controlId } = req.params;

    // Verify evidence belongs to the organization
    const evidence = await pool.query(
      `SELECT id FROM evidence_files WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );

    if (evidence.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    const result = await pool.query(
      `DELETE FROM control_evidence WHERE evidence_file_id = $1 AND control_id = $2 RETURNING *`,
      [id, controlId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    res.json({ success: true, data: { evidenceFileId: id, controlId } });
  } catch (error) {
    console.error('Error unlinking evidence from control:', error);
    res.status(500).json({ success: false, error: 'Failed to unlink evidence from control' });
  }
});

module.exports = router;
