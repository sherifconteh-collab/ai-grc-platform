// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  getDomainConfig,
  getConfigValue,
  upsertConfig,
  deleteConfig
} = require('../services/dynamicConfigService');

router.use(authenticate);

function isGlobalScope(req) {
  return req.query.scope === 'global' || req.body?.scope === 'global';
}

function assertAdminForGlobal(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Global configuration updates require admin role.'
    });
    return false;
  }
  return true;
}

// GET /api/v1/config/:domain
router.get('/:domain', requirePermission('organizations.read'), async (req, res) => {
  try {
    const domain = req.params.domain;
    const orgId = req.user.organization_id;

    const merged = await getDomainConfig(orgId, domain);
    res.json({
      success: true,
      data: {
        domain,
        scope: 'merged',
        values: merged
      }
    });
  } catch (error) {
    console.error('Dynamic config domain read error:', error);
    res.status(500).json({ success: false, error: 'Failed to load dynamic config domain' });
  }
});

// GET /api/v1/config/:domain/:key
router.get('/:domain/:key', requirePermission('organizations.read'), async (req, res) => {
  try {
    const { domain, key } = req.params;
    const orgId = req.user.organization_id;
    const value = await getConfigValue(orgId, domain, key, null);
    res.json({
      success: true,
      data: {
        domain,
        key,
        value
      }
    });
  } catch (error) {
    console.error('Dynamic config value read error:', error);
    res.status(500).json({ success: false, error: 'Failed to load config value' });
  }
});

// PUT /api/v1/config/:domain/:key
router.put('/:domain/:key', requirePermission('settings.manage'), async (req, res) => {
  try {
    const { domain, key } = req.params;
    const { value, isActive = true } = req.body || {};
    const globalScope = isGlobalScope(req);

    if (globalScope && !assertAdminForGlobal(req, res)) return;

    const row = await upsertConfig({
      organizationId: globalScope ? null : req.user.organization_id,
      domain,
      key,
      value,
      isActive: Boolean(isActive),
      updatedBy: req.user.id
    });

    res.json({
      success: true,
      data: row
    });
  } catch (error) {
    console.error('Dynamic config upsert error:', error);
    res.status(500).json({ success: false, error: 'Failed to update config value' });
  }
});

// DELETE /api/v1/config/:domain/:key
router.delete('/:domain/:key', requirePermission('settings.manage'), async (req, res) => {
  try {
    const { domain, key } = req.params;
    const globalScope = isGlobalScope(req);

    if (globalScope && !assertAdminForGlobal(req, res)) return;

    const deleted = await deleteConfig({
      organizationId: globalScope ? null : req.user.organization_id,
      domain,
      key
    });

    res.json({
      success: true,
      data: { deleted }
    });
  } catch (error) {
    console.error('Dynamic config delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete config value' });
  }
});

module.exports = router;
