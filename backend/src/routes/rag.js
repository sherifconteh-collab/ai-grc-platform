// @tier: enterprise
/**
 * RAG (Retrieval-Augmented Generation) Routes
 * Endpoints for indexing, searching, and managing organization documents
 * used to enrich AI responses with org-specific context.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { log } = require('../utils/logger');
const ragService = require('../services/orgRagService');

router.use(authenticate);
router.use(requireTier('enterprise'));
router.use(requirePermission('ai.use'));
router.use(createRateLimiter({ label: 'rag', windowMs: 60 * 1000, max: 30 }));

// ---------------------------------------------------------------------------
// File upload config (reuse uploads dir)
// ---------------------------------------------------------------------------
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_RAG_TYPES = new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.csv']);

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_RAG_TYPES.has(ext)) {
      cb(null, true);
    } else {
      const err = new Error(`File type ${ext} not supported for RAG indexing. Allowed: ${[...ALLOWED_RAG_TYPES].join(', ')}`);
      err.status = 400;
      cb(err);
    }
  }
});

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------
async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    return fs.readFileSync(filePath, 'utf8');
  }

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.doc' || ext === '.docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ---------------------------------------------------------------------------
// POST /rag/index — Index a document (file upload)
// ---------------------------------------------------------------------------
router.post('/index', upload.single('file'), async (req, res) => {
  const organizationId = req.user.organization_id;
  const tmpPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided. Upload a document to index.' });
    }

    const sourceName = req.body.source_name || req.file.originalname;
    const sourceType = req.body.source_type || 'document';

    // Extract text
    const text = await extractText(tmpPath, req.file.originalname);
    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: 'Document contains too little text to index (minimum 50 characters).' });
    }

    // Index
    const result = await ragService.indexDocument({
      organizationId,
      text,
      sourceType,
      sourceName,
      metadata: {
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        uploadedBy: req.user.id
      }
    });

    res.json({ success: true, data: result });
  } catch (err) {
    log('error', 'rag.index.failed', { error: err.message, orgId: organizationId });
    res.status(500).json({ error: 'Failed to index document' });
  } finally {
    // Clean up temp file
    if (tmpPath && fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
});

// ---------------------------------------------------------------------------
// POST /rag/index-text — Index raw text (no file upload)
// ---------------------------------------------------------------------------
router.post('/index-text', async (req, res) => {
  const organizationId = req.user.organization_id;

  try {
    const { text, source_name, source_type, source_id, metadata } = req.body;
    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: 'Text must be at least 50 characters.' });
    }

    const result = await ragService.indexDocument({
      organizationId,
      text,
      sourceType: source_type || 'document',
      sourceId: source_id,
      sourceName: source_name || 'Untitled Document',
      metadata
    });

    res.json({ success: true, data: result });
  } catch (err) {
    log('error', 'rag.index_text.failed', { error: err.message, orgId: organizationId });
    res.status(500).json({ error: 'Failed to index text' });
  }
});

// ---------------------------------------------------------------------------
// POST /rag/search — Semantic search across indexed documents
// ---------------------------------------------------------------------------
router.post('/search', async (req, res) => {
  const organizationId = req.user.organization_id;

  try {
    const { query, top_k, threshold, source_type } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query text is required.' });
    }

    const results = await ragService.searchDocuments({
      organizationId,
      query: query.trim(),
      topK: top_k,
      threshold,
      sourceType: source_type
    });

    res.json({ success: true, data: results });
  } catch (err) {
    log('error', 'rag.search.failed', { error: err.message, orgId: organizationId });
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// ---------------------------------------------------------------------------
// GET /rag/documents — List indexed documents
// ---------------------------------------------------------------------------
router.get('/documents', async (req, res) => {
  const organizationId = req.user.organization_id;

  try {
    const documents = await ragService.listIndexedDocuments(organizationId);
    res.json({ success: true, data: documents });
  } catch (err) {
    log('error', 'rag.list.failed', { error: err.message, orgId: organizationId });
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

// ---------------------------------------------------------------------------
// GET /rag/stats — RAG stats for the organization
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  const organizationId = req.user.organization_id;

  try {
    const stats = await ragService.getOrgRagStats(organizationId);
    res.json({ success: true, data: stats });
  } catch (err) {
    log('error', 'rag.stats.failed', { error: err.message, orgId: organizationId });
    res.status(500).json({ error: 'Failed to fetch RAG stats' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /rag/documents/:sourceId — Remove an indexed document
// ---------------------------------------------------------------------------
router.delete('/documents/:sourceId', async (req, res) => {
  const organizationId = req.user.organization_id;
  const { sourceId } = req.params;
  const sourceType = req.query.source_type || 'document';

  try {
    await ragService.removeDocument(organizationId, sourceType, sourceId);
    res.json({ success: true, message: 'Document removed from RAG index.' });
  } catch (err) {
    log('error', 'rag.delete.failed', { error: err.message, orgId: organizationId });
    res.status(500).json({ error: 'Failed to remove document' });
  }
});

module.exports = router;
