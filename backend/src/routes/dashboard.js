/**
 * Dashboard API Routes
 * Provides compliance metrics, statistics, and activity feeds
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const pool = require('../config/database');
const { decrypt } = require('../utils/encrypt');

const router = express.Router();

async function getDashboardStats(orgId) {
  const overallResult = await pool.query(
    `SELECT
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalk_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'in_progress' THEN ci.id END) as in_progress_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'not_started' OR ci.status IS NULL THEN fc.id END) as not_started_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'not_applicable' THEN ci.id END) as not_applicable_count
    FROM organization_frameworks of
    JOIN framework_controls fc ON fc.framework_id = of.framework_id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = of.organization_id
    WHERE of.organization_id = $1`,
    [orgId]
  );

  const overall = overallResult.rows[0];
  const totalApplicable = parseInt(overall.total_controls) - parseInt(overall.not_applicable_count || 0);
  const totalSatisfied = parseInt(overall.implemented_count || 0) + parseInt(overall.crosswalk_count || 0);
  const compliancePercentage = totalApplicable > 0
    ? Math.round((totalSatisfied / totalApplicable) * 100)
    : 0;

  const frameworkResult = await pool.query(
    `SELECT
      f.id,
      f.code,
      f.name,
      f.category,
      of.priority,
      COUNT(DISTINCT fc.id) as total_controls,
      COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as implemented_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalk_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'in_progress' THEN ci.id END) as in_progress_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'not_started' OR ci.status IS NULL THEN fc.id END) as not_started_count,
      COUNT(DISTINCT CASE WHEN ci.status = 'not_applicable' THEN ci.id END) as not_applicable_count
    FROM organization_frameworks of
    JOIN frameworks f ON f.id = of.framework_id
    LEFT JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = of.organization_id
    WHERE of.organization_id = $1
    GROUP BY f.id, f.code, f.name, f.category, of.priority
    ORDER BY of.priority ASC, f.name ASC`,
    [orgId]
  );

  const frameworks = frameworkResult.rows.map(row => {
    const applicableControls = parseInt(row.total_controls) - parseInt(row.not_applicable_count || 0);
    const satisfiedControls = parseInt(row.implemented_count || 0) + parseInt(row.crosswalk_count || 0);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      priority: row.priority,
      totalControls: parseInt(row.total_controls),
      implemented: parseInt(row.implemented_count || 0),
      satisfiedViaCrosswalk: parseInt(row.crosswalk_count || 0),
      inProgress: parseInt(row.in_progress_count || 0),
      notStarted: parseInt(row.not_started_count || 0),
      notApplicable: parseInt(row.not_applicable_count || 0),
      compliancePercentage: applicableControls > 0
        ? Math.round((satisfiedControls / applicableControls) * 100)
        : 0
    };
  });

  const priorityResult = await pool.query(
    `SELECT COUNT(*)
     FROM organization_frameworks of
     JOIN framework_controls fc ON fc.framework_id = of.framework_id
     LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = of.organization_id
     WHERE of.organization_id = $1
     AND fc.priority IN ('critical', 'high')
     AND (ci.status IS NULL OR ci.status = 'not_started')`,
    [orgId]
  );

  return {
    overall: {
      totalControls: parseInt(overall.total_controls),
      totalApplicable,
      implemented: parseInt(overall.implemented_count || 0),
      satisfiedViaCrosswalk: parseInt(overall.crosswalk_count || 0),
      totalSatisfied,
      inProgress: parseInt(overall.in_progress_count || 0),
      notStarted: parseInt(overall.not_started_count || 0),
      notApplicable: parseInt(overall.not_applicable_count || 0),
      compliancePercentage
    },
    frameworks,
    priorityControlsNotStarted: parseInt(priorityResult.rows[0].count)
  };
}

async function getDashboardTrend(orgId, days = 30) {
  const result = await pool.query(
    `WITH date_series AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '${parseInt(days)} days',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS date
    ),
    daily_stats AS (
      SELECT
        ds.date,
        COUNT(DISTINCT fc.id) as total_controls,
        COUNT(DISTINCT CASE
          WHEN ci.implemented_at IS NOT NULL AND ci.implemented_at::date <= ds.date
          THEN ci.id
        END) as implemented_count
      FROM date_series ds
      CROSS JOIN organization_frameworks of
      JOIN framework_controls fc ON fc.framework_id = of.framework_id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id
        AND ci.organization_id = of.organization_id
        AND ci.status IN ('implemented', 'satisfied_via_crosswalk')
      WHERE of.organization_id = $1
      GROUP BY ds.date
    )
    SELECT
      date,
      total_controls,
      implemented_count,
      CASE
        WHEN total_controls > 0 THEN ROUND((implemented_count::numeric / total_controls) * 100, 1)
        ELSE 0
      END as compliance_percentage
    FROM daily_stats
    ORDER BY date ASC`,
    [orgId]
  );

  return result.rows.map(row => ({
    date: row.date,
    totalControls: parseInt(row.total_controls),
    implementedControls: parseInt(row.implemented_count),
    compliance: parseFloat(row.compliance_percentage)
  }));
}

async function getDashboardOverviewActivity(orgId, limit = 20) {
  const result = await pool.query(
    `SELECT
      al.id,
      COALESCE(u.first_name || ' ' || u.last_name, al.actor_name, 'System') as changed_by_name,
      fc.control_id as control_code,
      fc.title as control_title,
      COALESCE(al.details->>'old_status', 'not_started') as old_status,
      COALESCE(al.details->>'status', al.details->>'new_status', 'not_started') as new_status,
      al.created_at as changed_at,
      al.details->>'notes' as notes
    FROM audit_logs al
    LEFT JOIN framework_controls fc ON fc.id::text = al.resource_id::text
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.organization_id = $1
      AND al.resource_type = 'control'
      AND COALESCE(al.details->>'status', al.details->>'new_status', al.details->>'old_status') IS NOT NULL
    ORDER BY al.created_at DESC
    LIMIT $2`,
    [orgId, parseInt(limit)]
  );

  return result.rows.map((row) => ({
    id: row.id,
    changed_by_name: row.changed_by_name,
    control_code: row.control_code,
    control_title: row.control_title,
    old_status: row.old_status,
    new_status: row.new_status,
    changed_at: row.changed_at,
    notes: row.notes || undefined
  }));
}

router.get('/overview', authenticate, async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const [stats, activity, trend] = await Promise.all([
      getDashboardStats(orgId),
      getDashboardOverviewActivity(orgId, 20),
      getDashboardTrend(orgId, 30)
    ]);

    res.json({
      success: true,
      data: {
        stats,
        activity,
        trend,
        maturity: null
      }
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard overview'
    });
  }
});

/**
 * GET /api/v1/dashboard/stats
 * Get overall compliance statistics for the organization
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const stats = await getDashboardStats(orgId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard statistics'
    });
  }
});

/**
 * GET /api/v1/dashboard/priority-actions
 * Get high-priority controls that need attention
 */
router.get('/priority-actions', authenticate, async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const { limit = 10 } = req.query;

    const result = await pool.query(
      `SELECT
        fc.id,
        fc.control_id,
        fc.title,
        fc.description,
        fc.priority,
        f.code as framework_code,
        f.name as framework_name,
        ci.status,
        ci.assigned_to,
        CASE
          WHEN ci.status IS NULL OR ci.status = 'not_started' THEN 1
          WHEN ci.status = 'in_progress' THEN 2
          ELSE 3
        END as urgency_order
      FROM organization_frameworks of
      JOIN framework_controls fc ON fc.framework_id = of.framework_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = of.organization_id
      WHERE of.organization_id = $1
      AND fc.priority IN ('critical', 'high')
      AND (ci.status IS NULL OR ci.status IN ('not_started', 'in_progress'))
      ORDER BY
        CASE fc.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          ELSE 3
        END,
        urgency_order,
        f.name,
        fc.display_order
      LIMIT $2`,
      [orgId, parseInt(limit)]
    );

    const actions = result.rows.map(row => ({
      controlId: row.id,
      controlCode: row.control_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      framework: {
        code: row.framework_code,
        name: row.framework_name
      },
      status: row.status || 'not_started',
      assignedTo: row.assigned_to
    }));

    res.json({
      success: true,
      data: {
        actions,
        total: actions.length
      }
    });

  } catch (error) {
    console.error('Get priority actions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get priority actions'
    });
  }
});

/**
 * GET /api/v1/dashboard/recent-activity
 * Get recent activity feed for the organization
 */
router.get('/recent-activity', authenticate, async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const { limit = 20 } = req.query;

    const result = await pool.query(
      `SELECT
        ci.id,
        ci.status,
        ci.updated_at,
        fc.control_id,
        fc.title as control_title,
        f.code as framework_code,
        f.name as framework_name,
        u.full_name as user_name,
        u.email as user_email
      FROM control_implementations ci
      JOIN framework_controls fc ON fc.id = ci.control_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE ci.organization_id = $1
      AND ci.updated_at IS NOT NULL
      ORDER BY ci.updated_at DESC
      LIMIT $2`,
      [orgId, parseInt(limit)]
    );

    const activities = result.rows.map(row => ({
      id: row.id,
      type: 'control_update',
      timestamp: row.updated_at,
      control: {
        code: row.control_id,
        title: row.control_title,
        framework: {
          code: row.framework_code,
          name: row.framework_name
        }
      },
      status: row.status,
      user: row.user_name ? {
        name: row.user_name,
        email: decrypt(row.user_email)
      } : null,
      description: `Control ${row.control_id} status changed to ${row.status}`
    }));

    res.json({
      success: true,
      data: {
        activities,
        total: activities.length
      }
    });

  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent activity'
    });
  }
});

/**
 * GET /api/v1/dashboard/compliance-trend
 * Get compliance percentage trend over time
 */
router.get('/compliance-trend', authenticate, async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const { days = 30 } = req.query;
    const rawTrend = await getDashboardTrend(orgId, days);
    const trend = rawTrend.map(({ compliance, ...row }) => ({
      ...row,
      compliancePercentage: compliance
    }));

    res.json({
      success: true,
      data: {
        trend,
        days: parseInt(days)
      }
    });

  } catch (error) {
    console.error('Get compliance trend error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get compliance trend'
    });
  }
});

/**
 * GET /api/v1/dashboard/crosswalk-impact
 * Get statistics on crosswalk satisfaction impact
 */
router.get('/crosswalk-impact', authenticate, async (req, res) => {
  try {
    const orgId = req.user.organizationId;

    // Get crosswalk satisfaction stats
    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT CASE WHEN ci.status = 'satisfied_via_crosswalk' THEN ci.id END) as crosswalk_satisfied_count,
        COUNT(DISTINCT CASE WHEN ci.status = 'implemented' THEN ci.id END) as directly_implemented_count,
        COUNT(DISTINCT fc.id) as total_controls
      FROM organization_frameworks of
      JOIN framework_controls fc ON fc.framework_id = of.framework_id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = of.organization_id
      WHERE of.organization_id = $1`,
      [orgId]
    );

    const stats = result.rows[0];
    const crosswalkCount = parseInt(stats.crosswalk_satisfied_count || 0);
    const directCount = parseInt(stats.directly_implemented_count || 0);
    const totalCount = parseInt(stats.total_controls);

    const effortSavings = directCount > 0
      ? Math.round((crosswalkCount / directCount) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        crosswalkSatisfied: crosswalkCount,
        directlyImplemented: directCount,
        totalControls: totalCount,
        effortSavingsPercentage: effortSavings,
        message: crosswalkCount > 0
          ? `You've satisfied ${crosswalkCount} controls automatically through crosswalk mappings, saving approximately ${effortSavings}% implementation effort!`
          : 'Start implementing controls to see crosswalk benefits'
      }
    });

  } catch (error) {
    console.error('Get crosswalk impact error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get crosswalk impact statistics'
    });
  }
});

module.exports = router;
