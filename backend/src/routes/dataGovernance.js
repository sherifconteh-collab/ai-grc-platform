// @tier: enterprise
const express = require('express');
const fs = require('fs');
const { createHash } = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

function parseDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// GET /api/v1/data-governance/policies
router.get('/policies', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT *
       FROM data_retention_policies
       WHERE organization_id = $1
       ORDER BY active DESC, resource_type, policy_name`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List retention policies error:', error);
    res.status(500).json({ success: false, error: 'Failed to load retention policies' });
  }
});

// POST /api/v1/data-governance/policies
router.post('/policies', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { policy_name, resource_type, retention_days, auto_enforce = false, active = true } = req.body || {};
    if (!policy_name || !resource_type || !retention_days) {
      return res.status(400).json({ success: false, error: 'policy_name, resource_type, and retention_days are required' });
    }
    const days = Number(retention_days);
    if (!Number.isFinite(days) || days < 1) {
      return res.status(400).json({ success: false, error: 'retention_days must be a positive number' });
    }

    const insert = await pool.query(
      `INSERT INTO data_retention_policies (
         organization_id, policy_name, resource_type, retention_days, auto_enforce, active, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [orgId, policy_name, resource_type, days, Boolean(auto_enforce), Boolean(active), req.user.id]
    );
    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (error) {
    console.error('Create retention policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to create retention policy' });
  }
});

// PATCH /api/v1/data-governance/policies/:id
router.patch('/policies/:id', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const patch = req.body || {};
    const days = patch.retention_days === undefined ? null : Number(patch.retention_days);
    if (patch.retention_days !== undefined && (!Number.isFinite(days) || days < 1)) {
      return res.status(400).json({ success: false, error: 'retention_days must be a positive number' });
    }

    const update = await pool.query(
      `UPDATE data_retention_policies
       SET policy_name = COALESCE($3, policy_name),
           resource_type = COALESCE($4, resource_type),
           retention_days = COALESCE($5, retention_days),
           auto_enforce = COALESCE($6, auto_enforce),
           active = COALESCE($7, active),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        patch.policy_name || null,
        patch.resource_type || null,
        days,
        patch.auto_enforce === undefined ? null : Boolean(patch.auto_enforce),
        patch.active === undefined ? null : Boolean(patch.active)
      ]
    );

    if (update.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Retention policy not found' });
    }
    res.json({ success: true, data: update.rows[0] });
  } catch (error) {
    console.error('Update retention policy error:', error);
    res.status(500).json({ success: false, error: 'Failed to update retention policy' });
  }
});

// GET /api/v1/data-governance/legal-holds
router.get('/legal-holds', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT *
       FROM legal_holds
       WHERE organization_id = $1
       ORDER BY active DESC, created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List legal holds error:', error);
    res.status(500).json({ success: false, error: 'Failed to load legal holds' });
  }
});

// POST /api/v1/data-governance/legal-holds
router.post('/legal-holds', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { hold_name, resource_type, resource_id = null, reason, ends_at = null } = req.body || {};
    if (!hold_name || !resource_type || !reason) {
      return res.status(400).json({ success: false, error: 'hold_name, resource_type, and reason are required' });
    }

    const parsedEndsAt = ends_at ? parseDate(ends_at) : null;
    if (ends_at && !parsedEndsAt) {
      return res.status(400).json({ success: false, error: 'ends_at must be a valid date' });
    }

    const insert = await pool.query(
      `INSERT INTO legal_holds (
         organization_id, hold_name, resource_type, resource_id, reason, active, starts_at, ends_at, created_by
       )
       VALUES ($1, $2, $3, $4, $5, true, NOW(), $6, $7)
       RETURNING *`,
      [orgId, hold_name, resource_type, resource_id, reason, parsedEndsAt, req.user.id]
    );

    res.status(201).json({ success: true, data: insert.rows[0] });
  } catch (error) {
    console.error('Create legal hold error:', error);
    res.status(500).json({ success: false, error: 'Failed to create legal hold' });
  }
});

// POST /api/v1/data-governance/legal-holds/:id/release
router.post('/legal-holds/:id/release', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const update = await pool.query(
      `UPDATE legal_holds
       SET active = false,
           released_by = $3,
           released_at = NOW(),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [orgId, id, req.user.id]
    );
    if (update.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Legal hold not found' });
    }

    res.json({ success: true, data: update.rows[0] });
  } catch (error) {
    console.error('Release legal hold error:', error);
    res.status(500).json({ success: false, error: 'Failed to release legal hold' });
  }
});

// POST /api/v1/data-governance/evidence/:id/sign
router.post('/evidence/:id/sign', requirePermission('evidence.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const evidenceId = req.params.id;

    const evidenceResult = await pool.query(
      `SELECT id, file_name, file_path, integrity_hash_sha256, evidence_version, created_at
       FROM evidence
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, evidenceId]
    );
    if (evidenceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    const ev = evidenceResult.rows[0];
    if (!ev.file_path || !fs.existsSync(ev.file_path)) {
      return res.status(404).json({ success: false, error: 'Evidence file missing on disk' });
    }

    const digest = ev.integrity_hash_sha256 || await computeSha256(ev.file_path);
    const insert = await pool.query(
      `INSERT INTO artifact_signatures (
         organization_id, resource_type, resource_id, algorithm, digest, signed_by
       )
       VALUES ($1, 'evidence', $2, 'sha256', $3, $4)
       RETURNING *`,
      [orgId, evidenceId, digest, req.user.id]
    );

    res.status(201).json({
      success: true,
      data: {
        signature: insert.rows[0],
        evidence: {
          id: ev.id,
          file_name: ev.file_name,
          evidence_version: ev.evidence_version,
          created_at: ev.created_at
        }
      }
    });
  } catch (error) {
    console.error('Sign evidence error:', error);
    res.status(500).json({ success: false, error: 'Failed to sign evidence artifact' });
  }
});

// GET /api/v1/data-governance/evidence/:id/immutable-export
router.get('/evidence/:id/immutable-export', requirePermission('evidence.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const evidenceId = req.params.id;

    const evidenceResult = await pool.query(
      `SELECT id, file_name, file_size, mime_type, created_at, evidence_version, integrity_hash_sha256
       FROM evidence
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, evidenceId]
    );
    if (evidenceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }

    const signaturesResult = await pool.query(
      `SELECT id, algorithm, digest, signed_by, created_at
       FROM artifact_signatures
       WHERE organization_id = $1
         AND resource_type = 'evidence'
         AND resource_id = $2
       ORDER BY created_at DESC`,
      [orgId, evidenceId]
    );

    const activeHoldResult = await pool.query(
      `SELECT id, hold_name, reason, starts_at, ends_at
       FROM legal_holds
       WHERE organization_id = $1
         AND active = true
         AND resource_type = 'evidence'
         AND (resource_id IS NULL OR resource_id = $2)
       ORDER BY created_at DESC`,
      [orgId, evidenceId]
    );

    res.json({
      success: true,
      data: {
        immutable_manifest: {
          exported_at: new Date().toISOString(),
          evidence: evidenceResult.rows[0],
          signatures: signaturesResult.rows,
          active_legal_holds: activeHoldResult.rows
        }
      }
    });
  } catch (error) {
    console.error('Immutable evidence export error:', error);
    res.status(500).json({ success: false, error: 'Failed to build immutable export manifest' });
  }
});

module.exports = router;
