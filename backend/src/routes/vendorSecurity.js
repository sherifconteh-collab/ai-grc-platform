// @tier: enterprise
// Vendor Security Scoring — stubs
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { stubList, stubCreate, stubGet, stubAction } = require('./_stubs');

router.use(authenticate);

router.get('/scores', requirePermission('controls.read'), stubList);
router.post('/scores', requirePermission('controls.write'), stubCreate);
router.get('/scores/:id', requirePermission('controls.read'), stubGet);
router.post('/monitor', requirePermission('controls.write'), stubAction);

module.exports = router;
