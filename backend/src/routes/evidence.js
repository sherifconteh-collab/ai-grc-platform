// @tier: pro
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { evidenceUploaded } = require('../services/realtimeEventService');
const ragService = require('../services/orgRagService');
const aiSecurity = require('../utils/aiSecurity');

router.use(authenticate);
router.use(requireTier('pro'));

function getRank(rankMap, value) {
  return rankMap.get(value) ?? 0;
}

// Helper: extract text from file for RAG indexing (same as rag.js extractText)
async function extractTextForRag(filePath, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const safeFilePath = resolveSafeUploadPath(filePath);
  if (ext === '.txt' || ext === '.md' || ext === '.csv') return readUploadTextFile(safeFilePath);
  if (ext === '.pdf') { const pdfParse = require('pdf-parse'); return (await pdfParse(readUploadBuffer(safeFilePath))).text; }
  if (ext === '.doc' || ext === '.docx') { const mammoth = require('mammoth'); return (await mammoth.extractRawText({ path: safeFilePath })).value; }
  return '';
}

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const resolvedUploadsDir = path.resolve(uploadsDir);

const ALLOWED_PII_CLASSIFICATIONS = ['none', 'low', 'moderate', 'high', 'critical'];
const ALLOWED_DATA_SENSITIVITIES = ['public', 'internal', 'confidential', 'restricted'];
const ALLOWED_PII_TYPES = ['name', 'email', 'ssn', 'address', 'phone', 'dob', 'financial', 'health', 'biometric', 'other'];

// Ranking maps for merging manual vs. auto classification (higher rank = stricter)
const PII_CLASS_RANK = new Map([
  ['none', 0],
  ['low', 1],
  ['moderate', 2],
  ['high', 3],
  ['critical', 4]
]);
const DATA_SENS_RANK = new Map([
  ['public', 0],
  ['internal', 1],
  ['confidential', 2],
  ['restricted', 3]
]);
function mergeClassification(manual, auto, rank) {
  return getRank(rank, auto) > getRank(rank, manual) ? auto : manual;
}

let evidenceColumnsCache = {
  expiresAt: 0,
  columns: null
};

async function getEvidenceColumns() {
  const now = Date.now();
  if (evidenceColumnsCache.columns && evidenceColumnsCache.expiresAt > now) {
    return evidenceColumnsCache.columns;
  }

  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'evidence'`
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  evidenceColumnsCache = {
    columns,
    expiresAt: now + 60 * 1000
  };
  return columns;
}

const ALLOWED_UPLOAD_TYPES = new Map([
  ['.pdf', ['application/pdf']],
  ['.doc', ['application/msword']],
  ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip']],
  ['.xls', ['application/vnd.ms-excel']],
  ['.xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip']],
  ['.csv', ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']],
  ['.txt', ['text/plain']],
  ['.png', ['image/png']],
  ['.jpg', ['image/jpeg']],
  ['.jpeg', ['image/jpeg']],
  ['.gif', ['image/gif']],
  ['.zip', ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip']],
  // Compliance/security artifacts
  ['.ckl', ['application/xml', 'text/xml']],
  ['.nessus', ['application/xml', 'text/xml']],
  ['.xml', ['application/xml', 'text/xml']],
  ['.json', ['application/json', 'text/json', 'application/sarif+json']],
  ['.sarif', ['application/sarif+json', 'application/json', 'text/json']],
  ['.fpr', ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip']]
]);

function isAllowedUpload(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedMimeTypes = ALLOWED_UPLOAD_TYPES.get(ext);
  if (!allowedMimeTypes) return false;
  const mimeType = String(file.mimetype || '').toLowerCase();
  // Browsers/Windows often send unknown types as octet-stream; trust the extension whitelist.
  if (!mimeType || mimeType === 'application/octet-stream') return true;
  return allowedMimeTypes.includes(mimeType);
}

function isSafeUploadPath(filePath) {
  if (!filePath) return false;
  const resolvedPath = path.resolve(filePath);
  return resolvedPath.startsWith(`${resolvedUploadsDir}${path.sep}`);
}

function resolveSafeUploadPath(filePath) {
  if (!filePath || !isSafeUploadPath(filePath)) {
    throw new Error('Stored file path is outside allowed uploads directory');
  }

  return path.resolve(filePath);
}

function uploadFileExists(filePath) {
  if (!filePath || !isSafeUploadPath(filePath)) {
    return false;
  }

  const resolvedPath = path.resolve(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is constrained to the uploads directory.
  return fs.existsSync(resolvedPath);
}

function readUploadTextFile(filePath) {
  const resolvedPath = resolveSafeUploadPath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is constrained to the uploads directory.
  return fs.readFileSync(resolvedPath, 'utf8');
}

function readUploadBuffer(filePath) {
  const resolvedPath = resolveSafeUploadPath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is constrained to the uploads directory.
  return fs.readFileSync(resolvedPath);
}

function createUploadReadStream(filePath) {
  const resolvedPath = resolveSafeUploadPath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is constrained to the uploads directory.
  return fs.createReadStream(resolvedPath);
}

function removeUploadFile(filePath) {
  if (!uploadFileExists(filePath)) {
    return false;
  }

  const resolvedPath = resolveSafeUploadPath(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved path is constrained to the uploads directory.
  fs.unlinkSync(resolvedPath);
  return true;
}

function sanitizeDownloadName(input) {
  const safe = String(input || 'evidence')
    .replace(/[\r\n]/g, ' ')
    .replace(/"/g, '')
    .replace(/[^a-zA-Z0-9._() -]/g, '_')
    .trim();
  return (safe || 'evidence').slice(0, 200);
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
  limits: { fileSize: Math.max(1, Number(process.env.EVIDENCE_MAX_UPLOAD_MB || 50)) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isAllowedUpload(file)) {
      const err = new Error('Unsupported file type');
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  }
});

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createUploadReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function getDefaultRetentionDate() {
  const retentionDays = Number(process.env.EVIDENCE_DEFAULT_RETENTION_DAYS || 365);
  const dt = new Date();
  dt.setDate(dt.getDate() + Math.max(1, retentionDays));
  return dt.toISOString().split('T')[0];
}

function normalizeRetentionDate(input) {
  if (!input) return getDefaultRetentionDate();
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return getDefaultRetentionDate();
  return parsed.toISOString().split('T')[0];
}

// GET /evidence
router.get('/', requirePermission('evidence.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search, tags, limit, offset } = req.query;
    const evidenceColumns = await getEvidenceColumns();

    const optionalSelect = [
      evidenceColumns.has('evidence_version') ? 'e.evidence_version' : '1 AS evidence_version',
      evidenceColumns.has('retention_until') ? 'e.retention_until' : 'NULL::date AS retention_until',
      evidenceColumns.has('integrity_verified_at') ? 'e.integrity_verified_at' : 'NULL::timestamp AS integrity_verified_at',
      evidenceColumns.has('pii_classification') ? 'e.pii_classification' : "'none'::text AS pii_classification",
      evidenceColumns.has('pii_types') ? 'e.pii_types' : 'NULL::text[] AS pii_types',
      evidenceColumns.has('data_sensitivity') ? 'e.data_sensitivity' : "'internal'::text AS data_sensitivity"
    ].join(',\n             ');

    let query = `
      SELECT e.id, e.file_name, e.file_size, e.mime_type, e.description, e.tags,
             e.created_at, e.updated_at,
             ${optionalSelect},
             u.first_name || ' ' || u.last_name as uploaded_by_name,
             (SELECT COUNT(*) FROM evidence_control_links ecl WHERE ecl.evidence_id = e.id) as linked_controls
      FROM evidence e
      LEFT JOIN users u ON u.id = e.uploaded_by
      WHERE e.organization_id = $1
    `;
    const params = [orgId];
    let idx = 2;

    if (search) {
      query += ` AND (e.file_name ILIKE $${idx} OR e.description ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    if (tags) {
      query += ` AND e.tags && $${idx}::text[]`;
      params.push(`{${tags}}`);
      idx++;
    }

    query += ' ORDER BY e.created_at DESC';

    if (limit) {
      query += ` LIMIT $${idx}`;
      params.push(parseInt(limit));
      idx++;
    }
    if (offset) {
      query += ` OFFSET $${idx}`;
      params.push(parseInt(offset));
      idx++;
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Evidence list error:', error);
    res.status(500).json({ success: false, error: 'Failed to load evidence' });
  }
});

// POST /evidence/upload
router.post('/upload', createRateLimiter({ label: 'evidence-upload', windowMs: 60 * 1000, max: 20 }), requirePermission('evidence.write'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const evidenceColumns = await getEvidenceColumns();

    const { description, tags } = req.body;
    const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [];
    const integrityHash = await computeFileSha256(req.file.path);
    const retentionUntil = normalizeRetentionDate(req.body.retention_until || req.body.retentionUntil);
    const safeOriginalName = path.basename(String(req.file.originalname || 'evidence'));

    const rawPiiClassification = req.body.pii_classification || 'none';
    const piiClassification = ALLOWED_PII_CLASSIFICATIONS.includes(rawPiiClassification) ? rawPiiClassification : 'none';

    const rawDataSensitivity = req.body.data_sensitivity || 'internal';
    const dataSensitivity = ALLOWED_DATA_SENSITIVITIES.includes(rawDataSensitivity) ? rawDataSensitivity : 'internal';

    const rawPiiTypes = req.body.pii_types
      ? (typeof req.body.pii_types === 'string' ? req.body.pii_types.split(',').map(t => t.trim()) : req.body.pii_types)
      : [];
    const piiTypes = rawPiiTypes.filter(t => ALLOWED_PII_TYPES.includes(t));

    // Auto-classify description text and merge with any manually-supplied classification,
    // always preserving the stricter (higher-ranked) value (AU-2 data tagging).
    const autoClass = aiSecurity.classifyDataSensitivity(description || '');
    const finalPiiClassification = mergeClassification(piiClassification, autoClass.pii_classification, PII_CLASS_RANK);
    const finalDataSensitivity    = mergeClassification(dataSensitivity,    autoClass.data_sensitivity,    DATA_SENS_RANK);
    const finalPiiTypes = [...new Set([...piiTypes, ...autoClass.pii_types])].filter(t => ALLOWED_PII_TYPES.includes(t));
    if (autoClass.detected) {
      console.info(`[aiSecurity] Evidence auto-classified on upload (org=${req.user.organization_id}, pii=${finalPiiClassification}, sensitivity=${finalDataSensitivity})`);
    }

    const insertColumns = [
      'organization_id',
      'uploaded_by',
      'file_name',
      'file_path',
      'file_size',
      'mime_type',
      'description',
      'tags'
    ];
    const insertValues = [
      req.user.organization_id,
      req.user.id,
      safeOriginalName,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      description || null,
      tagsArray
    ];

    if (evidenceColumns.has('integrity_hash_sha256')) {
      insertColumns.push('integrity_hash_sha256');
      insertValues.push(integrityHash);
    }
    if (evidenceColumns.has('evidence_version')) {
      insertColumns.push('evidence_version');
      insertValues.push(1);
    }
    if (evidenceColumns.has('retention_until')) {
      insertColumns.push('retention_until');
      insertValues.push(retentionUntil);
    }
    if (evidenceColumns.has('integrity_verified_at')) {
      insertColumns.push('integrity_verified_at');
      insertValues.push(new Date());
    }
    if (evidenceColumns.has('pii_classification')) {
      insertColumns.push('pii_classification');
      insertValues.push(finalPiiClassification);
    }
    if (evidenceColumns.has('pii_types')) {
      insertColumns.push('pii_types');
      insertValues.push(finalPiiTypes);
    }
    if (evidenceColumns.has('data_sensitivity')) {
      insertColumns.push('data_sensitivity');
      insertValues.push(finalDataSensitivity);
    }

    const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');
    const result = await pool.query(
      `INSERT INTO evidence (${insertColumns.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      insertValues
    );

    const evidence = result.rows[0];
    
    // Emit real-time event
    evidenceUploaded(req.user.organization_id, {
      id: evidence.id,
      file_name: evidence.file_name,
      uploaded_by: req.user.id,
      description: evidence.description
    });

    // Auto-index evidence for RAG (non-blocking — never fails the upload)
    if (uploadFileExists(evidence.file_path)) {
      const RAG_INDEXABLE = new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.csv']);
      const ext = path.extname(evidence.file_name || '').toLowerCase();
      if (RAG_INDEXABLE.has(ext)) {
        (async () => {
          try {
            const text = await extractTextForRag(evidence.file_path, evidence.file_name);
            // Re-classify including file content, upgrade stored labels if stricter
            const contentClass = aiSecurity.classifyDataSensitivity(text);
            if (contentClass.detected) {
              const upgradedPiiClass = mergeClassification(finalPiiClassification, contentClass.pii_classification, PII_CLASS_RANK);
              const upgradedSensitivity = mergeClassification(finalDataSensitivity, contentClass.data_sensitivity, DATA_SENS_RANK);
              const upgradedPiiTypes = [...new Set([...finalPiiTypes, ...contentClass.pii_types])].filter(t => ALLOWED_PII_TYPES.includes(t));
              const hasUpgrade = upgradedPiiClass !== finalPiiClassification || upgradedSensitivity !== finalDataSensitivity;
              if (hasUpgrade &&
                  evidenceColumns.has('pii_classification') &&
                  evidenceColumns.has('pii_types') &&
                  evidenceColumns.has('data_sensitivity')) {
                await pool.query(
                  `UPDATE evidence SET pii_classification = $1, pii_types = $2, data_sensitivity = $3 WHERE id = $4`,
                  [upgradedPiiClass, upgradedPiiTypes, upgradedSensitivity, evidence.id]
                );
                console.info(`[aiSecurity] Evidence classification upgraded from file content (org=${req.user.organization_id}, id=${evidence.id}, pii=${upgradedPiiClass}, sensitivity=${upgradedSensitivity})`);
              }
            }
            await ragService.indexDocument({
              organizationId: req.user.organization_id,
              text,
              sourceType: 'evidence',
              sourceId: evidence.id,
              sourceName: evidence.file_name,
              metadata: { description: evidence.description, tags: tagsArray }
            });
          } catch (err) {
            console.error('RAG auto-index (non-fatal):', err.message);
          }
        })();
      }
    } else if (uploadFileExists(evidence.file_path)) {
      // Non-RAG tiers: still auto-classify file content for data tagging (non-blocking)
      const TEXT_CLASSIFIABLE = new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.csv']);
      const ext = path.extname(evidence.file_name || '').toLowerCase();
      if (TEXT_CLASSIFIABLE.has(ext) &&
          evidenceColumns.has('pii_classification') &&
          evidenceColumns.has('pii_types') &&
          evidenceColumns.has('data_sensitivity')) {
        (async () => {
          try {
            const text = await extractTextForRag(evidence.file_path, evidence.file_name);
            if (!text || text.trim().length < 20) return;
            const contentClass = aiSecurity.classifyDataSensitivity(text);
            if (!contentClass.detected) return;
            const upgradedPiiClass = mergeClassification(finalPiiClassification, contentClass.pii_classification, PII_CLASS_RANK);
            const upgradedSensitivity = mergeClassification(finalDataSensitivity, contentClass.data_sensitivity, DATA_SENS_RANK);
            const upgradedPiiTypes = [...new Set([...finalPiiTypes, ...contentClass.pii_types])].filter(t => ALLOWED_PII_TYPES.includes(t));
            const hasUpgrade = upgradedPiiClass !== finalPiiClassification || upgradedSensitivity !== finalDataSensitivity;
            if (hasUpgrade) {
              await pool.query(
                `UPDATE evidence SET pii_classification = $1, pii_types = $2, data_sensitivity = $3 WHERE id = $4`,
                [upgradedPiiClass, upgradedPiiTypes, upgradedSensitivity, evidence.id]
              );
              console.info(`[aiSecurity] Evidence classification upgraded from file content (org=${req.user.organization_id}, id=${evidence.id}, pii=${upgradedPiiClass}, sensitivity=${upgradedSensitivity})`);
            }
          } catch (err) {
            console.error('Evidence auto-classify (non-fatal):', err.message);
          }
        })();
      }
    }

    res.status(201).json({ success: true, data: evidence });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload evidence' });
  }
});

// POST /evidence/bulk-upload
// Accepts up to 20 files, classifies each synchronously with AI, and returns per-file results.
router.post('/bulk-upload', createRateLimiter({ label: 'evidence-bulk-upload', windowMs: 60 * 1000, max: 5 }), requirePermission('evidence.write'), upload.array('files', 20), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files provided' });
  }

  const evidenceColumns = await getEvidenceColumns();
  const { description, tags } = req.body;
  const tagsArray = tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [];
  const retentionUntil = normalizeRetentionDate(req.body.retention_until || req.body.retentionUntil);

  const rawPiiClassification = req.body.pii_classification || 'none';
  const piiClassification = ALLOWED_PII_CLASSIFICATIONS.includes(rawPiiClassification) ? rawPiiClassification : 'none';
  const rawDataSensitivity = req.body.data_sensitivity || 'internal';
  const dataSensitivity = ALLOWED_DATA_SENSITIVITIES.includes(rawDataSensitivity) ? rawDataSensitivity : 'internal';
  const rawPiiTypes = req.body.pii_types
    ? (typeof req.body.pii_types === 'string' ? req.body.pii_types.split(',').map(t => t.trim()) : req.body.pii_types)
    : [];
  const piiTypes = rawPiiTypes.filter(t => ALLOWED_PII_TYPES.includes(t));

  // Pre-classify the shared description (applied to all files as the baseline)
  const descAutoClass = aiSecurity.classifyDataSensitivity(description || '');
  const basePiiClass    = mergeClassification(piiClassification, descAutoClass.pii_classification, PII_CLASS_RANK);
  const baseSensitivity = mergeClassification(dataSensitivity,   descAutoClass.data_sensitivity,   DATA_SENS_RANK);
  const basePiiTypes    = [...new Set([...piiTypes, ...descAutoClass.pii_types])].filter(t => ALLOWED_PII_TYPES.includes(t));

  const TEXT_CLASSIFIABLE = new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.csv']);

  // Process files in batches of 5 to avoid overwhelming memory with concurrent extractions
  const BATCH_SIZE = 5;
  const results = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (file) => {
    try {
      const safeOriginalName = path.basename(String(file.originalname || 'evidence'));
      const ext = path.extname(safeOriginalName).toLowerCase();
      const integrityHash = await computeFileSha256(file.path);

      // Synchronous file-content AI classification (so we can return results to caller)
      let filePiiClass    = basePiiClass;
      let fileSensitivity = baseSensitivity;
      let filePiiTypes    = [...basePiiTypes];
      let contentAnalysis = { detected: false, pii_classification: 'none', data_sensitivity: 'public', pii_types: [] };

      if (TEXT_CLASSIFIABLE.has(ext) && uploadFileExists(file.path)) {
        try {
          const text = await extractTextForRag(file.path, file.originalname);
          if (text && text.trim().length >= 20) {
            contentAnalysis = aiSecurity.classifyDataSensitivity(text);
            if (contentAnalysis.detected) {
              filePiiClass    = mergeClassification(basePiiClass,    contentAnalysis.pii_classification, PII_CLASS_RANK);
              fileSensitivity = mergeClassification(baseSensitivity, contentAnalysis.data_sensitivity,   DATA_SENS_RANK);
              filePiiTypes    = [...new Set([...basePiiTypes, ...contentAnalysis.pii_types])].filter(t => ALLOWED_PII_TYPES.includes(t));
            }
          }
        } catch (classErr) {
          console.warn(`[aiSecurity] Bulk content classification skipped (${file.originalname}): ${classErr.message}`);
        }
      }

      const insertColumns = ['organization_id', 'uploaded_by', 'file_name', 'file_path', 'file_size', 'mime_type', 'description', 'tags'];
      const insertValues  = [req.user.organization_id, req.user.id, safeOriginalName, file.path, file.size, file.mimetype, description || null, tagsArray];

      if (evidenceColumns.has('integrity_hash_sha256')) { insertColumns.push('integrity_hash_sha256'); insertValues.push(integrityHash); }
      if (evidenceColumns.has('evidence_version'))      { insertColumns.push('evidence_version');      insertValues.push(1); }
      if (evidenceColumns.has('retention_until'))        { insertColumns.push('retention_until');        insertValues.push(retentionUntil); }
      if (evidenceColumns.has('integrity_verified_at'))  { insertColumns.push('integrity_verified_at');  insertValues.push(new Date()); }
      if (evidenceColumns.has('pii_classification'))     { insertColumns.push('pii_classification');     insertValues.push(filePiiClass); }
      if (evidenceColumns.has('pii_types'))              { insertColumns.push('pii_types');              insertValues.push(filePiiTypes); }
      if (evidenceColumns.has('data_sensitivity'))       { insertColumns.push('data_sensitivity');       insertValues.push(fileSensitivity); }

      const placeholders = insertValues.map((_, idx) => `$${idx + 1}`).join(', ');
      const dbResult = await pool.query(
        `INSERT INTO evidence (${insertColumns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        insertValues
      );
      const evidence = dbResult.rows[0];

      evidenceUploaded(req.user.organization_id, {
        id: evidence.id, file_name: evidence.file_name, uploaded_by: req.user.id, description: evidence.description
      });

      // RAG indexing (non-blocking)
      if (TEXT_CLASSIFIABLE.has(ext) && uploadFileExists(evidence.file_path)) {
        (async () => {
          try {
            const text = await extractTextForRag(evidence.file_path, evidence.file_name);
            await ragService.indexDocument({
              organizationId: req.user.organization_id,
              text,
              sourceType: 'evidence',
              sourceId: evidence.id,
              sourceName: evidence.file_name,
              metadata: { description: evidence.description, tags: tagsArray }
            });
          } catch (err) {
            console.error('Bulk RAG index (non-fatal):', err.message);
          }
        })();
      }

      return {
        success: true,
        file_name: safeOriginalName,
        id: evidence.id,
        ai_analysis: {
          detected: contentAnalysis.detected || descAutoClass.detected,
          pii_classification: filePiiClass,
          data_sensitivity: fileSensitivity,
          pii_types: filePiiTypes,
          description_detected: descAutoClass.detected,
          content_detected: contentAnalysis.detected
        }
      };
    } catch (err) {
      console.error(`Bulk upload error (${file.originalname}):`, err.message);
      if (uploadFileExists(file.path)) {
        try { removeUploadFile(file.path); } catch (_) {}
      }
      return { success: false, file_name: file.originalname, error: 'Failed to process file' };
    }
  }));
    results.push(...batchResults);
  }

  const succeeded = results.filter(r => r.success).length;
  res.status(201).json({
    success: true,
    data: {
      results,
      summary: { total: files.length, succeeded, failed: files.length - succeeded }
    }
  });
});

// GET /evidence/:id/integrity-check
router.get('/:id/integrity-check', requirePermission('evidence.read'), async (req, res) => {
  try {
    const evidenceColumns = await getEvidenceColumns();
    const hashSelect = evidenceColumns.has('integrity_hash_sha256')
      ? 'integrity_hash_sha256'
      : 'NULL::text AS integrity_hash_sha256';
    const verifiedAtSelect = evidenceColumns.has('integrity_verified_at')
      ? 'integrity_verified_at'
      : 'NULL::timestamp AS integrity_verified_at';

    const result = await pool.query(
      `SELECT id, file_name, file_path, ${hashSelect}, ${verifiedAtSelect}
       FROM evidence
       WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.user.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    const evidence = result.rows[0];
    if (!evidence.file_path || !uploadFileExists(evidence.file_path)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    const currentHash = await computeFileSha256(evidence.file_path);
    const matches = Boolean(evidence.integrity_hash_sha256) && currentHash === evidence.integrity_hash_sha256;

    if (evidenceColumns.has('integrity_verified_at')) {
      await pool.query(
        'UPDATE evidence SET integrity_verified_at = NOW() WHERE id = $1 AND organization_id = $2',
        [req.params.id, req.user.organization_id]
      );
    }

    res.json({
      success: true,
      data: {
        id: evidence.id,
        file_name: evidence.file_name,
        matches,
        expected_hash: evidence.integrity_hash_sha256,
        current_hash: currentHash,
        previous_verified_at: evidence.integrity_verified_at
      }
    });
  } catch (error) {
    console.error('Integrity check error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify evidence integrity' });
  }
});

// GET /evidence/:id
router.get('/:id', requirePermission('evidence.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM evidence e
      LEFT JOIN users u ON u.id = e.uploaded_by
      WHERE e.id = $1 AND e.organization_id = $2
    `, [req.params.id, req.user.organization_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    // Get linked controls
    const links = await pool.query(`
      SELECT ecl.control_id, ecl.notes, fc.control_id as control_code, fc.title,
             f.name as framework_name
      FROM evidence_control_links ecl
      JOIN framework_controls fc ON fc.id = ecl.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE ecl.evidence_id = $1
    `, [req.params.id]);

    res.json({ success: true, data: { ...result.rows[0], linked_controls: links.rows } });
  } catch (error) {
    console.error('Get evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to load evidence' });
  }
});

// GET /evidence/:id/download
router.get('/:id/download', requirePermission('evidence.read'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT file_name, file_path, mime_type FROM evidence WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    const file = result.rows[0];
    if (!isSafeUploadPath(file.file_path)) {
      return res.status(400).json({ success: false, error: 'Stored file path is outside allowed uploads directory' });
    }
    if (!uploadFileExists(file.file_path)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    const safeFileName = sanitizeDownloadName(file.file_name);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Type', file.mime_type);
    createUploadReadStream(file.file_path).pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Failed to download evidence' });
  }
});

// PUT /evidence/:id
router.put('/:id', requirePermission('evidence.write'), async (req, res) => {
  try {
    const { description, tags, retention_until, pii_classification, pii_types, data_sensitivity } = req.body;
    const evidenceColumns = await getEvidenceColumns();

    if (pii_classification !== undefined && evidenceColumns.has('pii_classification') && !ALLOWED_PII_CLASSIFICATIONS.includes(pii_classification)) {
      return res.status(400).json({ success: false, error: `Invalid pii_classification. Must be one of: ${ALLOWED_PII_CLASSIFICATIONS.join(', ')}` });
    }
    if (data_sensitivity !== undefined && evidenceColumns.has('data_sensitivity') && !ALLOWED_DATA_SENSITIVITIES.includes(data_sensitivity)) {
      return res.status(400).json({ success: false, error: `Invalid data_sensitivity. Must be one of: ${ALLOWED_DATA_SENSITIVITIES.join(', ')}` });
    }

    const validatedPiiTypes = Array.isArray(pii_types)
      ? pii_types.filter(t => ALLOWED_PII_TYPES.includes(t))
      : undefined;

    const setClauses = [
      'description = COALESCE($1, description)',
      'tags = COALESCE($2, tags)'
    ];
    const params = [description, tags || null];
    let idx = 3;

    if (evidenceColumns.has('retention_until')) {
      setClauses.push(`retention_until = COALESCE($${idx}, retention_until)`);
      params.push(retention_until || null);
      idx++;
    }
    if (evidenceColumns.has('pii_classification')) {
      setClauses.push(`pii_classification = COALESCE($${idx}, pii_classification)`);
      params.push(pii_classification ?? null);
      idx++;
    }
    if (evidenceColumns.has('pii_types')) {
      setClauses.push(`pii_types = COALESCE($${idx}, pii_types)`);
      params.push(validatedPiiTypes ?? null);
      idx++;
    }
    if (evidenceColumns.has('data_sensitivity')) {
      setClauses.push(`data_sensitivity = COALESCE($${idx}, data_sensitivity)`);
      params.push(data_sensitivity ?? null);
      idx++;
    }
    if (evidenceColumns.has('evidence_version')) {
      setClauses.push('evidence_version = evidence_version + 1');
    }
    setClauses.push('updated_at = NOW()');

    params.push(req.params.id, req.user.organization_id);

    const result = await pool.query(
      `UPDATE evidence SET
         ${setClauses.join(',\n        ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to update evidence' });
  }
});

// DELETE /evidence/:id
router.delete('/:id', requirePermission('evidence.write'), async (req, res) => {
  try {
    const hold = await pool.query(
      `SELECT id, hold_name
       FROM legal_holds
       WHERE organization_id = $1
         AND active = true
         AND resource_type = 'evidence'
         AND (resource_id IS NULL OR resource_id = $2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.organization_id, req.params.id]
    );

    if (hold.rows.length > 0) {
      return res.status(423).json({
        success: false,
        error: 'Evidence is under active legal hold and cannot be deleted',
        hold: hold.rows[0]
      });
    }

    const result = await pool.query(
      'DELETE FROM evidence WHERE id = $1 AND organization_id = $2 RETURNING file_path',
      [req.params.id, req.user.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    // Clean up file from disk
    const filePath = result.rows[0].file_path;
    if (uploadFileExists(filePath)) {
      removeUploadFile(filePath);
    }

    res.json({ success: true, message: 'Evidence deleted' });
  } catch (error) {
    console.error('Delete evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete evidence' });
  }
});

// POST /evidence/:id/link
router.post('/:id/link', requirePermission('evidence.write'), async (req, res) => {
  try {
    const { controlIds, notes } = req.body;

    if (!controlIds || !Array.isArray(controlIds)) {
      return res.status(400).json({ success: false, error: 'controlIds array required' });
    }

    // Verify evidence belongs to org
    const ev = await pool.query('SELECT id FROM evidence WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.organization_id]);
    if (ev.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    for (const cid of controlIds) {
      await pool.query(
        'INSERT INTO evidence_control_links (evidence_id, control_id, notes) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [req.params.id, cid, notes || null]
      );
    }

    res.json({ success: true, message: 'Controls linked' });
  } catch (error) {
    console.error('Link error:', error);
    res.status(500).json({ success: false, error: 'Failed to link controls' });
  }
});

// DELETE /evidence/:evidenceId/unlink/:controlId
router.delete('/:evidenceId/unlink/:controlId', requirePermission('evidence.write'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM evidence_control_links WHERE evidence_id = $1 AND control_id = $2',
      [req.params.evidenceId, req.params.controlId]
    );
    res.json({ success: true, message: 'Control unlinked' });
  } catch (error) {
    console.error('Unlink error:', error);
    res.status(500).json({ success: false, error: 'Failed to unlink control' });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File exceeds 50MB upload limit' });
    }
    return res.status(400).json({ success: false, error: 'Invalid upload request' });
  }

  if (err?.message === 'Unsupported file type') {
    return res.status(400).json({ success: false, error: 'Unsupported file type' });
  }

  return next(err);
});

module.exports = router;
