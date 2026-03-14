// @tier: enterprise
// Advanced premium feature stubs — contacts, phase6, RAG, RMF, PLOT4AI, billing
const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const { stubList, stubCreate, stubGet, stubAction } = require('./_stubs');

// ---------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------
const contactsRouter = express.Router();
contactsRouter.use(authenticate);
contactsRouter.get('/', requirePermission('controls.read'), stubList);
contactsRouter.post('/', requirePermission('controls.write'), stubCreate);
contactsRouter.get('/:id', requirePermission('controls.read'), stubGet);
contactsRouter.put('/:id', requirePermission('controls.write'), stubAction);
contactsRouter.delete('/:id', requirePermission('controls.write'), stubAction);

// ---------------------------------------------------------------
// Phase6 (risk scoring, regulatory impact, remediation)
// ---------------------------------------------------------------
const phase6Router = express.Router();
phase6Router.use(authenticate);
phase6Router.post('/risk-score/calculate', requirePermission('controls.read'), stubAction);
phase6Router.get('/risk-score/latest', requirePermission('controls.read'), stubGet);
phase6Router.get('/risk-score/history', requirePermission('controls.read'), stubList);
phase6Router.post('/regulatory-impact/analyze', requirePermission('controls.read'), stubAction);
phase6Router.get('/regulatory-impact/assessments', requirePermission('controls.read'), stubList);
phase6Router.post('/remediation/generate', requirePermission('controls.read'), stubAction);
phase6Router.get('/remediation/plans', requirePermission('controls.read'), stubList);
phase6Router.post('/analyze/comprehensive', requirePermission('controls.read'), stubAction);

// ---------------------------------------------------------------
// RAG (Retrieval-Augmented Generation)
// ---------------------------------------------------------------
const ragRouter = express.Router();
ragRouter.use(authenticate);
ragRouter.post('/index', requirePermission('settings.manage'), stubAction);
ragRouter.post('/index-text', requirePermission('settings.manage'), stubAction);
ragRouter.post('/search', requirePermission('controls.read'), stubAction);
ragRouter.get('/documents', requirePermission('controls.read'), stubList);
ragRouter.get('/stats', requirePermission('settings.manage'), stubGet);

// ---------------------------------------------------------------
// RMF (Risk Management Framework)
// ---------------------------------------------------------------
const rmfRouter = express.Router();
rmfRouter.use(authenticate);
rmfRouter.get('/summary', requirePermission('controls.read'), stubGet);
rmfRouter.get('/packages', requirePermission('controls.read'), stubList);
rmfRouter.post('/packages', requirePermission('controls.write'), stubCreate);
rmfRouter.get('/packages/:id', requirePermission('controls.read'), stubGet);

// ---------------------------------------------------------------
// PLOT4AI (AI threat modeling)
// ---------------------------------------------------------------
const plot4aiRouter = express.Router();
plot4aiRouter.use(authenticate);
plot4aiRouter.get('/threats', requirePermission('controls.read'), stubList);
plot4aiRouter.get('/categories', requirePermission('controls.read'), stubList);
plot4aiRouter.get('/filters', requirePermission('controls.read'), stubList);
plot4aiRouter.get('/stats', requirePermission('controls.read'), stubGet);

// ---------------------------------------------------------------
// Billing (Stripe / payment management)
// ---------------------------------------------------------------
const billingRouter = express.Router();
billingRouter.use(authenticate);
billingRouter.post('/checkout', stubAction);
billingRouter.post('/portal', stubAction);
billingRouter.get('/subscription', stubGet);
billingRouter.post('/change-plan', stubAction);
billingRouter.post('/cancel', stubAction);
billingRouter.post('/downgrade-to-free', stubAction);
billingRouter.post('/webhook', stubAction); // webhook uses raw body, handled separately

module.exports = { contactsRouter, phase6Router, ragRouter, rmfRouter, plot4aiRouter, billingRouter };
