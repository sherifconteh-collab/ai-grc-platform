// @tier: enterprise
// Threat Intelligence — stubs
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { stubList, stubCreate, stubGet, stubAction } = require('./_stubs');

router.use(authenticate);

router.get('/feeds', requirePermission('controls.read'), stubList);
router.post('/feeds', requirePermission('controls.write'), stubCreate);
router.get('/feeds/:id', requirePermission('controls.read'), stubGet);
router.put('/feeds/:id', requirePermission('controls.write'), stubAction);
router.delete('/feeds/:id', requirePermission('controls.write'), stubAction);
router.post('/sync-all', requirePermission('controls.write'), stubAction);
router.get('/items', requirePermission('controls.read'), stubList);
router.get('/stats', requirePermission('controls.read'), stubGet);

module.exports = router;
