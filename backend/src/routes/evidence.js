/**
 * evidence.js – Evidence file upload and retrieval routes.
 *
 * POST   /api/v1/evidence/upload   – upload a single evidence file
 * GET    /api/v1/evidence          – list all evidence files for the org
 * GET    /api/v1/evidence/:id      – get metadata for one file
 * DELETE /api/v1/evidence/:id      – delete a file and its record
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';

const router = Router();

// ---------------------------------------------------------------------------
// Multer – store uploads on disk under backend/uploads/
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/plain',
  'text/csv'
]);

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIMETYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Accepted: PDF, PNG, JPG, XLSX, DOCX, TXT, CSV'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

// ---------------------------------------------------------------------------
// POST /api/v1/evidence/upload
// multipart/form-data  – field "file", optional field "controlId"
// ---------------------------------------------------------------------------
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file type rejected' });
  }

  try {
    const { controlId } = req.body || {};
    const record = {
      id: req.file.filename.split('.')[0],       // the uuid we generated
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      controlId: controlId || null,
      uploadedAt: new Date().toISOString()
    };

    // If an evidence_files table exists use it; otherwise return metadata only.
    try {
      await pool.query(
        `INSERT INTO evidence_files (id, original_name, stored_name, mime_type, size, control_id, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [record.id, record.originalName, record.storedName, record.mimetype, record.size, record.controlId, record.uploadedAt]
      );
    } catch (dbErr) {
      // Table doesn't exist yet – that's fine, still return the file metadata
      console.warn('evidence_files table not found – skipping DB insert:', dbErr.message);
    }

    res.status(201).json(record);
  } catch (err) {
    console.error('POST /evidence/upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/evidence
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM evidence_files ORDER BY uploaded_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    // If table doesn't exist yet, return empty list instead of crashing
    if (err.code === '42P01') {
      return res.json([]);
    }
    console.error('GET /evidence error:', err);
    res.status(500).json({ error: 'Failed to fetch evidence files' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/evidence/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM evidence_files WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evidence file not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '42P01') {
      return res.status(404).json({ error: 'Evidence file not found' });
    }
    console.error('GET /evidence/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch evidence file' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/evidence/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    // Try to get stored filename from DB so we can delete the actual file
    let storedName = null;
    try {
      const result = await pool.query(
        'SELECT stored_name FROM evidence_files WHERE id = $1',
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Evidence file not found' });
      }
      storedName = result.rows[0].stored_name;
      await pool.query('DELETE FROM evidence_files WHERE id = $1', [req.params.id]);
    } catch (dbErr) {
      if (dbErr.code === '42P01') {
        return res.status(404).json({ error: 'Evidence file not found' });
      }
      throw dbErr;
    }

    // Remove from disk
    if (storedName) {
      const filePath = path.join(UPLOAD_DIR, storedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(204).end();
  } catch (err) {
    console.error('DELETE /evidence/:id error:', err);
    res.status(500).json({ error: 'Failed to delete evidence file' });
  }
});

export default router;
