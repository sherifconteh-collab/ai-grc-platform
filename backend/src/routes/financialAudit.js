'use strict';

/**
 * Financial audit readiness: risk-control matrix, control testing with
 * attribute sampling, NFR/CAP tracking and the readiness dashboard.
 *
 *   GET    /financial-audit/rcm                     list the matrix
 *   POST   /financial-audit/rcm                     add an entry
 *   POST   /financial-audit/rcm/import              import entries from CSV text
 *   PATCH  /financial-audit/rcm/:id                 update an entry
 *   DELETE /financial-audit/rcm/:id                 delete an untested entry, or retire a tested one
 *   GET    /financial-audit/sampling                sample size for a control (frequency table)
 *   POST   /financial-audit/sampling/statistical    statistical attribute sample size
 *   GET    /financial-audit/tests                   list tests
 *   POST   /financial-audit/tests                   plan a test and select its sample
 *   GET    /financial-audit/tests/:id               test with samples
 *   PUT    /financial-audit/tests/:id/samples/:n    record a sample result
 *   POST   /financial-audit/tests/:id/complete      conclude a test
 *   POST   /financial-audit/tests/:id/review        independent review sign-off
 *   POST   /financial-audit/tests/:id/reopen        reopen a completed test
 *   POST   /financial-audit/tests/:id/finding       raise a finding (NFR) from a failed test
 *   PATCH  /financial-audit/findings/:id/nfr        NFR number, fiscal year, classification, CAP link
 *   POST   /financial-audit/findings/:id/cap        open a POA&M item as the corrective action plan
 *   GET    /financial-audit/readiness               readiness dashboard
 *   GET    /financial-audit/readiness/export        matrix with test results (CSV)
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { isUuid } = require('../middleware/validate');
const auditService = require('../services/auditService');
const sampling = require('../services/samplingService');
const rcm = require('../services/financialAudit/rcm');
const testing = require('../services/financialAudit/testing');
const readiness = require('../services/financialAudit/readiness');
const { log, serializeError } = require('../utils/logger');

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ label: 'financial-audit', windowMs: 15 * 60 * 1000, max: 1000 }));

const canRead = requirePermission('financial_audit.read');
const canWrite = requirePermission('financial_audit.write');
const MAX_CSV_BYTES = 2 * 1024 * 1024;

function failed(res, error, event) {
  if (error instanceof testing.TestError) return res.status(error.status).json({ success: false, error: error.message });
  log('error', event, { error: serializeError(error) });
  return res.status(500).json({ success: false, error: 'Internal server error' });
}

function fiscalYearParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

function requireUuidParam(name) {
  return (req, res, next) => (isUuid(req.params[name]) ? next() : res.status(400).json({ success: false, error: `Invalid ${name}` }));
}

async function checkReferences(organizationId, values) {
  if (values.owner_user_id) {
    if (!isUuid(values.owner_user_id)) return 'Invalid owner_user_id';
    const { rows } = await pool.query('SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND is_active = true', [values.owner_user_id, organizationId]);
    if (!rows.length) return 'Owner not found in this organization';
  }
  if (values.framework_control_id) {
    if (!isUuid(values.framework_control_id)) return 'Invalid framework_control_id';
    const { rows } = await pool.query('SELECT 1 FROM framework_controls WHERE id = $1', [values.framework_control_id]);
    if (!rows.length) return 'Framework control not found';
  }
  return null;
}

// ---------------------------------------------------------------- RCM

router.get('/rcm', canRead, async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const result = await rcm.listRcm(req.user.organization_id, {
      process: rcm.PROCESSES.includes(req.query.process) ? req.query.process : null,
      status: ['draft', 'active', 'retired'].includes(req.query.status) ? req.query.status : null,
      keyOnly: req.query.key_only === 'true',
      search: typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : null,
      limit,
      offset
    });
    res.json({ success: true, data: result.rows, pagination: { total: result.total, limit, offset } });
  } catch (error) {
    return failed(res, error, 'financial_audit.rcm_list_failed');
  }
});

router.post('/rcm', canWrite, async (req, res) => {
  try {
    const { values, errors } = rcm.normalizeRcm(req.body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
    const refError = await checkReferences(req.user.organization_id, values);
    if (refError) return res.status(400).json({ success: false, error: refError });
    const existing = await pool.query('SELECT 1 FROM rcm_entries WHERE organization_id = $1 AND control_ref = $2', [req.user.organization_id, values.control_ref]);
    if (existing.rows.length) return res.status(409).json({ success: false, error: `Control ${values.control_ref} is already in the matrix` });
    const saved = await rcm.upsertRcm(pool, req.user.organization_id, req.user.id, values);
    await auditService.logFromRequest(req, { eventType: 'rcm_entry.created', resourceType: 'rcm_entry', resourceId: saved.id, details: { control_ref: saved.control_ref } });
    const { inserted, ...entry } = saved;
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    return failed(res, error, 'financial_audit.rcm_create_failed');
  }
});

router.post('/rcm/import', canWrite, async (req, res) => {
  try {
    const csv = req.body && req.body.csv;
    if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ success: false, error: 'csv text is required' });
    if (Buffer.byteLength(csv) > MAX_CSV_BYTES) return res.status(413).json({ success: false, error: 'CSV exceeds 2 MB' });
    const result = await rcm.importCsv(req.user.organization_id, req.user.id, csv);
    await auditService.logFromRequest(req, { eventType: 'rcm_entry.imported', resourceType: 'rcm_entry', details: { created: result.created, updated: result.updated, rejected: result.errors.length } });
    res.json({ success: true, data: result });
  } catch (error) {
    return failed(res, error, 'financial_audit.rcm_import_failed');
  }
});

router.patch('/rcm/:id', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const { values, errors } = rcm.normalizeRcm(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });
    delete values.control_ref;
    const keys = Object.keys(values);
    if (!keys.length) return res.status(400).json({ success: false, error: 'No changes supplied' });
    const refError = await checkReferences(req.user.organization_id, values);
    if (refError) return res.status(400).json({ success: false, error: refError });
    const { rows: [entry] } = await pool.query(
      `UPDATE rcm_entries SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, req.user.organization_id, ...keys.map((k) => values[k])]
    );
    if (!entry) return res.status(404).json({ success: false, error: 'Risk-control matrix entry not found' });
    await auditService.logFromRequest(req, { eventType: 'rcm_entry.updated', resourceType: 'rcm_entry', resourceId: entry.id, details: { fields: keys } });
    res.json({ success: true, data: entry });
  } catch (error) {
    return failed(res, error, 'financial_audit.rcm_update_failed');
  }
});

router.delete('/rcm/:id', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const tests = await pool.query('SELECT 1 FROM control_tests WHERE rcm_entry_id = $1 AND organization_id = $2 LIMIT 1', [req.params.id, orgId]);
    const result = tests.rows.length
      ? await pool.query("UPDATE rcm_entries SET status = 'retired', updated_at = NOW() WHERE id = $1 AND organization_id = $2 RETURNING id, control_ref", [req.params.id, orgId])
      : await pool.query('DELETE FROM rcm_entries WHERE id = $1 AND organization_id = $2 RETURNING id, control_ref', [req.params.id, orgId]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Risk-control matrix entry not found' });
    const retired = tests.rows.length > 0;
    await auditService.logFromRequest(req, { eventType: retired ? 'rcm_entry.retired' : 'rcm_entry.deleted', resourceType: 'rcm_entry', resourceId: req.params.id, details: { control_ref: result.rows[0].control_ref } });
    res.json({ success: true, data: { id: req.params.id, retired } });
  } catch (error) {
    return failed(res, error, 'financial_audit.rcm_delete_failed');
  }
});

// ---------------------------------------------------------------- sampling

router.get('/sampling', canRead, (req, res) => {
  try {
    const population = req.query.population ? parseInt(req.query.population, 10) : null;
    const data = sampling.frequencySampleSize({
      frequency: req.query.frequency,
      riskLevel: req.query.risk_level || 'moderate',
      controlType: req.query.control_type || 'manual',
      population: Number.isInteger(population) ? population : null
    });
    res.json({ success: true, data: { ...data, table: sampling.FREQUENCY_TABLE } });
  } catch (error) {
    if (error instanceof RangeError) return res.status(400).json({ success: false, error: error.message });
    return failed(res, error, 'financial_audit.sampling_failed');
  }
});

router.post('/sampling/statistical', canRead, (req, res) => {
  try {
    const body = req.body || {};
    // Rates may be sent as fractions (0.05) or percentages (5); 1 and above are percentages.
    const pct = (v, d) => (v === undefined || v === null || v === '' ? d : (Number(v) >= 1 ? Number(v) / 100 : Number(v)));
    const population = body.population ? parseInt(body.population, 10) : null;
    const data = sampling.statisticalSampleSize({
      confidence: pct(body.confidence_level, 0.95),
      tolerableRate: pct(body.tolerable_rate, 0.05),
      expectedRate: pct(body.expected_rate, 0),
      population: Number.isInteger(population) ? population : null
    });
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof RangeError) return res.status(400).json({ success: false, error: error.message });
    return failed(res, error, 'financial_audit.statistical_sampling_failed');
  }
});

// ---------------------------------------------------------------- tests

router.get('/tests', canRead, async (req, res) => {
  try {
    const data = await testing.listTests(req.user.organization_id, {
      rcmEntryId: isUuid(req.query.rcm_entry_id) ? req.query.rcm_entry_id : null,
      fiscalYear: fiscalYearParam(req.query.fiscal_year),
      status: ['planned', 'in_progress', 'completed'].includes(req.query.status) ? req.query.status : null,
      limit: Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100))
    });
    res.json({ success: true, data });
  } catch (error) {
    return failed(res, error, 'financial_audit.tests_list_failed');
  }
});

router.post('/tests', canWrite, async (req, res) => {
  try {
    const body = req.body || {};
    if (!isUuid(body.rcm_entry_id)) return res.status(400).json({ success: false, error: 'rcm_entry_id is required' });
    if (body.engagement_id && !isUuid(body.engagement_id)) return res.status(400).json({ success: false, error: 'Invalid engagement_id' });
    const test = await testing.planTest(req.user.organization_id, req.user.id, body);
    await auditService.logFromRequest(req, { eventType: 'control_test.planned', resourceType: 'control_test', resourceId: test.id, details: { test_type: test.test_type, sample_size: test.sample_size, method: test.sample_method } });
    res.status(201).json({ success: true, data: test });
  } catch (error) {
    return failed(res, error, 'financial_audit.test_create_failed');
  }
});

router.get('/tests/:id', canRead, requireUuidParam('id'), async (req, res) => {
  try {
    const test = await testing.getTest(req.user.organization_id, req.params.id);
    if (!test) return res.status(404).json({ success: false, error: 'Control test not found' });
    res.json({ success: true, data: test });
  } catch (error) {
    return failed(res, error, 'financial_audit.test_get_failed');
  }
});

router.put('/tests/:id/samples/:n', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const n = parseInt(req.params.n, 10);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ success: false, error: 'Invalid sample number' });
    const body = req.body || {};
    if (body.evidence_id && !isUuid(body.evidence_id)) return res.status(400).json({ success: false, error: 'Invalid evidence_id' });
    const sample = await testing.recordSample(req.user.organization_id, req.user.id, req.params.id, n, body);
    res.json({ success: true, data: sample });
  } catch (error) {
    return failed(res, error, 'financial_audit.sample_update_failed');
  }
});

router.post('/tests/:id/complete', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const test = await testing.completeTest(req.user.organization_id, req.params.id, req.body || {});
    await auditService.logFromRequest(req, { eventType: 'control_test.completed', resourceType: 'control_test', resourceId: test.id, details: { conclusion: test.conclusion, suggested: test.suggested_conclusion, exceptions: test.exceptions } });
    res.json({ success: true, data: test });
  } catch (error) {
    return failed(res, error, 'financial_audit.test_complete_failed');
  }
});

router.post('/tests/:id/review', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const test = await testing.reviewTest(req.user.organization_id, req.user.id, req.params.id);
    await auditService.logFromRequest(req, { eventType: 'control_test.reviewed', resourceType: 'control_test', resourceId: test.id, details: { conclusion: test.conclusion } });
    res.json({ success: true, data: test });
  } catch (error) {
    return failed(res, error, 'financial_audit.test_review_failed');
  }
});

router.post('/tests/:id/reopen', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const test = await testing.reopenTest(req.user.organization_id, req.params.id);
    await auditService.logFromRequest(req, { eventType: 'control_test.reopened', resourceType: 'control_test', resourceId: test.id, details: {} });
    res.json({ success: true, data: test });
  } catch (error) {
    return failed(res, error, 'financial_audit.test_reopen_failed');
  }
});

router.post('/tests/:id/finding', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.engagement_id && !isUuid(body.engagement_id)) return res.status(400).json({ success: false, error: 'Invalid engagement_id' });
    const finding = await testing.raiseFinding(req.user.organization_id, req.user.id, req.params.id, body);
    await auditService.logFromRequest(req, { eventType: 'audit_finding.raised_from_test', resourceType: 'audit_finding', resourceId: finding.id, details: { control_test_id: req.params.id, nfr_number: finding.nfr_number, deficiency_level: finding.deficiency_level } });
    res.status(201).json({ success: true, data: finding });
  } catch (error) {
    return failed(res, error, 'financial_audit.finding_create_failed');
  }
});

router.patch('/findings/:id/nfr', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.cap_poam_id && !isUuid(body.cap_poam_id)) return res.status(400).json({ success: false, error: 'Invalid cap_poam_id' });
    const finding = await testing.updateNfr(req.user.organization_id, req.params.id, body);
    await auditService.logFromRequest(req, { eventType: 'audit_finding.nfr_updated', resourceType: 'audit_finding', resourceId: finding.id, details: { fields: Object.keys(body) } });
    res.json({ success: true, data: finding });
  } catch (error) {
    return failed(res, error, 'financial_audit.nfr_update_failed');
  }
});

router.post('/findings/:id/cap', canWrite, requireUuidParam('id'), async (req, res) => {
  try {
    const body = req.body || {};
    if (body.owner_id && !isUuid(body.owner_id)) return res.status(400).json({ success: false, error: 'Invalid owner_id' });
    const cap = await testing.createCap(req.user.organization_id, req.user.id, req.params.id, body);
    await auditService.logFromRequest(req, { eventType: 'audit_finding.cap_created', resourceType: 'poam_item', resourceId: cap.id, details: { finding_id: req.params.id } });
    res.status(201).json({ success: true, data: cap });
  } catch (error) {
    return failed(res, error, 'financial_audit.cap_create_failed');
  }
});

// ---------------------------------------------------------------- readiness

router.get('/readiness', canRead, async (req, res) => {
  try {
    const data = await readiness.readiness(req.user.organization_id, fiscalYearParam(req.query.fiscal_year));
    res.json({ success: true, data });
  } catch (error) {
    return failed(res, error, 'financial_audit.readiness_failed');
  }
});

router.get('/readiness/export', canRead, async (req, res) => {
  try {
    const fiscalYear = fiscalYearParam(req.query.fiscal_year);
    const csv = await readiness.exportCsv(req.user.organization_id, fiscalYear);
    await auditService.logFromRequest(req, { eventType: 'rcm.exported', resourceType: 'rcm_entry', details: { fiscal_year: fiscalYear } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="risk-control-matrix${fiscalYear ? `-fy${fiscalYear}` : ''}.csv"`);
    res.send(csv);
  } catch (error) {
    return failed(res, error, 'financial_audit.export_failed');
  }
});

module.exports = router;
