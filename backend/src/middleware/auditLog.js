// @tier: community
'use strict';

/**
 * Audit Log Middleware
 * 
 * Express middleware factory for automatic audit logging of route operations.
 * Creates audit log entries after successful route execution.
 */

const { createAuditLog } = require('../services/auditService');
const { log, serializeError } = require('../utils/logger');
const { extractIpFromRequest } = require('../services/geolocationService');
const { runWithAuditContext } = require('../utils/auditContext');

// Keys whose values must never be written to the audit trail.
const SENSITIVE_KEY_PATTERN = /pass(word)?|secret|token|api[_-]?key|private[_-]?key|credential|authorization|totp|otp|ssn/i;

function redactSensitive(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitive(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitive(item, depth + 1);
  }
  return out;
}


/**
 * Create an audit log middleware for a specific event type
 * 
 * @param {string} eventType - The type of event to log (e.g., 'ai_monitoring_rule_create')
 * @param {Object} options - Optional configuration
 * @param {Function} options.resourceExtractor - Function to extract resource info from req/res
 * @returns {Function} Express middleware function
 */
function auditLog(eventType, options = {}) {
  return async (req, res, next) => {
    // Store the original res.json and res.send to intercept the response
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    
    let responseIntercepted = false;
    
    const logAudit = async (body, statusCode) => {
      // Only log once and only for successful operations (2xx status codes)
      if (responseIntercepted || statusCode < 200 || statusCode >= 300) {
        return;
      }
      responseIntercepted = true;
      
      try {
        const user = req.user;
        if (!user || !user.organization_id) {
          // Cannot log without user context
          return;
        }
        
        // Extract resource information if provided
        let resourceType = null;
        let resourceId = null;
        
        if (options.resourceExtractor && typeof options.resourceExtractor === 'function') {
          const extracted = options.resourceExtractor(req, body);
          resourceType = extracted.resourceType || null;
          resourceId = extracted.resourceId || null;
        }
        
        // Create audit log entry (non-blocking)
        createAuditLog({
          organizationId: user.organization_id,
          userId: user.id,
          eventType,
          resourceType,
          resourceId,
          details: {
            method: req.method,
            path: req.path,
            params: req.params,
            body: req.body,
            statusCode
          },
          ipAddress: extractIpFromRequest(req),
          userAgent: req.headers['user-agent'] || null,
          success: true,
          requestId: req.requestId || null,
          actorName: user.username || user.email || null
        }).catch(err => {
          // AU-5: the request still succeeds, but this event never made it
          // into the audit trail -- do not let that pass unreported.
          log('error', 'audit.write_failed',
            { eventType, path: req.path, method: req.method, error: serializeError(err) });
        });
      } catch (error) {
        // Do not break the request, but do not fail silently either.
        log('error', 'audit.middleware_failed',
          { eventType, path: req.path, method: req.method, error: serializeError(error) });
      }
    };
    
    // Intercept res.json
    res.json = function(body) {
      logAudit(body, res.statusCode || 200);
      return originalJson(body);
    };
    
    // Intercept res.send
    res.send = function(body) {
      logAudit(body, res.statusCode || 200);
      return originalSend(body);
    };
    
    next();
  };
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ACTION_BY_METHOD = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
// Paths with their own, richer audit events or that are not user actions.
const BASELINE_EXCLUDED_PREFIXES = [
  '/auth/login', '/auth/refresh', '/auth/logout', '/sso/exchange',
  '/audit/logs', '/external-ai', '/realtime', '/public', '/tprm-public', '/webhooks/inbound'
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resourceFromRequest(req) {
  const base = String(req.baseUrl || '').replace(/^\/api\/v1\/?/, '');
  const resource = base.split('/')[0] || 'api';
  const params = req.params || {};
  const idValue = params.id || Object.values(params).find((v) => UUID_PATTERN.test(String(v)));
  return { resource, resourceId: idValue && UUID_PATTERN.test(String(idValue)) ? String(idValue) : null };
}

/**
 * Baseline audit trail (AU-2 / AU-12): records every authenticated,
 * state-changing API request that succeeded or was refused for lack of
 * permission, unless the handler already wrote its own, more specific audit
 * event. Records the route, method, identifiers and outcome -- never the
 * request body, which may carry PII or secrets.
 */
function auditBaseline(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const path = String(req.originalUrl || req.url || '').replace(/^\/api\/v1/, '').split('?')[0];
  if (BASELINE_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

  return runWithAuditContext((auditContext) => {
    res.on('finish', () => {
      const status = res.statusCode;
      const denied = status === 403;
      if (!(status >= 200 && status < 300) && !denied) return;
      if (auditContext.audited) return;
      const user = req.user;
      if (!user || !user.organization_id) return;

      const { resource, resourceId } = resourceFromRequest(req);
      const routePath = req.route && req.route.path ? `${req.baseUrl}${req.route.path}` : `${req.baseUrl}${req.path}`;
      createAuditLog({
        organizationId: user.organization_id,
        userId: user.id,
        eventType: `${resource}.${ACTION_BY_METHOD[req.method]}${denied ? '.denied' : ''}`,
        resourceType: resource,
        resourceId,
        details: { method: req.method, route: routePath, params: req.params || {}, statusCode: status, baseline: true },
        ipAddress: extractIpFromRequest(req),
        userAgent: req.headers['user-agent'] || null,
        success: !denied,
        failureReason: denied ? 'Insufficient permissions' : null,
        requestId: req.requestId || null,
        actorName: user.email || null
      }).catch((err) => {
        log('error', 'audit.baseline_write_failed', { path, method: req.method, error: serializeError(err) });
      });
    });
    next();
  });
}

module.exports = { auditLog, auditBaseline, redactSensitive };
