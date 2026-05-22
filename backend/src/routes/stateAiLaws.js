// @tier: govcloud
/**
 * State AI Laws — dedicated API routes (Gov Cloud & Advisory tier)
 *
 * Provides structured, searchable access to all US state AI governance law
 * controls that live under the `state_ai_governance` framework.
 *
 * Base path: /api/v1/state-ai-laws
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const stateAiLawsRateLimiter = createRateLimiter({
  label: 'state-ai-laws',
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

// All endpoints require authentication and govcloud tier
router.use(authenticate);
router.use(requireTier('govcloud'));

// Jurisdiction metadata — single source of truth for UI and API consumers
const JURISDICTIONS = [
  { code: 'CO',  name: 'Colorado',        law: 'SB 205 (Colorado AI Act)',                   effective: '2026-02-01', status: 'enacted' },
  { code: 'IL',  name: 'Illinois',         law: 'AI Video Interview Act / HB 3773',            effective: '2019-08-09', status: 'enacted' },
  { code: 'NYC', name: 'New York City',    law: 'Local Law 144 (AEDT)',                        effective: '2023-07-05', status: 'enacted' },
  { code: 'CA',  name: 'California',       law: 'SB 942 / AB 2013 / AB 2885 / AB 1008',       effective: '2024-01-01', status: 'enacted' },
  { code: 'TX',  name: 'Texas',            law: 'Texas Responsible AI Governance Act (TRAIGA)',effective: '2025-09-01', status: 'enacted' },
  { code: 'VA',  name: 'Virginia',         law: 'HB 2048 (Proposed AI Impact Assessment bill)', effective: '2026-07-01 (if enacted)', status: 'proposed' },
  { code: 'CT',  name: 'Connecticut',      law: 'SB 2 (Proposed Connecticut AI Act)',          effective: '2026-01-01 (if enacted)', status: 'proposed' },
  { code: 'TN',  name: 'Tennessee',        law: 'ELVIS Act',                                   effective: '2024-07-01', status: 'enacted' },
  { code: 'UT',  name: 'Utah',             law: 'SB 149 (Utah AI Policy Act)',                 effective: '2024-05-01', status: 'enacted' },
  { code: 'WA',  name: 'Washington',       law: 'SB 5838 / HB 1951 (Proposed automated decision systems rules)', effective: 'Tracked 2025 legislative session', status: 'proposed' },
  { code: 'MD',  name: 'Maryland',         law: 'HB 1281 (Proposed automated decision tools bill)', effective: '2025-10-01 (if enacted)', status: 'proposed' },
  { code: 'NY',  name: 'New York State',   law: 'Tracked AI transparency proposals',           effective: 'Tracked 2025+ legislative cycle', status: 'tracked' },
  { code: 'MULTI', name: 'Multi-State Cross-Cutting', law: 'SAI-CORE — applies across all 12 jurisdictions', effective: '2025-01-01', status: 'enacted' },
];

// Control-ID prefix → jurisdiction code mapping for quick lookup
const CONTROL_PREFIX_MAP = {
  'CO-AI':    'CO',
  'IL-AI':    'IL',
  'NYC-AI':   'NYC',
  'CA-AI':    'CA',
  'TX-AI':    'TX',
  'VA-AI':    'VA',
  'CT-AI':    'CT',
  'TN-AI':    'TN',
  'UT-AI':    'UT',
  'WA-AI':    'WA',
  'MD-AI':    'MD',
  'NY-AI':    'NY',
  'SAI-CORE': 'MULTI',
};

/**
 * Derive jurisdiction code from a control_id string.
 * Examples: 'CO-AI-1' → 'CO', 'SAI-CORE-3' → 'MULTI'
 * Returns 'UNKNOWN' for unrecognized prefixes (logged for data-quality monitoring).
 * SAI-CORE-* controls are known cross-cutting controls and return 'MULTI' silently.
 */
function jurisdictionFromControlId(controlId) {
  if (controlId.startsWith('SAI-CORE-')) return 'MULTI';
  for (const [prefix, code] of Object.entries(CONTROL_PREFIX_MAP)) {
    if (controlId.startsWith(prefix)) return code;
  }
  console.warn(`[state-ai-laws] Unrecognized control ID prefix: ${controlId}`);
  return 'UNKNOWN';
}

// ── GET /api/v1/state-ai-laws/jurisdictions ───────────────────────────────────
// List all supported state/local jurisdictions with law metadata
router.get('/jurisdictions', stateAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    res.json({ success: true, data: JURISDICTIONS, count: JURISDICTIONS.length });
  } catch (error) {
    console.error('State AI laws jurisdictions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch jurisdictions' });
  }
});

// ── GET /api/v1/state-ai-laws/controls ───────────────────────────────────────
// List all state AI law controls, with optional filtering by jurisdiction or type
router.get('/controls', stateAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { jurisdiction, control_type, priority, search } = req.query;

    const result = await pool.query(
      `SELECT fc.control_id, fc.title, fc.description, fc.priority, fc.control_type,
              fc.created_at
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       WHERE f.code = 'state_ai_governance'
       ORDER BY fc.control_id ASC`
    );

    let controls = result.rows.map((row) => ({
      ...row,
      jurisdiction: jurisdictionFromControlId(row.control_id),
    }));

    // Apply optional filters
    if (jurisdiction) {
      const j = jurisdiction.toUpperCase();
      controls = controls.filter((c) => c.jurisdiction === j);
    }
    if (control_type) {
      controls = controls.filter((c) => c.control_type === control_type);
    }
    if (priority) {
      controls = controls.filter((c) => c.priority === priority);
    }
    if (search) {
      const q = search.toLowerCase();
      controls = controls.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.control_id.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: controls, count: controls.length });
  } catch (error) {
    console.error('State AI laws controls error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch state AI law controls' });
  }
});

// ── GET /api/v1/state-ai-laws/controls/:controlId ────────────────────────────
// Fetch a single state AI law control with implementation status for the org
router.get('/controls/:controlId', stateAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { controlId } = req.params;
    const orgId = req.user.organization_id;

    // Validate controlId to prevent injection (alphanumeric, hyphens only)
    if (!/^[A-Z0-9-]+$/i.test(controlId)) {
      return res.status(400).json({ success: false, error: 'Invalid control ID format' });
    }

    const result = await pool.query(
      `SELECT fc.id, fc.control_id, fc.title, fc.description, fc.priority, fc.control_type,
              ci.status AS implementation_status, ci.notes AS implementation_notes,
              ci.updated_at AS implementation_updated_at
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN control_implementations ci
              ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE f.code = 'state_ai_governance'
         AND UPPER(fc.control_id) = UPPER($2)
       LIMIT 1`,
      [orgId, controlId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control not found' });
    }

    const control = {
      ...result.rows[0],
      jurisdiction: jurisdictionFromControlId(result.rows[0].control_id),
    };

    // Fetch NIST AI RMF crosswalk mappings for this control
    const mappings = await pool.query(
      `SELECT tgt.control_id AS mapped_control_id, tgt.title AS mapped_title,
              f2.name AS mapped_framework, cm.mapping_type, cm.notes AS mapping_notes
       FROM control_mappings cm
       JOIN framework_controls src ON src.id = cm.source_control_id
       JOIN framework_controls tgt ON tgt.id = cm.target_control_id
       JOIN frameworks f2 ON f2.id = tgt.framework_id
       WHERE src.id = $1`,
      [result.rows[0].id]
    );

    control.crosswalk_mappings = mappings.rows;

    res.json({ success: true, data: control });
  } catch (error) {
    console.error('State AI laws control detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch control detail' });
  }
});

// ── GET /api/v1/state-ai-laws/summary ────────────────────────────────────────
// Returns compliance summary: per-jurisdiction control counts and implementation progress
router.get('/summary', stateAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(
      `SELECT fc.control_id,
              COALESCE(ci.status, 'not_started') AS status
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN control_implementations ci
              ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE f.code = 'state_ai_governance'`,
      [orgId]
    );

    const jurisdictionStats = {};
    let totalControls = 0;
    let implementedControls = 0;

    for (const row of result.rows) {
      const jCode = jurisdictionFromControlId(row.control_id);
      if (!jurisdictionStats[jCode]) {
        jurisdictionStats[jCode] = { total: 0, implemented: 0, in_progress: 0, not_started: 0 };
      }
      jurisdictionStats[jCode].total++;
      totalControls++;

      if (row.status === 'implemented') {
        jurisdictionStats[jCode].implemented++;
        implementedControls++;
      } else if (row.status === 'in_progress') {
        jurisdictionStats[jCode].in_progress++;
      } else {
        jurisdictionStats[jCode].not_started++;
      }
    }

    const jurisdictions = JURISDICTIONS.map((j) => ({
      ...j,
      stats: jurisdictionStats[j.code] || { total: 0, implemented: 0, in_progress: 0, not_started: 0 },
    }));

    res.json({
      success: true,
      data: {
        total_controls: totalControls,
        implemented: implementedControls,
        completion_percentage: totalControls > 0 ? Math.round((implementedControls / totalControls) * 100) : 0,
        jurisdictions,
      },
    });
  } catch (error) {
    console.error('State AI laws summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch state AI laws summary' });
  }
});

module.exports = router;
