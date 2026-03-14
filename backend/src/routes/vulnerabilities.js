// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

// GET /api/v1/vulnerabilities
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { status, severity, source, search, limit = 100, offset = 0 } = req.query;

    const params = [orgId];
    const filters = [];

    if (status) { params.push(status); filters.push(`v.status = $${params.length}`); }
    if (severity) { params.push(severity); filters.push(`v.severity = $${params.length}`); }
    if (source) { params.push(source); filters.push(`v.source = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(v.title ILIKE $${params.length} OR v.vuln_id ILIKE $${params.length})`);
    }

    const whereExtra = filters.length > 0 ? ' AND ' + filters.join(' AND ') : '';
    params.push(Number(limit) || 100, Number(offset) || 0);

    const result = await pool.query(
      `SELECT v.*, a.name AS asset_name
       FROM vulnerabilities v
       LEFT JOIN assets a ON a.id = v.asset_id
       WHERE v.organization_id = $1 ${whereExtra}
       ORDER BY
         CASE v.severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         v.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Count with same filters for accurate pagination metadata
    const countParams = [orgId];
    const countFilters = [];
    if (status) { countParams.push(status); countFilters.push(`v.status = $${countParams.length}`); }
    if (severity) { countParams.push(severity); countFilters.push(`v.severity = $${countParams.length}`); }
    if (source) { countParams.push(source); countFilters.push(`v.source = $${countParams.length}`); }
    if (search) {
      countParams.push(`%${search}%`);
      countFilters.push(`(v.title ILIKE $${countParams.length} OR v.vuln_id ILIKE $${countParams.length})`);
    }
    const countWhere = countFilters.length > 0 ? ' AND ' + countFilters.join(' AND ') : '';

    const count = await pool.query(
      `SELECT COUNT(*) FROM vulnerabilities v WHERE v.organization_id=$1 ${countWhere}`,
      countParams
    );

    res.json({ success: true, data: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error('Vulnerability list error:', err);
    res.status(500).json({ success: false, error: 'Failed to load vulnerabilities' });
  }
});

// GET /api/v1/vulnerabilities/sources
router.get('/sources', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT DISTINCT source FROM vulnerabilities WHERE organization_id=$1 AND source IS NOT NULL ORDER BY source`,
      [orgId]
    );
    res.json({ success: true, data: result.rows.map(r => r.source) });
  } catch (err) {
    console.error('Vuln sources error:', err);
    res.status(500).json({ success: false, error: 'Failed to load vulnerability sources' });
  }
});

// POST /api/v1/vulnerabilities/import
router.post('/import', requirePermission('controls.write'), upload.single('file'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    // Basic JSON/CSV import stub - parse as JSON array if possible
    let items = [];
    try {
      items = JSON.parse(req.file.buffer.toString());
      if (!Array.isArray(items)) items = [items];
    } catch {
      return res.status(400).json({ success: false, error: 'File must be a valid JSON array of vulnerabilities' });
    }

    const imported = [];
    for (const item of items) {
      const vulnId = item.cve_id || item.vuln_id || item.cve || null;
      // Deduplicate by (organization_id, vuln_id) when vuln_id is present
      if (vulnId) {
        const r = await pool.query(
          `INSERT INTO vulnerabilities (
             organization_id, title, description, vuln_id, severity, status, source,
             cvss_score, affected_component, remediation, created_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (organization_id, vuln_id) DO UPDATE
             SET title=EXCLUDED.title, severity=EXCLUDED.severity,
                 cvss_score=COALESCE(EXCLUDED.cvss_score, vulnerabilities.cvss_score),
                 updated_at=NOW()
           RETURNING id, title, vuln_id, severity`,
          [
            orgId, item.title || item.name || 'Unnamed',
            item.description || null, vulnId,
            item.severity || 'medium', item.status || 'open', item.source || 'import',
            item.cvss_score || null, item.affected_component || null,
            item.remediation || null, req.user.id
          ]
        );
        if (r.rows.length > 0) imported.push(r.rows[0]);
      } else {
        // No vuln_id — always insert (no deduplication possible)
        const r = await pool.query(
          `INSERT INTO vulnerabilities (
             organization_id, title, description, vuln_id, severity, status, source,
             cvss_score, affected_component, remediation, created_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id, title, vuln_id, severity`,
          [
            orgId, item.title || item.name || 'Unnamed',
            item.description || null, null,
            item.severity || 'medium', item.status || 'open', item.source || 'import',
            item.cvss_score || null, item.affected_component || null,
            item.remediation || null, req.user.id
          ]
        );
        if (r.rows.length > 0) imported.push(r.rows[0]);
      }
    }

    res.json({ success: true, data: { imported: imported.length, items: imported } });
  } catch (err) {
    console.error('Vuln import error:', err);
    res.status(500).json({ success: false, error: 'Failed to import vulnerabilities' });
  }
});

// POST /api/v1/vulnerabilities
router.post('/', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      title, description, vuln_id, severity, status, source,
      cvss_score, asset_id, affected_component, remediation
    } = req.body || {};
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const result = await pool.query(
      `INSERT INTO vulnerabilities (
         organization_id, title, description, vuln_id, severity, status, source,
         cvss_score, asset_id, affected_component, remediation, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        orgId, title, description || null, vuln_id || null,
        severity || 'medium', status || 'open', source || 'manual',
        cvss_score || null, asset_id || null, affected_component || null,
        remediation || null, req.user.id
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Vulnerability create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create vulnerability' });
  }
});

// GET /api/v1/vulnerabilities/:id
router.get('/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT v.*, a.name AS asset_name
       FROM vulnerabilities v LEFT JOIN assets a ON a.id = v.asset_id
       WHERE v.organization_id=$1 AND v.id=$2`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Vulnerability get error:', err);
    res.status(500).json({ success: false, error: 'Failed to get vulnerability' });
  }
});

// PUT /api/v1/vulnerabilities/:id
router.put('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const {
      title, description, severity, status, cvss_score,
      asset_id, affected_component, remediation
    } = req.body || {};

    const result = await pool.query(
      `UPDATE vulnerabilities
       SET title = COALESCE($3, title),
           description = COALESCE($4, description),
           severity = COALESCE($5, severity),
           status = COALESCE($6, status),
           cvss_score = COALESCE($7, cvss_score),
           asset_id = COALESCE($8, asset_id),
           affected_component = COALESCE($9, affected_component),
           remediation = COALESCE($10, remediation),
           updated_at = NOW()
       WHERE organization_id=$1 AND id=$2
       RETURNING *`,
      [orgId, req.params.id, title || null, description || null, severity || null,
       status || null, cvss_score || null, asset_id || null, affected_component || null, remediation || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Vulnerability update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update vulnerability' });
  }
});

// DELETE /api/v1/vulnerabilities/:id
router.delete('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM vulnerabilities WHERE organization_id=$1 AND id=$2 RETURNING id, title`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vulnerability not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Vulnerability delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete vulnerability' });
  }
});

module.exports = router;
