// @tier: community
'use strict';

/**
 * Centralized Audit Logging Service
 * 
 * Provides AU-2 compliant audit logging with support for:
 * - Complete event details (type, date/time, location, source, outcome)
 * - Subject identity tracking (user, service account, API key)
 * - Session and correlation identifiers
 * - SSO/authentication method tracking
 * - SIEM forwarding integration
 */

const pool = require('../config/database');

// Optional SIEM service: fall back to no-op if unavailable
let siemService;
try {
  siemService = require('./siemService');
} catch (e) {
  siemService = { forwardEvent: async () => ({}) };
}
const dynamicFieldsService = require('./dynamicAuditFieldsService');

/**
 * Create an audit log entry with AU-2 compliant fields
 * 
 * @param {Object} params - Audit log parameters
 * @param {string} params.organizationId - Organization ID
 * @param {string} [params.userId] - User ID (optional for system events)
 * @param {string} params.eventType - Type of event (e.g., 'user.login', 'control.updated')
 * @param {string} [params.resourceType] - Type of resource affected
 * @param {string} [params.resourceId] - ID of resource affected
 * @param {Object} [params.details] - Additional event details
 * @param {string} [params.ipAddress] - Client IP address
 * @param {string} [params.userAgent] - Client user agent
 * @param {boolean} [params.success] - Whether operation succeeded
 * @param {string} [params.failureReason] - Reason for failure if applicable
 * @param {string} [params.sessionId] - Session identifier
 * @param {string} [params.authenticationMethod] - Method: password, sso, passkey, api_key, service_account
 * @param {string} [params.ssoProvider] - SSO provider if applicable
 * @param {string} [params.requestId] - Request correlation ID
 * @param {string} [params.actorName] - Human-readable actor name
 * @param {string} [params.sourceSystem] - Source system/service name
 * @param {Object} [params.customFields] - Custom fields to store (key-value pairs)
 * @param {Object} [params.integrationData] - Full integration data for AI analysis
 */
async function createAuditLog(params) {
  const {
    organizationId,
    userId = null,
    eventType,
    resourceType = null,
    resourceId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
    success = true,
    failureReason = null,
    sessionId = null,
    authenticationMethod = null,
    ssoProvider = null,
    requestId = null,
    actorName = null,
    sourceSystem = 'controlweave',
    customFields = {},
    integrationData = null
  } = params;

  const outcome = success ? 'success' : 'failure';

  try {
    // Insert audit log
    const result = await pool.query(
      `INSERT INTO audit_logs (
        organization_id, user_id, event_type, resource_type, resource_id,
        details, ip_address, user_agent, success, failure_reason,
        session_id, authentication_method, sso_provider, siem_forwarded,
        outcome, request_id, actor_name, source_system, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      RETURNING id`,
      [
        organizationId, userId, eventType, resourceType, resourceId,
        details, ipAddress, userAgent, success, failureReason,
        sessionId, authenticationMethod, ssoProvider, false,
        outcome, requestId, actorName, sourceSystem
      ]
    );

    const auditLogId = result.rows[0].id;

    // Store custom fields if provided
    if (Object.keys(customFields).length > 0) {
      await storeCustomFields(auditLogId, organizationId, customFields, sourceSystem);
    }

    // Analyze integration data for AI suggestions if provided
    if (integrationData && sourceSystem) {
      analyzeIntegrationData(organizationId, integrationData, sourceSystem).catch(err => {
        console.error('Integration data analysis error:', err);
      });
    }

    // Forward to SIEM asynchronously (don't block the audit log creation)
    forwardToSiem(organizationId, auditLogId, eventType, {
      organization_id: organizationId,
      user_id: userId,
      event_type: eventType,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: ipAddress,
      user_agent: userAgent,
      success,
      failure_reason: failureReason,
      session_id: sessionId,
      authentication_method: authenticationMethod,
      sso_provider: ssoProvider,
      outcome,
      request_id: requestId,
      actor_name: actorName,
      source_system: sourceSystem,
      timestamp: new Date().toISOString(),
      custom_fields: customFields
    }).catch(err => {
      // Log SIEM forwarding errors but don't fail the audit log creation
      console.error('SIEM forwarding error:', err);
    });

    return auditLogId;
  } catch (error) {
    // Audit logging failures should be logged but not block operations
    console.error('Audit log creation error:', error);
    throw error;
  }
}

/**
 * Forward audit event to configured SIEM systems
 * Updates the siem_forwarded flag on success
 */
async function forwardToSiem(organizationId, auditLogId, eventType, payload) {
  try {
    const results = await siemService.forwardEvent(organizationId, eventType, payload);
    
    // Check if any SIEM forwarding was successful
    const anySuccess = results.some(r => r.ok);
    
    if (anySuccess) {
      // Mark as forwarded in audit log
      await pool.query(
        'UPDATE audit_logs SET siem_forwarded = TRUE WHERE id = $1',
        [auditLogId]
      );
    }

    return results;
  } catch (error) {
    console.error('SIEM forwarding failed:', error);
    return [];
  }
}

/**
 * Log an authentication event
 */
async function logAuthentication(params) {
  const {
    organizationId,
    userId,
    email,
    authMethod,
    ssoProvider = null,
    success,
    failureReason = null,
    ipAddress = null,
    userAgent = null,
    sessionId = null,
    requestId = null,
    actorName = null
  } = params;

  return createAuditLog({
    organizationId,
    userId,
    eventType: success ? 'user.login.success' : 'user.login.failure',
    resourceType: 'user',
    resourceId: userId,
    details: {
      email,
      authentication_method: authMethod,
      sso_provider: ssoProvider
    },
    ipAddress,
    userAgent,
    success,
    failureReason,
    sessionId,
    authenticationMethod: authMethod,
    ssoProvider,
    requestId,
    actorName,
    sourceSystem: 'controlweave-auth'
  });
}

/**
 * Log a logout event
 */
async function logLogout(params) {
  const {
    organizationId,
    userId,
    sessionId,
    ipAddress = null,
    userAgent = null,
    requestId = null,
    actorName = null
  } = params;

  return createAuditLog({
    organizationId,
    userId,
    eventType: 'user.logout',
    resourceType: 'user',
    resourceId: userId,
    details: { session_id: sessionId },
    ipAddress,
    userAgent,
    success: true,
    sessionId,
    requestId,
    actorName,
    sourceSystem: 'controlweave-auth'
  });
}

/**
 * Log an SSO configuration change
 */
async function logSsoConfigChange(params) {
  const {
    organizationId,
    userId,
    action,
    provider,
    details = {},
    ipAddress = null,
    userAgent = null,
    requestId = null,
    actorName = null
  } = params;

  return createAuditLog({
    organizationId,
    userId,
    eventType: `sso.config.${action}`,
    resourceType: 'sso_configuration',
    details: {
      provider,
      ...details
    },
    ipAddress,
    userAgent,
    success: true,
    requestId,
    actorName,
    sourceSystem: 'controlweave-sso'
  });
}

/**
 * Log a SIEM configuration change
 */
async function logSiemConfigChange(params) {
  const {
    organizationId,
    userId,
    action,
    siemProvider,
    configId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
    requestId = null,
    actorName = null
  } = params;

  return createAuditLog({
    organizationId,
    userId,
    eventType: `siem.config.${action}`,
    resourceType: 'siem_configuration',
    resourceId: configId,
    details: {
      provider: siemProvider,
      ...details
    },
    ipAddress,
    userAgent,
    success: true,
    requestId,
    actorName,
    sourceSystem: 'controlweave-siem'
  });
}

/**
 * Store custom field values for an audit log
 */
async function storeCustomFields(auditLogId, organizationId, customFields, sourceSystem) {
  try {
    // Get active field definitions for this org and source
    const fieldDefs = await dynamicFieldsService.getFieldDefinitions(organizationId, true);
    const fieldDefMap = {};
    
    fieldDefs.forEach(def => {
      if (!def.source_integration || def.source_integration === sourceSystem) {
        fieldDefMap[def.field_name] = def;
      }
    });

    // Store values for defined fields
    for (const [fieldName, value] of Object.entries(customFields)) {
      const fieldDef = fieldDefMap[fieldName];
      if (fieldDef) {
        await dynamicFieldsService.storeCustomFieldValue(
          auditLogId,
          fieldDef.id,
          value
        );
      }
    }
  } catch (error) {
    console.error('Error storing custom fields:', error);
    // Don't throw - custom field storage shouldn't break audit logging
  }
}

/**
 * Analyze integration data for AI field suggestions (async, non-blocking)
 */
async function analyzeIntegrationData(organizationId, integrationData, sourceSystem) {
  try {
    await dynamicFieldsService.analyzeAndSuggestFields(
      organizationId,
      integrationData,
      sourceSystem
    );
  } catch (error) {
    console.error(`Error analyzing integration data for org ${organizationId}, source ${sourceSystem}:`, error);
    // Don't throw - this is a non-critical background operation
  }
}

/**
 * Extract common audit context from Express request
 */
function extractAuditContext(req) {
  return {
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
    sessionId: req.user?.session_id || req.sessionID,
    authenticationMethod: req.user?.authentication_method
  };
}

/**
 * Get human-readable actor name from user object
 */
function getActorName(user) {
  if (!user) return null;
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`.trim();
  }
  if (user.name) return user.name;
  return user.email || null;
}

/**
 * Create audit log from Express request context
 * Extracts common fields from request object
 */
async function logFromRequest(req, params) {
  const context = extractAuditContext(req);
  
  let actorName = null;
  if (req.user) {
    actorName = getActorName(req.user);
  }

  return createAuditLog({
    ...params,
    organizationId: params.organizationId || req.user?.organization_id,
    userId: params.userId || req.user?.id,
    ipAddress: params.ipAddress || context.ipAddress,
    userAgent: params.userAgent || context.userAgent,
    requestId: params.requestId || context.requestId,
    sessionId: params.sessionId || context.sessionId,
    authenticationMethod: params.authenticationMethod || context.authenticationMethod,
    actorName: params.actorName || actorName
  });
}

module.exports = {
  createAuditLog,
  logAuthentication,
  logLogout,
  logSsoConfigChange,
  logSiemConfigChange,
  logFromRequest,
  forwardToSiem,
  extractAuditContext,
  getActorName,
  storeCustomFields,
  analyzeIntegrationData
};
