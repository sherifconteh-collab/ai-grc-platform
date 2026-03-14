// @tier: enterprise
// Data Sovereignty — stubs
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { stubList, stubCreate, stubGet, stubAction } = require('./_stubs');

router.use(authenticate);

router.get('/config', requirePermission('settings.manage'), stubGet);
router.put('/config', requirePermission('settings.manage'), stubAction);
router.get('/jurisdictions', requirePermission('controls.read'), stubList);
router.get('/organization-jurisdictions', requirePermission('controls.read'), stubList);
router.post('/organization-jurisdictions', requirePermission('controls.write'), stubCreate);
router.get('/regulatory-changes', requirePermission('controls.read'), stubList);
router.post('/regulatory-changes', requirePermission('controls.write'), stubCreate);
router.get('/ai-provider-regions', requirePermission('controls.read'), stubList);
router.get('/compliance-gap-analysis', requirePermission('controls.read'), stubGet);

module.exports = router;
