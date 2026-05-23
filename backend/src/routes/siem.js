// @tier: enterprise
'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const siem = require('../services/siemService');
const auditService = require('../services/auditService');

// All SIEM routes require authentication, settings.manage permission, and enterprise tier
router.use(authenticate);
router.use(requireTier('enterprise'));
router.use(requirePermission('settings.manage'));

const VALID_PROVIDERS = new Set(['splunk', 'elastic', 'webhook', 'syslog']);

// GET /siem — list all SIEM configurations
router.get('/', async (req, res) => {
  try {
    const configs = await siem.listSiemConfigs(req.user.organization_id);
    return res.json({ data: configs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve SIEM configurations' });
  }
});

// POST /siem — create a new SIEM config
router.post(
  '/',
  validateBody((body) => requireFields(body, ['name', 'provider'])),
  async (req, res) => {
    try {
      if (!VALID_PROVIDERS.has(req.body.provider)) {
        return res.status(400).json({ error: 'Invalid provider. Must be one of: splunk, elastic, webhook, syslog' });
      }
      const id = await siem.saveSiemConfig(req.user.organization_id, req.body);
      
      // Log SIEM configuration creation
      const context = auditService.extractAuditContext(req);
      await auditService.logSiemConfigChange({
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'created',
        siemProvider: req.body.provider,
        configId: id,
        details: {
          name: req.body.name,
          enabled: req.body.enabled !== false
        },
        ...context,
        actorName: auditService.getActorName(req.user)
      });
      
      return res.status(201).json({ data: { id } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save SIEM configuration' });
    }
  }
);

// PUT /siem/:id — update an existing SIEM config
router.put(
  '/:id',
  validateBody((body) => requireFields(body, ['name', 'provider'])),
  async (req, res) => {
    try {
      if (!VALID_PROVIDERS.has(req.body.provider)) {
        return res.status(400).json({ error: 'Invalid provider.' });
      }
      await siem.saveSiemConfig(req.user.organization_id, { ...req.body, id: req.params.id });
      
      // Log SIEM configuration update
      const context = auditService.extractAuditContext(req);
      await auditService.logSiemConfigChange({
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'updated',
        siemProvider: req.body.provider,
        configId: req.params.id,
        details: {
          name: req.body.name,
          enabled: req.body.enabled !== false
        },
        ...context,
        actorName: auditService.getActorName(req.user)
      });
      
      return res.json({ data: { updated: true } });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update SIEM configuration' });
    }
  }
);

// DELETE /siem/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await siem.deleteSiemConfig(req.user.organization_id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'SIEM config not found.' });
    
    // Log SIEM configuration deletion
    const context = auditService.extractAuditContext(req);
    await auditService.logSiemConfigChange({
      organizationId: req.user.organization_id,
      userId: req.user.id,
      action: 'deleted',
      siemProvider: 'unknown',
      configId: req.params.id,
      details: {},
      ...context,
      actorName: auditService.getActorName(req.user)
    });
    
    return res.json({ data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete SIEM configuration' });
  }
});

// POST /siem/:id/test — send a test event
router.post('/:id/test', async (req, res) => {
  try {
    const result = await siem.testSiemConfig(req.user.organization_id, req.params.id);
    return res.json({ data: { ok: true, detail: result } });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: 'SIEM connection test failed' });
  }
});

// POST /siem/forward — manually forward an event (for testing/manual flush)
router.post('/forward', async (req, res) => {
  try {
    const { event_type, payload } = req.body;
    if (!event_type) return res.status(400).json({ error: 'event_type required.' });
    const results = await siem.forwardEvent(req.user.organization_id, event_type, payload || {});
    return res.json({ data: results });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to forward SIEM event' });
  }
});

module.exports = router;
