// @tier: govcloud
/**
 * International AI Laws — dedicated API routes (Gov Cloud & Advisory tier)
 *
 * Provides structured, searchable access to international AI governance, privacy,
 * and policy controls under the `international_ai_governance` framework covering
 * EU, UK, Canada proposal tracking, Brazil, Singapore, Japan, South Korea,
 * China, Australia, and India.
 *
 * This pack is available to Gov Cloud & Advisory organizations that need
 * cross-border AI regulatory tracking alongside broader regulated-environment
 * support.
 *
 * Base path: /api/v1/international-ai-laws
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const intlAiLawsRateLimiter = createRateLimiter({
  label: 'international-ai-laws',
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

// All endpoints require authentication and Gov Cloud & Advisory tier
router.use(authenticate);
router.use(requireTier('govcloud'));

// Jurisdiction metadata — single source of truth for UI and API consumers
const JURISDICTIONS = [
  {
    code: 'EU',    name: 'European Union',  region: 'Europe',
    law: 'EU AI Act (Regulation 2024/1689)',
    authority: 'European AI Office / National Market Surveillance Authorities',
    effective: '2024-08-01', fully_applicable: '2027-08-02', status: 'enacted',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689'
  },
  {
    code: 'UK',    name: 'United Kingdom',  region: 'Europe',
    law: 'UK Pro-Innovation AI Regulatory Framework (DSIT)',
    authority: 'DSIT / sector regulators (ICO, FCA, CMA, Ofcom)',
    effective: '2023-03-29', fully_applicable: '2023-03-29', status: 'guidance',
    url: 'https://www.gov.uk/government/publications/ai-regulation-a-pro-innovation-approach'
  },
  {
    code: 'CA',    name: 'Canada',          region: 'North America',
    law: 'Artificial Intelligence and Data Act proposal (AIDA / Bill C-27)',
    authority: 'Innovation, Science and Economic Development Canada (ISED)',
    effective: null, fully_applicable: null, status: 'proposal_tracking',
    url: 'https://www.parl.ca/legisinfo/en/bill/44-1/c-27'
  },
  {
    code: 'BR',    name: 'Brazil',          region: 'South America',
    law: 'LGPD AI Provisions (Art. 20) + AI Bill PL 2338/2023',
    authority: 'ANPD (National Data Protection Authority)',
    effective: '2020-09-18', fully_applicable: null, status: 'mixed',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13853.htm'
  },
  {
    code: 'SG',    name: 'Singapore',       region: 'Asia-Pacific',
    law: 'PDPA + AI Governance Framework 2.0 (PDPC/IMDA)',
    authority: 'PDPC (Personal Data Protection Commission) / IMDA',
    effective: '2022-02-01', fully_applicable: '2022-02-01', status: 'mixed',
    url: 'https://www.pdpc.gov.sg/Help-and-Resources/2020/01/Model-AI-Governance-Framework'
  },
  {
    code: 'JP',    name: 'Japan',           region: 'Asia-Pacific',
    law: 'APPI (Act No. 57/2003 amended) + AI Strategy 2022 / MIC-METI AI Principles',
    authority: 'Personal Information Protection Commission (PPC) / METI / MIC',
    effective: '2022-04-01', fully_applicable: '2024-06-01', status: 'mixed',
    url: 'https://www.ppc.go.jp/en/legal/'
  },
  {
    code: 'KR',    name: 'South Korea',     region: 'Asia-Pacific',
    law: 'AI Basic Act (Act No. 20469)',
    authority: 'Korea Communications Commission (KCC) / MSIT',
    effective: '2024-01-26', fully_applicable: '2026-01-22', status: 'enacted',
    url: 'https://www.law.go.kr/lsInfoP.do?lsiSeq=259597'
  },
  {
    code: 'CN',    name: 'China',           region: 'Asia-Pacific',
    law: 'CAC Generative AI Measures (2023) + Algorithm Recommendation Regulation (2022) + Deep Synthesis Regulation (2022)',
    authority: 'Cyberspace Administration of China (CAC)',
    effective: '2022-03-01', fully_applicable: '2023-08-15', status: 'enacted',
    url: 'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm'
  },
  {
    code: 'AU',    name: 'Australia',       region: 'Asia-Pacific',
    law: 'Privacy Act 1988 (APPs) + National AI Ethics Framework (DISR 2019)',
    authority: 'OAIC (Office of the Australian Information Commissioner) / DISR',
    effective: '2019-11-07', fully_applicable: '2019-11-07', status: 'mixed',
    url: 'https://www.industry.gov.au/publications/australias-artificial-intelligence-ethics-framework'
  },
  {
    code: 'IN',    name: 'India',           region: 'Asia-Pacific',
    law: 'Digital Personal Data Protection (DPDP) Act 2023',
    authority: 'Data Protection Board of India / MeitY',
    effective: '2023-08-11', fully_applicable: null, status: 'phased',
    url: 'https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf'
  },
  {
    code: 'MULTI', name: 'Multi-Jurisdiction', region: 'Global',
    law: 'Cross-cutting controls applicable across all covered jurisdictions and policy packs',
    authority: 'Multiple',
    effective: '2024-01-01', fully_applicable: '2024-01-01', status: 'baseline',
    url: null
  },
];

// Control-ID prefix → jurisdiction code mapping
const CONTROL_PREFIX_MAP = {
  'EU-AIA':    'EU',
  'UK-AI':     'UK',
  'CA-AIDA':   'CA',
  'BR-AI':     'BR',
  'SG-AI':     'SG',
  'JP-AI':     'JP',
  'KR-AI':     'KR',
  'CN-AI':     'CN',
  'AU-AI':     'AU',
  'IN-AI':     'IN',
  'INTL-CORE': 'MULTI',
};

/**
 * Derive jurisdiction code from a control_id string.
 * Returns 'UNKNOWN' for unrecognized prefixes (logged for data-quality monitoring).
 */
function jurisdictionFromControlId(controlId) {
  for (const [prefix, code] of Object.entries(CONTROL_PREFIX_MAP)) {
    if (controlId.startsWith(prefix)) return code;
  }
  console.warn(`[international-ai-laws] Unrecognized control ID prefix: ${controlId}`);
  return 'UNKNOWN';
}

// ── GET /api/v1/international-ai-laws/jurisdictions ───────────────────────────
// List all supported international jurisdictions with law metadata
router.get('/jurisdictions', intlAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    res.json({ success: true, data: JURISDICTIONS, count: JURISDICTIONS.length });
  } catch (error) {
    console.error('International AI laws jurisdictions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch jurisdictions' });
  }
});

// ── GET /api/v1/international-ai-laws/controls ───────────────────────────────
// List all international AI law controls, with optional filters
router.get('/controls', intlAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { jurisdiction, control_type, priority, search, region } = req.query;

    const result = await pool.query(
      `SELECT fc.control_id, fc.title, fc.description, fc.priority, fc.control_type,
              fc.created_at
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       WHERE f.code = 'international_ai_governance'
       ORDER BY fc.control_id ASC`
    );

    let controls = result.rows.map((row) => {
      const jCode = jurisdictionFromControlId(row.control_id);
      const jMeta = JURISDICTIONS.find((j) => j.code === jCode) || null;
      return {
        ...row,
        jurisdiction: jCode,
        region: jMeta ? jMeta.region : null,
        law: jMeta ? jMeta.law : null,
      };
    });

    // Apply optional filters
    if (jurisdiction) {
      const j = jurisdiction.toUpperCase();
      controls = controls.filter((c) => c.jurisdiction === j);
    }
    if (region) {
      controls = controls.filter((c) => c.region === region);
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
    console.error('International AI laws controls error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch international AI law controls' });
  }
});

// ── GET /api/v1/international-ai-laws/controls/:controlId ────────────────────
// Fetch a single control with org implementation status and crosswalk mappings
router.get('/controls/:controlId', intlAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
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
       WHERE f.code = 'international_ai_governance'
         AND UPPER(fc.control_id) = UPPER($2)
       LIMIT 1`,
      [orgId, controlId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Control not found' });
    }

    const jCode = jurisdictionFromControlId(result.rows[0].control_id);
    const jMeta = JURISDICTIONS.find((j) => j.code === jCode) || null;

    const control = {
      ...result.rows[0],
      jurisdiction: jCode,
      jurisdiction_meta: jMeta,
    };

    // Fetch crosswalk mappings (NIST AI RMF, EU AI Act)
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
    console.error('International AI laws control detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch control detail' });
  }
});

// ── GET /api/v1/international-ai-laws/summary ────────────────────────────────
// Returns per-jurisdiction compliance progress for the authenticated org
router.get('/summary', intlAiLawsRateLimiter, requirePermission('frameworks.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const result = await pool.query(
      `SELECT fc.control_id,
              COALESCE(ci.status, 'not_started') AS status
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       LEFT JOIN control_implementations ci
              ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE f.code = 'international_ai_governance'`,
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
        jurisdictions_covered: JURISDICTIONS.filter((j) => j.code !== 'MULTI').length,
        jurisdictions,
      },
    });
  } catch (error) {
    console.error('International AI laws summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch international AI laws summary' });
  }
});

module.exports = router;
