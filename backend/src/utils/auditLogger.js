/**
 * AU-2 Compliant Audit Logging Utility
 *
 * Implements NIST 800-53 AU-2 (Audit Events) requirements:
 * - Logs security-relevant events
 * - Captures what, when, where, who, and outcome
 * - Supports required event types per AU-2
 *
 * Event Types (AU-2):
 * - Successful/unsuccessful account logon
 * - Account management (create, modify, enable, disable, remove)
 * - Object access (data access, file access)
 * - Policy changes
 * - Privilege function usage (admin operations)
 * - Process tracking (system events)
 * - System events
 */

import pool from '../config/database.js';

// AU-2 Required Event Types
export const AuditEventType = {
  // Account Logon Events
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',

  // Account Management Events
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_MODIFIED: 'account_modified',
  ACCOUNT_DELETED: 'account_deleted',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_ENABLED: 'account_enabled',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',

  // Access Control Events
  ACCESS_GRANTED: 'access_granted',
  ACCESS_DENIED: 'access_denied',
  PERMISSION_CHANGED: 'permission_changed',
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REMOVED: 'role_removed',

  // Object Access Events
  DATA_ACCESS: 'data_access',
  DATA_CREATED: 'data_created',
  DATA_MODIFIED: 'data_modified',
  DATA_DELETED: 'data_deleted',
  DATA_EXPORTED: 'data_exported',
  FILE_UPLOADED: 'file_uploaded',
  FILE_DOWNLOADED: 'file_downloaded',

  // Policy and Configuration Changes
  POLICY_CREATED: 'policy_created',
  POLICY_MODIFIED: 'policy_modified',
  POLICY_DELETED: 'policy_deleted',
  CONFIG_CHANGED: 'config_changed',

  // Privilege Function Usage
  ADMIN_ACTION: 'admin_action',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  SECURITY_FUNCTION: 'security_function',

  // System Events
  SYSTEM_STARTUP: 'system_startup',
  SYSTEM_SHUTDOWN: 'system_shutdown',
  SERVICE_STARTED: 'service_started',
  SERVICE_STOPPED: 'service_stopped',

  // Security Events
  SECURITY_ALERT: 'security_alert',
  SECURITY_VIOLATION: 'security_violation',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',

  // Token/Session Events
  TOKEN_ISSUED: 'token_issued',
  TOKEN_REFRESHED: 'token_refreshed',
  TOKEN_REVOKED: 'token_revoked',
  SESSION_CREATED: 'session_created',
  SESSION_TERMINATED: 'session_terminated'
};

/**
 * Log an audit event to the auth_audit_log table
 *
 * @param {Object} event - Audit event details
 * @param {string} event.eventType - Type of event (use AuditEventType constants)
 * @param {string} [event.userId] - UUID of user who performed action
 * @param {string} [event.email] - Email of user (for login attempts)
 * @param {boolean} [event.success=true] - Whether the event succeeded
 * @param {string} [event.failureReason] - Reason for failure (if success=false)
 * @param {string} [event.ipAddress] - Source IP address
 * @param {string} [event.userAgent] - User agent string
 * @param {Object} [event.metadata] - Additional event-specific data
 * @param {string} [event.metadata.objectType] - Type of object accessed/modified
 * @param {string} [event.metadata.objectId] - ID of object accessed/modified
 * @param {string} [event.metadata.action] - Specific action performed
 * @param {Object} [event.metadata.changes] - Before/after values for modifications
 * @param {string} [event.metadata.resource] - Resource affected
 * @param {string} [event.metadata.method] - HTTP method (GET, POST, etc.)
 * @param {string} [event.metadata.endpoint] - API endpoint accessed
 * @param {number} [event.metadata.statusCode] - HTTP status code
 */
export async function logAuditEvent(event) {
  const {
    eventType,
    userId = null,
    email = null,
    success = true,
    failureReason = null,
    ipAddress = null,
    userAgent = null,
    metadata = {}
  } = event;

  try {
    await pool.query(
      `INSERT INTO auth_audit_log
        (user_id, email, event_type, ip_address, user_agent, success, failure_reason, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        userId,
        email,
        eventType,
        ipAddress,
        userAgent,
        success,
        failureReason,
        JSON.stringify(metadata)
      ]
    );
  } catch (error) {
    // Don't throw - logging failures shouldn't break the application
    // But log to console for operational awareness
    console.error('❌ Audit logging failed:', {
      error: error.message,
      eventType,
      userId,
      email
    });
  }
}

/**
 * Log successful authentication event
 */
export async function logLoginSuccess(userId, email, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.LOGIN_SUCCESS,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log failed authentication attempt
 */
export async function logLoginFailure(email, reason, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.LOGIN_FAILURE,
    email,
    success: false,
    failureReason: reason,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log user logout
 */
export async function logLogout(userId, email, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.LOGOUT,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log account creation
 */
export async function logAccountCreated(userId, email, createdBy, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.ACCOUNT_CREATED,
    userId: createdBy,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      newUserId: userId,
      action: 'create',
      objectType: 'user_account'
    }
  });
}

/**
 * Log account modification
 */
export async function logAccountModified(userId, email, modifiedBy, changes, ipAddress, userAgent) {
  await logAuditEvent({
    eventType: AuditEventType.ACCOUNT_MODIFIED,
    userId: modifiedBy,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      targetUserId: userId,
      action: 'modify',
      objectType: 'user_account',
      changes
    }
  });
}

/**
 * Log password change
 */
export async function logPasswordChanged(userId, email, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.PASSWORD_CHANGED,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      action: 'password_change',
      objectType: 'credentials'
    }
  });
}

/**
 * Log access denied event
 */
export async function logAccessDenied(userId, email, resource, reason, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.ACCESS_DENIED,
    userId,
    email,
    success: false,
    failureReason: reason,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      resource,
      action: 'access_attempt',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log privileged operation (admin action)
 */
export async function logAdminAction(userId, email, action, target, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.ADMIN_ACTION,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      action,
      target,
      privileged: true,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log data access event
 */
export async function logDataAccess(userId, email, objectType, objectId, action, ipAddress, userAgent) {
  await logAuditEvent({
    eventType: AuditEventType.DATA_ACCESS,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      objectType,
      objectId,
      action,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log data modification event
 */
export async function logDataModified(userId, email, objectType, objectId, action, ipAddress, userAgent, changes = {}) {
  await logAuditEvent({
    eventType: AuditEventType.DATA_MODIFIED,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      objectType,
      objectId,
      action,
      changes,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log policy or configuration change
 */
export async function logPolicyChange(userId, email, policyType, changes, ipAddress, userAgent) {
  await logAuditEvent({
    eventType: AuditEventType.POLICY_MODIFIED,
    userId,
    email,
    success: true,
    ipAddress,
    userAgent,
    metadata: {
      policyType,
      changes,
      action: 'policy_modification',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log security alert or violation
 */
export async function logSecurityAlert(userId, email, alertType, description, ipAddress, userAgent, metadata = {}) {
  await logAuditEvent({
    eventType: AuditEventType.SECURITY_ALERT,
    userId,
    email,
    success: false,
    failureReason: description,
    ipAddress,
    userAgent,
    metadata: {
      ...metadata,
      alertType,
      severity: metadata.severity || 'medium',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Express middleware to automatically log API requests
 * Use this on protected routes to capture access events
 */
export function auditMiddleware(req, res, next) {
  // Capture original end function
  const originalEnd = res.end;

  // Override end function to log after response
  res.end = function(...args) {
    // Log the API access
    logDataAccess(
      req.user?.id,
      req.user?.email,
      'api_endpoint',
      req.path,
      req.method,
      req.ip || req.connection.remoteAddress,
      req.get('user-agent')
    ).catch(err => {
      console.error('Audit middleware logging failed:', err);
    });

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Query audit logs with filters
 *
 * @param {Object} filters - Query filters
 * @param {string} [filters.userId] - Filter by user ID
 * @param {string} [filters.email] - Filter by email
 * @param {string} [filters.eventType] - Filter by event type
 * @param {Date} [filters.startDate] - Filter by start date
 * @param {Date} [filters.endDate] - Filter by end date
 * @param {boolean} [filters.successOnly] - Show only successful events
 * @param {number} [filters.limit=100] - Number of records to return
 * @param {number} [filters.offset=0] - Offset for pagination
 */
export async function queryAuditLogs(filters = {}) {
  const {
    userId,
    email,
    eventType,
    startDate,
    endDate,
    successOnly,
    limit = 100,
    offset = 0
  } = filters;

  let query = 'SELECT * FROM auth_audit_log WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (userId) {
    query += ` AND user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }

  if (email) {
    query += ` AND email = $${paramIndex}`;
    params.push(email);
    paramIndex++;
  }

  if (eventType) {
    query += ` AND event_type = $${paramIndex}`;
    params.push(eventType);
    paramIndex++;
  }

  if (startDate) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  if (successOnly) {
    query += ` AND success = true`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

export default {
  AuditEventType,
  logAuditEvent,
  logLoginSuccess,
  logLoginFailure,
  logLogout,
  logAccountCreated,
  logAccountModified,
  logPasswordChanged,
  logAccessDenied,
  logAdminAction,
  logDataAccess,
  logDataModified,
  logPolicyChange,
  logSecurityAlert,
  auditMiddleware,
  queryAuditLogs
};
