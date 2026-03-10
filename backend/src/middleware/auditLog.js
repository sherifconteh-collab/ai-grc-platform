// @tier: free
'use strict';

/**
 * Audit Log Middleware
 * 
 * Express middleware factory for automatic audit logging of route operations.
 * Creates audit log entries after successful route execution.
 */

const { createAuditLog } = require('../services/auditService');
// Optional premium service — not available in community edition
let geolocationServiceModule;
try { geolocationServiceModule = require('../services/geolocationService'); } catch (_) { geolocationServiceModule = {}; }
const { extractIpFromRequest = (req) => req?.ip || null } = geolocationServiceModule;

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
          sessionId: req.sessionId || null,
          requestId: req.requestId || null,
          actorName: user.username || user.email || null
        }).catch(err => {
          // Log error but don't fail the request
          console.error('Failed to create audit log:', err);
        });
      } catch (error) {
        // Silently fail - audit logging should not break the application
        console.error('Audit log middleware error:', error);
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

module.exports = { auditLog };
