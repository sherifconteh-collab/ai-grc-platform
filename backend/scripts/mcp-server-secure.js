#!/usr/bin/env node
// @tier: free
/**
 * Secure MCP Server for ControlWeave
 * Implements OWASP best practices for MCP server development
 * Reference: https://genai.owasp.org/resource/a-practical-guide-for-secure-mcp-server-development/
 */

require('dotenv').config();

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod/v4');
const aiSecurity = require('../src/utils/aiSecurity');
const {
  getJwtExpiryMs,
  getSessionFilePath,
  isJwtExpiring,
  normalizeApiBaseUrl,
  readSession,
  refreshWithRefreshToken,
  writeSession
} = require('./mcp-auth-session');

// ============================================================================
// CONFIGURATION WITH SECURE DEFAULTS
// ============================================================================

const API_BASE = normalizeApiBaseUrl(process.env.GRC_API_BASE_URL || 'http://localhost:3001/api/v1');
const SESSION_FILE = getSessionFilePath(process.env);
const HEALTH_URL = process.env.GRC_HEALTH_URL || `${API_BASE.replace(/\/api\/v1$/, '')}/health`;

let runtimeSession = null;
let refreshInFlight = null;

// Security configuration
const SECURITY_CONFIG = {
  // Rate limiting (requests per minute per tool)
  rateLimitPerMinute: parseInt(process.env.MCP_RATE_LIMIT || '30'),
  // Request timeout in milliseconds
  requestTimeoutMs: parseInt(process.env.MCP_REQUEST_TIMEOUT_MS || '30000'),
  // Maximum input length for text fields
  maxInputLength: parseInt(process.env.MCP_MAX_INPUT_LENGTH || '10000'),
  // Enable audit logging
  enableAuditLog: process.env.MCP_ENABLE_AUDIT_LOG !== 'false',
  // Enable detailed error messages (disable in production)
  verboseErrors: process.env.NODE_ENV !== 'production',
  // Maximum results returned per query
  maxResultLimit: parseInt(process.env.MCP_MAX_RESULT_LIMIT || '200')
};

// ============================================================================
// RATE LIMITING
// ============================================================================

class RateLimiter {
  constructor(requestsPerMinute) {
    this.limit = requestsPerMinute;
    this.requests = new Map(); // tool -> [{timestamp}]
  }

  checkLimit(toolName) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    if (!this.requests.has(toolName)) {
      this.requests.set(toolName, []);
    }
    
    const toolRequests = this.requests.get(toolName);
    // Remove old requests outside the time window
    const recentRequests = toolRequests.filter(ts => now - ts < windowMs);
    this.requests.set(toolName, recentRequests);
    
    if (recentRequests.length >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(recentRequests[0] + windowMs)
      };
    }
    
    recentRequests.push(now);
    return {
      allowed: true,
      remaining: this.limit - recentRequests.length,
      resetAt: new Date(now + windowMs)
    };
  }

  reset(toolName) {
    this.requests.delete(toolName);
  }
}

const rateLimiter = new RateLimiter(SECURITY_CONFIG.rateLimitPerMinute);

// ============================================================================
// AUDIT LOGGING
// ============================================================================

class AuditLogger {
  constructor(enabled) {
    this.enabled = enabled;
  }

  log(event, data) {
    if (!this.enabled) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      ...data
    };
    
    // Log to stderr (stdout is used for MCP protocol)
    console.error('[AUDIT]', JSON.stringify(logEntry));
  }

  toolInvocation(toolName, args, userId, organizationId, clientMetadata = null) {
    this.log('tool_invocation', {
      tool: toolName,
      args: this.sanitizeForLog(args),
      user_id: userId,
      organization_id: organizationId,
      ...(clientMetadata ? { client: clientMetadata } : {})
    });
  }

  toolSuccess(toolName, duration) {
    this.log('tool_success', {
      tool: toolName,
      duration_ms: duration
    });
  }

  toolError(toolName, error, duration) {
    this.log('tool_error', {
      tool: toolName,
      error: error.message,
      duration_ms: duration
    });
  }

  authenticationAttempt(success, reason = null) {
    this.log('authentication', {
      success,
      reason
    });
  }

  rateLimitExceeded(toolName) {
    this.log('rate_limit_exceeded', {
      tool: toolName
    });
  }

  sanitizeForLog(data) {
    // Remove sensitive fields from logs
    if (!data || typeof data !== 'object') return data;
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'api_key', 'apiKey'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }
    
    return sanitized;
  }
}

const auditLogger = new AuditLogger(SECURITY_CONFIG.enableAuditLog);

function loadRuntimeSession() {
  const persisted = readSession(SESSION_FILE);
  if (!persisted) return;

  if (persisted.apiBaseUrl && normalizeApiBaseUrl(persisted.apiBaseUrl) !== API_BASE) {
    console.error(`[WARNING] Ignoring MCP session from different API base: ${persisted.apiBaseUrl}`);
    console.error(`[WARNING] Current API base is ${API_BASE}. Run login again for this environment.`);
    return;
  }

  runtimeSession = {
    ...persisted,
    apiBaseUrl: API_BASE,
    accessTokenExpiresAt: persisted.accessTokenExpiresAt || (persisted.accessToken
      ? new Date(getJwtExpiryMs(persisted.accessToken) || Date.now()).toISOString()
      : null)
  };
}

function hasSessionAuth() {
  return Boolean(runtimeSession?.accessToken || runtimeSession?.refreshToken);
}

function persistRuntimeSession() {
  if (!runtimeSession) return;
  writeSession(SESSION_FILE, runtimeSession);
}

async function refreshSessionAccessToken(reason = 'unspecified') {
  if (!runtimeSession?.refreshToken) {
    throw new Error('Missing refresh token. Run "npm run mcp:login" from backend to authenticate MCP.');
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const accessToken = await refreshWithRefreshToken({
        apiBaseUrl: API_BASE,
        refreshToken: runtimeSession.refreshToken,
        timeoutMs: SECURITY_CONFIG.requestTimeoutMs
      });

      runtimeSession.accessToken = accessToken;
      runtimeSession.accessTokenExpiresAt = (() => {
        const expiryMs = getJwtExpiryMs(accessToken);
        return expiryMs ? new Date(expiryMs).toISOString() : null;
      })();
      runtimeSession.updatedAt = new Date().toISOString();
      persistRuntimeSession();

      auditLogger.log('authentication_refresh_success', { reason });
      return accessToken;
    })().catch((error) => {
      auditLogger.log('authentication_refresh_failed', {
        reason,
        error: error.message
      });
      throw error;
    }).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

async function resolveApiToken() {
  if (!hasSessionAuth()) {
    auditLogger.authenticationAttempt(false, 'missing_token');
    throw new Error('Missing MCP login session. Run "npm run mcp:login" in backend to authenticate MCP.');
  }

  if (!runtimeSession.accessToken) {
    return refreshSessionAccessToken('missing_access_token');
  }

  if (isJwtExpiring(runtimeSession.accessToken, 60000)) {
    try {
      return await refreshSessionAccessToken('access_token_expiring');
    } catch (error) {
      console.error(`[WARNING] Access token refresh failed: ${error.message}`);
    }
  }

  return runtimeSession.accessToken;
}

// ============================================================================
// INPUT VALIDATION & SANITIZATION
// ============================================================================

function validateAndSanitizeString(input, fieldName, maxLength = SECURITY_CONFIG.maxInputLength) {
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  
  if (input.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  
  // Remove potential control characters and null bytes
  return input.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Scan free-text MCP tool arguments for prompt injection / adversarial patterns.
 * Returns { detected, threatTypes } — callers decide whether to block or log.
 * (AIDEFEND: Adversarial Robustness, OWASP LLM01 - Prompt Injection)
 *
 * @param {Object} args - Tool argument object
 * @param {string[]} textFields - Field names containing free text to scan
 * @returns {{ detected: boolean, threatTypes: string }}
 */
function scanMcpTextArgs(args, textFields) {
  const threats = [];
  for (const field of textFields) {
    const value = args[field];
    if (typeof value !== 'string') continue;
    const { detected, threats: found } = aiSecurity.detectPromptInjection(value);
    if (detected) threats.push(...found);
  }
  const detected = threats.length > 0;
  const threatTypes = detected
    ? [...new Set(threats.map(t => t.label))].join(', ')
    : '';
  return { detected, threatTypes };
}

function validateUUID(input, fieldName) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(input)) {
    throw new Error(`${fieldName} is not a valid UUID`);
  }
  return input;
}

function sanitizeQueryParams(params) {
  const sanitized = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    // Prevent query parameter injection
    sanitized[key] = String(value).replace(/[^\w\s\-@.]/g, '');
  }
  return sanitized;
}

// ============================================================================
// SECURE API REQUEST WRAPPER
// ============================================================================

async function apiRequest(method, path, { query, body, auth = true } = {}) {
  const token = auth ? await resolveApiToken() : null;

  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const url = new URL(normalizedPath, `${API_BASE}/`);
  
  // Sanitize and apply query parameters
  if (query) {
    const sanitizedQuery = sanitizeQueryParams(query);
    for (const [key, value] of Object.entries(sanitizedQuery)) {
      url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      headers.Authorization = `Bearer ${attempt === 0 ? token : await resolveApiToken()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SECURITY_CONFIG.requestTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let parsed = null;

      try {
        parsed = responseText ? JSON.parse(responseText) : null;
      } catch {
        parsed = { raw: responseText };
      }

      if (response.status === 401 && auth && runtimeSession?.refreshToken && attempt === 0) {
        await refreshSessionAccessToken('received_401');
        continue;
      }

      if (!response.ok) {
        const message = parsed?.error || parsed?.message || `${response.status} ${response.statusText}`;
        throw new Error(`API request failed: ${message}`);
      }

      return parsed;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${SECURITY_CONFIG.requestTimeoutMs}ms`);
      }

      throw error;
    }
  }

  throw new Error('API request failed after retry');
}

// ============================================================================
// SECURE USER CONTEXT RESOLUTION
// ============================================================================

async function resolveOrganizationId(providedId) {
  if (providedId) {
    validateUUID(providedId, 'organization_id');
    return providedId;
  }
  
  const me = await apiRequest('GET', '/auth/me');
  const orgId = me?.data?.organization?.id;
  
  if (!orgId) {
    throw new Error('Could not resolve organization id from /auth/me');
  }
  
  return orgId;
}

async function getCurrentUser() {
  const me = await apiRequest('GET', '/auth/me');
  return {
    id: me?.data?.id,
    email: me?.data?.email,
    organizationId: me?.data?.organization?.id
  };
}

// ============================================================================
// RESPONSE HELPERS WITH DATA MINIMIZATION
// ============================================================================

function toJsonText(payload) {
  return JSON.stringify(payload, null, 2);
}

function ok(payload) {
  // Apply data minimization - remove sensitive fields
  const sanitized = sanitizeResponseData(payload);
  return {
    content: [{ type: 'text', text: toJsonText(sanitized) }]
  };
}

function fail(error) {
  const message = SECURITY_CONFIG.verboseErrors && error instanceof Error 
    ? error.message 
    : 'An error occurred';
    
  auditLogger.log('error_response', { 
    message: error instanceof Error ? error.message : String(error) 
  });
  
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  };
}

function sanitizeResponseData(data) {
  if (!data || typeof data !== 'object') return data;
  
  // Remove potentially sensitive fields from responses
  const sensitiveFields = ['password_hash', 'jwt_secret', 'api_key', 'secret'];
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponseData(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some(sf => key.toLowerCase().includes(sf))) {
      continue; // Skip sensitive fields
    }
    
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeResponseData(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// ============================================================================
// CLIENT METADATA DETECTION
// ============================================================================

function detectClientMetadata() {
  const metadata = {
    platform: process.platform,
    node_version: process.version,
    pid: process.pid
  };

  // Detect LLM client from environment variables or parent process
  // Claude Desktop, Cursor, and other MCP clients may set these
  if (process.env.MCP_CLIENT_NAME) {
    metadata.client_name = process.env.MCP_CLIENT_NAME;
  }
  if (process.env.MCP_CLIENT_VERSION) {
    metadata.client_version = process.env.MCP_CLIENT_VERSION;
  }
  
  // Try to detect from parent process command line (if available)
  try {
    const ppid = process.ppid;
    if (ppid) {
      metadata.parent_pid = ppid;
      // Common LLM client patterns in parent process
      const cmdline = process.title || '';
      if (cmdline.toLowerCase().includes('claude')) {
        metadata.client_name = metadata.client_name || 'Claude Desktop';
      } else if (cmdline.toLowerCase().includes('cursor')) {
        metadata.client_name = metadata.client_name || 'Cursor';
      }
    }
  } catch (err) {
    // Parent process detection failed, continue without it
  }

  return metadata;
}

// Store client metadata globally
const CLIENT_METADATA = detectClientMetadata();

// ============================================================================
// TOOL WRAPPER WITH SECURITY CONTROLS
// ============================================================================

function createSecureTool(toolName, description, inputSchema, handler) {
  return {
    description,
    inputSchema,
    handler: async (args) => {
      const startTime = Date.now();
      
      try {
        // 1. Rate limiting check
        const rateCheck = rateLimiter.checkLimit(toolName);
        if (!rateCheck.allowed) {
          auditLogger.rateLimitExceeded(toolName);
          return fail(new Error(
            `Rate limit exceeded. Try again after ${rateCheck.resetAt.toISOString()}`
          ));
        }
        
        // 2. Get current user context for audit logging
        let user = null;
        try {
          user = await getCurrentUser();
        } catch (err) {
          auditLogger.authenticationAttempt(false, 'invalid_or_expired_token');
          return fail(new Error('Authentication failed. Please check your token.'));
        }
        
        // 3. AIDEFEND: Scan free-text tool arguments for prompt injection BEFORE
        //    logging the invocation, so adversarial payloads are never written to logs.
        const safeArgs = args || {};
        const textArgs = Object.keys(safeArgs).filter(k => typeof safeArgs[k] === 'string');
        const { detected: injectionDetected, threatTypes } = scanMcpTextArgs(safeArgs, textArgs);
        if (injectionDetected) {
          auditLogger.log('aidefend_injection_blocked', {
            tool: toolName,
            user_id: user.id,
            organization_id: user.organizationId,
            threatTypes
          });
          return fail(new Error('Request blocked: invalid content detected in tool arguments'));
        }

        // 4. Log tool invocation with client metadata (only after injection check passes)
        auditLogger.toolInvocation(toolName, args, user.id, user.organizationId, CLIENT_METADATA);

        // 5. Execute the tool handler
        const result = await handler(args);
        
        // 6. Log success
        const duration = Date.now() - startTime;
        auditLogger.toolSuccess(toolName, duration);
        
        return result;
      } catch (error) {
        // Log error
        const duration = Date.now() - startTime;
        auditLogger.toolError(toolName, error, duration);
        return fail(error);
      }
    }
  };
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

const server = new McpServer({
  name: 'controlweave-mcp-secure',
  version: '2.0.0'
});

console.error('[SECURITY] MCP server starting with security enhancements enabled');
console.error('[SECURITY] Rate limit:', SECURITY_CONFIG.rateLimitPerMinute, 'req/min per tool');
console.error('[SECURITY] Request timeout:', SECURITY_CONFIG.requestTimeoutMs, 'ms');
console.error('[SECURITY] Audit logging:', SECURITY_CONFIG.enableAuditLog ? 'enabled' : 'disabled');

// ============================================================================
// TOOL REGISTRATIONS WITH ENHANCED SECURITY
// ============================================================================

// Health check (no auth required)
server.registerTool('grc_health', {
  description: 'Check AI GRC backend health and database connectivity. No authentication required.',
  inputSchema: {}
}, async () => {
  try {
    const response = await fetch(HEALTH_URL);
    const body = await response.json();
    return ok(body);
  } catch (error) {
    return fail(error);
  }
});

// Whoami - Get current user context
const whoamiTool = createSecureTool(
  'grc_whoami',
  'Return current authenticated user, organization, roles, and permissions. Requires valid JWT token.',
  {},
  async () => {
    return ok(await apiRequest('GET', '/auth/me'));
  }
);
server.registerTool('grc_whoami', whoamiTool, whoamiTool.handler);

// List frameworks
const listFrameworksTool = createSecureTool(
  'grc_list_frameworks',
  'List available compliance frameworks in the platform catalog.',
  {},
  async () => {
    return ok(await apiRequest('GET', '/frameworks'));
  }
);
server.registerTool('grc_list_frameworks', listFrameworksTool, listFrameworksTool.handler);

// Get dashboard stats
const dashboardStatsTool = createSecureTool(
  'grc_get_dashboard_stats',
  'Get dashboard compliance and activity summary statistics for the current user organization.',
  {},
  async () => {
    return ok(await apiRequest('GET', '/dashboard/stats'));
  }
);
server.registerTool('grc_get_dashboard_stats', dashboardStatsTool, dashboardStatsTool.handler);

// List controls with enhanced validation
const listControlsTool = createSecureTool(
  'grc_list_controls',
  'List controls for an organization with optional framework/status filtering.',
  {
    organization_id: z.string().uuid().optional().describe('Organization UUID. If omitted, uses current user organization.'),
    framework_id: z.string().uuid().optional().describe('Framework UUID filter.'),
    status: z.string().max(50).optional().describe('Implementation status filter (e.g., implemented, in_progress, not_started).')
  },
  async ({ organization_id, framework_id, status }) => {
    const orgId = await resolveOrganizationId(organization_id);
    
    const query = {
      frameworkId: framework_id,
      status: status ? validateAndSanitizeString(status, 'status', 50) : undefined
    };
    
    return ok(await apiRequest('GET', `/organizations/${orgId}/controls`, { query }));
  }
);
server.registerTool('grc_list_controls', listControlsTool, listControlsTool.handler);

// Update control implementation with input validation
const updateControlTool = createSecureTool(
  'grc_update_control_implementation',
  'Update implementation details for a specific control. Requires appropriate permissions.',
  {
    control_id: z.string().uuid().describe('Framework control UUID to update.'),
    status: z.string().max(50).describe('New status (implemented, in_progress, not_started, planned, etc.).'),
    implementation_details: z.string().max(SECURITY_CONFIG.maxInputLength).optional().describe('Implementation details text.'),
    evidence_url: z.string().url().max(2000).optional().describe('Evidence URL or reference.'),
    assigned_to: z.string().uuid().optional().describe('Assignee user UUID.'),
    notes: z.string().max(SECURITY_CONFIG.maxInputLength).optional().describe('Additional implementation notes.')
  },
  async ({ control_id, status, implementation_details, evidence_url, assigned_to, notes }) => {
    validateUUID(control_id, 'control_id');
    
    const body = {
      status: validateAndSanitizeString(status, 'status', 50),
      ...(implementation_details ? { 
        implementationDetails: validateAndSanitizeString(implementation_details, 'implementation_details') 
      } : {}),
      ...(evidence_url ? { 
        evidenceUrl: validateAndSanitizeString(evidence_url, 'evidence_url', 2000) 
      } : {}),
      ...(assigned_to ? { 
        assignedTo: validateUUID(assigned_to, 'assigned_to') 
      } : {}),
      ...(notes ? { 
        notes: validateAndSanitizeString(notes, 'notes') 
      } : {})
    };

    return ok(await apiRequest('PUT', `/controls/${control_id}/implementation`, { body }));
  }
);
server.registerTool('grc_update_control_implementation', updateControlTool, updateControlTool.handler);

// AI query with input validation
const aiQueryTool = createSecureTool(
  'grc_ai_query',
  'Run natural-language compliance Q&A against the organization data. Uses organization-configured LLM.',
  {
    question: z.string().min(3).max(SECURITY_CONFIG.maxInputLength).describe('Compliance question to ask.'),
    provider: z.enum(['claude', 'openai', 'gemini', 'grok']).optional().describe('Optional LLM provider override.'),
    model: z.string().max(100).optional().describe('Optional model override.')
  },
  async ({ question, provider, model }) => {
    const body = {
      question: validateAndSanitizeString(question, 'question'),
      ...(provider ? { provider } : {}),
      ...(model ? { model: validateAndSanitizeString(model, 'model', 100) } : {})
    };
    
    return ok(await apiRequest('POST', '/ai/query', { body }));
  }
);
server.registerTool('grc_ai_query', aiQueryTool, aiQueryTool.handler);

// List assessment procedures with pagination limits
const listProceduresTool = createSecureTool(
  'grc_list_assessment_procedures',
  'List assessment procedures with optional filters.',
  {
    framework_code: z.string().max(50).optional().describe('Framework code filter.'),
    control_id: z.string().max(100).optional().describe('Framework control id filter.'),
    procedure_type: z.string().max(50).optional().describe('Procedure type filter.'),
    depth: z.string().max(20).optional().describe('Assessment depth filter.'),
    search: z.string().max(200).optional().describe('Full-text search term.'),
    limit: z.number().int().min(1).max(SECURITY_CONFIG.maxResultLimit).optional().describe('Max results to return.'),
    offset: z.number().int().min(0).optional().describe('Pagination offset.')
  },
  async (args) => {
    // Sanitize all string inputs
    const sanitizedArgs = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        sanitizedArgs[key] = validateAndSanitizeString(value, key, 200);
      } else {
        sanitizedArgs[key] = value;
      }
    }
    
    return ok(await apiRequest('GET', '/assessments/procedures', { query: sanitizedArgs }));
  }
);
server.registerTool('grc_list_assessment_procedures', listProceduresTool, listProceduresTool.handler);

// List notifications with pagination limits
const listNotificationsTool = createSecureTool(
  'grc_list_notifications',
  'List notifications for the current user.',
  {
    unread: z.boolean().optional().describe('If true, return only unread notifications.'),
    limit: z.number().int().min(1).max(SECURITY_CONFIG.maxResultLimit).optional().describe('Max number of notifications.')
  },
  async ({ unread, limit }) => {
    const query = {
      unread: unread ? 'true' : undefined,
      limit
    };
    
    return ok(await apiRequest('GET', '/notifications', { query }));
  }
);
server.registerTool('grc_list_notifications', listNotificationsTool, listNotificationsTool.handler);

// ============================================================================
// EVIDENCE MANAGEMENT TOOLS
// ============================================================================

// List evidence with filtering
const listEvidenceTool = createSecureTool(
  'grc_list_evidence',
  'List evidence files for the organization with optional filtering.',
  {
    search: z.string().max(200).optional().describe('Search term for file name or description.'),
    tags: z.string().max(200).optional().describe('Comma-separated tags to filter by.'),
    limit: z.number().int().min(1).max(SECURITY_CONFIG.maxResultLimit).optional().describe('Maximum number of results.'),
    offset: z.number().int().min(0).optional().describe('Pagination offset.')
  },
  async ({ search, tags, limit, offset }) => {
    const query = {
      search: search ? validateAndSanitizeString(search, 'search', 200) : undefined,
      tags: tags ? validateAndSanitizeString(tags, 'tags', 200) : undefined,
      limit,
      offset
    };
    
    return ok(await apiRequest('GET', '/evidence', { query }));
  }
);
server.registerTool('grc_list_evidence', listEvidenceTool, listEvidenceTool.handler);

// Get single evidence details
const getEvidenceTool = createSecureTool(
  'grc_get_evidence',
  'Get details of a specific evidence file by ID.',
  {
    evidence_id: z.string().uuid().describe('Evidence UUID.')
  },
  async ({ evidence_id }) => {
    validateUUID(evidence_id, 'evidence_id');
    return ok(await apiRequest('GET', `/evidence/${evidence_id}`));
  }
);
server.registerTool('grc_get_evidence', getEvidenceTool, getEvidenceTool.handler);

// Link evidence to controls
const linkEvidenceTool = createSecureTool(
  'grc_link_evidence',
  'Link an evidence file to one or more controls. Requires evidence.write permission.',
  {
    evidence_id: z.string().uuid().describe('Evidence UUID to link.'),
    control_ids: z.array(z.string().uuid()).min(1).max(50).describe('Array of control UUIDs to link to (max 50).'),
    notes: z.string().max(SECURITY_CONFIG.maxInputLength).optional().describe('Optional notes about the link.')
  },
  async ({ evidence_id, control_ids, notes }) => {
    validateUUID(evidence_id, 'evidence_id');
    
    // Validate all control IDs
    for (const id of control_ids) {
      validateUUID(id, 'control_id');
    }
    
    const body = {
      controlIds: control_ids,
      notes: notes ? validateAndSanitizeString(notes, 'notes') : undefined
    };
    
    return ok(await apiRequest('POST', `/evidence/${evidence_id}/link`, { body }));
  }
);
server.registerTool('grc_link_evidence', linkEvidenceTool, linkEvidenceTool.handler);

// Unlink evidence from control
const unlinkEvidenceTool = createSecureTool(
  'grc_unlink_evidence',
  'Unlink an evidence file from a specific control. Requires evidence.write permission.',
  {
    evidence_id: z.string().uuid().describe('Evidence UUID.'),
    control_id: z.string().uuid().describe('Control UUID to unlink from.')
  },
  async ({ evidence_id, control_id }) => {
    validateUUID(evidence_id, 'evidence_id');
    validateUUID(control_id, 'control_id');
    
    return ok(await apiRequest('DELETE', `/evidence/${evidence_id}/unlink/${control_id}`));
  }
);
server.registerTool('grc_unlink_evidence', unlinkEvidenceTool, unlinkEvidenceTool.handler);

// Update evidence metadata
const updateEvidenceTool = createSecureTool(
  'grc_update_evidence',
  'Update evidence file metadata (description, tags, retention date). Requires evidence.write permission.',
  {
    evidence_id: z.string().uuid().describe('Evidence UUID to update.'),
    description: z.string().max(SECURITY_CONFIG.maxInputLength).optional().describe('Updated description.'),
    tags: z.array(z.string().max(50)).max(20).optional().describe('Updated tags array (max 20 tags, 50 chars each).'),
    retention_until: z.string().max(10).optional().describe('Retention date in YYYY-MM-DD format.')
  },
  async ({ evidence_id, description, tags, retention_until }) => {
    validateUUID(evidence_id, 'evidence_id');
    
    const body = {
      description: description ? validateAndSanitizeString(description, 'description') : undefined,
      tags: tags ? tags.map(t => validateAndSanitizeString(t, 'tag', 50)) : undefined,
      retention_until: retention_until ? validateAndSanitizeString(retention_until, 'retention_until', 10) : undefined
    };
    
    return ok(await apiRequest('PUT', `/evidence/${evidence_id}`, { body }));
  }
);
server.registerTool('grc_update_evidence', updateEvidenceTool, updateEvidenceTool.handler);

// ============================================================================
// ASSET/CMDB MANAGEMENT TOOLS
// ============================================================================

// List assets with filtering
const listAssetsTool = createSecureTool(
  'grc_list_assets',
  'List assets (hardware, software, AI agents, etc.) for the organization with optional filtering.',
  {
    category: z.string().max(50).optional().describe('Asset category code (e.g., hardware, software, ai_agent).'),
    status: z.string().max(50).optional().describe('Asset status filter (active, maintenance, deprecated, decommissioned).'),
    environment_id: z.string().uuid().optional().describe('Environment UUID filter.'),
    search: z.string().max(200).optional().describe('Search term for asset name, hostname, or IP address.')
  },
  async ({ category, status, environment_id, search }) => {
    const query = {
      category: category ? validateAndSanitizeString(category, 'category', 50) : undefined,
      status: status ? validateAndSanitizeString(status, 'status', 50) : undefined,
      environment_id: environment_id ? validateUUID(environment_id, 'environment_id') : undefined,
      search: search ? validateAndSanitizeString(search, 'search', 200) : undefined
    };
    
    return ok(await apiRequest('GET', '/assets', { query }));
  }
);
server.registerTool('grc_list_assets', listAssetsTool, listAssetsTool.handler);

// Get asset categories
const getAssetCategoriesTool = createSecureTool(
  'grc_get_asset_categories',
  'Get all available asset categories with tier restrictions.',
  {},
  async () => {
    return ok(await apiRequest('GET', '/assets/categories'));
  }
);
server.registerTool('grc_get_asset_categories', getAssetCategoriesTool, getAssetCategoriesTool.handler);

// Get single asset details
const getAssetTool = createSecureTool(
  'grc_get_asset',
  'Get detailed information about a specific asset by ID.',
  {
    asset_id: z.string().uuid().describe('Asset UUID.')
  },
  async ({ asset_id }) => {
    validateUUID(asset_id, 'asset_id');
    return ok(await apiRequest('GET', `/assets/${asset_id}`));
  }
);
server.registerTool('grc_get_asset', getAssetTool, getAssetTool.handler);

// Create new asset
const createAssetTool = createSecureTool(
  'grc_create_asset',
  'Create a new asset (hardware, software, AI agent, etc.). Requires assets.write permission and appropriate tier.',
  {
    category_id: z.string().uuid().describe('Asset category UUID (use grc_get_asset_categories to find valid IDs).'),
    name: z.string().min(1).max(200).describe('Asset name.'),
    asset_tag: z.string().max(100).optional().describe('Asset tag or identifier.'),
    serial_number: z.string().max(100).optional().describe('Serial number.'),
    model: z.string().max(100).optional().describe('Model name/number.'),
    manufacturer: z.string().max(100).optional().describe('Manufacturer name.'),
    location: z.string().max(200).optional().describe('Physical or logical location.'),
    environment_id: z.string().uuid().optional().describe('Environment UUID.'),
    status: z.enum(['active', 'maintenance', 'deprecated', 'decommissioned']).optional().describe('Asset status (default: active).'),
    security_classification: z.string().max(50).optional().describe('Security classification level.'),
    criticality: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Business criticality.'),
    ip_address: z.string().max(45).optional().describe('IP address (IPv4 or IPv6).'),
    hostname: z.string().max(255).optional().describe('Hostname.'),
    fqdn: z.string().max(255).optional().describe('Fully qualified domain name.'),
    version: z.string().max(100).optional().describe('Software/firmware version.'),
    notes: z.string().max(SECURITY_CONFIG.maxInputLength).optional().describe('Additional notes.')
  },
  async (params) => {
    // Validate UUIDs
    validateUUID(params.category_id, 'category_id');
    if (params.environment_id) {
      validateUUID(params.environment_id, 'environment_id');
    }
    
    // Sanitize string inputs
    const body = {
      category_id: params.category_id,
      name: validateAndSanitizeString(params.name, 'name', 200),
      asset_tag: params.asset_tag ? validateAndSanitizeString(params.asset_tag, 'asset_tag', 100) : undefined,
      serial_number: params.serial_number ? validateAndSanitizeString(params.serial_number, 'serial_number', 100) : undefined,
      model: params.model ? validateAndSanitizeString(params.model, 'model', 100) : undefined,
      manufacturer: params.manufacturer ? validateAndSanitizeString(params.manufacturer, 'manufacturer', 100) : undefined,
      location: params.location ? validateAndSanitizeString(params.location, 'location', 200) : undefined,
      environment_id: params.environment_id,
      status: params.status,
      security_classification: params.security_classification ? validateAndSanitizeString(params.security_classification, 'security_classification', 50) : undefined,
      criticality: params.criticality,
      ip_address: params.ip_address ? validateAndSanitizeString(params.ip_address, 'ip_address', 45) : undefined,
      hostname: params.hostname ? validateAndSanitizeString(params.hostname, 'hostname', 255) : undefined,
      fqdn: params.fqdn ? validateAndSanitizeString(params.fqdn, 'fqdn', 255) : undefined,
      version: params.version ? validateAndSanitizeString(params.version, 'version', 100) : undefined,
      notes: params.notes ? validateAndSanitizeString(params.notes, 'notes') : undefined
    };
    
    return ok(await apiRequest('POST', '/assets', { body }));
  }
);
server.registerTool('grc_create_asset', createAssetTool, createAssetTool.handler);

// Update existing asset
const updateAssetTool = createSecureTool(
  'grc_update_asset',
  'Update an existing asset. Requires assets.write permission. Only provided fields will be updated.',
  {
    asset_id: z.string().uuid().describe('Asset UUID to update.'),
    name: z.string().min(1).max(200).optional().describe('Updated asset name.'),
    asset_tag: z.string().max(100).optional().describe('Updated asset tag.'),
    status: z.enum(['active', 'maintenance', 'deprecated', 'decommissioned']).optional().describe('Updated status.'),
    location: z.string().max(200).optional().describe('Updated location.'),
    security_classification: z.string().max(50).optional().describe('Updated security classification.'),
    criticality: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Updated criticality.'),
    ip_address: z.string().max(45).optional().describe('Updated IP address.'),
    hostname: z.string().max(255).optional().describe('Updated hostname.'),
    version: z.string().max(100).optional().describe('Updated version.'),
    notes: z.string().max(SECURITY_CONFIG.maxInputLength).optional().describe('Updated notes.')
  },
  async (params) => {
    validateUUID(params.asset_id, 'asset_id');
    
    const body = {};
    if (params.name) body.name = validateAndSanitizeString(params.name, 'name', 200);
    if (params.asset_tag) body.asset_tag = validateAndSanitizeString(params.asset_tag, 'asset_tag', 100);
    if (params.status) body.status = params.status;
    if (params.location) body.location = validateAndSanitizeString(params.location, 'location', 200);
    if (params.security_classification) body.security_classification = validateAndSanitizeString(params.security_classification, 'security_classification', 50);
    if (params.criticality) body.criticality = params.criticality;
    if (params.ip_address) body.ip_address = validateAndSanitizeString(params.ip_address, 'ip_address', 45);
    if (params.hostname) body.hostname = validateAndSanitizeString(params.hostname, 'hostname', 255);
    if (params.version) body.version = validateAndSanitizeString(params.version, 'version', 100);
    if (params.notes) body.notes = validateAndSanitizeString(params.notes, 'notes');
    
    return ok(await apiRequest('PUT', `/assets/${params.asset_id}`, { body }));
  }
);
server.registerTool('grc_update_asset', updateAssetTool, updateAssetTool.handler);

// Delete asset
const deleteAssetTool = createSecureTool(
  'grc_delete_asset',
  'Delete an asset. Requires assets.write permission. Use with caution - this action cannot be undone.',
  {
    asset_id: z.string().uuid().describe('Asset UUID to delete.')
  },
  async ({ asset_id }) => {
    validateUUID(asset_id, 'asset_id');
    return ok(await apiRequest('DELETE', `/assets/${asset_id}`));
  }
);
server.registerTool('grc_delete_asset', deleteAssetTool, deleteAssetTool.handler);

// Get asset statistics
const getAssetStatsTool = createSecureTool(
  'grc_get_asset_stats',
  'Get asset statistics and summary for dashboard view.',
  {},
  async () => {
    return ok(await apiRequest('GET', '/assets/stats'));
  }
);
server.registerTool('grc_get_asset_stats', getAssetStatsTool, getAssetStatsTool.handler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function main() {
  loadRuntimeSession();

  // Validate required configuration
  if (!API_BASE) {
    throw new Error('GRC_API_BASE_URL is required');
  }
  
  if (!hasSessionAuth()) {
    console.error('[WARNING] No MCP authentication found. Most tools will fail authentication.');
    console.error('[WARNING] Run "npm run mcp:login" in backend to authenticate MCP.');
  }

  if (hasSessionAuth()) {
    console.error(`[INFO] Loaded MCP login session from ${SESSION_FILE}`);
  }
  
  // Option A: Startup Identity Verification
  // Display authenticated user info when server starts
  if (hasSessionAuth()) {
    try {
      console.error('[INFO] Verifying user identity...');
      const userInfo = await getCurrentUser();
      const userDetails = await apiRequest('GET', '/auth/me');
      
      const firstName = userDetails?.data?.first_name || '';
      const lastName = userDetails?.data?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'Unknown User';
      const email = userDetails?.data?.email || 'unknown@example.com';
      const orgName = userDetails?.data?.organization?.name || 'Unknown Organization';
      const role = userDetails?.data?.role || 'user';
      const permissions = userDetails?.data?.permissions || [];
      
      console.error('');
      console.error('='.repeat(70));
      console.error('  MCP SERVER IDENTITY VERIFICATION');
      console.error('='.repeat(70));
      console.error(`  Connected as: ${fullName} (${email})`);
      console.error(`  Organization: ${orgName}`);
      console.error(`  Role: ${role}`);
      console.error(`  Permissions: ${permissions.length} permission(s)`);
      console.error(`  User ID: ${userInfo.id}`);
      console.error(`  Org ID: ${userInfo.organizationId}`);
      console.error('='.repeat(70));
      console.error('');
      
      // Log identity verification to audit log
      auditLogger.log('identity_verified', {
        user_id: userInfo.id,
        email: email,
        organization_id: userInfo.organizationId,
        organization_name: orgName,
        role: role,
        client: CLIENT_METADATA
      });
      
    } catch (err) {
      console.error('[ERROR] Failed to verify user identity:', err.message);
      console.error('[WARNING] Server will start but authentication may fail on tool invocations.');
    }
  }
  
  // Log server start with client metadata (Option C)
  auditLogger.log('server_start', {
    api_base: API_BASE,
    security_config: SECURITY_CONFIG,
    client: CLIENT_METADATA
  });
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error(`[INFO] Secure AI GRC MCP server running on stdio (API: ${API_BASE})`);
  
  // Display client metadata
  if (CLIENT_METADATA.client_name) {
    console.error(`[INFO] Client: ${CLIENT_METADATA.client_name}${CLIENT_METADATA.client_version ? ' v' + CLIENT_METADATA.client_version : ''}`);
  }
  
  console.error('[INFO] Server ready to accept tool invocations');
}

// Graceful shutdown
process.on('SIGINT', () => {
  auditLogger.log('server_shutdown', { 
    reason: 'SIGINT',
    client: CLIENT_METADATA
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  auditLogger.log('server_shutdown', { 
    reason: 'SIGTERM',
    client: CLIENT_METADATA
  });
  process.exit(0);
});

main().catch((error) => {
  console.error('[ERROR] MCP server startup failed:', error);
  auditLogger.log('server_start_failed', { error: error.message });
  process.exit(1);
});
