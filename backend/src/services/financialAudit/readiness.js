'use strict';

/**
 * Audit readiness: key-control test coverage by process and assertion, the
 * deficiency picture, and the matrix export that supports an A-123 Statement
 * of Assurance or a SOX 404 management assessment.
 */

const pool = require('../../config/database');
const { PROCESSES, ASSERTIONS } = require('./rcm');
const { toCsvDocument } = require('../../utils/csv');

// Assertions expected for transaction-processing cycles. IT general and
// entity-level controls support every assertion indirectly, so they are not
// counted toward assertion gaps.
const CORE_ASSERTIONS = ['existence_occurrence', 'completeness', 'rights_obligations', 'valuation_allocation', 'presentation_disclosure'];
const INDIRECT_PROCESSES = new Set(['it_general', 'entity_level']);

async function loadMatrix(organizationId, fiscalYear) {
  const { rows } = await pool.query(
    `SELECT r.id, r.control_ref, r.process, r.sub_process, r.assessable_unit, r.risk_ref, r.risk_statement,
            r.control_description, r.assertions, r.frequency, r.control_type, r.control_nature, r.key_control,
            r.fraud_risk, r.risk_level, r.system_name, fc.control_id AS framework_control, f.code AS framework_code,
            d.conclusion AS design_conclusion, o.conclusion AS oe_conclusion, o.sample_size AS oe_sample_size,
            o.exceptions AS oe_exceptions, o.fiscal_year AS oe_fiscal_year, o.reviewed_at AS oe_reviewed_at,
            fnd.nfr_number, fnd.deficiency_level
       FROM rcm_entries r
       LEFT JOIN framework_controls fc ON fc.id = r.framework_control_id
       LEFT JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN LATERAL (
         SELECT t.conclusion FROM control_tests t
          WHERE t.rcm_entry_id = r.id AND t.organization_id = r.organization_id AND t.status = 'completed'
            AND t.test_type = 'design' AND ($2::int IS NULL OR t.fiscal_year = $2)
          ORDER BY t.completed_at DESC LIMIT 1
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT t.conclusion, t.sample_size, t.fiscal_year, t.reviewed_at, t.finding_id,
                (SELECT COUNT(*)::int FROM control_test_samples s WHERE s.test_id = t.id AND s.result = 'exception') AS exceptions
           FROM control_tests t
          WHERE t.rcm_entry_id = r.id AND t.organization_id = r.organization_id AND t.status = 'completed'
            AND t.test_type = 'operating_effectiveness' AND ($2::int IS NULL OR t.fiscal_year = $2)
          ORDER BY t.completed_at DESC LIMIT 1
       ) o ON TRUE
       LEFT JOIN audit_findings fnd ON fnd.id = o.finding_id AND fnd.organization_id = r.organization_id
      WHERE r.organization_id = $1 AND r.status = 'active'
      ORDER BY r.process, r.control_ref`,
    [organizationId, fiscalYear || null]
  );
  return rows;
}

function isEffective(conclusion) {
  return conclusion === 'effective' || conclusion === 'effective_with_exceptions';
}

function summarizeProcesses(matrix) {
  return PROCESSES.map((process) => {
    const keys = matrix.filter((r) => r.process === process && r.key_control);
    if (!keys.length) return null;
    return {
      process,
      key_controls: keys.length,
      design_effective: keys.filter((r) => isEffective(r.design_conclusion)).length,
      tested: keys.filter((r) => r.oe_conclusion).length,
      effective: keys.filter((r) => isEffective(r.oe_conclusion)).length,
      ineffective: keys.filter((r) => r.oe_conclusion === 'ineffective').length,
      not_tested: keys.filter((r) => !r.oe_conclusion).length
    };
  }).filter(Boolean);
}

function assertionCoverage(matrix) {
  const coverage = {};
  const gaps = [];
  for (const process of PROCESSES) {
    const keys = matrix.filter((r) => r.process === process && r.key_control);
    if (!keys.length) continue;
    coverage[process] = Object.fromEntries(ASSERTIONS.map((a) => [a, keys.filter((r) => (r.assertions || []).includes(a)).length]));
    if (INDIRECT_PROCESSES.has(process)) continue;
    CORE_ASSERTIONS.filter((a) => coverage[process][a] === 0).forEach((assertion) => gaps.push({ process, assertion }));
  }
  return { coverage, gaps };
}

async function deficiencySummary(organizationId, fiscalYear) {
  const { rows } = await pool.query(
    `SELECT f.deficiency_level, COUNT(*)::int AS findings,
            COUNT(*) FILTER (WHERE f.status NOT IN ('verified', 'closed'))::int AS open,
            COUNT(*) FILTER (WHERE f.cap_poam_id IS NULL AND f.status NOT IN ('verified', 'closed'))::int AS without_cap,
            COUNT(*) FILTER (WHERE p.due_date < CURRENT_DATE AND p.status NOT IN ('closed', 'risk_accepted'))::int AS caps_overdue
       FROM audit_findings f
       LEFT JOIN poam_items p ON p.id = f.cap_poam_id AND p.organization_id = f.organization_id
      WHERE f.organization_id = $1 AND f.deficiency_level IS NOT NULL
        AND ($2::int IS NULL OR f.fiscal_year = $2)
      GROUP BY f.deficiency_level`,
    [organizationId, fiscalYear || null]
  );
  const byLevel = Object.fromEntries(rows.map((r) => [r.deficiency_level, r]));
  const pick = (level) => byLevel[level] || { findings: 0, open: 0, without_cap: 0, caps_overdue: 0 };
  return {
    material_weaknesses: pick('material_weakness'),
    significant_deficiencies: pick('significant_deficiency'),
    control_deficiencies: pick('control_deficiency')
  };
}

async function readiness(organizationId, fiscalYear) {
  const matrix = await loadMatrix(organizationId, fiscalYear);
  const keys = matrix.filter((r) => r.key_control);
  const processes = summarizeProcesses(matrix);
  const { coverage, gaps } = assertionCoverage(matrix);
  const deficiencies = await deficiencySummary(organizationId, fiscalYear);
  const effective = keys.filter((r) => isEffective(r.oe_conclusion)).length;
  const blockers = [];
  if (!keys.length) blockers.push('No key controls are in the risk-control matrix yet.');
  if (keys.some((r) => !r.oe_conclusion)) blockers.push(`${keys.filter((r) => !r.oe_conclusion).length} key control(s) have no completed operating effectiveness test.`);
  if (gaps.length) blockers.push(`${gaps.length} process and assertion combination(s) have no key control.`);
  if (deficiencies.material_weaknesses.open) blockers.push(`${deficiencies.material_weaknesses.open} open material weakness(es) must be reported in the Statement of Assurance.`);
  const withoutCap = Object.values(deficiencies).reduce((n, d) => n + d.without_cap, 0);
  if (withoutCap) blockers.push(`${withoutCap} open finding(s) have no corrective action plan.`);
  return {
    fiscal_year: fiscalYear || null,
    totals: {
      controls: matrix.length,
      key_controls: keys.length,
      tested: keys.filter((r) => r.oe_conclusion).length,
      effective,
      ineffective: keys.filter((r) => r.oe_conclusion === 'ineffective').length,
      readiness_percent: keys.length ? Math.round((effective / keys.length) * 100) : 0
    },
    processes,
    assertion_coverage: coverage,
    assertion_gaps: gaps,
    deficiencies,
    blockers,
    assurance: deficiencies.material_weaknesses.open ? 'qualified' : (blockers.length ? 'not_ready' : 'unmodified')
  };
}

const EXPORT_HEADER = ['control_ref', 'process', 'sub_process', 'assessable_unit', 'risk_ref', 'risk_statement', 'control_description', 'assertions', 'frequency', 'control_type', 'control_nature', 'key_control', 'fraud_risk', 'risk_level', 'system_name', 'framework_code', 'framework_control', 'design_conclusion', 'oe_conclusion', 'oe_sample_size', 'oe_exceptions', 'oe_reviewed_at', 'nfr_number', 'deficiency_level'];

async function exportCsv(organizationId, fiscalYear) {
  const matrix = await loadMatrix(organizationId, fiscalYear);
  return toCsvDocument(EXPORT_HEADER, matrix.map((r) => ({
    ...r,
    assertions: (r.assertions || []).join(';'),
    key_control: r.key_control ? 'yes' : 'no',
    fraud_risk: r.fraud_risk ? 'yes' : 'no',
    oe_reviewed_at: r.oe_reviewed_at ? new Date(r.oe_reviewed_at).toISOString() : ''
  })));
}

module.exports = { readiness, exportCsv, assertionCoverage, summarizeProcesses, CORE_ASSERTIONS };
