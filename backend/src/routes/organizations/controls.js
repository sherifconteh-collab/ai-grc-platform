// @tier: community
/**
 * Organization controls routes: GET /:orgId/controls (org-scoped control
 * list with implementation status), GET /:orgId/controls/export (xlsx/csv),
 * and POST /:orgId/controls/import (xlsx/csv with optional AI column
 * mapping). Spreadsheet helpers live in ./_importHelpers.
 *
 * Extracted verbatim from routes/organizations.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/organizations.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const ExcelJS = require('exceljs');
const path = require('path');
const { Readable } = require('stream');
const llm = require('../../services/llmService');
const { requirePermission } = require('../../middleware/auth');
const { isUuid } = require('../../middleware/validate');
const { log } = require('../../utils/logger');
const {
  VALID_CONTROL_IMPLEMENTATION_STATUSES,
  controlsImportUpload,
  verifyOrgAccess,
} = require('./_helpers');
const {
  normalizeHeaderKey,
  buildImportHeaderMap,
  normalizeImplementationStatus,
  parseDateCellToISO,
  csvEscape,
  nonEmptyString,
  normalizeFrameworkToken,
  getOrgDefaultLlmConfig,
  enforceImportAiLimit,
  collectHeaderExamples,
  selectHeaderCellsForImportAi,
  inferControlAnswerImportHeaderMapWithAI,
} = require('./_importHelpers');

// GET /organizations/:orgId/controls
router.get('/:orgId/controls', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;
    const { frameworkId, status } = req.query;

    let query = `
      SELECT fc.id, fc.control_id,
             COALESCE(occ.title, fc.title) as title,
             COALESCE(occ.description, fc.description) as description,
             fc.control_type, fc.priority,
             f.name as framework_name, f.code as framework_code,
             COALESCE(ci.status, 'not_started') as status,
             ci.assigned_to, ci.notes,
             u.first_name || ' ' || u.last_name as assigned_to_name
      FROM organization_frameworks of2
      JOIN framework_controls fc ON fc.framework_id = of2.framework_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $1
       AND occ.framework_control_id = fc.id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE of2.organization_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (frameworkId) {
      query += ` AND f.id = $${paramIndex}`;
      params.push(frameworkId);
      paramIndex++;
    }

    if (status) {
      if (status === 'not_started') {
        query += ` AND (ci.status IS NULL OR ci.status = 'not_started')`;
      } else {
        query += ` AND ci.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    query += ' ORDER BY f.name, fc.control_id';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, controls: result.rows });
  } catch (error) {
    log('error', 'organizations.controls.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load controls' });
  }
});

// GET /organizations/:orgId/controls/export
router.get('/:orgId/controls/export', requirePermission('implementations.read'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;

    const format = String(req.query.format || 'xlsx').trim().toLowerCase();
    if (!['xlsx', 'csv'].includes(format)) {
      return res.status(400).json({ success: false, error: "format must be one of: xlsx, csv" });
    }

    const { frameworkId, status } = req.query;

    let query = `
      SELECT
        fc.id as framework_control_id,
        f.name as framework_name,
        f.code as framework_code,
        fc.control_id,
        COALESCE(occ.title, fc.title) as title,
        COALESCE(occ.description, fc.description) as description,
        fc.control_type,
        fc.priority,
        COALESCE(ci.status, 'not_started') as status,
        ci.implementation_notes,
        ci.evidence_location,
        ci.notes,
        ci.implementation_date as due_date,
        u.email as assigned_to_email,
        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') as assigned_to_name
      FROM organization_frameworks of2
      JOIN framework_controls fc ON fc.framework_id = of2.framework_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $1
       AND occ.framework_control_id = fc.id
      LEFT JOIN control_implementations ci
        ON ci.control_id = fc.id
       AND ci.organization_id = $1
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE of2.organization_id = $1
    `;

    const params = [orgId];
    let paramIndex = 2;

    if (frameworkId) {
      query += ` AND f.id = $${paramIndex}`;
      params.push(frameworkId);
      paramIndex++;
    }

    if (status) {
      if (status === 'not_started') {
        query += ` AND (ci.status IS NULL OR ci.status = 'not_started')`;
      } else {
        query += ` AND ci.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    query += ' ORDER BY f.name, fc.control_id';

    const result = await pool.query(query, params);
    const rows = result.rows || [];

    const exportColumns = [
      'framework_control_id',
      'framework_code',
      'framework_name',
      'control_id',
      'title',
      'description',
      'control_type',
      'priority',
      'status',
      'implementation_notes',
      'evidence_location',
      'notes',
      'assigned_to_email',
      'assigned_to_name',
      'due_date'
    ];

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `controlweave-control-answers-${orgId}-${stamp}.${format}`;

    res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
    res.setHeader('Cache-Control', 'no-store');

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const lines = [];
      lines.push(exportColumns.join(','));
      rows.forEach((row) => {
        const values = exportColumns.map((key) => csvEscape(row[key]));
        lines.push(values.join(','));
      });
      // Include UTF-8 BOM so Excel opens it cleanly.
      const csvText = `\uFEFF${lines.join('\r\n')}\r\n`;
      return res.status(200).send(csvText);
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Control Answers');

    sheet.columns = exportColumns.map((key) => ({
      header: key,
      key,
      width: key === 'description' || key === 'implementation_notes' || key === 'notes' ? 50 : 24
    }));

    rows.forEach((row) => {
      sheet.addRow({
        ...row,
        due_date: row.due_date ? String(row.due_date).slice(0, 10) : null
      });
    });

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    log('error', 'organizations.controls.export_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to export controls' });
  }
});

// POST /organizations/:orgId/controls/import?mode=merge|replace
router.post(
  '/:orgId/controls/import',
  requirePermission('implementations.write'),
  controlsImportUpload.single('file'),
  async (req, res) => {
    try {
      const orgId = verifyOrgAccess(req, res);
      if (!orgId) return;

      const mode = String(req.query.mode || 'merge').trim().toLowerCase();
      if (!['merge', 'replace'].includes(mode)) {
        return res.status(400).json({ success: false, error: "mode must be one of: merge, replace" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: "No file uploaded. Expected multipart/form-data with field 'file'." });
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!['.xlsx', '.csv'].includes(ext)) {
        return res.status(400).json({ success: false, error: 'Unsupported file type. Please upload .xlsx or .csv.' });
      }

      const workbook = new ExcelJS.Workbook();
      if (ext === '.xlsx') {
        await workbook.xlsx.load(file.buffer);
      } else {
        const csvText = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
        await workbook.csv.read(Readable.from([csvText]));
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ success: false, error: 'No worksheet found in uploaded file.' });
      }

      const headerRow = worksheet.getRow(1);
      const headerCells = [];
      for (let col = 1; col <= headerRow.cellCount; col++) {
        const header = String(headerRow.getCell(col)?.text || '').trim();
        if (!header) continue;
        headerCells.push({ col, header });
      }

      const colByNormalizedHeader = new Map(
        headerCells.map((entry) => [normalizeHeaderKey(entry.header), entry.col])
      );

      const { headerMap, present } = buildImportHeaderMap(worksheet);
      const aiColumnMapping = {
        attempted: false,
        used: false,
        provider: null,
        model: null,
        mapping: null,
        note: null,
        error: null
      };

      const aiEnabled = String(req.query.ai ?? '1').trim() !== '0';
      const hasAiPermission = Array.isArray(req.user?.permissions)
        ? (req.user.permissions.includes('*') || req.user.permissions.includes('ai.use'))
        : req.user?.role === 'admin';

      const canonicalFields = [
        'framework_control_id',
        'framework_code',
        'control_id',
        'status',
        'implementation_notes',
        'evidence_location',
        'notes',
        'assigned_to_email',
        'assigned_to_id',
        'due_date'
      ];

      const missingFields = canonicalFields.filter((field) => !headerMap[field]);
      if (aiEnabled && hasAiPermission && missingFields.length > 0 && headerCells.length > 0) {
        aiColumnMapping.attempted = true;
        try {
          const defaults = await getOrgDefaultLlmConfig(orgId);
          const provider = ['claude', 'openai', 'gemini', 'grok', 'groq', 'ollama'].includes(String(req.query.provider || ''))
            ? String(req.query.provider)
            : defaults.provider;
          const model = nonEmptyString(req.query.model) ? String(req.query.model) : defaults.model;

          aiColumnMapping.provider = provider;
          aiColumnMapping.model = model;

          await enforceImportAiLimit({
            organizationId: orgId,
            organizationTier: req.user.organization_tier,
            provider
          });

          const aiHeaderCells = selectHeaderCellsForImportAi(headerCells);
          if (aiHeaderCells.length !== headerCells.length) {
            aiColumnMapping.note = `AI column mapping inspected ${aiHeaderCells.length}/${headerCells.length} headers due to size limits.`;
          }

          const examples = collectHeaderExamples(worksheet, aiHeaderCells, {
            maxSampleRows: 12,
            maxExamplesPerHeader: 3,
            maxChars: 90
          });

          const aiResult = await inferControlAnswerImportHeaderMapWithAI({
            organizationId: orgId,
            provider,
            model,
            headers: aiHeaderCells.map((entry) => entry.header),
            examples
          });

          const mapping = aiResult?.mapping && typeof aiResult.mapping === 'object' ? aiResult.mapping : null;
          if (mapping) {
            aiColumnMapping.mapping = mapping;

            canonicalFields.forEach((field) => {
              if (headerMap[field]) return;
              const proposedHeader = mapping[field];
              if (!nonEmptyString(proposedHeader)) return;

              const normalizedProposed = normalizeHeaderKey(proposedHeader);
              const col = colByNormalizedHeader.get(normalizedProposed) || null;
              if (!col) return;

              headerMap[field] = col;
              present.add(field);
              aiColumnMapping.used = true;
            });
          }

          await llm.logAIUsage(orgId, req.user.id, 'control_answer_import_column_mapping', provider, model).catch(() => {});
        } catch (err) {
          aiColumnMapping.error = err?.message || String(err);
        }
      }

      const hasFrameworkControlIdColumn = Boolean(headerMap.framework_control_id);
      const hasControlIdColumn = Boolean(headerMap.control_id);
      if (!hasFrameworkControlIdColumn && !hasControlIdColumn) {
        return res.status(400).json({
          success: false,
          error: 'Missing control identifiers. Provide framework_control_id (UUID) OR control_id (control code) column.',
          ai_column_mapping: aiColumnMapping,
          headers_seen: headerCells.map((entry) => entry.header)
        });
      }

      const controlResult = await pool.query(
        `SELECT
           fc.id as framework_control_id,
           LOWER(f.code) as framework_code,
           fc.control_id
         FROM organization_frameworks of2
         JOIN framework_controls fc ON fc.framework_id = of2.framework_id
         JOIN frameworks f ON f.id = fc.framework_id
         WHERE of2.organization_id = $1`,
        [orgId]
      );

      const controlIdByFrameworkControlId = new Map();
      const controlIdByComposite = new Map();
      controlResult.rows.forEach((row) => {
        const fcId = String(row.framework_control_id);
        const code = String(row.framework_code || '').trim().toLowerCase();
        const controlCode = String(row.control_id || '').trim();
        if (fcId) {
          controlIdByFrameworkControlId.set(fcId, fcId);
        }
        if (code && controlCode) {
          controlIdByComposite.set(`${code}::${controlCode.toLowerCase()}`, fcId);
        }
      });

      const orgFrameworkResult = await pool.query(
        `SELECT LOWER(f.code) as framework_code, f.name as framework_name
         FROM organization_frameworks of2
         JOIN frameworks f ON f.id = of2.framework_id
         WHERE of2.organization_id = $1`,
        [orgId]
      );
      const frameworkCodeByToken = new Map();
      orgFrameworkResult.rows.forEach((row) => {
        const code = String(row.framework_code || '').trim().toLowerCase();
        const name = String(row.framework_name || '').trim();
        if (code) frameworkCodeByToken.set(normalizeFrameworkToken(code), code);
        if (name) frameworkCodeByToken.set(normalizeFrameworkToken(name), code);
      });
      const defaultFrameworkCode = orgFrameworkResult.rows.length === 1
        ? String(orgFrameworkResult.rows[0].framework_code || '').trim().toLowerCase()
        : null;

      const existingResult = await pool.query(
        `SELECT control_id FROM control_implementations WHERE organization_id = $1`,
        [orgId]
      );
      const hasExistingImplementation = new Set(existingResult.rows.map((row) => String(row.control_id)));

      const userResult = await pool.query(
        `SELECT id, LOWER(email) as email
         FROM users
         WHERE organization_id = $1 AND is_active = true`,
        [orgId]
      );
      const userIdByEmail = new Map(userResult.rows.map((row) => [String(row.email || ''), String(row.id)]));
      const userIds = new Set(userResult.rows.map((row) => String(row.id)));

      const summary = {
        import_mode: mode,
        filename: file.originalname,
        total_rows: 0,
        processed_rows: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        ai_column_mapping: aiColumnMapping,
        warnings: [],
        errors: []
      };

      const fileProvidesField = (field) => present.has(field);
      const maxRows = 20000;
      const rowLimit = Math.min(worksheet.rowCount || 0, maxRows);

      const upsertSql = `
        INSERT INTO control_implementations
          (control_id, organization_id, status, implementation_notes, evidence_location, assigned_to, notes, implementation_date)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (control_id, organization_id) DO UPDATE SET
          status = CASE WHEN $9 THEN EXCLUDED.status ELSE control_implementations.status END,
          implementation_notes = CASE WHEN $10 THEN EXCLUDED.implementation_notes ELSE control_implementations.implementation_notes END,
          evidence_location = CASE WHEN $11 THEN EXCLUDED.evidence_location ELSE control_implementations.evidence_location END,
          assigned_to = CASE WHEN $12 THEN EXCLUDED.assigned_to ELSE control_implementations.assigned_to END,
          notes = CASE WHEN $13 THEN EXCLUDED.notes ELSE control_implementations.notes END,
          implementation_date = CASE WHEN $14 THEN EXCLUDED.implementation_date ELSE control_implementations.implementation_date END
        RETURNING (xmax = 0) AS inserted
      `;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (let rowNumber = 2; rowNumber <= rowLimit; rowNumber++) {
          const row = worksheet.getRow(rowNumber);
          if (!row || !row.hasValues) continue;

          const getCellText = (field) => {
            const col = headerMap[field];
            if (!col) return '';
            return String(row.getCell(col)?.text || '').trim();
          };

          const getCell = (field) => {
            const col = headerMap[field];
            if (!col) return null;
            return row.getCell(col);
          };

          const rawFrameworkControlId = getCellText('framework_control_id');
          const rawFrameworkIdentifier = getCellText('framework_code');
          const rawControlCode = getCellText('control_id');

          // Skip completely empty identifier rows.
          if (!rawFrameworkControlId && !rawControlCode) {
            continue;
          }

          summary.total_rows += 1;

          let frameworkControlId = null;
          if (rawFrameworkControlId) {
            frameworkControlId = controlIdByFrameworkControlId.get(rawFrameworkControlId) || null;
          }
          if (!frameworkControlId && rawControlCode) {
            let resolvedFrameworkCode = defaultFrameworkCode;
            if (nonEmptyString(rawFrameworkIdentifier)) {
              const token = normalizeFrameworkToken(rawFrameworkIdentifier);
              const mapped = frameworkCodeByToken.get(token) || null;
              if (mapped) {
                resolvedFrameworkCode = mapped;
              } else if (!defaultFrameworkCode) {
                summary.errors.push({
                  row: rowNumber,
                  error: `Framework not recognized for this organization: "${rawFrameworkIdentifier}".`
                });
                continue;
              }
            }

            if (!resolvedFrameworkCode) {
              summary.errors.push({
                row: rowNumber,
                error: 'Missing framework identifier. Include a framework_code column (or import into an org with exactly one selected framework).'
              });
              continue;
            }

            const candidates = [];
            const raw = String(rawControlCode || '').trim();
            if (raw) {
              candidates.push(raw);
              const firstToken = raw.split(/\s+/)[0];
              if (firstToken && firstToken !== raw) candidates.push(firstToken);
              const cleaned = firstToken.replace(/[,:;]+$/g, '');
              if (cleaned && cleaned !== firstToken) candidates.push(cleaned);
            }

            for (const candidate of candidates) {
              const found = controlIdByComposite.get(`${resolvedFrameworkCode}::${candidate.toLowerCase()}`) || null;
              if (found) {
                frameworkControlId = found;
                break;
              }
            }
          }

          if (!frameworkControlId) {
            summary.errors.push({
              row: rowNumber,
              error: 'Control not found for this organization (check framework_control_id, or control_id + framework_code when multiple frameworks are selected).'
            });
            continue;
          }

          const statusRaw = getCellText('status');
          const statusNormalized = normalizeImplementationStatus(statusRaw);
          let statusProvided = false;
          if (fileProvidesField('status') && statusNormalized) {
            statusProvided = true;
          }
          if (statusRaw && !statusNormalized) {
            statusProvided = false;
            summary.warnings.push({ row: rowNumber, warning: `Invalid status '${statusRaw}'. Allowed: ${Array.from(VALID_CONTROL_IMPLEMENTATION_STATUSES).join(', ')}` });
          }
          const statusValue = statusNormalized || 'not_started';

          const implementationNotesRaw = getCellText('implementation_notes');
          const implementationNotesValue = implementationNotesRaw ? implementationNotesRaw : null;
          let implementationNotesProvided = false;
          if (fileProvidesField('implementation_notes')) {
            implementationNotesProvided = mode === 'replace' ? true : Boolean(implementationNotesRaw);
          }

          const evidenceLocationRaw = getCellText('evidence_location');
          const evidenceLocationValue = evidenceLocationRaw ? evidenceLocationRaw : null;
          let evidenceLocationProvided = false;
          if (fileProvidesField('evidence_location')) {
            evidenceLocationProvided = mode === 'replace' ? true : Boolean(evidenceLocationRaw);
          }

          const notesRaw = getCellText('notes');
          const notesValue = notesRaw ? notesRaw : null;
          let notesProvided = false;
          if (fileProvidesField('notes')) {
            notesProvided = mode === 'replace' ? true : Boolean(notesRaw);
          }

          const dueDateCell = getCell('due_date');
          const dueDateValue = parseDateCellToISO(dueDateCell);
          let dueDateProvided = false;
          if (fileProvidesField('due_date')) {
            const dueDateText = String(dueDateCell?.text || '').trim();
            dueDateProvided = mode === 'replace' ? true : Boolean(dueDateValue);
            if (dueDateText && !dueDateValue) {
              dueDateProvided = false;
              summary.warnings.push({ row: rowNumber, warning: `Invalid due_date '${dueDateText}'. Expected YYYY-MM-DD or MM/DD/YYYY.` });
            }
          }

          const assignedToEmailRaw = getCellText('assigned_to_email').toLowerCase();
          const assignedToIdRaw = getCellText('assigned_to_id');
          let assignedToIdValue = null;
          let assignedToProvided = false;

          if (assignedToEmailRaw) {
            const mapped = userIdByEmail.get(assignedToEmailRaw) || null;
            if (!mapped) {
              summary.warnings.push({ row: rowNumber, warning: `assigned_to_email '${assignedToEmailRaw}' not found in organization users. Assignment unchanged.` });
            } else {
              assignedToIdValue = mapped;
              assignedToProvided = true;
            }
          } else if (assignedToIdRaw && isUuid(assignedToIdRaw)) {
            if (userIds.has(assignedToIdRaw)) {
              assignedToIdValue = assignedToIdRaw;
              assignedToProvided = true;
            } else {
              summary.warnings.push({ row: rowNumber, warning: `assigned_to_id '${assignedToIdRaw}' not found in organization users. Assignment unchanged.` });
            }
          } else if (fileProvidesField('assigned_to_email') || fileProvidesField('assigned_to_id')) {
            // Empty assignment cell in replace mode means "clear".
            if (mode === 'replace') {
              assignedToIdValue = null;
              assignedToProvided = true;
            }
          }

          const hasOtherData = Boolean(
            implementationNotesValue ||
              evidenceLocationValue ||
              notesValue ||
              dueDateValue ||
              assignedToEmailRaw ||
              assignedToIdRaw
          );
          const effectiveStatusForEmptyCheck = statusNormalized || 'not_started';
          const isEmptyRow = effectiveStatusForEmptyCheck === 'not_started' && !hasOtherData;
          const hasExisting = hasExistingImplementation.has(frameworkControlId);

          // Avoid creating thousands of empty "not_started" rows from templates/exports.
          if (!hasExisting && isEmptyRow) {
            summary.skipped += 1;
            continue;
          }

          const result = await client.query(upsertSql, [
            frameworkControlId,
            orgId,
            statusValue,
            implementationNotesValue,
            evidenceLocationValue,
            assignedToIdValue,
            notesValue,
            dueDateValue,
            statusProvided,
            implementationNotesProvided,
            evidenceLocationProvided,
            assignedToProvided,
            notesProvided,
            dueDateProvided
          ]);

          summary.processed_rows += 1;
          if (result.rows[0]?.inserted) {
            summary.inserted += 1;
            hasExistingImplementation.add(frameworkControlId);
          } else {
            summary.updated += 1;
          }
        }

        await client.query(
          `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
           VALUES ($1, $2, 'control_answers_imported', 'organization', $1, $3)`,
          [
            orgId,
            req.user.id,
            JSON.stringify({
              filename: file.originalname,
              mode,
              inserted: summary.inserted,
              updated: summary.updated,
              skipped: summary.skipped,
              warnings: summary.warnings.length,
              errors: summary.errors.length
            })
          ]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      if (worksheet.rowCount > maxRows) {
        summary.warnings.push({ row: null, warning: `Row limit exceeded. Processed first ${maxRows} rows only.` });
      }

      res.json({ success: true, data: summary });
    } catch (error) {
      log('error', 'organizations.controls.import_failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to import controls' });
    }
  }
);

module.exports = router;
