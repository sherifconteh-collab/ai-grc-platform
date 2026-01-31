/**
 * Audit Log API Routes
 * Provides endpoints for querying AU-2 compliant audit logs
 * Restricted to admin users only
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { queryAuditLogs, AuditEventType } from '../utils/auditLogger.js';
import pool from '../config/database.js';

const router = express.Router();

/**
 * GET /api/v1/audit/logs
 * Query audit logs with filters
 * Admin only
 */
router.get('/logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const {
      userId,
      email,
      eventType,
      startDate,
      endDate,
      successOnly,
      limit = 100,
      offset = 0
    } = req.query;

    const filters = {
      userId,
      email,
      eventType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      successOnly: successOnly === 'true',
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    };

    const logs = await queryAuditLogs(filters);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM auth_audit_log WHERE 1=1';
    const countParams = [];
    let paramIndex = 1;

    if (userId) {
      countQuery += ` AND user_id = $${paramIndex}`;
      countParams.push(userId);
      paramIndex++;
    }

    if (email) {
      countQuery += ` AND email = $${paramIndex}`;
      countParams.push(email);
      paramIndex++;
    }

    if (eventType) {
      countQuery += ` AND event_type = $${paramIndex}`;
      countParams.push(eventType);
      paramIndex++;
    }

    if (startDate) {
      countQuery += ` AND created_at >= $${paramIndex}`;
      countParams.push(new Date(startDate));
      paramIndex++;
    }

    if (endDate) {
      countQuery += ` AND created_at <= $${paramIndex}`;
      countParams.push(new Date(endDate));
      paramIndex++;
    }

    if (successOnly === 'true') {
      countQuery += ` AND success = true`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total: totalCount,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: filters.offset + logs.length < totalCount
        }
      }
    });

  } catch (error) {
    console.error('Audit log query error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to query audit logs'
    });
  }
});

/**
 * GET /api/v1/audit/event-types
 * Get list of available audit event types
 */
router.get('/event-types', authenticateToken, requireRole(['admin']), async (req, res) => {
  res.json({
    success: true,
    data: {
      eventTypes: Object.values(AuditEventType),
      categories: {
        'Account Logon': [
          AuditEventType.LOGIN_SUCCESS,
          AuditEventType.LOGIN_FAILURE,
          AuditEventType.LOGOUT
        ],
        'Account Management': [
          AuditEventType.ACCOUNT_CREATED,
          AuditEventType.ACCOUNT_MODIFIED,
          AuditEventType.ACCOUNT_DELETED,
          AuditEventType.ACCOUNT_DISABLED,
          AuditEventType.ACCOUNT_ENABLED,
          AuditEventType.PASSWORD_CHANGED,
          AuditEventType.PASSWORD_RESET_REQUESTED,
          AuditEventType.PASSWORD_RESET_COMPLETED
        ],
        'Access Control': [
          AuditEventType.ACCESS_GRANTED,
          AuditEventType.ACCESS_DENIED,
          AuditEventType.PERMISSION_CHANGED,
          AuditEventType.ROLE_ASSIGNED,
          AuditEventType.ROLE_REMOVED
        ],
        'Object Access': [
          AuditEventType.DATA_ACCESS,
          AuditEventType.DATA_CREATED,
          AuditEventType.DATA_MODIFIED,
          AuditEventType.DATA_DELETED,
          AuditEventType.DATA_EXPORTED,
          AuditEventType.FILE_UPLOADED,
          AuditEventType.FILE_DOWNLOADED
        ],
        'Policy Changes': [
          AuditEventType.POLICY_CREATED,
          AuditEventType.POLICY_MODIFIED,
          AuditEventType.POLICY_DELETED,
          AuditEventType.CONFIG_CHANGED
        ],
        'Privilege Functions': [
          AuditEventType.ADMIN_ACTION,
          AuditEventType.PRIVILEGE_ESCALATION,
          AuditEventType.SECURITY_FUNCTION
        ],
        'System Events': [
          AuditEventType.SYSTEM_STARTUP,
          AuditEventType.SYSTEM_SHUTDOWN,
          AuditEventType.SERVICE_STARTED,
          AuditEventType.SERVICE_STOPPED
        ],
        'Security Events': [
          AuditEventType.SECURITY_ALERT,
          AuditEventType.SECURITY_VIOLATION,
          AuditEventType.SUSPICIOUS_ACTIVITY
        ],
        'Session Management': [
          AuditEventType.TOKEN_ISSUED,
          AuditEventType.TOKEN_REFRESHED,
          AuditEventType.TOKEN_REVOKED,
          AuditEventType.SESSION_CREATED,
          AuditEventType.SESSION_TERMINATED
        ]
      }
    }
  });
});

/**
 * GET /api/v1/audit/stats
 * Get audit log statistics
 * Admin only
 */
router.get('/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      dateFilter = ' WHERE created_at >= $1 AND created_at <= $2';
      params.push(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      dateFilter = ' WHERE created_at >= $1';
      params.push(new Date(startDate));
    } else if (endDate) {
      dateFilter = ' WHERE created_at <= $1';
      params.push(new Date(endDate));
    }

    // Get event type counts
    const eventStats = await pool.query(
      `SELECT event_type, COUNT(*) as count,
              SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
              SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failure_count
       FROM auth_audit_log
       ${dateFilter}
       GROUP BY event_type
       ORDER BY count DESC`,
      params
    );

    // Get total counts
    const totalStats = await pool.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN success THEN 1 ELSE 0 END) as total_success,
              SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as total_failure
       FROM auth_audit_log
       ${dateFilter}`,
      params
    );

    // Get recent failed login attempts
    const recentFailures = await pool.query(
      `SELECT email, COUNT(*) as failure_count, MAX(created_at) as last_failure
       FROM auth_audit_log
       WHERE event_type = 'login_failure'
       ${startDate ? 'AND created_at >= $1' : ''}
       GROUP BY email
       HAVING COUNT(*) >= 3
       ORDER BY failure_count DESC
       LIMIT 10`,
      startDate ? [new Date(startDate)] : []
    );

    res.json({
      success: true,
      data: {
        total: parseInt(totalStats.rows[0].total),
        successTotal: parseInt(totalStats.rows[0].total_success),
        failureTotal: parseInt(totalStats.rows[0].total_failure),
        eventTypeStats: eventStats.rows.map(row => ({
          eventType: row.event_type,
          count: parseInt(row.count),
          successCount: parseInt(row.success_count),
          failureCount: parseInt(row.failure_count)
        })),
        suspiciousActivity: recentFailures.rows.map(row => ({
          email: row.email,
          failureCount: parseInt(row.failure_count),
          lastFailure: row.last_failure
        }))
      }
    });

  } catch (error) {
    console.error('Audit stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audit statistics'
    });
  }
});

/**
 * GET /api/v1/audit/user/:userId
 * Get audit logs for a specific user
 * Admin only
 */
router.get('/user/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const logs = await queryAuditLogs({
      userId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        userId,
        logs
      }
    });

  } catch (error) {
    console.error('User audit log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user audit logs'
    });
  }
});

export default router;
