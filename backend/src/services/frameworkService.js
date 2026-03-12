// @tier: community
const pool = require('../config/database');

/**
 * In-memory cache for framework status summaries with 5-minute TTL
 */
const frameworkStatusCache = new Map();
const FRAMEWORK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clears framework status cache for an organization
 * @param {string} organizationId
 */
function invalidateFrameworkStatusCache(organizationId) {
  const keysToDelete = [];
  for (const key of frameworkStatusCache.keys()) {
    if (key.startsWith(`${organizationId}:`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => frameworkStatusCache.delete(key));
}

/**
 * Get framework status summary for an organization
 * Returns aggregated compliance status across all frameworks
 * 
 * @param {string} organizationId
 * @returns {Promise<Object>} Framework status summary with compliance percentages
 * 
 * @example
 * const summary = await getFrameworkStatusSummary(orgId);
 * // Returns:
 * // {
 * //   totalFrameworks: 3,
 * //   totalControls: 450,
 * //   implementedControls: 315,
 * //   overallCompliance: 70.0,
 * //   frameworks: [
 * //     { code: 'NIST_800_53', name: 'NIST 800-53', controlCount: 200, implemented: 150, compliance: 75.0 },
 * //     { code: 'SOC2', name: 'SOC 2', controlCount: 150, implemented: 120, compliance: 80.0 },
 * //     ...
 * //   ]
 * // }
 */
async function getFrameworkStatusSummary(organizationId) {
  const cacheKey = `${organizationId}:summary`;
  const cached = frameworkStatusCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < FRAMEWORK_CACHE_TTL_MS)) {
    return cached.data;
  }

  try {
    // Get detailed framework status
    const frameworksResult = await pool.query(
      `SELECT f.code, f.name,
              COUNT(fc.id) AS control_count,
              COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') AS implemented,
              ROUND(
                COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
                / NULLIF(COUNT(fc.id), 0) * 100, 1
              ) AS compliance
       FROM organization_frameworks ofw
       JOIN frameworks f ON f.id = ofw.framework_id
       JOIN framework_controls fc ON fc.framework_id = f.id
       LEFT JOIN control_implementations ci
         ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE ofw.organization_id = $1
       GROUP BY f.code, f.name
       ORDER BY f.name`,
      [organizationId]
    );

    const frameworks = frameworksResult.rows.map(row => ({
      code: row.code,
      name: row.name,
      controlCount: parseInt(row.control_count) || 0,
      implemented: parseInt(row.implemented) || 0,
      compliance: parseFloat(row.compliance) || 0
    }));

    // Calculate overall statistics
    const totalControls = frameworks.reduce((sum, fw) => sum + fw.controlCount, 0);
    const implementedControls = frameworks.reduce((sum, fw) => sum + fw.implemented, 0);
    // Round to 1 decimal place: multiply by 1000, round, then divide by 10
    const overallCompliance = totalControls > 0 
      ? Math.round((implementedControls / totalControls) * 1000) / 10 
      : 0;

    const summary = {
      totalFrameworks: frameworks.length,
      totalControls,
      implementedControls,
      overallCompliance,
      frameworks
    };

    // Cache the result
    frameworkStatusCache.set(cacheKey, { data: summary, timestamp: Date.now() });
    return summary;
  } catch (err) {
    console.error('getFrameworkStatusSummary error:', err.message);
    return {
      totalFrameworks: 0,
      totalControls: 0,
      implementedControls: 0,
      overallCompliance: 0,
      frameworks: []
    };
  }
}

module.exports = {
  getFrameworkStatusSummary,
  invalidateFrameworkStatusCache
};
