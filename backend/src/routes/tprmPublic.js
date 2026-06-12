// @tier: enterprise
'use strict';

/**
 * TPRM Public Routes — unauthenticated vendor-facing endpoints.
 * Vendors access questionnaires via a cryptographically random token;
 * no ControlWeave account is required.
 */

const express = require('express');
const multer = require('multer');
const { createHmac, timingSafeEqual } = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const { createRateLimiter } = require('../middleware/rateLimit');
const { parseSbomBuffer } = require('../services/sbomService');

// Strict rate limiting for public endpoints (no org context)
const publicRateLimiter = createRateLimiter({
  label: 'tprm-public',
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip
});
router.use(publicRateLimiter);

// Optional HMAC signature verification (zero-trust layer on top of the token).
// If a vendor integration has TPRM_HMAC_SECRET configured, every request must
// include X-TPRM-Signature: sha384=<hex> (legacy sha256 accepted). Falls back
// to token-only when the secret is not configured — fully backward compatible.
async function verifyTprmSignature(req, res, next) {
  const secret = process.env.TPRM_HMAC_SECRET;
  if (!secret) return next();

  const signature = req.headers['x-tprm-signature'];
  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing HMAC signature' });
  }

  // Sign the exact raw request bytes (captured in server.js); bodyless
  // requests (GET) sign the empty string. For body-bearing methods without
  // rawBody the signature would be computed over '' — allowing any multipart
  // or non-JSON payload through — so reject instead.
  if (!req.rawBody && !['GET', 'HEAD', 'DELETE'].includes(req.method)) {
    return res.status(400).json({
      success: false,
      error: 'HMAC verification requires a JSON body; multipart or non-JSON payloads are not supported when TPRM_HMAC_SECRET is configured'
    });
  }
  const body = req.rawBody || '';
  // Prefer HMAC-SHA-384 (CNSA 1.0); accept legacy SHA-256 signers transitionally.
  let valid = false;
  for (const alg of ['sha384', 'sha256']) {
    const expected = `${alg}=${createHmac(alg, secret).update(body).digest('hex')}`;
    try {
      if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        valid = true;
        break;
      }
    } catch (_err) { /* length mismatch — try next algorithm */ }
  }

  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
  }

  next();
}

router.use(verifyTprmSignature);

// GET /api/v1/tprm-public/respond/:token
// Vendor opens their questionnaire link. Records opened_at on first access.
// Returns the questionnaire title, description, due date, and questions.
// Does NOT return responses from other vendors or any org-internal data.
router.get('/respond/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Validate token format (96 hex chars = 48 random bytes)
    if (!/^[0-9a-f]{96}$/i.test(token)) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const result = await pool.query(
      `SELECT q.id, q.title, q.description, q.due_date, q.status, q.questions,
              q.responses, q.opened_at, q.completed_at,
              v.vendor_name
       FROM tprm_questionnaires q
       JOIN tprm_vendors v ON v.id = q.vendor_id
       WHERE q.access_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found or link has expired' });
    }

    const q = result.rows[0];

    if (q.status === 'cancelled') {
      return res.status(410).json({ success: false, error: 'This questionnaire has been cancelled' });
    }

    // Record first open
    if (!q.opened_at) {
      await pool.query(
        `UPDATE tprm_questionnaires SET opened_at = NOW(), updated_at = NOW()
         WHERE access_token = $1`,
        [token]
      );
      q.opened_at = new Date().toISOString();
    }

    res.json({
      success: true,
      data: {
        id: q.id,
        title: q.title,
        description: q.description,
        due_date: q.due_date,
        status: q.status,
        questions: q.questions,
        // Return existing responses so vendor can continue where they left off
        responses: q.responses || {},
        completed: q.status === 'completed',
        vendor_name: q.vendor_name,
        opened_at: q.opened_at
      }
    });
  } catch (error) {
    console.error('TPRM public respond GET error:', error);
    res.status(500).json({ success: false, error: 'Failed to load questionnaire' });
  }
});

// PATCH /api/v1/tprm-public/respond/:token
// Vendor submits their responses (or saves progress).
// Accepts { responses: { "Q1": "...", "Q2": "..." }, completed: true|false }
router.patch('/respond/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { responses, completed } = req.body || {};

    if (!/^[0-9a-f]{96}$/i.test(token)) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    if (typeof responses !== 'object' || responses === null || Array.isArray(responses)) {
      return res.status(400).json({ success: false, error: 'responses must be an object mapping question IDs to answers' });
    }

    // Sanitise response values — only allow strings, numbers, booleans
    const sanitised = {};
    for (const [key, val] of Object.entries(responses)) {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        sanitised[String(key).slice(0, 64)] = typeof val === 'string' ? val.slice(0, 4000) : val;
      }
    }

    const result = await pool.query(
      `SELECT q.id, q.status, q.questions
       FROM tprm_questionnaires q
       WHERE q.access_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const q = result.rows[0];

    if (['cancelled', 'completed'].includes(q.status)) {
      return res.status(409).json({ success: false, error: `Questionnaire is already ${q.status}` });
    }

    const newStatus = completed ? 'completed' : 'in_progress';
    const setCompletedAt = completed ? ', completed_at = COALESCE(completed_at, NOW())' : '';

    await pool.query(
      `UPDATE tprm_questionnaires SET
         responses = $2::jsonb,
         status = $3,
         updated_at = NOW()
         ${setCompletedAt}
       WHERE access_token = $1`,
      [token, JSON.stringify(sanitised), newStatus]
    );

    res.json({
      success: true,
      data: { status: newStatus },
      message: completed ? 'Questionnaire submitted successfully. Thank you!' : 'Responses saved.'
    });
  } catch (error) {
    console.error('TPRM public respond PATCH error:', error);
    res.status(500).json({ success: false, error: 'Failed to save responses' });
  }
});

// ======================== EVIDENCE UPLOAD (vendor-facing) ========================

// Allowed evidence file types: SBOMs, PDFs, images of certs, text reports
const ALLOWED_EVIDENCE_EXTENSIONS = new Set([
  '.json', '.xml', '.yaml', '.yml', '.spdx', '.rdf', '.swidtag',  // SBOM formats
  '.pdf', '.txt', '.csv', '.xlsx', '.docx'                          // Documents
]);
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'application/json', 'application/xml', 'text/xml', 'text/plain',
  'text/yaml', 'application/x-yaml', 'application/spdx+json', 'application/spdx+yaml',
  'application/pdf',
  'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream'  // allow generic binary for SBOM uploads missing content-type
]);
const SBOM_EXTENSIONS = new Set(['.json', '.xml', '.yaml', '.yml', '.spdx', '.rdf', '.swidtag']);
const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024; // 10 MB

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname
      ? `.${file.originalname.toLowerCase().split('.').pop()}`
      : '';
    if (!ALLOWED_EVIDENCE_EXTENSIONS.has(ext)) {
      const err = new Error('Unsupported evidence file type');
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    // Also check MIME type if provided (allows generic binary for SBOM uploads missing content-type)
    if (file.mimetype && !ALLOWED_EVIDENCE_MIME_TYPES.has(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      const err = new Error('Unsupported MIME type');
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  }
});

// POST /api/v1/tprm-public/respond/:token/evidence
// Vendor uploads an evidence file (SBOM, PDF cert, pen test report, etc.).
// Parses SBOM files automatically and stores component summary.
router.post('/respond/:token/evidence', evidenceUpload.single('file'), async (req, res) => {
  try {
    const { token } = req.params;

    if (!/^[0-9a-f]{96}$/i.test(token)) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Send file as multipart field named "file".' });
    }

    // Look up questionnaire by token
    const qResult = await pool.query(
      `SELECT q.id, q.status, q.organization_id
       FROM tprm_questionnaires q
       WHERE q.access_token = $1`,
      [token]
    );

    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const q = qResult.rows[0];

    if (['cancelled', 'completed'].includes(q.status)) {
      return res.status(409).json({ success: false, error: `Cannot upload evidence: questionnaire is already ${q.status}` });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    const ext = originalname ? `.${originalname.toLowerCase().split('.').pop()}` : '';
    const isSbom = SBOM_EXTENSIONS.has(ext);

    let sbomFormat = null;
    let sbomComponentCount = null;
    let sbomSummary = null;
    let sbomParsedAt = null;

    // Attempt SBOM parsing for SBOM-format files
    if (isSbom) {
      try {
        const parsed = await parseSbomBuffer(buffer, originalname, mimetype);
        sbomFormat = parsed.format || null;
        const components = Array.isArray(parsed.components) ? parsed.components : [];
        sbomComponentCount = components.length;
        const vulnerabilities = Array.isArray(parsed.vulnerabilities) ? parsed.vulnerabilities : [];
        sbomSummary = {
          format: sbomFormat,
          specVersion: parsed.specVersion || null,
          tool: parsed.metadata?.tool || null,
          component_count: sbomComponentCount,
          vulnerability_count: vulnerabilities.length,
          components: components.slice(0, 50).map(c => ({
            name: c.name,
            version: c.version,
            purl: c.purl || null,
            licenses: Array.isArray(c.licenses) ? c.licenses : []
          })),
          top_vulnerabilities: vulnerabilities.slice(0, 10).map(v => ({
            id: v.id,
            severity: v.severity,
            description: v.description || null
          }))
        };
        sbomParsedAt = new Date().toISOString();
      } catch (sbomErr) {
        // Not a valid SBOM — store as plain file but don't mark is_sbom
        console.warn('TPRM evidence SBOM parse attempt failed:', sbomErr.message);
      }
    }

    // Store file content as UTF-8 text (non-text files stored as base64)
    let fileContent;
    try {
      fileContent = buffer.toString('utf8');
      // Sanity-check: if it has too many null bytes it's binary — base64 it
      const nullCount = (fileContent.match(/\0/g) || []).length;
      if (nullCount > 10) {
        fileContent = `base64:${buffer.toString('base64')}`;
      }
    } catch {
      fileContent = `base64:${buffer.toString('base64')}`;
    }

    const result = await pool.query(
      `INSERT INTO tprm_evidence (
         questionnaire_id, organization_id, original_filename, file_size_bytes, mime_type,
         is_sbom, sbom_format, sbom_component_count, sbom_parsed_at, sbom_summary, file_content
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, original_filename, file_size_bytes, is_sbom, sbom_format,
                 sbom_component_count, sbom_summary, uploaded_at`,
      [
        q.id, q.organization_id, originalname, size, mimetype || null,
        isSbom && sbomSummary !== null,
        sbomFormat, sbomComponentCount, sbomParsedAt,
        sbomSummary ? JSON.stringify(sbomSummary) : null,
        fileContent
      ]
    );

    const ev = result.rows[0];
    res.status(201).json({
      success: true,
      data: {
        id: ev.id,
        original_filename: ev.original_filename,
        file_size_bytes: ev.file_size_bytes,
        is_sbom: ev.is_sbom,
        sbom_format: ev.sbom_format,
        sbom_component_count: ev.sbom_component_count,
        sbom_summary: ev.sbom_summary,
        uploaded_at: ev.uploaded_at
      },
      // If file had an SBOM extension but parsing failed, surface a warning so the vendor knows
      sbom_parse_warning: isSbom && !ev.is_sbom
        ? 'File has an SBOM extension but could not be parsed as CycloneDX, SPDX, or SWID. It has been stored as a plain document.'
        : null,
      message: ev.is_sbom
        ? `SBOM uploaded and parsed: ${sbomComponentCount} components found.`
        : 'Evidence file uploaded successfully.'
    });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: 'File upload error. Check file size and format.' });
    }
    if (err.code === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(400).json({ success: false, error: 'Unsupported file type.' });
    }
    console.error('TPRM evidence upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload evidence file' });
  }
});

// GET /api/v1/tprm-public/respond/:token/evidence
// Vendor can list their own previously uploaded evidence files
router.get('/respond/:token/evidence', async (req, res) => {
  try {
    const { token } = req.params;
    if (!/^[0-9a-f]{96}$/i.test(token)) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }
    const result = await pool.query(
      `SELECT e.id, e.original_filename, e.file_size_bytes, e.mime_type,
              e.is_sbom, e.sbom_format, e.sbom_component_count, e.sbom_summary, e.uploaded_at
       FROM tprm_evidence e
       JOIN tprm_questionnaires q ON q.id = e.questionnaire_id
       WHERE q.access_token = $1
       ORDER BY e.uploaded_at DESC`,
      [token]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('TPRM evidence list (public) error:', err);
    res.status(500).json({ success: false, error: 'Failed to list evidence' });
  }
});

module.exports = router;
