// @tier: free
/**
 * MCP Tool Registry — Dynamic tool definitions for ControlWeave MCP Server
 *
 * All MCP tools are defined here. The MCP server loads tools from this registry
 * at startup, so adding a new tool is a single-file change.
 *
 * Each tool definition has:
 *   - name        : unique tool identifier
 *   - category    : logical grouping for documentation / discovery
 *   - description : tool description surfaced to the LLM
 *   - inputSchema : Zod schema object (or {} for no params)
 *   - handler     : async (args, { apiRequest, resolveOrganizationId }) => MCP result
 */

const z = require('zod/v4');

// Re-usable schema fragments
const uuidOpt = () => z.string().uuid().optional();
const uuidReq = () => z.string().uuid();
const searchStr = () => z.string().max(200).optional();
const limitOpt = (max = 200) => z.number().int().min(1).max(max).optional();
const offsetOpt = () => z.number().int().min(0).optional();

// ---------------------------------------------------------------------------
// TOOL DEFINITIONS
// ---------------------------------------------------------------------------

const tools = [

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM & AUTH
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'grc_health',
    category: 'system',
    description: 'Check AI GRC backend health and database connectivity. No authentication required.',
    inputSchema: {},
    // grc_health is special — it calls the health endpoint without auth
    noAuth: true,
    handler: async (_args, { healthUrl }) => {
      const response = await fetch(healthUrl);
      const body = await response.json();
      return body;
    }
  },
  {
    name: 'grc_whoami',
    category: 'system',
    description: 'Return current authenticated user, organization, roles, and permissions. Requires valid JWT token.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/auth/me');
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE & FRAMEWORKS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'grc_list_frameworks',
    category: 'compliance',
    description: 'List available compliance frameworks in the platform catalog.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/frameworks');
    }
  },
  {
    name: 'grc_get_dashboard_stats',
    category: 'compliance',
    description: 'Get dashboard compliance and activity summary statistics for the current user organization.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/dashboard/stats');
    }
  },
  {
    name: 'grc_list_controls',
    category: 'compliance',
    description: 'List controls for an organization with optional framework/status filtering.',
    inputSchema: {
      organization_id: uuidOpt().describe('Organization UUID. If omitted, uses current user organization.'),
      framework_id: uuidOpt().describe('Framework UUID filter.'),
      status: z.string().max(50).optional().describe('Implementation status filter (e.g., implemented, in_progress, not_started).')
    },
    handler: async ({ organization_id, framework_id, status }, { apiRequest, resolveOrganizationId, sanitize }) => {
      const orgId = await resolveOrganizationId(organization_id);
      const query = {
        frameworkId: framework_id,
        status: status ? sanitize(status, 'status', 50) : undefined
      };
      return await apiRequest('GET', `/organizations/${orgId}/controls`, { query });
    }
  },
  {
    name: 'grc_update_control_implementation',
    category: 'compliance',
    description: 'Update implementation details for a specific control. Requires appropriate permissions.',
    inputSchema: {
      control_id: uuidReq().describe('Framework control UUID to update.'),
      status: z.string().max(50).describe('New status (implemented, in_progress, not_started, planned, etc.).'),
      implementation_details: z.string().max(10000).optional().describe('Implementation details text.'),
      evidence_url: z.string().url().max(2000).optional().describe('Evidence URL or reference.'),
      assigned_to: uuidOpt().describe('Assignee user UUID.'),
      notes: z.string().max(10000).optional().describe('Additional implementation notes.')
    },
    handler: async ({ control_id, status, implementation_details, evidence_url, assigned_to, notes }, { apiRequest, sanitize, validateUUID }) => {
      validateUUID(control_id, 'control_id');
      const body = {
        status: sanitize(status, 'status', 50),
        ...(implementation_details ? { implementationDetails: sanitize(implementation_details, 'implementation_details') } : {}),
        ...(evidence_url ? { evidenceUrl: sanitize(evidence_url, 'evidence_url', 2000) } : {}),
        ...(assigned_to ? { assignedTo: validateUUID(assigned_to, 'assigned_to') } : {}),
        ...(notes ? { notes: sanitize(notes, 'notes') } : {})
      };
      return await apiRequest('PUT', `/controls/${control_id}/implementation`, { body });
    }
  },
  {
    name: 'grc_get_crosswalk_mappings',
    category: 'compliance',
    description: 'Get crosswalk mappings for a specific control — shows equivalent controls across other frameworks with similarity scores.',
    inputSchema: {
      control_id: uuidReq().describe('Control UUID to get crosswalk mappings for.')
    },
    handler: async ({ control_id }, { apiRequest, validateUUID }) => {
      validateUUID(control_id, 'control_id');
      return await apiRequest('GET', `/controls/${control_id}/mappings`);
    }
  },
  {
    name: 'grc_ai_query',
    category: 'compliance',
    description: 'Run natural-language compliance Q&A against the organization data. Uses organization-configured LLM.',
    inputSchema: {
      question: z.string().min(3).max(10000).describe('Compliance question to ask.'),
      provider: z.enum(['claude', 'openai', 'gemini', 'grok']).optional().describe('Optional LLM provider override.'),
      model: z.string().max(100).optional().describe('Optional model override.')
    },
    handler: async ({ question, provider, model }, { apiRequest, sanitize }) => {
      const body = {
        question: sanitize(question, 'question'),
        ...(provider ? { provider } : {}),
        ...(model ? { model: sanitize(model, 'model', 100) } : {})
      };
      return await apiRequest('POST', '/ai/query', { body });
    }
  },
  {
    name: 'grc_list_assessment_procedures',
    category: 'compliance',
    description: 'List assessment procedures with optional filters.',
    inputSchema: {
      framework_code: z.string().max(50).optional().describe('Framework code filter.'),
      control_id: z.string().max(100).optional().describe('Framework control id filter.'),
      procedure_type: z.string().max(50).optional().describe('Procedure type filter.'),
      depth: z.string().max(20).optional().describe('Assessment depth filter.'),
      search: searchStr().describe('Full-text search term.'),
      limit: limitOpt().describe('Max results to return.'),
      offset: offsetOpt().describe('Pagination offset.')
    },
    handler: async (args, { apiRequest, sanitize }) => {
      const sanitizedArgs = {};
      for (const [key, value] of Object.entries(args)) {
        if (typeof value === 'string') {
          sanitizedArgs[key] = sanitize(value, key, 200);
        } else {
          sanitizedArgs[key] = value;
        }
      }
      return await apiRequest('GET', '/assessments/procedures', { query: sanitizedArgs });
    }
  },
  {
    name: 'grc_list_notifications',
    category: 'compliance',
    description: 'List notifications for the current user.',
    inputSchema: {
      unread: z.boolean().optional().describe('If true, return only unread notifications.'),
      limit: limitOpt().describe('Max number of notifications.')
    },
    handler: async ({ unread, limit }, { apiRequest }) => {
      const query = {
        unread: unread ? 'true' : undefined,
        limit
      };
      return await apiRequest('GET', '/notifications', { query });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // POA&M (Plan of Action & Milestones)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'poam_list',
    category: 'poam',
    description: 'List POA&M (Plan of Action & Milestones) items for the organization. Supports filtering by status, risk level, and framework.',
    inputSchema: {
      status: z.enum(['draft', 'open', 'in_progress', 'completed', 'closed', 'cancelled']).optional().describe('Filter by POA&M status.'),
      risk_level: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by risk level.'),
      limit: limitOpt().describe('Max results to return.'),
      offset: offsetOpt().describe('Pagination offset.')
    },
    handler: async ({ status, risk_level, limit, offset }, { apiRequest }) => {
      return await apiRequest('GET', '/poam', { query: { status, risk_level, limit, offset } });
    }
  },
  {
    name: 'poam_get',
    category: 'poam',
    description: 'Get full details of a specific POA&M item including milestones, updates, and approval history.',
    inputSchema: {
      poam_id: uuidReq().describe('POA&M UUID.')
    },
    handler: async ({ poam_id }, { apiRequest, validateUUID }) => {
      validateUUID(poam_id, 'poam_id');
      return await apiRequest('GET', `/poam/${poam_id}`);
    }
  },
  {
    name: 'poam_create',
    category: 'poam',
    description: 'Create a new POA&M item. Requires appropriate write permissions.',
    inputSchema: {
      title: z.string().min(1).max(500).describe('POA&M title.'),
      description: z.string().max(10000).optional().describe('Detailed description of the weakness or finding.'),
      risk_level: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Risk level.'),
      control_id: uuidOpt().describe('Related control UUID.'),
      scheduled_completion_date: z.string().max(10).optional().describe('Target completion date (YYYY-MM-DD).'),
      assigned_to: uuidOpt().describe('Assignee user UUID.'),
      milestones: z.string().max(10000).optional().describe('Key milestones text.')
    },
    handler: async (args, { apiRequest, sanitize }) => {
      const body = {
        title: sanitize(args.title, 'title', 500),
        ...(args.description ? { description: sanitize(args.description, 'description') } : {}),
        ...(args.risk_level ? { risk_level: args.risk_level } : {}),
        ...(args.control_id ? { control_id: args.control_id } : {}),
        ...(args.scheduled_completion_date ? { scheduled_completion_date: args.scheduled_completion_date } : {}),
        ...(args.assigned_to ? { assigned_to: args.assigned_to } : {}),
        ...(args.milestones ? { milestones: sanitize(args.milestones, 'milestones') } : {})
      };
      return await apiRequest('POST', '/poam', { body });
    }
  },
  {
    name: 'poam_update',
    category: 'poam',
    description: 'Update an existing POA&M item. Only provided fields will be updated.',
    inputSchema: {
      poam_id: uuidReq().describe('POA&M UUID to update.'),
      status: z.enum(['draft', 'open', 'in_progress', 'completed', 'closed', 'cancelled']).optional().describe('Updated status.'),
      risk_level: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Updated risk level.'),
      description: z.string().max(10000).optional().describe('Updated description.'),
      scheduled_completion_date: z.string().max(10).optional().describe('Updated target completion date (YYYY-MM-DD).'),
      assigned_to: uuidOpt().describe('Updated assignee user UUID.'),
      milestones: z.string().max(10000).optional().describe('Updated milestones text.')
    },
    handler: async ({ poam_id, ...updates }, { apiRequest, validateUUID, sanitize }) => {
      validateUUID(poam_id, 'poam_id');
      const body = {};
      if (updates.status) body.status = updates.status;
      if (updates.risk_level) body.risk_level = updates.risk_level;
      if (updates.description) body.description = sanitize(updates.description, 'description');
      if (updates.scheduled_completion_date) body.scheduled_completion_date = updates.scheduled_completion_date;
      if (updates.assigned_to) body.assigned_to = updates.assigned_to;
      if (updates.milestones) body.milestones = sanitize(updates.milestones, 'milestones');
      return await apiRequest('PATCH', `/poam/${poam_id}`, { body });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'reports_list_types',
    category: 'reports',
    description: 'List available compliance report types (PDF, Excel, SSP, etc.) and their descriptions.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/reports/types');
    }
  },
  {
    name: 'reports_generate_compliance',
    category: 'reports',
    description: 'Generate a compliance report. Returns report metadata and download information.',
    inputSchema: {
      format: z.enum(['pdf', 'excel', 'json']).describe('Report output format.'),
      type: z.enum(['compliance', 'ssp']).optional().describe('Report type. Defaults to compliance.'),
      framework_id: uuidOpt().describe('Optional framework UUID to scope the report.')
    },
    handler: async ({ format, type, framework_id }, { apiRequest }) => {
      const reportType = type || 'compliance';
      const path = reportType === 'ssp'
        ? `/reports/ssp/${format === 'excel' ? 'json' : format}`
        : `/reports/compliance/${format}`;
      return await apiRequest('GET', path, { query: { framework_id } });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXCEPTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'exceptions_list',
    category: 'exceptions',
    description: 'List compliance exceptions (risk acceptances, compensating controls, temporary waivers).',
    inputSchema: {
      status: z.enum(['pending', 'approved', 'rejected', 'expired', 'revoked']).optional().describe('Filter by exception status.'),
      limit: limitOpt().describe('Max results to return.'),
      offset: offsetOpt().describe('Pagination offset.')
    },
    handler: async ({ status, limit, offset }, { apiRequest }) => {
      return await apiRequest('GET', '/exceptions', { query: { status, limit, offset } });
    }
  },
  {
    name: 'exceptions_create',
    category: 'exceptions',
    description: 'Create a new compliance exception request. Requires appropriate permissions.',
    inputSchema: {
      title: z.string().min(1).max(500).describe('Exception title.'),
      description: z.string().max(10000).optional().describe('Justification and description of the exception.'),
      control_id: uuidOpt().describe('Related control UUID.'),
      exception_type: z.enum(['risk_acceptance', 'compensating_control', 'temporary_waiver']).optional().describe('Type of exception.'),
      expiration_date: z.string().max(10).optional().describe('Expiration date (YYYY-MM-DD).')
    },
    handler: async (args, { apiRequest, sanitize }) => {
      const body = {
        title: sanitize(args.title, 'title', 500),
        ...(args.description ? { description: sanitize(args.description, 'description') } : {}),
        ...(args.control_id ? { control_id: args.control_id } : {}),
        ...(args.exception_type ? { exception_type: args.exception_type } : {}),
        ...(args.expiration_date ? { expiration_date: args.expiration_date } : {})
      };
      return await apiRequest('POST', '/exceptions', { body });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'audit_list_logs',
    category: 'audit',
    description: 'List audit log entries for the organization. Read-only access to the compliance audit trail.',
    inputSchema: {
      event_type: z.string().max(100).optional().describe('Filter by event type.'),
      user_id: uuidOpt().describe('Filter by user UUID.'),
      limit: limitOpt().describe('Max results to return.'),
      offset: offsetOpt().describe('Pagination offset.')
    },
    handler: async ({ event_type, user_id, limit, offset }, { apiRequest }) => {
      return await apiRequest('GET', '/audit/logs', { query: { event_type, user_id, limit, offset } });
    }
  },
  {
    name: 'audit_get_stats',
    category: 'audit',
    description: 'Get audit log statistics — event counts by type, active users, and recent activity summary.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/audit/stats');
    }
  },
  {
    name: 'audit_log_event',
    category: 'audit',
    description: 'Create an audit log entry. Use this to report significant events back to ControlWeave — configuration changes, policy decisions, access reviews, or any action the AI agent performed that should be tracked for compliance (AU-2).',
    inputSchema: {
      event_type: z.string().min(1).max(100).describe('Event type identifier (e.g. "ai_agent_action", "policy_review", "access_decision", "configuration_change").'),
      resource_type: z.string().max(100).optional().describe('Type of resource affected (e.g. "control", "evidence", "asset", "poam").'),
      resource_id: z.string().max(255).optional().describe('ID of the affected resource.'),
      details: z.string().max(5000).optional().describe('JSON-encoded details about the event — what happened, why, and any relevant context.'),
      outcome: z.string().max(100).optional().describe('Outcome of the action (e.g. "success", "failure", "denied", "escalated").')
    },
    handler: async (args, { apiRequest, sanitize }) => {
      const body = {
        event_type: sanitize(args.event_type, 'event_type', 100),
        source_system: 'mcp_agent',
        ...(args.resource_type ? { resource_type: sanitize(args.resource_type, 'resource_type', 100) } : {}),
        ...(args.resource_id ? { resource_id: sanitize(args.resource_id, 'resource_id', 255) } : {}),
        ...(args.details ? { details: args.details } : {}),
        ...(args.outcome ? { outcome: sanitize(args.outcome, 'outcome', 100) } : {})
      };
      return await apiRequest('POST', '/audit/logs', { body });
    }
  },
  {
    name: 'audit_log_ai_decision',
    category: 'audit',
    description: 'Log an AI decision for compliance tracking. Records the input, output, risk level, bias flags, and reasoning of an AI-generated decision. Required for EU AI Act Article 12 record-keeping and NIST AI RMF traceability. The decision is queued for human review.',
    inputSchema: {
      feature: z.string().min(1).max(200).describe('AI feature or use case (e.g. "gap_analysis", "remediation_playbook", "risk_scoring", "vendor_assessment").'),
      input_summary: z.string().max(5000).describe('Summary of the input provided to the AI (what was asked or analyzed).'),
      output_summary: z.string().max(5000).describe('Summary of the AI output (the decision, recommendation, or analysis produced).'),
      risk_level: z.enum(['limited', 'low', 'medium', 'high', 'critical']).optional().describe('Risk level of this AI decision. Defaults to "limited".'),
      reasoning: z.string().max(5000).optional().describe('Explanation of the AI reasoning or methodology used to reach the decision.'),
      bias_flags: z.array(z.string().max(200)).optional().describe('Array of potential bias indicators detected (e.g. ["demographic_parity_concern", "underrepresented_group_impact"]).'),
      regulatory_framework: z.string().max(100).optional().describe('Applicable regulatory framework (e.g. "EU AI Act", "NIST AI RMF", "ISO 42001").'),
      confidence_score: z.number().min(0).max(1).optional().describe('Confidence score of the AI output (0.0 to 1.0).'),
      correlation_id: z.string().max(255).optional().describe('Correlation ID to link related decisions together.'),
      model_version: z.string().max(200).optional().describe('Model or LLM version used for this decision.')
    },
    handler: async (args, { apiRequest, sanitize }) => {
      const body = {
        feature: sanitize(args.feature, 'feature', 200),
        input_data: { summary: args.input_summary },
        output_data: { summary: args.output_summary },
        risk_level: args.risk_level || 'limited',
        decision_source: 'mcp_agent',
        ...(args.reasoning ? { reasoning: sanitize(args.reasoning, 'reasoning', 5000) } : {}),
        ...(args.bias_flags ? { bias_flags: args.bias_flags } : {}),
        ...(args.regulatory_framework ? { regulatory_framework: sanitize(args.regulatory_framework, 'regulatory_framework', 100) } : {}),
        ...(args.confidence_score != null ? { confidence_score: args.confidence_score } : {}),
        ...(args.correlation_id ? { correlation_id: sanitize(args.correlation_id, 'correlation_id', 255) } : {}),
        ...(args.model_version ? { model_version: sanitize(args.model_version, 'model_version', 200) } : {})
      };
      return await apiRequest('POST', '/ai/decisions', { body });
    }
  },
  {
    name: 'audit_list_ai_decisions',
    category: 'audit',
    description: 'List AI decision log entries for the organization. Shows decisions pending human review, bias flags, risk levels, and review status. Use this to check which AI decisions need review.',
    inputSchema: {
      reviewed: z.enum(['true', 'false']).optional().describe('Filter by review status — "true" for reviewed, "false" for pending review.'),
      risk_level: z.enum(['limited', 'low', 'medium', 'high', 'critical']).optional().describe('Filter by risk level.'),
      feature: z.string().max(200).optional().describe('Filter by AI feature name.'),
      decision_source: z.string().max(100).optional().describe('Filter by decision source (e.g. "mcp_agent", "internal", "external").'),
      page: z.number().int().min(1).optional().describe('Page number (default 1).'),
      limit: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100).')
    },
    handler: async (args, { apiRequest }) => {
      const query = {
        ...(args.reviewed ? { reviewed: args.reviewed } : {}),
        ...(args.risk_level ? { risk_level: args.risk_level } : {}),
        ...(args.feature ? { feature: args.feature } : {}),
        ...(args.decision_source ? { decision_source: args.decision_source } : {}),
        ...(args.page ? { page: args.page } : {}),
        ...(args.limit ? { limit: args.limit } : {})
      };
      return await apiRequest('GET', '/ai/decisions', { query });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EVIDENCE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'grc_list_evidence',
    category: 'evidence',
    description: 'List evidence files for the organization with optional filtering.',
    inputSchema: {
      search: searchStr().describe('Search term for file name or description.'),
      tags: z.string().max(200).optional().describe('Comma-separated tags to filter by.'),
      limit: limitOpt().describe('Maximum number of results.'),
      offset: offsetOpt().describe('Pagination offset.')
    },
    handler: async ({ search, tags, limit, offset }, { apiRequest, sanitize }) => {
      const query = {
        search: search ? sanitize(search, 'search', 200) : undefined,
        tags: tags ? sanitize(tags, 'tags', 200) : undefined,
        limit,
        offset
      };
      return await apiRequest('GET', '/evidence', { query });
    }
  },
  {
    name: 'grc_get_evidence',
    category: 'evidence',
    description: 'Get details of a specific evidence file by ID.',
    inputSchema: {
      evidence_id: uuidReq().describe('Evidence UUID.')
    },
    handler: async ({ evidence_id }, { apiRequest, validateUUID }) => {
      validateUUID(evidence_id, 'evidence_id');
      return await apiRequest('GET', `/evidence/${evidence_id}`);
    }
  },
  {
    name: 'grc_link_evidence',
    category: 'evidence',
    description: 'Link an evidence file to one or more controls. Requires evidence.write permission.',
    inputSchema: {
      evidence_id: uuidReq().describe('Evidence UUID to link.'),
      control_ids: z.array(z.string().uuid()).min(1).max(50).describe('Array of control UUIDs to link to (max 50).'),
      notes: z.string().max(10000).optional().describe('Optional notes about the link.')
    },
    handler: async ({ evidence_id, control_ids, notes }, { apiRequest, validateUUID, sanitize }) => {
      validateUUID(evidence_id, 'evidence_id');
      for (const id of control_ids) { validateUUID(id, 'control_id'); }
      const body = {
        controlIds: control_ids,
        notes: notes ? sanitize(notes, 'notes') : undefined
      };
      return await apiRequest('POST', `/evidence/${evidence_id}/link`, { body });
    }
  },
  {
    name: 'grc_unlink_evidence',
    category: 'evidence',
    description: 'Unlink an evidence file from a specific control. Requires evidence.write permission.',
    inputSchema: {
      evidence_id: uuidReq().describe('Evidence UUID.'),
      control_id: uuidReq().describe('Control UUID to unlink from.')
    },
    handler: async ({ evidence_id, control_id }, { apiRequest, validateUUID }) => {
      validateUUID(evidence_id, 'evidence_id');
      validateUUID(control_id, 'control_id');
      return await apiRequest('DELETE', `/evidence/${evidence_id}/unlink/${control_id}`);
    }
  },
  {
    name: 'grc_update_evidence',
    category: 'evidence',
    description: 'Update evidence file metadata (description, tags, retention date). Requires evidence.write permission.',
    inputSchema: {
      evidence_id: uuidReq().describe('Evidence UUID to update.'),
      description: z.string().max(10000).optional().describe('Updated description.'),
      tags: z.array(z.string().max(50)).max(20).optional().describe('Updated tags array (max 20 tags, 50 chars each).'),
      retention_until: z.string().max(10).optional().describe('Retention date in YYYY-MM-DD format.')
    },
    handler: async ({ evidence_id, description, tags, retention_until }, { apiRequest, validateUUID, sanitize }) => {
      validateUUID(evidence_id, 'evidence_id');
      const body = {
        description: description ? sanitize(description, 'description') : undefined,
        tags: tags ? tags.map(t => sanitize(t, 'tag', 50)) : undefined,
        retention_until: retention_until ? sanitize(retention_until, 'retention_until', 10) : undefined
      };
      return await apiRequest('PUT', `/evidence/${evidence_id}`, { body });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSET / CMDB MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'grc_list_assets',
    category: 'assets',
    description: 'List assets (hardware, software, AI agents, etc.) for the organization with optional filtering.',
    inputSchema: {
      category: z.string().max(50).optional().describe('Asset category code (e.g., hardware, software, ai_agent).'),
      status: z.string().max(50).optional().describe('Asset status filter (active, maintenance, deprecated, decommissioned).'),
      environment_id: uuidOpt().describe('Environment UUID filter.'),
      search: searchStr().describe('Search term for asset name, hostname, or IP address.')
    },
    handler: async ({ category, status, environment_id, search }, { apiRequest, sanitize, validateUUID: vUUID }) => {
      const query = {
        category: category ? sanitize(category, 'category', 50) : undefined,
        status: status ? sanitize(status, 'status', 50) : undefined,
        environment_id: environment_id ? vUUID(environment_id, 'environment_id') : undefined,
        search: search ? sanitize(search, 'search', 200) : undefined
      };
      return await apiRequest('GET', '/assets', { query });
    }
  },
  {
    name: 'grc_get_asset_categories',
    category: 'assets',
    description: 'Get all available asset categories with tier restrictions.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/assets/categories');
    }
  },
  {
    name: 'grc_get_asset',
    category: 'assets',
    description: 'Get detailed information about a specific asset by ID.',
    inputSchema: {
      asset_id: uuidReq().describe('Asset UUID.')
    },
    handler: async ({ asset_id }, { apiRequest, validateUUID }) => {
      validateUUID(asset_id, 'asset_id');
      return await apiRequest('GET', `/assets/${asset_id}`);
    }
  },
  {
    name: 'grc_create_asset',
    category: 'assets',
    description: 'Create a new asset (hardware, software, AI agent, etc.). Requires assets.write permission and appropriate tier.',
    inputSchema: {
      category_id: uuidReq().describe('Asset category UUID (use grc_get_asset_categories to find valid IDs).'),
      name: z.string().min(1).max(200).describe('Asset name.'),
      asset_tag: z.string().max(100).optional().describe('Asset tag or identifier.'),
      serial_number: z.string().max(100).optional().describe('Serial number.'),
      model: z.string().max(100).optional().describe('Model name/number.'),
      manufacturer: z.string().max(100).optional().describe('Manufacturer name.'),
      location: z.string().max(200).optional().describe('Physical or logical location.'),
      environment_id: uuidOpt().describe('Environment UUID.'),
      status: z.enum(['active', 'maintenance', 'deprecated', 'decommissioned']).optional().describe('Asset status (default: active).'),
      security_classification: z.string().max(50).optional().describe('Security classification level.'),
      criticality: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Business criticality.'),
      ip_address: z.string().max(45).optional().describe('IP address (IPv4 or IPv6).'),
      hostname: z.string().max(255).optional().describe('Hostname.'),
      fqdn: z.string().max(255).optional().describe('Fully qualified domain name.'),
      version: z.string().max(100).optional().describe('Software/firmware version.'),
      notes: z.string().max(10000).optional().describe('Additional notes.')
    },
    handler: async (params, { apiRequest, validateUUID, sanitize }) => {
      validateUUID(params.category_id, 'category_id');
      if (params.environment_id) validateUUID(params.environment_id, 'environment_id');
      const body = {
        category_id: params.category_id,
        name: sanitize(params.name, 'name', 200),
        asset_tag: params.asset_tag ? sanitize(params.asset_tag, 'asset_tag', 100) : undefined,
        serial_number: params.serial_number ? sanitize(params.serial_number, 'serial_number', 100) : undefined,
        model: params.model ? sanitize(params.model, 'model', 100) : undefined,
        manufacturer: params.manufacturer ? sanitize(params.manufacturer, 'manufacturer', 100) : undefined,
        location: params.location ? sanitize(params.location, 'location', 200) : undefined,
        environment_id: params.environment_id,
        status: params.status,
        security_classification: params.security_classification ? sanitize(params.security_classification, 'security_classification', 50) : undefined,
        criticality: params.criticality,
        ip_address: params.ip_address ? sanitize(params.ip_address, 'ip_address', 45) : undefined,
        hostname: params.hostname ? sanitize(params.hostname, 'hostname', 255) : undefined,
        fqdn: params.fqdn ? sanitize(params.fqdn, 'fqdn', 255) : undefined,
        version: params.version ? sanitize(params.version, 'version', 100) : undefined,
        notes: params.notes ? sanitize(params.notes, 'notes') : undefined
      };
      return await apiRequest('POST', '/assets', { body });
    }
  },
  {
    name: 'grc_update_asset',
    category: 'assets',
    description: 'Update an existing asset. Requires assets.write permission. Only provided fields will be updated.',
    inputSchema: {
      asset_id: uuidReq().describe('Asset UUID to update.'),
      name: z.string().min(1).max(200).optional().describe('Updated asset name.'),
      asset_tag: z.string().max(100).optional().describe('Updated asset tag.'),
      status: z.enum(['active', 'maintenance', 'deprecated', 'decommissioned']).optional().describe('Updated status.'),
      location: z.string().max(200).optional().describe('Updated location.'),
      security_classification: z.string().max(50).optional().describe('Updated security classification.'),
      criticality: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Updated criticality.'),
      ip_address: z.string().max(45).optional().describe('Updated IP address.'),
      hostname: z.string().max(255).optional().describe('Updated hostname.'),
      version: z.string().max(100).optional().describe('Updated version.'),
      notes: z.string().max(10000).optional().describe('Updated notes.')
    },
    handler: async (params, { apiRequest, validateUUID, sanitize }) => {
      validateUUID(params.asset_id, 'asset_id');
      const body = {};
      if (params.name) body.name = sanitize(params.name, 'name', 200);
      if (params.asset_tag) body.asset_tag = sanitize(params.asset_tag, 'asset_tag', 100);
      if (params.status) body.status = params.status;
      if (params.location) body.location = sanitize(params.location, 'location', 200);
      if (params.security_classification) body.security_classification = sanitize(params.security_classification, 'security_classification', 50);
      if (params.criticality) body.criticality = params.criticality;
      if (params.ip_address) body.ip_address = sanitize(params.ip_address, 'ip_address', 45);
      if (params.hostname) body.hostname = sanitize(params.hostname, 'hostname', 255);
      if (params.version) body.version = sanitize(params.version, 'version', 100);
      if (params.notes) body.notes = sanitize(params.notes, 'notes');
      return await apiRequest('PUT', `/assets/${params.asset_id}`, { body });
    }
  },
  {
    name: 'grc_delete_asset',
    category: 'assets',
    description: 'Delete an asset. Requires assets.write permission. Use with caution — this action cannot be undone.',
    inputSchema: {
      asset_id: uuidReq().describe('Asset UUID to delete.')
    },
    handler: async ({ asset_id }, { apiRequest, validateUUID }) => {
      validateUUID(asset_id, 'asset_id');
      return await apiRequest('DELETE', `/assets/${asset_id}`);
    }
  },
  {
    name: 'grc_get_asset_stats',
    category: 'assets',
    description: 'Get asset statistics and summary for dashboard view.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/assets/stats');
    }
  },
  {
    name: 'cmdb_get_asset_vulnerabilities',
    category: 'assets',
    description: 'Get open vulnerability counts and severity breakdown for a specific CMDB asset.',
    inputSchema: {
      asset_id: uuidReq().describe('Asset UUID.')
    },
    handler: async ({ asset_id }, { apiRequest, validateUUID }) => {
      validateUUID(asset_id, 'asset_id');
      return await apiRequest('GET', `/assets/${asset_id}/vulnerabilities`);
    }
  },
  {
    name: 'cmdb_import_analyze',
    category: 'assets',
    description: 'Analyze a CSV or JSON asset export from an external CMDB tool and get AI-suggested field mappings to the ControlWeave asset schema.',
    inputSchema: {
      file_content: z.string().describe('Raw text content of the CSV or JSON file to analyze.'),
      file_name: z.string().describe('File name including extension (.csv or .json).')
    },
    handler: async ({ file_content, file_name }, { apiRequest }) => {
      return await apiRequest('POST', '/cmdb/import/analyze', { body: { file_content, file_name } });
    }
  },
  {
    name: 'cmdb_import_commit',
    category: 'assets',
    description: 'Commit a CMDB import using confirmed field mappings. Supports dry-run validation and optional upsert of existing assets.',
    inputSchema: {
      rows: z.array(z.record(z.string(), z.unknown())).describe('Array of raw row objects from the source file.'),
      mappings: z.record(z.string(), z.string()).describe('Map of source column name → ControlWeave field name.'),
      asset_type: z.string().describe('Asset category name (e.g. hardware, software, ai_agent, service_account).'),
      update_existing: z.boolean().optional().describe('If true, update existing assets matched by name. Default false (skip duplicates).'),
      dry_run: z.boolean().optional().describe('If true, validate without writing to the database.')
    },
    handler: async (args, { apiRequest }) => {
      return await apiRequest('POST', '/cmdb/import/commit', { body: args });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TPRM (Third-Party Risk Management)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'tprm_list_vendors',
    category: 'tprm',
    description: 'List third-party vendors in the TPRM registry. Returns vendor name, risk tier, status, and last assessment date.',
    inputSchema: {
      status: z.enum(['active', 'inactive', 'pending_review']).optional().describe('Filter by vendor status.'),
      risk_tier: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by inherent risk tier.'),
      search: z.string().optional().describe('Search vendors by name or description.')
    },
    handler: async ({ status, risk_tier, search }, { apiRequest }) => {
      return await apiRequest('GET', '/tprm/vendors', { query: { status, risk_tier, search } });
    }
  },
  {
    name: 'tprm_get_vendor',
    category: 'tprm',
    description: 'Get full details of a specific TPRM vendor including AI risk assessment and linked assets.',
    inputSchema: {
      vendor_id: uuidReq().describe('Vendor UUID.')
    },
    handler: async ({ vendor_id }, { apiRequest }) => {
      return await apiRequest('GET', `/tprm/vendors/${vendor_id}`);
    }
  },
  {
    name: 'tprm_create_vendor',
    category: 'tprm',
    description: 'Create a new third-party vendor record in the TPRM registry.',
    inputSchema: {
      name: z.string().min(1).describe('Vendor name.'),
      description: z.string().optional().describe('Vendor description or service summary.'),
      website: z.string().optional().describe('Vendor website URL.'),
      contact_email: z.string().email().optional().describe('Primary contact email.'),
      risk_tier: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Inherent risk tier.'),
      services_provided: z.string().optional().describe('Description of services provided.')
    },
    handler: async (args, { apiRequest }) => {
      return await apiRequest('POST', '/tprm/vendors', { body: args });
    }
  },
  {
    name: 'tprm_list_questionnaires',
    category: 'tprm',
    description: 'List TPRM questionnaires with their status (draft, sent, submitted, reviewed).',
    inputSchema: {
      vendor_id: uuidOpt().describe('Filter by vendor UUID.'),
      status: z.enum(['draft', 'sent', 'submitted', 'reviewed']).optional().describe('Filter by questionnaire status.')
    },
    handler: async ({ vendor_id, status }, { apiRequest }) => {
      return await apiRequest('GET', '/tprm/questionnaires', { query: { vendor_id, status } });
    }
  },
  {
    name: 'tprm_send_questionnaire',
    category: 'tprm',
    description: 'Send a TPRM questionnaire to the vendor via email. Generates a secure token link for the vendor portal.',
    inputSchema: {
      questionnaire_id: uuidReq().describe('Questionnaire UUID to send.'),
      message: z.string().optional().describe('Optional custom message to include in the email.')
    },
    handler: async ({ questionnaire_id, message }, { apiRequest }) => {
      return await apiRequest('POST', `/tprm/questionnaires/${questionnaire_id}/send`, { body: { message } });
    }
  },
  {
    name: 'tprm_get_summary',
    category: 'tprm',
    description: 'Get TPRM programme summary: vendor counts by risk tier, questionnaire completion rates, outstanding items.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/tprm/summary');
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THIRD-PARTY AI GOVERNANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'ai_governance_get_summary',
    category: 'ai_governance',
    description: 'Get Third-Party AI Governance summary: vendor count, concentration risk (vendors with high/critical business criticality), open incidents, and unapproved supply chain components. Requires Professional tier.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/ai-governance/summary');
    }
  },
  {
    name: 'ai_governance_list_vendors',
    category: 'ai_governance',
    description: 'List AI vendor assessments including risk level, vendor type (llm_provider, ml_platform, data_provider, ai_tool), and per-dimension risk scores (security, privacy, compliance, operational). Requires Professional tier.',
    inputSchema: {
      risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by overall risk level.'),
      vendor_type: z.enum(['llm_provider', 'ml_platform', 'data_provider', 'ai_tool', 'consulting']).optional().describe('Filter by vendor type.'),
      search: searchStr().describe('Search vendors by name.'),
      limit: limitOpt(100),
      offset: offsetOpt()
    },
    handler: async ({ risk_level, vendor_type, search, limit, offset }, { apiRequest }) => {
      return await apiRequest('GET', '/ai-governance/vendors', { query: { risk_level, vendor_type, search, limit, offset } });
    }
  },
  {
    name: 'ai_governance_get_vendor',
    category: 'ai_governance',
    description: 'Get full details of a specific AI vendor assessment including all risk dimension scores, model transparency rating, bias testing evidence, data provenance clarity, subprocessors, and contract dates. Requires Professional tier.',
    inputSchema: {
      vendor_id: uuidReq().describe('AI vendor assessment UUID.')
    },
    handler: async ({ vendor_id }, { apiRequest }) => {
      return await apiRequest('GET', `/ai-governance/vendors/${vendor_id}`);
    }
  },
  {
    name: 'ai_governance_list_incidents',
    category: 'ai_governance',
    description: 'List AI vendor incidents (security breaches, data leaks, service outages, compliance violations, model failures) with severity and regulatory reporting flag. Requires Professional tier.',
    inputSchema: {
      vendor_assessment_id: uuidOpt().describe('Filter by vendor assessment UUID.'),
      status: z.enum(['open', 'closed']).optional().describe('Filter by incident status.'),
      incident_type: z.enum(['security_breach', 'data_leak', 'service_outage', 'compliance_violation', 'model_failure']).optional().describe('Filter by incident type.')
    },
    handler: async ({ vendor_assessment_id, status, incident_type }, { apiRequest }) => {
      return await apiRequest('GET', '/ai-governance/incidents', { query: { vendor_assessment_id, status, incident_type } });
    }
  },
  {
    name: 'ai_governance_list_supply_chain',
    category: 'ai_governance',
    description: 'List AI supply chain components (models, datasets, libraries, APIs) with approval status and provenance verification. Use this to understand third-party AI dependencies and identify unapproved components. Requires Professional tier.',
    inputSchema: {
      source_vendor_id: uuidOpt().describe('Filter by source vendor assessment UUID.'),
      component_type: z.enum(['model', 'dataset', 'library', 'infrastructure', 'api', 'tool']).optional().describe('Filter by component type.'),
      approved_for_use: z.boolean().optional().describe('Filter by approval status.')
    },
    handler: async ({ source_vendor_id, component_type, approved_for_use }, { apiRequest }) => {
      return await apiRequest('GET', '/ai-governance/supply-chain', { query: { source_vendor_id, component_type, approved_for_use } });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THREAT INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'threat_intel_get_stats',
    category: 'threat_intel',
    description: 'Get threat intelligence summary: active feed count, total items, critical/high severity counts, and items with known exploits. Requires Professional tier.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/threat-intel/stats');
    }
  },
  {
    name: 'threat_intel_list_items',
    category: 'threat_intel',
    description: 'List threat intelligence items (CVEs, indicators of compromise) from integrated feeds (NVD, CISA KEV, MITRE ATT&CK, AlienVault OTX) with CVSS scores and exploit-available flags. Requires Professional tier.',
    inputSchema: {
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Filter by severity.'),
      exploit_available: z.boolean().optional().describe('Filter to items with known exploits only.'),
      search: searchStr().describe('Search by CVE ID, title, or description.'),
      limit: limitOpt(100),
      offset: offsetOpt()
    },
    handler: async ({ severity, exploit_available, search, limit, offset }, { apiRequest }) => {
      return await apiRequest('GET', '/threat-intel/items', { query: { severity, exploit_available, search, limit, offset } });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSSWALK / CONTROL INHERITANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'grc_trigger_crosswalk_inherit',
    category: 'compliance',
    description: 'Manually trigger crosswalk inheritance for a control — propagates the control\'s implementation status to all mapped controls in other active frameworks that meet the configured similarity threshold (default 90%). Returns the count of controls auto-satisfied and the list of inheritance events created.',
    inputSchema: {
      control_id: uuidReq().describe('Source control UUID to trigger inheritance from.'),
      inherited_status: z.enum(['implemented', 'satisfied_via_crosswalk', 'in_progress', 'not_started']).optional().describe('Override the status to inherit (defaults to the source control\'s current status).')
    },
    handler: async ({ control_id, inherited_status }, { apiRequest }) => {
      return await apiRequest('POST', `/controls/${control_id}/inherit`, { body: inherited_status ? { inheritedStatus: inherited_status } : {} });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HELP CENTER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'grc_help_index',
    category: 'help',
    description: 'List all available in-app help articles for the current user\'s tier.',
    inputSchema: {},
    handler: async (_args, { apiRequest }) => {
      return await apiRequest('GET', '/help');
    }
  },
  {
    name: 'grc_help_article',
    category: 'help',
    description: 'Get the full content of a specific help article by slug (e.g. "getting-started", "tprm-guide", "cmdb-import").',
    inputSchema: {
      slug: z.string().describe('Help article slug identifier.')
    },
    handler: async ({ slug }, { apiRequest }) => {
      return await apiRequest('GET', `/help/${slug}`);
    }
  }
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Returns an array of all tool definitions.
 * Each tool has: name, category, description, inputSchema, handler, noAuth?
 */
function getTools() {
  return tools;
}

/**
 * Returns tools filtered by category.
 */
function getToolsByCategory(category) {
  return tools.filter(t => t.category === category);
}

/**
 * Returns the list of unique categories.
 */
function getCategories() {
  return [...new Set(tools.map(t => t.category))];
}

module.exports = { getTools, getToolsByCategory, getCategories };
