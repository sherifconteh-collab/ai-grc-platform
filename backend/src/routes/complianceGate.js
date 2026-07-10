// @tier: community
/**
 * Compliance-as-code gate – CI-friendly pass/fail endpoint.
 *
 * GET /compliance/gate?framework_id=<uuid>&min_pct=<0-100>
 *
 * Computes current compliance live (same aggregation as the snapshot job in
 * services/jobService.js) and returns 200 when every evaluated framework
 * meets the threshold, or 412 Precondition Failed otherwise so `curl --fail`
 * breaks a CI pipeline directly. See docs/COMPLIANCE_AS_CODE.md.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');
const { log } = require('../utils/logger');

// Three layers, in this specific order: (1) a cheap per-process IP-based
// limiter first, so unauthenticated requests are bounded before they reach
// authenticate's JWT/DB work (also the middleware CodeQL's static analysis
// can trace as guarding this router); (2) authenticate; (3) the org-scoped
// Redis-backed limiter, which needs req.user for its key and so must run
// after auth -- this is the real production control across instances.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
router.use(authenticate);
router.use(createRateLimiter({
  label: 'compliance-gate',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EXPORT_FORMATS = new Set(['github_actions', 'gitlab_ci', 'curl']);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

function buildExportSnippet(format, gateUrl, frameworkName) {
  const label = frameworkName ? ` — ${frameworkName}` : '';
  if (format === 'github_actions') {
    return [
      `# Compliance gate${label} — paste into a GitHub Actions job step`,
      '- name: Check compliance gate',
      '  env:',
      '    CONTROLWEAVE_TOKEN: ${{ secrets.CONTROLWEAVE_TOKEN }}',
      '  run: |',
      '    curl --fail \\',
      '      -H "Authorization: Bearer $CONTROLWEAVE_TOKEN" \\',
      `      "${gateUrl}"`,
      ''
    ].join('\n');
  }
  if (format === 'gitlab_ci') {
    return [
      `# Compliance gate${label} — paste into .gitlab-ci.yml`,
      'compliance_gate:',
      '  stage: test',
      '  script:',
      '    - >',
      '      curl --fail',
      '      -H "Authorization: Bearer $CONTROLWEAVE_TOKEN"',
      `      "${gateUrl}"`,
      ''
    ].join('\n');
  }
  return [
    `# Compliance gate${label}`,
    'curl --fail \\',
    '  -H "Authorization: Bearer $CONTROLWEAVE_TOKEN" \\',
    `  "${gateUrl}"`,
    ''
  ].join('\n');
}

// ===========================================================================
// GET /compliance/gate/export — ready-to-paste CI snippet for this org
// ===========================================================================
router.get('/gate/export', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const format = String(req.query.format || 'curl').toLowerCase();
    if (!VALID_EXPORT_FORMATS.has(format)) {
      return res.status(400).json({
        success: false,
        error: `format must be one of: ${Array.from(VALID_EXPORT_FORMATS).join(', ')}`
      });
    }

    const minPct = Number(req.query.min_pct ?? 80);
    if (!Number.isFinite(minPct) || minPct < 0 || minPct > 100) {
      return res.status(400).json({ success: false, error: 'min_pct must be a number between 0 and 100' });
    }

    const frameworkId = req.query.framework_id ? String(req.query.framework_id) : null;
    if (frameworkId && !UUID_RE.test(frameworkId)) {
      return res.status(400).json({ success: false, error: 'framework_id must be a valid UUID' });
    }

    let frameworkName = null;
    if (frameworkId) {
      const fw = await pool.query(
        `SELECT f.name
         FROM organization_frameworks of2
         JOIN frameworks f ON f.id = of2.framework_id
         WHERE of2.organization_id = $1 AND of2.framework_id = $2`,
        [orgId, frameworkId]
      );
      if (fw.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Framework not found for this organization' });
      }
      frameworkName = fw.rows[0].name;
    }

    const queryString = frameworkId
      ? `framework_id=${frameworkId}&min_pct=${minPct}`
      : `min_pct=${minPct}`;
    const gateUrl = `${BACKEND_URL}/api/v1/compliance/gate?${queryString}`;
    const snippet = buildExportSnippet(format, gateUrl, frameworkName);

    log('info', 'compliance_gate.export', { orgId, format, frameworkId, userId: req.user.id });

    res.json({
      success: true,
      data: { format, snippet, gate_url: gateUrl, framework_name: frameworkName, threshold: minPct }
    });
  } catch (error) {
    log('error', 'compliance_gate.export_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate export snippet' });
  }
});

// ===========================================================================
// GET /compliance/gate — evaluate framework compliance against a threshold
// ===========================================================================
router.get('/gate', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const minPct = Number(req.query.min_pct ?? 80);
    if (!Number.isFinite(minPct) || minPct < 0 || minPct > 100) {
      return res.status(400).json({ success: false, error: 'min_pct must be a number between 0 and 100' });
    }

    const frameworkId = req.query.framework_id ? String(req.query.framework_id) : null;
    if (frameworkId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(frameworkId)) {
      return res.status(400).json({ success: false, error: 'framework_id must be a valid UUID' });
    }
    const frameworkFilter = frameworkId ? 'AND of2.framework_id = $2' : '';
    const params = frameworkId ? [orgId, frameworkId] : [orgId];

    // Live aggregation, mirroring runComplianceSnapshot in services/jobService.js.
    const result = await pool.query(
      `SELECT
         of2.framework_id,
         f.name AS framework_name,
         COUNT(fc.id)::int AS total_controls,
         COUNT(ci.id) FILTER (WHERE ci.status IN ('implemented', 'verified', 'satisfied_via_crosswalk'))::int AS implemented,
         CASE WHEN COUNT(fc.id) > 0
              THEN ROUND((COUNT(ci.id) FILTER (WHERE ci.status IN ('implemented', 'verified', 'satisfied_via_crosswalk'))::numeric
                          / COUNT(fc.id)::numeric) * 100, 2)
              ELSE 0
         END AS compliance_pct
       FROM organization_frameworks of2
       JOIN frameworks f ON f.id = of2.framework_id
       JOIN framework_controls fc ON fc.framework_id = of2.framework_id
       LEFT JOIN control_implementations ci
         ON ci.control_id = fc.id AND ci.organization_id = of2.organization_id
       WHERE of2.organization_id = $1 ${frameworkFilter}
       GROUP BY of2.framework_id, f.name
       ORDER BY f.name ASC`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: frameworkId
          ? 'Framework not found for this organization'
          : 'No frameworks are selected for this organization'
      });
    }

    const frameworks = result.rows.map(row => ({
      framework_id: row.framework_id,
      framework_name: row.framework_name,
      total_controls: row.total_controls,
      implemented: row.implemented,
      compliance_pct: Number(row.compliance_pct),
      pass: Number(row.compliance_pct) >= minPct
    }));

    const pass = frameworks.every(fw => fw.pass);

    log('info', 'compliance_gate.evaluated', {
      orgId,
      frameworkId,
      minPct,
      pass,
      userId: req.user.id
    });

    // 412 on failure so `curl --fail` breaks CI pipelines without JSON parsing.
    res.status(pass ? 200 : 412).json({
      success: true,
      data: {
        pass,
        threshold: minPct,
        evaluated_at: new Date().toISOString(),
        frameworks
      }
    });
  } catch (error) {
    log('error', 'compliance_gate.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to evaluate compliance gate' });
  }
});

module.exports = router;
