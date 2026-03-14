// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

// GET /api/v1/sbom/assets — list assets that have SBOM records
router.get('/assets', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { search } = req.query;
    const params = [orgId];
    let whereExtra = '';
    if (search) {
      params.push(`%${search}%`);
      whereExtra = ` AND (a.name ILIKE $${params.length} OR a.asset_type ILIKE $${params.length})`;
    }
    const result = await pool.query(
      `SELECT a.id, a.name, a.asset_type, a.description,
              COUNT(s.id) AS sbom_count
       FROM assets a
       LEFT JOIN sbom_records s ON s.asset_id = a.id
       WHERE a.organization_id = $1 ${whereExtra}
       GROUP BY a.id
       ORDER BY a.name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('SBOM assets error:', err);
    res.status(500).json({ success: false, error: 'Failed to load SBOM assets' });
  }
});

// GET /api/v1/sbom — list SBOM records
router.get('/', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { asset_id, format, search, limit = 50, offset = 0 } = req.query;

    const params = [orgId];
    const filters = [];

    if (asset_id) { params.push(asset_id); filters.push(`s.asset_id = $${params.length}`); }
    if (format) { params.push(format); filters.push(`s.sbom_format = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(s.name ILIKE $${params.length} OR a.name ILIKE $${params.length})`);
    }

    const whereExtra = filters.length > 0 ? ' AND ' + filters.join(' AND ') : '';
    params.push(Number(limit) || 50, Number(offset) || 0);

    const result = await pool.query(
      `SELECT s.*,
              a.name AS asset_name,
              COUNT(c.id) AS component_count
       FROM sbom_records s
       LEFT JOIN assets a ON a.id = s.asset_id
       LEFT JOIN sbom_components c ON c.sbom_id = s.id
       WHERE s.organization_id = $1 ${whereExtra}
       GROUP BY s.id, a.name
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = await pool.query(
      `SELECT COUNT(*) FROM sbom_records WHERE organization_id=$1`,
      [orgId]
    );

    res.json({ success: true, data: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error('SBOM list error:', err);
    res.status(500).json({ success: false, error: 'Failed to load SBOM records' });
  }
});

// GET /api/v1/sbom/:id
router.get('/:id', requirePermission('controls.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const sbom = await pool.query(
      `SELECT s.*, a.name AS asset_name FROM sbom_records s LEFT JOIN assets a ON a.id=s.asset_id WHERE s.organization_id=$1 AND s.id=$2`,
      [orgId, req.params.id]
    );
    if (sbom.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SBOM record not found' });
    }
    const components = await pool.query(
      `SELECT * FROM sbom_components WHERE sbom_id=$1 ORDER BY name`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...sbom.rows[0], components: components.rows } });
  } catch (err) {
    console.error('SBOM get error:', err);
    res.status(500).json({ success: false, error: 'Failed to get SBOM record' });
  }
});

// POST /api/v1/sbom/upload — upload an SBOM file (CycloneDX / SPDX JSON)
router.post('/upload', requirePermission('controls.write'), upload.single('file'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    const { asset_id, name } = req.body || {};
    const raw = req.file.buffer.toString();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }

    // Detect format
    let format = 'unknown';
    let components = [];
    if (parsed) {
      if (parsed.bomFormat === 'CycloneDX') {
        format = 'cyclonedx';
        components = (parsed.components || []).map(c => ({
          name: c.name, version: c.version || null, purl: c.purl || null,
          license: c.licenses?.[0]?.license?.id || null
        }));
      } else if (parsed.spdxVersion) {
        format = 'spdx';
        components = (parsed.packages || []).map(p => ({
          name: p.name, version: p.versionInfo || null, purl: null,
          license: p.licenseConcluded || null
        }));
      }
    }

    const record = await pool.query(
      `INSERT INTO sbom_records (organization_id, asset_id, name, sbom_format, raw_content, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
      [orgId, asset_id || null, name || req.file.originalname, format, JSON.stringify({ raw: raw.substring(0, 10000) }), req.user.id]
    );
    const sbomId = record.rows[0].id;

    for (const c of components) {
      await pool.query(
        `INSERT INTO sbom_components (sbom_id, name, version, purl, license)
         VALUES ($1,$2,$3,$4,$5)`,
        [sbomId, c.name, c.version, c.purl, c.license]
      ).catch(err => {
        console.warn(`SBOM component insert failed for "${c.name}": ${err.message}`);
      });
    }

    res.status(201).json({
      success: true,
      data: { ...record.rows[0], components_parsed: components.length }
    });
  } catch (err) {
    console.error('SBOM upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload SBOM' });
  }
});

// DELETE /api/v1/sbom/:id
router.delete('/:id', requirePermission('controls.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM sbom_records WHERE organization_id=$1 AND id=$2 RETURNING id`,
      [orgId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SBOM record not found' });
    }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    console.error('SBOM delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete SBOM record' });
  }
});

module.exports = router;
