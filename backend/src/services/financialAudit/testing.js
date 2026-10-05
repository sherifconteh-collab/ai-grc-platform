'use strict';

/**
 * Tests of design and operating effectiveness, their samples, and the NFR and
 * corrective action plan (CAP) records that follow a failed test.
 */

const crypto = require('crypto');
const pool = require('../../config/database');
const sampling = require('../samplingService');

const TEST_TYPES = ['design', 'operating_effectiveness'];
const SAMPLE_METHODS = ['frequency_table', 'statistical', 'full_population', 'judgmental', 'walkthrough'];
const SAMPLE_RESULTS = ['pending', 'pass', 'exception', 'not_applicable'];
const CONCLUSIONS = ['effective', 'effective_with_exceptions', 'ineffective'];
const DEFICIENCY_LEVELS = ['control_deficiency', 'significant_deficiency', 'material_weakness'];
const SEVERITY_FOR_DEFICIENCY = { control_deficiency: 'medium', significant_deficiency: 'high', material_weakness: 'critical' };
const MAX_SAMPLE = 500;

class TestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fraction(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? (n >= 1 ? n / 100 : n) : NaN;
}

function optionalInt(value, name, { min = 0, max = 10000000 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new TestError(400, `${name} must be a whole number between ${min} and ${max}`);
  return n;
}

async function belongsToOrg(executor, table, organizationId, id) {
  if (!id) return true;
  const { rows } = await executor.query(`SELECT 1 FROM ${table} WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
  return rows.length > 0;
}

/** Work out the sample size for a planned test from its method. */
function planSampleSize(rcm, input) {
  const method = input.sample_method || (input.test_type === 'design' ? 'walkthrough' : 'frequency_table');
  if (!SAMPLE_METHODS.includes(method)) throw new TestError(400, `sample_method must be one of: ${SAMPLE_METHODS.join(', ')}`);
  const population = optionalInt(input.population_size, 'population_size');
  const override = optionalInt(input.sample_size, 'sample_size', { min: 1, max: MAX_SAMPLE });
  const plan = { method, population, confidence: null, tolerable: null, expected: null, allowed: 0 };

  if (method === 'walkthrough') return { ...plan, size: override || 1, basis: 'Walkthrough of one instance.' };
  if (method === 'full_population') {
    if (population === null) throw new TestError(400, 'population_size is required for full-population testing');
    if (population > MAX_SAMPLE) throw new TestError(400, `Full-population tests over ${MAX_SAMPLE} items belong in transaction monitoring`);
    return { ...plan, size: population, basis: 'Every item in the population.' };
  }
  if (method === 'judgmental') {
    if (!override) throw new TestError(400, 'sample_size is required for a judgmental sample');
    return { ...plan, size: override, basis: 'Judgmental sample size set by the tester.' };
  }
  if (method === 'statistical') {
    const confidence = fraction(input.confidence_level, 0.95);
    const tolerable = fraction(input.tolerable_rate, 0.05);
    const expected = fraction(input.expected_rate, 0);
    let result;
    try {
      result = sampling.statisticalSampleSize({ confidence, tolerableRate: tolerable, expectedRate: expected, population });
    } catch (error) {
      throw new TestError(400, error.message);
    }
    if (result.sample_size > MAX_SAMPLE) throw new TestError(400, `Sample of ${result.sample_size} exceeds ${MAX_SAMPLE}; use transaction monitoring for full-population testing`);
    return { ...plan, size: result.sample_size, basis: result.basis, confidence, tolerable, expected, allowed: result.allowed_deviations };
  }
  const table = sampling.frequencySampleSize({ frequency: rcm.frequency, riskLevel: rcm.risk_level, controlType: rcm.control_type, population });
  return { ...plan, size: override || table.sample_size, basis: override ? `Tester override of the table size (${table.sample_size}).` : table.basis };
}

async function planTest(organizationId, userId, input) {
  const testType = input.test_type || 'operating_effectiveness';
  if (!TEST_TYPES.includes(testType)) throw new TestError(400, `test_type must be one of: ${TEST_TYPES.join(', ')}`);
  const fiscalYear = optionalInt(input.fiscal_year, 'fiscal_year', { min: 2000, max: 2100 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [rcm] } = await client.query('SELECT * FROM rcm_entries WHERE id = $1 AND organization_id = $2', [input.rcm_entry_id, organizationId]);
    if (!rcm) throw new TestError(404, 'Risk-control matrix entry not found');
    if (!(await belongsToOrg(client, 'audit_engagements', organizationId, input.engagement_id))) throw new TestError(400, 'Engagement not found');
    const plan = planSampleSize(rcm, { ...input, test_type: testType });
    const seed = typeof input.selection_seed === 'string' && input.selection_seed.trim()
      ? input.selection_seed.trim().slice(0, 64)
      : crypto.randomBytes(8).toString('hex');
    const { rows: [test] } = await client.query(
      `INSERT INTO control_tests
         (organization_id, rcm_entry_id, engagement_id, test_type, fiscal_year, period_start, period_end,
          population_size, sample_size, sample_method, confidence_level, tolerable_rate, expected_rate,
          selection_seed, procedures, tester_id, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, 'in_progress')
       RETURNING *`,
      [organizationId, rcm.id, input.engagement_id || null, testType, fiscalYear, input.period_start || null, input.period_end || null,
        plan.population, plan.size, plan.method, plan.confidence, plan.tolerable, plan.expected,
        seed, typeof input.procedures === 'string' ? input.procedures.slice(0, 8000) : null, userId]
    );
    const picks = plan.method === 'full_population'
      ? Array.from({ length: plan.size }, (_, i) => i + 1)
      : sampling.selectSample(plan.population, plan.size, seed);
    const numbers = Array.from({ length: plan.size }, (_, i) => i + 1);
    await client.query(
      `INSERT INTO control_test_samples (organization_id, test_id, sample_number, item_reference)
       SELECT $1, $2, n, ref FROM UNNEST($3::int[], $4::text[]) AS s(n, ref)`,
      [organizationId, test.id, numbers, numbers.map((n) => (picks[n - 1] ? `Population item ${picks[n - 1]}` : null))]
    );
    await client.query('COMMIT');
    return { ...test, sample_basis: plan.basis, allowed_deviations: plan.allowed };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '22007' || error.code === '22008' || error.code === '23514') throw new TestError(400, 'Invalid test period or values');
    throw error;
  } finally {
    client.release();
  }
}

async function getTest(organizationId, testId) {
  const { rows: [test] } = await pool.query(
    `SELECT t.*, r.control_ref, r.control_description, r.process, r.frequency, r.control_type, r.risk_level, r.key_control,
            TRIM(COALESCE(ut.first_name, '') || ' ' || COALESCE(ut.last_name, '')) AS tester_name,
            TRIM(COALESCE(ur.first_name, '') || ' ' || COALESCE(ur.last_name, '')) AS reviewer_name
       FROM control_tests t
       JOIN rcm_entries r ON r.id = t.rcm_entry_id AND r.organization_id = t.organization_id
       LEFT JOIN users ut ON ut.id = t.tester_id
       LEFT JOIN users ur ON ur.id = t.reviewer_id
      WHERE t.id = $1 AND t.organization_id = $2`,
    [testId, organizationId]
  );
  if (!test) return null;
  const { rows: samples } = await pool.query(
    'SELECT * FROM control_test_samples WHERE test_id = $1 AND organization_id = $2 ORDER BY sample_number',
    [testId, organizationId]
  );
  return { ...test, samples, exceptions: samples.filter((s) => s.result === 'exception').length };
}

async function listTests(organizationId, { rcmEntryId, fiscalYear, status, limit = 100 }) {
  const where = ['t.organization_id = $1'];
  const params = [organizationId];
  if (rcmEntryId) { params.push(rcmEntryId); where.push(`t.rcm_entry_id = $${params.length}`); }
  if (fiscalYear) { params.push(fiscalYear); where.push(`t.fiscal_year = $${params.length}`); }
  if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT t.*, r.control_ref, r.process,
            (SELECT COUNT(*)::int FROM control_test_samples s WHERE s.test_id = t.id AND s.result = 'exception') AS exceptions,
            (SELECT COUNT(*)::int FROM control_test_samples s WHERE s.test_id = t.id AND s.result = 'pending') AS pending
       FROM control_tests t JOIN rcm_entries r ON r.id = t.rcm_entry_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function recordSample(organizationId, userId, testId, sampleNumber, input) {
  const test = await getTest(organizationId, testId);
  if (!test) throw new TestError(404, 'Control test not found');
  if (test.status === 'completed') throw new TestError(409, 'The test is completed; reopen it to change samples');
  if (input.result !== undefined && !SAMPLE_RESULTS.includes(input.result)) throw new TestError(400, `result must be one of: ${SAMPLE_RESULTS.join(', ')}`);
  if (input.result === 'exception' && !String(input.exception_description || '').trim()) throw new TestError(400, 'Describe the exception');
  if (!(await belongsToOrg(pool, 'evidence', organizationId, input.evidence_id))) throw new TestError(400, 'Evidence not found');
  const { rows: [sample] } = await pool.query(
    `UPDATE control_test_samples
        SET result = COALESCE($4, result),
            exception_description = CASE WHEN COALESCE($4, result) = 'exception' THEN COALESCE($5, exception_description) ELSE NULL END,
            item_reference = COALESCE($6, item_reference),
            evidence_id = COALESCE($7, evidence_id),
            tested_by = $8, tested_at = NOW()
      WHERE test_id = $1 AND organization_id = $2 AND sample_number = $3
      RETURNING *`,
    [testId, organizationId, sampleNumber, input.result || null,
      input.exception_description ? String(input.exception_description).slice(0, 4000) : null,
      input.item_reference ? String(input.item_reference).slice(0, 200) : null, input.evidence_id || null, userId]
  );
  if (!sample) throw new TestError(404, 'Sample not found');
  return sample;
}

function allowedDeviations(test) {
  if (test.sample_method !== 'statistical') return 0;
  try {
    return sampling.statisticalSampleSize({
      confidence: Number(test.confidence_level), tolerableRate: Number(test.tolerable_rate), expectedRate: Number(test.expected_rate || 0)
    }).allowed_deviations;
  } catch {
    return 0;
  }
}

async function completeTest(organizationId, testId, input) {
  const test = await getTest(organizationId, testId);
  if (!test) throw new TestError(404, 'Control test not found');
  if (test.status === 'completed') throw new TestError(409, 'The test is already completed');
  const pending = test.samples.filter((s) => s.result === 'pending').length;
  if (pending) throw new TestError(409, `${pending} sample(s) have no result yet`);
  const suggested = sampling.suggestConclusion({ exceptions: test.exceptions, sampleMethod: test.sample_method, allowedDeviations: allowedDeviations(test) });
  const conclusion = input.conclusion || suggested;
  if (!CONCLUSIONS.includes(conclusion)) throw new TestError(400, `conclusion must be one of: ${CONCLUSIONS.join(', ')}`);
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 8000) : '';
  if (CONCLUSIONS.indexOf(conclusion) < CONCLUSIONS.indexOf(suggested) && !notes) {
    throw new TestError(400, `The samples support "${suggested}"; explain in notes why the conclusion is "${conclusion}"`);
  }
  const { rows: [updated] } = await pool.query(
    `UPDATE control_tests SET status = 'completed', conclusion = $3, notes = COALESCE(NULLIF($4, ''), notes),
            completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [testId, organizationId, conclusion, notes]
  );
  return { ...updated, suggested_conclusion: suggested, exceptions: test.exceptions };
}

async function reviewTest(organizationId, reviewerId, testId) {
  const test = await getTest(organizationId, testId);
  if (!test) throw new TestError(404, 'Control test not found');
  if (test.status !== 'completed') throw new TestError(409, 'Only completed tests can be reviewed');
  if (test.tester_id === reviewerId) throw new TestError(409, 'The reviewer must be someone other than the tester');
  const { rows: [updated] } = await pool.query(
    `UPDATE control_tests SET reviewer_id = $3, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [testId, organizationId, reviewerId]
  );
  return updated;
}

async function reopenTest(organizationId, testId) {
  const { rows: [updated] } = await pool.query(
    `UPDATE control_tests SET status = 'in_progress', conclusion = NULL, completed_at = NULL,
            reviewer_id = NULL, reviewed_at = NULL, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'completed' RETURNING *`,
    [testId, organizationId]
  );
  if (!updated) throw new TestError(409, 'Only completed tests can be reopened');
  return updated;
}

function nfrFields(input) {
  const out = {};
  if (input.nfr_number !== undefined) out.nfr_number = input.nfr_number ? String(input.nfr_number).trim().slice(0, 60) : null;
  if (input.fiscal_year !== undefined) out.fiscal_year = optionalInt(input.fiscal_year, 'fiscal_year', { min: 2000, max: 2100 });
  if (input.auditor_organization !== undefined) out.auditor_organization = input.auditor_organization ? String(input.auditor_organization).trim().slice(0, 200) : null;
  if (input.deficiency_level !== undefined) {
    if (input.deficiency_level && !DEFICIENCY_LEVELS.includes(input.deficiency_level)) {
      throw new TestError(400, `deficiency_level must be one of: ${DEFICIENCY_LEVELS.join(', ')}`);
    }
    out.deficiency_level = input.deficiency_level || null;
  }
  return out;
}

async function raiseFinding(organizationId, userId, testId, input) {
  const test = await getTest(organizationId, testId);
  if (!test) throw new TestError(404, 'Control test not found');
  if (test.finding_id) throw new TestError(409, 'A finding already exists for this test');
  if (!['ineffective', 'effective_with_exceptions'].includes(test.conclusion)) {
    throw new TestError(409, 'Raise findings from completed tests with exceptions');
  }
  const engagementId = input.engagement_id || test.engagement_id;
  if (!engagementId || !(await belongsToOrg(pool, 'audit_engagements', organizationId, engagementId))) {
    throw new TestError(400, 'An engagement in this organization is required to record a finding');
  }
  const nfr = nfrFields(input);
  const level = nfr.deficiency_level || 'control_deficiency';
  const exceptions = test.samples.filter((s) => s.result === 'exception');
  const description = [
    `Test of ${test.test_type === 'design' ? 'design' : 'operating effectiveness'} for ${test.control_ref}: ${exceptions.length} exception(s) in ${test.samples.length} sample(s).`,
    ...exceptions.map((s) => `- Sample ${s.sample_number}${s.item_reference ? ` (${s.item_reference})` : ''}: ${s.exception_description}`)
  ].join('\n');
  const { rows: [rcm] } = await pool.query('SELECT framework_control_id FROM rcm_entries WHERE id = $1 AND organization_id = $2', [test.rcm_entry_id, organizationId]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [finding] } = await client.query(
      `INSERT INTO audit_findings
         (organization_id, engagement_id, control_id, title, description, severity, status, recommendation,
          created_by, nfr_number, fiscal_year, deficiency_level, auditor_organization, source_control_test_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [organizationId, engagementId, rcm ? rcm.framework_control_id : null,
        String(input.title || `${test.control_ref} not operating effectively`).slice(0, 255), description,
        SEVERITY_FOR_DEFICIENCY[level], input.recommendation ? String(input.recommendation).slice(0, 8000) : null, userId,
        nfr.nfr_number || null, nfr.fiscal_year || test.fiscal_year || null, level, nfr.auditor_organization || null, test.id]
    );
    await client.query('UPDATE control_tests SET finding_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3', [finding.id, test.id, organizationId]);
    await client.query('COMMIT');
    return finding;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new TestError(409, 'That NFR number is already used');
    throw error;
  } finally {
    client.release();
  }
}

async function updateNfr(organizationId, findingId, input) {
  const fields = nfrFields(input);
  if (input.cap_poam_id !== undefined) {
    if (input.cap_poam_id && !(await belongsToOrg(pool, 'poam_items', organizationId, input.cap_poam_id))) throw new TestError(400, 'POA&M item not found');
    fields.cap_poam_id = input.cap_poam_id || null;
  }
  const keys = Object.keys(fields);
  if (!keys.length) throw new TestError(400, 'No NFR fields supplied');
  try {
    const { rows: [finding] } = await pool.query(
      `UPDATE audit_findings SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(', ')}, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [findingId, organizationId, ...keys.map((k) => fields[k])]
    );
    if (!finding) throw new TestError(404, 'Finding not found');
    return finding;
  } catch (error) {
    if (error.code === '23505') throw new TestError(409, 'That NFR number is already used');
    throw error;
  }
}

/** Open a POA&M item as the corrective action plan for a finding. */
async function createCap(organizationId, userId, findingId, input) {
  if (!(await belongsToOrg(pool, 'users', organizationId, input.owner_id))) throw new TestError(400, 'Owner not found');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [finding] } = await client.query(
      'SELECT * FROM audit_findings WHERE id = $1 AND organization_id = $2 FOR UPDATE', [findingId, organizationId]
    );
    if (!finding) throw new TestError(404, 'Finding not found');
    if (finding.cap_poam_id) throw new TestError(409, 'This finding already has a corrective action plan');
    const { rows: [cap] } = await client.query(
      `INSERT INTO poam_items (organization_id, title, description, source_type, source_id, control_id, owner_id,
                               status, priority, remediation_plan, due_date, created_by)
       VALUES ($1, $2, $3, 'audit_finding', $4, $5, $6, 'open', $7, $8, $9, $10) RETURNING *`,
      [organizationId, `CAP: ${finding.nfr_number ? `${finding.nfr_number} ` : ''}${finding.title}`.slice(0, 255),
        finding.description, finding.id, finding.control_id, input.owner_id || finding.owner_user_id || null,
        finding.severity, input.remediation_plan ? String(input.remediation_plan).slice(0, 8000) : finding.recommendation,
        input.due_date || finding.due_date || null, userId]
    );
    await client.query('UPDATE audit_findings SET cap_poam_id = $1, status = $2, updated_at = NOW() WHERE id = $3 AND organization_id = $4',
      [cap.id, finding.status === 'open' ? 'remediating' : finding.status, finding.id, organizationId]);
    await client.query('COMMIT');
    return cap;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '22007' || error.code === '22008') throw new TestError(400, 'Invalid due date');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  TestError,
  TEST_TYPES,
  SAMPLE_METHODS,
  SAMPLE_RESULTS,
  CONCLUSIONS,
  DEFICIENCY_LEVELS,
  planSampleSize,
  planTest,
  getTest,
  listTests,
  recordSample,
  completeTest,
  reviewTest,
  reopenTest,
  raiseFinding,
  updateNfr,
  createCap
};
