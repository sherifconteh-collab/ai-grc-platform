// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');

router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'rag-route' }));

let multer;
try {
  multer = require('multer');
} catch (e) {
  // multer not available; file upload will be disabled
}

const upload = multer ? multer({ storage: multer.memoryStorage() }) : null;

router.post('/index', upload ? upload.single('file') : (req, res, next) => next(), async (req, res) => {
  try {
    const org = req.user.organization_id;
    const source_name = req.file ? req.file.originalname : req.body.source_name;
    const source_type = req.body.source_type || 'file';
    const source_id = req.body.source_id || null;
    const content_hash = req.body.content_hash || null;

    const result = await pool.query(
      `INSERT INTO rag_documents (organization_id, source_name, source_type, source_id, content_hash, chunk_count)
       VALUES ($1, $2, $3, $4, $5, 0) RETURNING *`,
      [org, source_name, source_type, source_id, content_hash]
    );
    return res.status(201).json({
      success: true,
      data: { document_id: result.rows[0].id, chunks: 0, message: 'RAG indexing not yet configured' }
    });
  } catch (error) {
    console.error('Error indexing document:', error);
    return res.status(500).json({ success: false, error: 'Failed to index document' });
  }
});

router.post('/index-text', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { text, source_name, source_type, source_id } = req.body;
    const result = await pool.query(
      `INSERT INTO rag_documents (organization_id, source_name, source_type, source_id, content_hash, chunk_count)
       VALUES ($1, $2, $3, $4, $5, 0) RETURNING *`,
      [org, source_name, source_type || 'text', source_id, null]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error indexing text:', error);
    return res.status(500).json({ success: false, error: 'Failed to index text' });
  }
});

router.post('/search', async (req, res) => {
  try {
    return res.json({ success: true, data: { results: [], message: 'RAG search not yet configured' } });
  } catch (error) {
    console.error('Error searching:', error);
    return res.status(500).json({ success: false, error: 'Failed to search' });
  }
});

router.get('/documents', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      'SELECT * FROM rag_documents WHERE organization_id = $1 ORDER BY created_at DESC',
      [org]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing documents:', error);
    return res.status(500).json({ success: false, error: 'Failed to list documents' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total_documents, COALESCE(SUM(chunk_count), 0)::int AS total_chunks
       FROM rag_documents WHERE organization_id = $1`,
      [org]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

router.delete('/documents/:sourceId', async (req, res) => {
  try {
    const org = req.user.organization_id;
    const { sourceId } = req.params;
    const { source_type } = req.query;

    let query = 'DELETE FROM rag_documents WHERE source_id = $1 AND organization_id = $2';
    const values = [sourceId, org];

    if (source_type) {
      query += ' AND source_type = $3';
      values.push(source_type);
    }

    query += ' RETURNING id';
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    return res.json({ success: true, data: { deleted: result.rows.length } });
  } catch (error) {
    console.error('Error deleting document:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

module.exports = router;
