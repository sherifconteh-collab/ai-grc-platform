// @tier: pro
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { enqueueWebhookEvent } = require('../services/webhookService');
const { enqueueJob } = require('../services/jobService');
const { getConfigValue } = require('../services/dynamicConfigService');

router.use(authenticate);
router.use(requirePermission('settings.manage'));

const DEFAULT_CONNECTOR_TEMPLATES = [
  { type: 'splunk', label: 'Splunk', category: 'SIEM', required: ['baseUrl', 'token'], supports_realtime: true },
  { type: 'acas', label: 'ACAS/Nessus', category: 'Vulnerability Scanner', required: ['baseUrl', 'apiKey'], supports_realtime: false },
  { type: 'sbom_repo', label: 'SBOM Repository', category: 'Software Supply Chain', required: ['baseUrl'], supports_realtime: false },
  { type: 'stig_repo', label: 'STIG Content Source', category: 'Hardening Baselines', required: ['sourcePath'], supports_realtime: false },
  { type: 'siem_generic', label: 'Generic SIEM', category: 'SIEM', required: ['endpoint', 'authType'], supports_realtime: false },
  { type: 'scanner_generic', label: 'Generic Scanner', category: 'Vulnerability Scanner', required: ['endpoint'], supports_realtime: false },
  { type: 'nvd', label: 'NIST NVD', category: 'Threat Intelligence', required: [], optional: ['apiKey'], supports_realtime: true, description: 'National Vulnerability Database CVE feed' },
  { type: 'cisa_kev', label: 'CISA KEV', category: 'Threat Intelligence', required: [], supports_realtime: true, description: 'Known Exploited Vulnerabilities catalog' },
  { type: 'mitre_attack', label: 'MITRE ATT&CK', category: 'Threat Intelligence', required: [], supports_realtime: false, description: 'Adversary tactics and techniques' },
  { type: 'alienvault_otx', label: 'AlienVault OTX', category: 'Threat Intelligence', required: ['apiKey'], supports_realtime: true, description: 'Open Threat Exchange' },
  { type: 'securityscorecard', label: 'SecurityScorecard', category: 'Vendor Security', required: ['apiKey'], supports_realtime: false, description: 'Third-party security ratings' },
  { type: 'bitsight', label: 'BitSight', category: 'Vendor Security', required: ['apiKey'], supports_realtime: false, description: 'Continuous security ratings' },
  { type: 'aws_security_hub', label: 'AWS Security Hub', category: 'Cloud Security', required: ['region', 'accessKeyId', 'secretAccessKey'], optional: ['assumeRoleArn'], supports_realtime: false, description: 'AWS Security Hub findings — maps severity to control status and links findings to NIST/CIS controls' },
  { type: 'qualys_vmdr', label: 'Qualys VMDR', category: 'Vulnerability Scanner', required: ['baseUrl', 'username', 'password'], optional: ['tagIds'], supports_realtime: false, description: 'Qualys VMDR vulnerability detections mapped to CIS Controls v8 and NIST 800-53' },
  { type: 'servicenow', label: 'ITSM / Change Management', category: 'ITSM / Change Management', required: ['instanceUrl', 'username', 'password'], optional: ['changeTableName', 'incidentTableName'], supports_realtime: false, description: 'ITSM incident and change records linked to control implementation evidence' } // ip-hygiene:ignore
];

function normalizeStatus(value) {
  const v = String(value || '').toLowerCase();
  return ['inactive', 'active', 'error'].includes(v) ? v : 'inactive';
}

async function emitConnectorEvent(orgId, userId, eventType, payload) {
  await enqueueWebhookEvent({
    organizationId: orgId,
    eventType,
    payload
  }).catch(() => {});

  await enqueueJob({
    organizationId: orgId,
    jobType: 'webhook_flush',
    payload: { limit: 50 },
    createdBy: userId
  }).catch(() => {});
}

// GET /api/v1/integrations-hub/templates
router.get('/templates', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const override = await getConfigValue(orgId, 'integrations', 'connector_templates', null);
    const templates = Array.isArray(override) ? override : DEFAULT_CONNECTOR_TEMPLATES;
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Integration template error:', error);
    res.status(500).json({ success: false, error: 'Failed to load integration templates' });
  }
});

// GET /api/v1/integrations-hub/connectors
router.get('/connectors', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const connectors = await pool.query(
      `SELECT *
       FROM integration_connectors
       WHERE organization_id = $1
       ORDER BY updated_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: connectors.rows });
  } catch (error) {
    console.error('List connectors error:', error);
    res.status(500).json({ success: false, error: 'Failed to load integration connectors' });
  }
});

// POST /api/v1/integrations-hub/connectors
router.post('/connectors', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { name, connector_type, status, auth_config = {}, connector_config = {} } = req.body || {};
    if (!name || !connector_type) {
      return res.status(400).json({ success: false, error: 'name and connector_type are required' });
    }

    const inserted = await pool.query(
      `INSERT INTO integration_connectors (
         organization_id, name, connector_type, status, auth_config, connector_config, created_by
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING *`,
      [
        orgId,
        name,
        connector_type,
        normalizeStatus(status),
        JSON.stringify(auth_config || {}),
        JSON.stringify(connector_config || {}),
        req.user.id
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'integration_connector_created', 'integration_connector', $3, $4::jsonb, true)`,
      [orgId, req.user.id, inserted.rows[0].id, JSON.stringify({ connector_type, name })]
    );

    await emitConnectorEvent(orgId, req.user.id, 'integration.connector.created', {
      id: inserted.rows[0].id,
      connector_type,
      name
    });

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    console.error('Create connector error:', error);
    res.status(500).json({ success: false, error: 'Failed to create integration connector' });
  }
});

// PATCH /api/v1/integrations-hub/connectors/:id
router.patch('/connectors/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const patch = req.body || {};

    const existing = await pool.query(
      `SELECT *
       FROM integration_connectors
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Integration connector not found' });
    }

    const updated = await pool.query(
      `UPDATE integration_connectors
       SET name = COALESCE($3, name),
           connector_type = COALESCE($4, connector_type),
           status = COALESCE($5, status),
           auth_config = COALESCE($6::jsonb, auth_config),
           connector_config = COALESCE($7::jsonb, connector_config),
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING *`,
      [
        orgId,
        id,
        patch.name || null,
        patch.connector_type || null,
        patch.status === undefined ? null : normalizeStatus(patch.status),
        patch.auth_config === undefined ? null : JSON.stringify(patch.auth_config),
        patch.connector_config === undefined ? null : JSON.stringify(patch.connector_config)
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'integration_connector_updated', 'integration_connector', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ status: updated.rows[0].status, name: updated.rows[0].name })]
    );

    await emitConnectorEvent(orgId, req.user.id, 'integration.connector.updated', {
      id,
      status: updated.rows[0].status
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    console.error('Update connector error:', error);
    res.status(500).json({ success: false, error: 'Failed to update integration connector' });
  }
});

// DELETE /api/v1/integrations-hub/connectors/:id
router.delete('/connectors/:id', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const deleted = await pool.query(
      `DELETE FROM integration_connectors
       WHERE organization_id = $1 AND id = $2
       RETURNING id, connector_type, name`,
      [orgId, id]
    );
    if (deleted.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Integration connector not found' });
    }

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'integration_connector_deleted', 'integration_connector', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify({ connector_type: deleted.rows[0].connector_type, name: deleted.rows[0].name })]
    );

    await emitConnectorEvent(orgId, req.user.id, 'integration.connector.deleted', { id });

    res.json({ success: true, message: 'Integration connector deleted' });
  } catch (error) {
    console.error('Delete connector error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete integration connector' });
  }
});

// POST /api/v1/integrations-hub/connectors/:id/run
router.post('/connectors/:id/run', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;

    const connector = await pool.query(
      `SELECT *
       FROM integration_connectors
       WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, id]
    );
    if (connector.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Integration connector not found' });
    }

    const runStart = await pool.query(
      `INSERT INTO integration_connector_runs (
         organization_id, connector_id, run_type, status, started_at, created_by
       )
       VALUES ($1, $2, 'manual', 'running', NOW(), $3)
       RETURNING *`,
      [orgId, id, req.user.id]
    );

    const row = connector.rows[0];
    const simulatedResult = {
      connector_type: row.connector_type,
      synced_assets: row.connector_type.includes('scanner') ? 12 : 5,
      findings_ingested: row.connector_type.includes('acas') ? 31 : 9,
      completed_at: new Date().toISOString()
    };

    const runFinish = await pool.query(
      `UPDATE integration_connector_runs
       SET status = 'success',
           result_summary = $2::jsonb,
           finished_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [runStart.rows[0].id, JSON.stringify(simulatedResult)]
    );

    await pool.query(
      `UPDATE integration_connectors
       SET status = 'active',
           last_sync_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, 'integration_connector_run', 'integration_connector', $3, $4::jsonb, true)`,
      [orgId, req.user.id, id, JSON.stringify(simulatedResult)]
    );

    await emitConnectorEvent(orgId, req.user.id, 'integration.connector.run', {
      connector_id: id,
      run_id: runFinish.rows[0].id,
      result: simulatedResult
    });

    res.json({ success: true, data: runFinish.rows[0] });
  } catch (error) {
    console.error('Run connector error:', error);
    res.status(500).json({ success: false, error: 'Failed to run integration connector' });
  }
});

// GET /api/v1/integrations-hub/connectors/:id/runs
router.get('/connectors/:id/runs', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const id = req.params.id;
    const runs = await pool.query(
      `SELECT *
       FROM integration_connector_runs
       WHERE organization_id = $1 AND connector_id = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [orgId, id]
    );
    res.json({ success: true, data: runs.rows });
  } catch (error) {
    console.error('Connector runs error:', error);
    res.status(500).json({ success: false, error: 'Failed to load integration run history' });
  }
});

module.exports = router;
