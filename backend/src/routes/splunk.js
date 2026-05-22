// @tier: pro
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const splunk = require('../services/splunkService');

const router = express.Router();

router.use(authenticate);
router.use(requireTier('pro'));

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function parseTags(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((tag) => String(tag).trim()).filter(Boolean);
  return String(input).split(',').map((tag) => tag.trim()).filter(Boolean);
}

function getDefaultRetentionDate() {
  const retentionDays = Number(process.env.EVIDENCE_DEFAULT_RETENTION_DAYS || 365);
  const dt = new Date();
  dt.setDate(dt.getDate() + Math.max(1, retentionDays));
  return dt.toISOString().split('T')[0];
}

function sanitizeFileName(input) {
  const base = String(input || 'splunk-evidence').replace(/[^a-zA-Z0-9-_ ]/g, '').trim();
  return (base || 'splunk-evidence').substring(0, 80);
}

function formatSettingsResponse(settings) {
  return {
    configured: Boolean(settings.baseUrl && settings.apiToken),
    base_url: settings.baseUrl,
    default_index: settings.defaultIndex,
    token_masked: splunk.maskToken(settings.apiToken),
    updated_at: settings.updatedAt || null
  };
}

// GET /api/v1/integrations/splunk
router.get('/splunk', requirePermission('settings.manage'), async (req, res) => {
  try {
    const settings = await splunk.getOrgSplunkSettings(req.user.organization_id);
    res.json({ success: true, data: formatSettingsResponse(settings) });
  } catch (error) {
    console.error('Get Splunk settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch Splunk settings' });
  }
});

// PUT /api/v1/integrations/splunk
router.put('/splunk', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Request body is required');
  if (body.base_url !== undefined && body.base_url !== null && typeof body.base_url !== 'string') {
    errors.push('base_url must be a string');
  }
  if (body.api_token !== undefined && body.api_token !== null && typeof body.api_token !== 'string') {
    errors.push('api_token must be a string');
  }
  if (body.default_index !== undefined && body.default_index !== null && typeof body.default_index !== 'string') {
    errors.push('default_index must be a string');
  }
  return errors;
}), async (req, res) => {
  try {
    const saved = await splunk.saveOrgSplunkSettings(req.user.organization_id, {
      baseUrl: req.body.base_url,
      apiToken: req.body.api_token,
      defaultIndex: req.body.default_index
    });
    res.json({
      success: true,
      message: 'Splunk settings updated',
      data: formatSettingsResponse(saved)
    });
  } catch (error) {
    console.error('Update Splunk settings error:', error);
    res.status(400).json({ success: false, error: 'Failed to update Splunk settings' });
  }
});

// DELETE /api/v1/integrations/splunk
router.delete('/splunk', requirePermission('settings.manage'), async (req, res) => {
  try {
    await splunk.saveOrgSplunkSettings(req.user.organization_id, {
      baseUrl: null,
      apiToken: null,
      defaultIndex: null
    });
    res.json({ success: true, message: 'Splunk settings removed' });
  } catch (error) {
    console.error('Delete Splunk settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove Splunk settings' });
  }
});

// POST /api/v1/integrations/splunk/test
router.post('/splunk/test', requirePermission('settings.manage'), validateBody((body) => {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('Request body is required');
  return errors;
}), async (req, res) => {
  try {
    const saved = await splunk.getOrgSplunkSettings(req.user.organization_id);
    const config = {
      baseUrl: splunk.normalizeBaseUrl(req.body.base_url || saved.baseUrl),
      apiToken: req.body.api_token || saved.apiToken,
      defaultIndex: req.body.default_index || saved.defaultIndex
    };

    if (!config.baseUrl || !config.apiToken) {
      return res.status(400).json({
        success: false,
        error: 'Splunk base URL and API token are required'
      });
    }

    const info = await splunk.testConnection(config);
    res.json({
      success: true,
      message: 'Splunk connection successful',
      data: info
    });
  } catch (error) {
    console.error('Splunk connection test error:', error);
    res.status(400).json({
      success: false,
      error: 'Splunk connection failed'
    });
  }
});

// POST /api/v1/integrations/splunk/import-evidence
router.post('/splunk/import-evidence', requirePermission('evidence.write'), validateBody((body) => {
  const errors = [];
  if (!body.search || typeof body.search !== 'string' || !body.search.trim()) {
    errors.push('search is required');
  }
  if (body.max_events !== undefined && (!Number.isInteger(Number(body.max_events)) || Number(body.max_events) <= 0)) {
    errors.push('max_events must be a positive integer');
  }
  if (body.control_ids !== undefined && !Array.isArray(body.control_ids)) {
    errors.push('control_ids must be an array of control UUIDs');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const saved = await splunk.getOrgSplunkSettings(orgId);
    const config = {
      baseUrl: saved.baseUrl,
      apiToken: saved.apiToken,
      defaultIndex: saved.defaultIndex
    };

    if (!config.baseUrl || !config.apiToken) {
      return res.status(400).json({
        success: false,
        error: 'Splunk is not configured. Go to Settings and add Splunk credentials first.'
      });
    }

    const searchResult = await splunk.runSearch(config, {
      search: req.body.search,
      earliestTime: req.body.earliest_time,
      latestTime: req.body.latest_time,
      maxEvents: req.body.max_events
    });

    const importedAt = new Date().toISOString();
    const evidencePayload = {
      source: 'splunk',
      imported_at: importedAt,
      query: {
        search: searchResult.search,
        earliest_time: req.body.earliest_time || '-24h@h',
        latest_time: req.body.latest_time || 'now',
        sid: searchResult.sid
      },
      summary: {
        result_count: searchResult.results.length
      },
      results: searchResult.results
    };

    const fileBody = Buffer.from(JSON.stringify(evidencePayload, null, 2), 'utf8');
    const fileHash = createHash('sha256').update(fileBody).digest('hex');
    const fileNameRoot = sanitizeFileName(req.body.title || `splunk-${Date.now()}`);
    const fileName = `${fileNameRoot}.json`;
    const diskName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-splunk.json`;
    const filePath = path.join(uploadsDir, diskName);
    fs.writeFileSync(filePath, fileBody);

    const description = req.body.description
      || `Imported from Splunk (${searchResult.results.length} result${searchResult.results.length === 1 ? '' : 's'})`;
    const tags = parseTags(req.body.tags);
    const retentionUntil = req.body.retention_until || getDefaultRetentionDate();

    const evidenceInsert = await pool.query(
      `INSERT INTO evidence (
        organization_id, uploaded_by, file_name, file_path, file_size, mime_type, description, tags,
        integrity_hash_sha256, evidence_version, retention_until, integrity_verified_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, NOW())
      RETURNING id, file_name, file_size, created_at`,
      [
        orgId,
        req.user.id,
        fileName,
        filePath,
        fileBody.length,
        'application/json',
        description,
        tags,
        fileHash,
        retentionUntil
      ]
    );

    const evidenceRecord = evidenceInsert.rows[0];
    const requestedControlIds = Array.isArray(req.body.control_ids) ? req.body.control_ids : [];
    let linkedControls = 0;

    if (requestedControlIds.length > 0) {
      const validControlRows = await pool.query(
        'SELECT id FROM framework_controls WHERE id = ANY($1::uuid[])',
        [requestedControlIds]
      );
      const validControlIds = validControlRows.rows.map((row) => row.id);
      for (const controlId of validControlIds) {
        await pool.query(
          `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [evidenceRecord.id, controlId, 'Imported from Splunk']
        );
      }
      linkedControls = validControlIds.length;
    }

    res.status(201).json({
      success: true,
      message: 'Splunk results imported to Evidence',
      data: {
        evidence_id: evidenceRecord.id,
        file_name: evidenceRecord.file_name,
        file_size: evidenceRecord.file_size,
        result_count: searchResult.results.length,
        sid: searchResult.sid,
        linked_controls: linkedControls
      }
    });
  } catch (error) {
    console.error('Splunk evidence import error:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to import Splunk evidence'
    });
  }
});

module.exports = router;
