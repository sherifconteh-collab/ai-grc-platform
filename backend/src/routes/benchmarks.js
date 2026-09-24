// @tier: community
/**
 * Anonymized industry benchmarking.
 *
 * Compares the caller's per-framework compliance percentage against
 * aggregates computed over every participating organization's latest
 * compliance snapshot. Organizations can opt out via the dynamic-config
 * toggle benchmarking/opt_out.
 *
 * SECURITY: this is an intentional cross-organization query, and the only
 * one in this module. The aggregate SELECT never projects organization ids,
 * names, or any per-org values for other tenants; results are suppressed
 * below the k-anonymity threshold so no single peer is identifiable.
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
  label: 'benchmarks',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
}));

const K_ANONYMITY_MIN = 5;

// ===========================================================================
// GET /benchmarks/frameworks — caller vs anonymized peer aggregates
// ===========================================================================
router.get('/frameworks', async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Latest snapshot per (org, framework), for frameworks the caller tracks.
    // Opted-out orgs are excluded from the peer pool entirely.
    const result = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (cs.organization_id, cs.framework_id)
                cs.organization_id, cs.framework_id, cs.compliance_pct
         FROM compliance_snapshots cs
         WHERE cs.framework_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM dynamic_config_entries dce
             WHERE dce.organization_id = cs.organization_id
               AND dce.config_domain = 'benchmarking'
               AND dce.config_key = 'opt_out'
               AND dce.is_active = true
               AND (dce.config_value ->> 'value')::boolean = true
           )
         ORDER BY cs.organization_id, cs.framework_id, cs.snapshot_date DESC
       ),
       own AS (
         SELECT framework_id, compliance_pct
         FROM latest WHERE organization_id = $1
       )
       SELECT f.id AS framework_id,
              f.name AS framework_name,
              own.compliance_pct AS own_pct,
              COUNT(latest.organization_id)::int AS n,
              ROUND(AVG(latest.compliance_pct), 2) AS avg_pct,
              ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latest.compliance_pct)::numeric, 2) AS median_pct,
              ROUND(100.0 * COUNT(*) FILTER (WHERE latest.compliance_pct <= own.compliance_pct) / COUNT(*), 0) AS percentile_rank
       FROM own
       JOIN latest ON latest.framework_id = own.framework_id
       JOIN frameworks f ON f.id = own.framework_id
       GROUP BY f.id, f.name, own.compliance_pct
       ORDER BY f.name ASC`,
      [orgId]
    );

    const data = result.rows.map(row => {
      if (row.n < K_ANONYMITY_MIN) {
        return {
          framework_id: row.framework_id,
          framework_name: row.framework_name,
          own_pct: Number(row.own_pct),
          insufficient_data: true,
          minimum_participants: K_ANONYMITY_MIN
        };
      }
      return {
        framework_id: row.framework_id,
        framework_name: row.framework_name,
        own_pct: Number(row.own_pct),
        participants: row.n,
        average_pct: Number(row.avg_pct),
        median_pct: Number(row.median_pct),
        percentile_rank: Number(row.percentile_rank)
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    log('error', 'benchmarks.frameworks.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load benchmarks' });
  }
});

module.exports = router;
