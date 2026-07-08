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
const { log } = require('../utils/logger');

router.use(authenticate);

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
         COUNT(ci.id) FILTER (WHERE ci.status IN ('implemented', 'satisfied_via_crosswalk'))::int AS implemented,
         CASE WHEN COUNT(fc.id) > 0
              THEN ROUND((COUNT(ci.id) FILTER (WHERE ci.status IN ('implemented', 'satisfied_via_crosswalk'))::numeric
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
