// @tier: community
const express = require('express');
const router = express.Router();
const { authenticate, requirePermission, requireTier } = require('../middleware/auth');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const llm = require('../services/llmService');
const auditService = require('../services/auditService');
const pool = require('../config/database');
const { normalizeTier, shouldEnforceAiLimitForByok, getByokPolicy } = require('../config/tierPolicy');

const aiOrgRateLimiter = createOrgRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  label: 'ai-org'
});

const aiDecisionWriteLimiter = createOrgRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  label: 'ai-decision-write'
});

const MAX_ERROR_MESSAGE_LENGTH = 500;
const UNAVAILABLE_SWARM_ERROR = 'Multi-agent orchestration requires a build that includes enterprise swarm services.';
const VALID_DECISION_SOURCES = ['platform', 'byok', 'external', 'mcp_agent'];

// All AI routes require authentication
router.use(authenticate);
router.use(requirePermission('ai.use'));
router.use(aiOrgRateLimiter);

// ---------- Middleware: Check AI usage limits ----------
async function checkAIUsage(req, res, next) {
  try {
    const params = await getAIParams(req);
    const tier = normalizeTier(req.user.organization_tier);
    const limit = llm.getUsageLimit(tier);
    const enforceByokLimits = shouldEnforceAiLimitForByok(tier);

    if (!enforceByokLimits) {
      const resolvedKey = await llm.resolveApiKey(params.provider, req.user.organization_id);
      if (resolvedKey.source === 'organization') {
        req.aiUsageRemaining = 'unlimited';
        req.aiUsageByok = true;
        req.aiUsageKeySource = resolvedKey.source;
        return next();
      }
    }

    // -1 means unlimited
    if (limit === -1) return next();

    const used = await llm.getUsageCount(req.user.organization_id);
    if (used >= limit) {
      return res.status(429).json({
        success: false,
        error: 'AI usage limit reached',
        message: `Your ${tier} tier allows ${limit} AI requests per month. You've used ${used}. Upgrade for more.`,
        currentTier: tier,
        used,
        limit,
        upgradeRequired: true
      });
    }

    req.aiUsageRemaining = limit - used;
    req.aiUsageByok = false;
    req.aiUsageKeySource = null;
    next();
  } catch (err) {
    console.error('AI usage check error:', err);
    next();
  }
}

// Helper: extract provider/model from request
// Uses the org's saved default_provider/default_model when none is explicitly supplied
async function getAIParams(req) {
  const explicitProvider = req.body.provider || req.query.provider;
  const explicitModel = req.body.model || req.query.model || null;
  const organizationId = req.user.organization_id;
  const provider = explicitProvider || await llm.getOrgDefaultProvider(organizationId);
  const model = explicitModel || await llm.getOrgDefaultModel(organizationId);
  return {
    provider,
    model,
    organizationId
  };
}

// Helper: extract agent metadata from request headers for tracking
// Supports agentic AI tracking through custom headers
function extractAgentMetadata(req) {
  const metadata = {
    agentId: req.headers['x-agent-id'] || req.body.agentId || null,
    agentContext: req.headers['x-agent-context'] || req.body.agentContext || null,
    dataSources: req.headers['x-data-sources'] || req.body.dataSources || null,
    agentVersion: req.headers['x-agent-version'] || req.body.agentVersion || null,
  };
  
  // Build data_lineage string from provided metadata
  const lineageParts = [];
  if (metadata.agentId) lineageParts.push(`Agent: ${metadata.agentId}`);
  if (metadata.agentVersion) lineageParts.push(`Version: ${metadata.agentVersion}`);
  if (metadata.dataSources) lineageParts.push(`Sources: ${metadata.dataSources}`);
  if (metadata.agentContext) lineageParts.push(`Context: ${metadata.agentContext}`);
  
  return {
    ...metadata,
    dataLineage: lineageParts.length > 0 ? lineageParts.join(' | ') : null
  };
}

// Helper: wrap AI handler with logging
function aiHandler(feature, fn, opts = {}) {
  return async (req, res) => {
    const agentMetadata = extractAgentMetadata(req);
    const startMs = Date.now();
    let resultText = null;
    const correlationId = require('crypto').randomUUID();
    const sessionId = req.headers['x-request-id'] || require('crypto').randomUUID();
    let params = {
      provider: null,
      model: null,
      organizationId: req.user.organization_id
    };
    try {
      params = await getAIParams(req);
      const tracked = await llm.withAITrackingContext(() => fn(req, params));
      const result = tracked?.result;
      const durationMs = Date.now() - startMs;
      const tracking = tracked?.tracking || null;
      const resolvedProvider = tracking?.usedProvider || params.provider;
      const resolvedModel = tracking?.usedModel || params.model;
      const fallbackUsed = !!tracking?.fallbackUsed;

      // Capture text output for high-stakes decision logging
      if (typeof result === 'string') resultText = result;
      else if (result && typeof result === 'object') resultText = JSON.stringify(result);

      // Log usage with extended context
      await llm.logAIUsage(params.organizationId, req.user.id, feature, resolvedProvider, resolvedModel, {
        success: true,
        byokUsed: !!req.aiUsageByok,
        ipAddress: req.ip || null,
        durationMs,
        resourceType: opts.resourceType ? (typeof opts.resourceType === 'function' ? opts.resourceType(req) : opts.resourceType) : null,
        resourceId: opts.resourceId ? (typeof opts.resourceId === 'function' ? opts.resourceId(req) : opts.resourceId) : null,
      }).catch(() => {});

      // For high-stakes features, also write to ai_decision_log with hashed I/O and agent metadata
      const inputContext = JSON.stringify(req.body || {});
      await llm.logAIDecision(params.organizationId, feature, inputContext, resultText, {
        modelVersion: resolvedModel || null,
        correlationId,
        sessionId,
        resourceType: opts.resourceType ? (typeof opts.resourceType === 'function' ? opts.resourceType(req) : opts.resourceType) : null,
        resourceId: opts.resourceId ? (typeof opts.resourceId === 'function' ? opts.resourceId(req) : opts.resourceId) : null,
        dataLineage: agentMetadata.dataLineage,
      }).catch(() => {});

      if (fallbackUsed) {
        await auditService.logFromRequest(req, {
          organizationId: params.organizationId,
          eventType: 'ai.provider_fallback.used',
          resourceType: 'ai_feature',
          resourceId: null,
          details: {
            feature,
            requestedProvider: params.provider || null,
            requestedModel: params.model || null,
            resolvedProvider: resolvedProvider || null,
            resolvedModel: resolvedModel || null,
            attempts: tracking?.attempts || []
          },
          success: true,
          sourceSystem: 'controlweave-ai'
        }).catch(() => {});
      }

      res.json({ success: true, data: { result, feature, provider: resolvedProvider, model: resolvedModel, fallbackUsed } });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      console.error(`AI ${feature} error:`, err);
      const statusCode = err.statusCode || 500;
      const knownMessage = typeof err.message === 'string' ? err.message : '';
      const hasMissingKeyError = /no api key configured/i.test(knownMessage);
      const hasQuotaError = /(quota exceeded|rate limit|too many requests|429|exceeded your current quota)/i.test(knownMessage);

      // Still log failed attempts
      await llm.logAIUsage(params.organizationId, req.user.id, feature, params.provider, params.model, {
        success: false,
        errorMessage: knownMessage ? knownMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH) : 'Unknown error',
        byokUsed: !!req.aiUsageByok,
        ipAddress: req.ip || null,
        durationMs,
      }).catch(() => {});

      const responseStatus = hasMissingKeyError ? 400 : (hasQuotaError ? 429 : statusCode);

      res.status(responseStatus).json({
        success: false,
        error: hasMissingKeyError || responseStatus === 400
          ? 'No AI API key configured. Add one in Settings > LLM Configuration.'
          : hasQuotaError
            ? 'AI provider quota/rate limit reached. Retry shortly or switch provider in Settings > LLM Configuration.'
          : `AI ${feature} failed`,
        message: responseStatus >= 500
          ? 'AI analysis failed on the server. Check backend logs and provider configuration.'
          : undefined
      });
    }
  };
}

// ======================== STATUS ========================
router.get('/status', async (req, res) => {
  try {
    const tier = normalizeTier(req.user.organization_tier);
    const limit = llm.getUsageLimit(tier);
    const used = await llm.getUsageCount(req.user.organization_id);
    const byokPolicy = getByokPolicy();
    const enforceByokLimits = shouldEnforceAiLimitForByok(tier);

    // Check for org-level keys
    const orgClaudeKey  = await llm.getOrgApiKey(req.user.organization_id, 'claude');
    const orgOpenAIKey  = await llm.getOrgApiKey(req.user.organization_id, 'openai');
    const orgGeminiKey  = await llm.getOrgApiKey(req.user.organization_id, 'gemini');
    const orgGrokKey    = await llm.getOrgApiKey(req.user.organization_id, 'grok');
    const orgGroqKey    = await llm.getOrgApiKey(req.user.organization_id, 'groq');
    const orgOllamaUrl  = await llm.getOrgApiKey(req.user.organization_id, 'ollama');

    const status = llm.getProviderStatus({
      claude: orgClaudeKey,
      openai: orgOpenAIKey,
      gemini: orgGeminiKey,
      grok:   orgGrokKey,
      groq:   orgGroqKey,
      ollama: orgOllamaUrl
    });

    res.json({
      success: true,
      data: {
        providers: {
          claude:  { available: status.claude.available, models: status.claude.models, hasOrgKey: !!orgClaudeKey },
          openai:  { available: status.openai.available, models: status.openai.models, hasOrgKey: !!orgOpenAIKey },
          gemini:  { available: status.gemini.available, models: status.gemini.models, hasOrgKey: !!orgGeminiKey },
          grok:    { available: status.grok.available, models: status.grok.models, hasOrgKey: !!orgGrokKey },
          groq:    { available: status.groq.available, models: status.groq.models, hasOrgKey: !!orgGroqKey },
          ollama:  { available: status.ollama.available, models: status.ollama.models, hasOrgKey: !!orgOllamaUrl }
        },
        usage: (() => {
          // When BYOK bypass applies for this tier AND the org has at least one
          // provider key configured, the 10-req/month community cap is not
          // enforced at call time — reflect that accurately here so UI consumers
          // don't show a misleading "10 / 10 used" bar for BYOK users.
          const hasOrgKey = !!(orgClaudeKey || orgOpenAIKey || orgGeminiKey || orgGrokKey || orgGroqKey || orgOllamaUrl);
          const byokUnlimited = !enforceByokLimits && hasOrgKey;
          const effectiveUnlimited = limit === -1 || byokUnlimited;
          return {
            used,
            limit: effectiveUnlimited ? 'unlimited' : limit,
            remaining: effectiveUnlimited ? 'unlimited' : Math.max(0, limit - used),
            byokUnlimited
          };
        })(),
        byokPolicy: {
          limitAppliesToByok: enforceByokLimits,
          mode: byokPolicy.mode,
          bypassTiers: byokPolicy.bypassTiers || []
        },
        tier,
        bias_coverage: await (async () => {
          try {
            const bc = await pool.query(
              `SELECT
                COUNT(*) FILTER (WHERE bias_flags != '[]'::jsonb) as decisions_with_bias_flags,
                COUNT(*) FILTER (WHERE bias_flags != '[]'::jsonb AND bias_reviewed = true) as bias_flags_reviewed,
                COUNT(*) FILTER (WHERE risk_level = 'high' AND human_reviewed = false) as high_risk_unreviewed
               FROM ai_decision_log WHERE organization_id = $1`,
              [req.user.organization_id]
            );
            return {
              decisions_with_bias_flags: parseInt(bc.rows[0].decisions_with_bias_flags) || 0,
              bias_flags_reviewed: parseInt(bc.rows[0].bias_flags_reviewed) || 0,
              high_risk_unreviewed: parseInt(bc.rows[0].high_risk_unreviewed) || 0
            };
          } catch { return null; }
        })(),
        features: {
          // All features available to all tiers, just usage-limited
          gapAnalysis: true,
          crosswalkOptimizer: true,
          complianceForecasting: true,
          regulatoryMonitor: true,
          remediationPlaybooks: true,
          incidentResponse: true,
          executiveReports: true,
          riskHeatmap: true,
          vendorRisk: true,
          auditReadiness: true,
          assetControlMapping: true,
          shadowITDetection: true,
          aiGovernance: true,
          complianceQuery: true,
          trainingRecommendations: true,
          evidenceAssistant: true,
          controlAnalysis: true,
          testProcedures: true,
          assetRisk: true,
          policyGenerator: true,
          iavmAssetAlert: true,
          chat: true
        }
      }
    });
  } catch (err) {
    console.error('AI status error:', err);
    res.status(500).json({ success: false, error: 'Failed to get AI status' });
  }
});

// ======================== 1. GAP ANALYSIS ========================
router.post('/gap-analysis', checkAIUsage, aiHandler('gap_analysis', (req, params) =>
  llm.generateGapAnalysis(params)
));

// ======================== 2. CROSSWALK OPTIMIZER ========================
router.post('/crosswalk-optimizer', checkAIUsage, aiHandler('crosswalk_optimizer', (req, params) =>
  llm.optimizeCrosswalk(params)
));

// ======================== 3. COMPLIANCE FORECASTING ========================
router.post('/compliance-forecast', checkAIUsage, aiHandler('compliance_forecast', (req, params) =>
  llm.forecastCompliance(params)
));

// ======================== 4. REGULATORY MONITOR ========================
router.post('/regulatory-monitor', checkAIUsage, aiHandler('regulatory_monitor', (req, params) =>
  llm.monitorRegulatoryChanges({ ...params, frameworks: req.body.frameworks })
));

// ======================== 5. REMEDIATION PLAYBOOKS ========================
router.post('/remediation/:controlId', checkAIUsage, aiHandler('remediation_playbook', (req, params) =>
  llm.generateRemediationPlaybook({ ...params, controlId: req.params.controlId })
));

// ======================== VULNERABILITY REMEDIATION ========================
router.post('/remediation/vulnerability/:vulnerabilityId', checkAIUsage, aiHandler('vulnerability_remediation', (req, params) =>
  llm.generateVulnerabilityRemediation({ ...params, vulnerabilityId: req.params.vulnerabilityId })
));

// ======================== IAVM ASSET ALERT ========================
// Matches a DoD IAVM notice against org assets and generates a prioritized
// AI-powered risk alert with remediation guidance.
router.post('/iavm-asset-alert', checkAIUsage, aiHandler('iavm_asset_alert', (req, params) => {
  const { iavmId, title, description, affectedProducts, severity } = req.body;
  if (!iavmId && !title) {
    throw Object.assign(new Error('At least one of iavmId or title is required'), { statusCode: 400 });
  }
  return llm.generateIAVMAssetAlert({ ...params, iavmId, title, description, affectedProducts, severity });
}));

// ======================== 6. INCIDENT RESPONSE ========================
router.post('/incident-response', checkAIUsage, aiHandler('incident_response', (req, params) =>
  llm.generateIncidentResponsePlan({ ...params, incidentType: req.body.incidentType })
));

// ======================== 7. EXECUTIVE REPORT ========================
router.post('/executive-report', checkAIUsage, aiHandler('executive_report', (req, params) =>
  llm.generateExecutiveReport(params)
));

// ======================== 8. RISK HEATMAP ========================
router.post('/risk-heatmap', checkAIUsage, aiHandler('risk_heatmap', (req, params) =>
  llm.generateRiskHeatmap(params)
));

// ======================== 9. VENDOR RISK ========================
router.post('/vendor-risk', checkAIUsage, aiHandler('vendor_risk', (req, params) =>
  llm.assessVendorRisk({ ...params, vendorInfo: req.body.vendorInfo })
));

// ======================== TPRM: GENERATE QUESTIONNAIRE ========================
router.post('/tprm/generate-questionnaire', checkAIUsage, aiHandler('tprm_questionnaire_generate', (req, params) =>
  llm.generateVendorQuestionnaire({ ...params, vendorInfo: req.body.vendorInfo })
));

// ======================== TPRM: ANALYZE QUESTIONNAIRE RESPONSES ========================
router.post('/tprm/analyze-responses', checkAIUsage, aiHandler('tprm_responses_analyze', (req, params) =>
  llm.analyzeQuestionnaireResponses({
    ...params,
    vendorInfo: req.body.vendorInfo,
    questions: req.body.questions,
    responses: req.body.responses
  })
));

// ======================== TPRM: ANALYZE VENDOR EVIDENCE (SBOM + DOCUMENTS) ========================
// Loads evidence from DB for the given questionnaire ID, then runs AI analysis
router.post('/tprm/analyze-evidence', checkAIUsage, async (req, res) => {
  const params = await getAIParams(req);
  const { questionnaireId } = req.body || {};

  if (!questionnaireId) {
    return res.status(400).json({ success: false, error: 'questionnaireId is required' });
  }

  try {
    const orgId = req.user.organization_id;

    // Load questionnaire + vendor info
    const qResult = await pool.query(
      `SELECT q.id, q.title, q.questions, q.responses,
              v.vendor_name, v.vendor_type, v.risk_tier, v.services_provided, v.data_access_level
       FROM tprm_questionnaires q
       JOIN tprm_vendors v ON v.id = q.vendor_id
       WHERE q.id = $1 AND q.organization_id = $2`,
      [questionnaireId, orgId]
    );

    if (qResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Questionnaire not found' });
    }

    const q = qResult.rows[0];

    // Load all evidence for this questionnaire (including file_content for documents)
    const evidenceResult = await pool.query(
      `SELECT id, original_filename, file_size_bytes, mime_type,
              is_sbom, sbom_format, sbom_component_count, sbom_summary,
              file_content, ai_analyzed_at
       FROM tprm_evidence
       WHERE questionnaire_id = $1
       ORDER BY uploaded_at`,
      [questionnaireId]
    );

    if (evidenceResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No evidence files found for this questionnaire. Evidence can be uploaded by the vendor via their questionnaire link, or by your team using the Evidence panel on the Questionnaires tab.' });
    }

    const vendorInfo = {
      vendor_name: q.vendor_name,
      vendor_type: q.vendor_type,
      risk_tier: q.risk_tier,
      services_provided: q.services_provided,
      data_access_level: q.data_access_level
    };

    const correlationId = require('crypto').randomUUID();
    const startMs = Date.now();

    const result = await llm.analyzeVendorEvidence({
      ...params,
      vendorInfo,
      questionnaireTitle: q.title,
      questions: q.questions,
      responses: q.responses,
      evidenceList: evidenceResult.rows
    });

    const durationMs = Date.now() - startMs;

    await llm.logAIUsage(orgId, req.user.id, 'tprm_evidence_analyze', params.provider, params.model, {
      success: true, byokUsed: !!req.aiUsageByok, durationMs
    }).catch(() => {});

    await llm.logAIDecision(orgId, 'tprm_evidence_analyze', JSON.stringify({ questionnaireId }), String(result), {
      correlationId, modelVersion: params.model || null
    }).catch(() => {});

    res.json({ success: true, data: { result, feature: 'tprm_evidence_analyze', provider: params.provider, evidence_count: evidenceResult.rows.length } });
  } catch (err) {
    console.error('TPRM analyze-evidence AI error:', err);
    res.status(500).json({ success: false, error: 'AI evidence analysis failed' });
  }
});

// ======================== 10. AUDIT READINESS ========================
router.post('/audit-readiness', checkAIUsage, aiHandler('audit_readiness', (req, params) =>
  llm.assessAuditReadiness({ ...params, framework: req.body.framework })
));

// ======================== AUDITOR AI: PBC DRAFT ========================
router.post('/audit/pbc-draft', checkAIUsage, aiHandler('audit_pbc_draft', (req, params) =>
  llm.generateAuditPbcDraft({
    ...params,
    requestContext: req.body.requestContext,
    controlId: req.body.controlId,
    frameworkCode: req.body.frameworkCode,
    dueDate: req.body.dueDate,
    priority: req.body.priority
  })
));

// ======================== AUDITOR AI: WORKPAPER DRAFT ========================
router.post('/audit/workpaper-draft', checkAIUsage, aiHandler('audit_workpaper_draft', (req, params) =>
  llm.generateAuditWorkpaperDraft({
    ...params,
    controlId: req.body.controlId,
    objective: req.body.objective,
    procedurePerformed: req.body.procedurePerformed,
    evidenceSummary: req.body.evidenceSummary,
    testOutcome: req.body.testOutcome
  })
));

// ======================== AUDITOR AI: FINDING DRAFT ========================
router.post('/audit/finding-draft', checkAIUsage, aiHandler('audit_finding_draft', (req, params) =>
  llm.generateAuditFindingDraft({
    ...params,
    controlId: req.body.controlId,
    issueSummary: req.body.issueSummary,
    evidenceSummary: req.body.evidenceSummary,
    severityHint: req.body.severityHint,
    recommendationScope: req.body.recommendationScope
  })
));

// ======================== 11. ASSET-CONTROL MAPPING ========================
router.post('/asset-control-mapping', checkAIUsage, aiHandler('asset_control_mapping', (req, params) =>
  llm.mapAssetsToControls(params)
));

// ======================== 12. SHADOW IT DETECTION ========================
router.post('/shadow-it', checkAIUsage, aiHandler('shadow_it', (req, params) =>
  llm.detectShadowIT(params)
));

// ======================== 13. AI GOVERNANCE ========================
router.post('/ai-governance', checkAIUsage, aiHandler('ai_governance', (req, params) =>
  llm.checkAIGovernance(params)
));

// ======================== 14. COMPLIANCE QUERY ========================
router.post('/query', checkAIUsage, aiHandler('compliance_query', (req, params) =>
  llm.queryCompliance({ ...params, question: req.body.question })
));

// ======================== 15. TRAINING RECOMMENDATIONS ========================
router.post('/training-recommendations', checkAIUsage, aiHandler('training_recommendations', (req, params) =>
  llm.recommendTraining(params)
));

// ======================== 16. EVIDENCE ASSISTANT ========================
router.post('/evidence-suggest/:controlId', checkAIUsage, aiHandler('evidence_suggest', (req, params) =>
  llm.suggestEvidence({ ...params, controlId: req.params.controlId })
));

// ======================== CONTROL ANALYSIS ========================
router.post('/analyze/control/:id', checkAIUsage, aiHandler('control_analysis', (req, params) =>
  llm.analyzeControl({ ...params, controlId: req.params.id })
));

// ======================== TEST PROCEDURES ========================
router.post('/test-procedures/:controlId', checkAIUsage, aiHandler('test_procedures', (req, params) =>
  llm.generateTestProcedures({ ...params, controlId: req.params.controlId })
));

// ======================== ASSET RISK ========================
router.post('/analyze/asset/:id', checkAIUsage, aiHandler('asset_risk', (req, params) =>
  llm.analyzeAssetRisk({ ...params, assetId: req.params.id })
));

// ======================== POLICY GENERATOR ========================
router.post('/generate-policy', checkAIUsage, aiHandler('policy_generator', (req, params) =>
  llm.generatePolicy({ ...params, policyType: req.body.policyType })
));

// ======================== CHAT ========================
router.post('/chat', checkAIUsage, aiHandler('chat', async (req, params) => {
  const messages = req.body.messages || [];
  // Extract last user message for RAG context retrieval
  let ragQuery = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { ragQuery = messages[i].content || ''; break; }
  }
  // Build personalized system prompt with org context + RAG when no explicit systemPrompt
  const systemPrompt = req.body.systemPrompt ||
    await llm.buildPersonalizedSystem(params.organizationId, null, 'compact', ragQuery, 'copilot');
  return llm.chat({ ...params, messages, systemPrompt });
}));

// ======================== STREAMING CHAT ========================
// SSE endpoint: streams AI response chunks in real-time as Server-Sent Events.
// Client receives: data: {"chunk":"...", "done":false}\n\n  ...  data: {"chunk":"","done":true}\n\n
router.post('/stream', checkAIUsage, async (req, res) => {
  const params = await getAIParams(req);
  const { messages, systemPrompt, feature = 'chat' } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages array is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const startMs = Date.now();

  try {
    const stream = llm.chatStream({
      ...params,
      messages,
      systemPrompt: systemPrompt || null
    });

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ chunk: '', done: true })}\n\n`);
    res.end();

    const durationMs = Date.now() - startMs;
    await llm.logAIUsage(params.organizationId, req.user.id, feature, params.provider, params.model, {
      success: true, byokUsed: !!req.aiUsageByok, ipAddress: req.ip || null, durationMs
    }).catch(() => {});
  } catch (err) {
    const durationMs = Date.now() - startMs;
    console.error('AI stream error:', err);
    const isMissingKey = err.message?.includes('No API key');
    const safeClientMessage = isMissingKey
      ? 'No API key configured. Add one in Settings > LLM Configuration.'
      : 'Streaming request failed. Please try again.';
    if (!res.headersSent) {
      res.status(isMissingKey ? 400 : 500).json({ success: false, error: safeClientMessage });
    } else {
      res.write(`data: ${JSON.stringify({ error: safeClientMessage, done: true })}\n\n`);
      res.end();
    }
    await llm.logAIUsage(params.organizationId, req.user.id, feature, params.provider, params.model, {
      success: false, errorMessage: err.message?.slice(0, MAX_ERROR_MESSAGE_LENGTH), byokUsed: !!req.aiUsageByok, ipAddress: req.ip || null, durationMs
    }).catch(() => {});
  }
});

// ======================== ADMIN: AI USAGE REPORT ========================
// Returns paginated AI usage log for the org — admin only
router.get('/usage-report', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { startDate, endDate, userId, feature, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * pageLimit;

    const conditions = ['l.organization_id = $1'];
    const values = [orgId];
    let idx = 2;

    if (startDate) { conditions.push(`l.created_at >= $${idx++}`); values.push(startDate); }
    if (endDate)   { conditions.push(`l.created_at <= $${idx++}`); values.push(endDate); }
    if (userId)    { conditions.push(`l.user_id = $${idx++}`);     values.push(userId); }
    if (feature)   { conditions.push(`l.feature = $${idx++}`);     values.push(feature); }

    const where = conditions.join(' AND ');

    const [rows, countRow] = await Promise.all([
      pool.query(`
        SELECT l.id, l.created_at, l.feature, l.provider, l.model,
               l.success, l.error_message, l.tokens_input, l.tokens_output,
               l.duration_ms, l.byok_used, l.ip_address,
               l.resource_type, l.resource_id,
               u.email AS user_email,
               COALESCE(
                 NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
                 u.email
               ) AS user_name
        FROM ai_usage_log l
        LEFT JOIN users u ON u.id = l.user_id
        WHERE ${where}
        ORDER BY l.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, [...values, pageLimit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM ai_usage_log l WHERE ${where}`, values),
    ]);

    res.json({
      success: true,
      data: rows.rows,
      pagination: {
        page: pageNum,
        limit: pageLimit,
        total: parseInt(countRow.rows[0].total, 10),
      },
    });
  } catch (err) {
    console.error('AI usage report error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch AI usage report' });
  }
});

// ======================== AI DECISION REVIEW ========================

// POST /ai/decisions — log an AI decision from MCP agents or integrations
router.post('/decisions', aiDecisionWriteLimiter, requirePermission('assessments.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const crypto = require('crypto');
    const body = req.body || {};

    const feature = body.feature;
    if (!feature || typeof feature !== 'string') {
      return res.status(400).json({ success: false, error: 'feature is required.' });
    }

    const inputData = body.input_data || {};
    const outputData = body.output_data || {};
    const inputText = JSON.stringify(inputData);
    const outputText = JSON.stringify(outputData);
    const inputHash = crypto.createHash('sha256').update(inputText).digest('hex');
    const outputHash = crypto.createHash('sha256').update(outputText).digest('hex');
    const riskLevel = String(body.risk_level || 'limited').toLowerCase();
    const VALID_RISK_LEVELS = new Set(['limited', 'low', 'medium', 'high', 'critical']);
    if (!VALID_RISK_LEVELS.has(riskLevel)) {
      return res.status(400).json({ success: false, error: `risk_level must be one of: ${[...VALID_RISK_LEVELS].join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO ai_decision_log
       (organization_id, feature, input_data, input_hash, output_data, output_hash,
        risk_level, regulatory_framework, model_version, correlation_id, session_id,
        processing_timestamp, bias_flags, bias_reviewed, human_reviewed,
        reasoning, confidence_score, decision_source)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6,
               $7, $8, $9, $10, $11,
               NOW(), $12::jsonb, false, false,
               $13, $14, $15)
       RETURNING id, feature, risk_level, processing_timestamp, decision_source`,
      [
        orgId,
        feature,
        inputText,
        inputHash,
        outputText,
        outputHash,
        riskLevel,
        body.regulatory_framework || null,
        body.model_version || null,
        body.correlation_id || null,
        body.session_id || null,
        JSON.stringify(body.bias_flags || []),
        body.reasoning || null,
        body.confidence_score != null ? body.confidence_score : null,
        body.decision_source && VALID_DECISION_SOURCES.includes(body.decision_source)
          ? body.decision_source
          : 'platform'
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('AI decision create error:', err);
    res.status(500).json({ success: false, error: 'Failed to log AI decision' });
  }
});

// GET /ai/decisions — paginated decision log for admin review
// Optimized with window functions for better performance on large tables
router.get('/decisions', requirePermission('settings.manage'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const reviewedFilter = req.query.reviewed; // 'true' | 'false' | undefined
    const featureFilter = req.query.feature || null;
    const riskFilter = req.query.risk_level || null;
    const decisionSourceFilter = req.query.decision_source || null;

    const params = [orgId];
    let whereConditions = ['organization_id = $1'];

    if (reviewedFilter === 'true') { whereConditions.push('human_reviewed = true'); }
    else if (reviewedFilter === 'false') { whereConditions.push('human_reviewed = false'); }
    if (featureFilter) { 
      params.push(featureFilter); 
      whereConditions.push(`feature = $${params.length}`); 
    }
    if (riskFilter) { 
      params.push(riskFilter); 
      whereConditions.push(`risk_level = $${params.length}`); 
    }
    if (decisionSourceFilter) {
      params.push(decisionSourceFilter);
      whereConditions.push(`decision_source = $${params.length}`);
    }

    const whereClause = whereConditions.join(' AND ');
    const offset = (page - 1) * limit;
    params.push(offset, limit);

    // Use window functions for efficient pagination without OFFSET performance penalty
    const result = await pool.query(
      `WITH ordered_decisions AS (
         SELECT id, processing_timestamp as created_at,
                regulatory_framework, risk_level, model_version, correlation_id,
                input_hash, output_hash, human_reviewed, review_outcome,
                reviewed_by, review_timestamp, bias_flags, bias_reviewed,
                data_lineage, bias_score, review_date, approved_by,
                LEFT(input_data::text, 500) as input_preview,
                LEFT(output_data::text, 500) as output_preview,
                COUNT(*) OVER() as total_count,
                ROW_NUMBER() OVER(ORDER BY processing_timestamp DESC) as row_num
         FROM ai_decision_log
         WHERE ${whereClause}
       )
       SELECT * FROM ordered_decisions
       WHERE row_num > $${params.length - 1} AND row_num <= ($${params.length - 1} + $${params.length})
       ORDER BY created_at DESC`,
      params
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    // Remove the total_count and row_num from each row
    const data = result.rows.map(row => {
      const { total_count, row_num, ...cleanRow } = row;
      return cleanRow;
    });

    res.json({
      success: true,
      data,
      pagination: { page, limit, total: totalCount }
    });
  } catch (err) {
    console.error('AI decisions error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve AI decisions' });
  }
});

// PATCH /ai/decisions/:id/review — mark a decision as human-reviewed
router.patch('/decisions/:id/review', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { outcome, notes } = req.body;
    const VALID_OUTCOMES = ['approved', 'rejected', 'needs_revision'];
    if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ success: false, error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` });
    }

    // Prepare approved_by based on outcome (only for approved decisions)
    const approvedBy = outcome === 'approved' ? req.user.email || req.user.username || req.user.id : null;

    const result = await pool.query(
      `UPDATE ai_decision_log
       SET human_reviewed = true,
           reviewed_by = $1,
           review_timestamp = NOW(),
           review_outcome = $2,
           review_notes = $3,
           review_date = NOW(),
           approved_by = $4
       WHERE id = $5 AND organization_id = $6
       RETURNING id`,
      [req.user.id, outcome, notes || null, approvedBy, req.params.id, req.user.organization_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Decision not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('AI decision review error:', err);
    res.status(500).json({ success: false, error: 'Failed to update decision review' });
  }
});

// PATCH /ai/decisions/:id/bias-review — mark bias flags as reviewed
router.patch('/decisions/:id/bias-review', requirePermission('assessments.write'), async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await pool.query(
      `UPDATE ai_decision_log
       SET bias_reviewed = true,
           bias_reviewed_by = $1,
           bias_review_timestamp = NOW(),
           fairness_notes = $2
       WHERE id = $3 AND organization_id = $4
       RETURNING id`,
      [req.user.id, notes || null, req.params.id, req.user.organization_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Decision not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Bias review error:', err);
    res.status(500).json({ success: false, error: 'Failed to update bias review' });
  }
});

// ======================== SECURITY POSTURE ========================
// POST /ai/security-posture
// Returns AI-driven analysis of OWASP Top 10:2025 exposure AND NIST control family gaps
// based on live org data (vulns, SBOM, control implementations).
router.post('/security-posture', checkAIUsage, aiHandler('security_posture', async (req, params) => {
  const orgId = params.organizationId;

  const owaspColumnCheck = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'vulnerability_findings'
         AND column_name = 'owasp_top10_2025_category'
     ) AS present`
  );
  const hasOwaspCategoryColumn = owaspColumnCheck.rows[0]?.present === true;
  const owaspCategoryExpr = hasOwaspCategoryColumn
    ? `COALESCE(owasp_top10_2025_category, 'UNCLASSIFIED')`
    : `'UNCLASSIFIED'`;
  const owaspGroupByExpr = hasOwaspCategoryColumn
    ? `owasp_top10_2025_category, severity`
    : `severity`;

  // 1. Vulns grouped by OWASP category + severity
  const owaspVulns = await pool.query(
    `SELECT
       ${owaspCategoryExpr} AS category,
       severity,
       COUNT(*) AS count
     FROM vulnerability_findings
     WHERE organization_id = $1 AND status = 'open'
     GROUP BY ${owaspGroupByExpr}
     ORDER BY category, severity`,
    [orgId]
  );

  // 2. SBOM component vulnerability counts (supply chain → A03)
  const sbomStats = await pool.query(
    `SELECT COUNT(*) AS total_components,
            COUNT(cv.id) AS vulnerable_components
     FROM sbom_records sr
     LEFT JOIN sbom_components sc ON sc.sbom_id = sr.id
     LEFT JOIN component_vulnerabilities cv ON cv.component_id = sc.id AND cv.status != 'false_positive'
     WHERE sr.organization_id = $1`,
    [orgId]
  );

  // 3. NIST control family coverage
  const nistFamilies = await pool.query(
    `SELECT
       SPLIT_PART(fc.control_number, '-', 1) AS family,
       COUNT(fc.id) AS total,
       COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') AS implemented,
       ROUND(
         COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
         / NULLIF(COUNT(fc.id), 0) * 100, 0
       ) AS pct
     FROM organization_frameworks of2
     JOIN frameworks f ON f.id = of2.framework_id
     JOIN framework_controls fc ON fc.framework_id = f.id
     LEFT JOIN control_implementations ci
       ON ci.control_id = fc.id AND ci.organization_id = $1
     WHERE of2.organization_id = $1
       AND f.code IN ('nist_800_53', 'nist_800_53_rev5', 'nist_800_53_r5')
     GROUP BY SPLIT_PART(fc.control_number, '-', 1)
     HAVING COUNT(fc.id) > 0
     ORDER BY pct ASC`,
    [orgId]
  );

  // Summarize OWASP data for the prompt
  const owaspSummary = {};
  for (const row of owaspVulns.rows) {
    if (!owaspSummary[row.category]) owaspSummary[row.category] = { total: 0, critical: 0, high: 0 };
    owaspSummary[row.category].total += parseInt(row.count, 10);
    if (row.severity === 'critical') owaspSummary[row.category].critical += parseInt(row.count, 10);
    if (row.severity === 'high') owaspSummary[row.category].high += parseInt(row.count, 10);
  }

  const sbom = sbomStats.rows[0] || {};
  const nistHasData = nistFamilies.rows.length > 0;

  const owaspEvidence = Object.entries(owaspSummary).map(([cat, s]) =>
    `${cat}: ${s.total} open (${s.critical} critical, ${s.high} high)`
  ).join('\n');

  const nistEvidence = nistHasData
    ? nistFamilies.rows.map(r => `${r.family}: ${r.pct || 0}% (${r.implemented}/${r.total})`).join('\n')
    : 'No NIST 800-53 framework active for this organization.';

  const systemPrompt = await llm.buildPersonalizedSystem(orgId, 'You are performing a comprehensive security posture analysis. Return structured JSON only.', 'compact', null, 'vulnerability');

  const userPrompt = `Analyze this organization's security posture against two standards and return a JSON object with keys "owasp" and "nist".

OWASP TOP 10:2025 OPEN VULNERABILITIES:
${owaspEvidence || 'No open vulnerabilities found.'}

SBOM SUPPLY CHAIN (relevant to A03:2025):
Total components: ${sbom.total_components || 0}, Vulnerable: ${sbom.vulnerable_components || 0}

NIST 800-53 CONTROL FAMILY COVERAGE (weakest first):
${nistEvidence}

For the "owasp" key, return an array of 10 objects, one for each OWASP Top 10:2025 category (A01:2025 through A10:2025):
{ "id": "A01:2025", "name": "Broken Access Control", "riskLevel": "critical|high|medium|low|none", "evidenceCount": <number>, "summary": "<1-2 sentences citing specific evidence>", "recommendations": ["<action 1>", "<action 2>", "<action 3>"] }

For the "nist" key, return an array of the top 5 highest-priority NIST control families to address (only if NIST data is available, otherwise empty array):
{ "family": "IA", "name": "Identification & Authentication", "pct": 30, "priority": "critical|high|medium|low", "businessRisk": "<1 sentence>", "nextControls": ["IA-2", "IA-5"] }

Return ONLY valid JSON. No markdown fences, no explanation.`;

  const raw = await llm.chat({
    provider: params.provider,
    model: params.model,
    organizationId: orgId,
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  // Parse JSON from LLM response
  let parsed;
  try {
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = { owasp: [], nist: [], raw };
  }

  return parsed;
}));

// ======================== MULTI-AGENT SWARM ========================

let orchestrator = {
  SWARM_CONFIGS: {},
  getSwarmConfigs: () => [],
  getSwarmConfig: () => null,
  executeSwarm: async () => {
    const err = new Error(UNAVAILABLE_SWARM_ERROR);
    err.statusCode = 503;
    throw err;
  }
};
let reasoningMemory = {
  invalidateCache: () => {}
};
try {
  orchestrator = require('../services/multiAgentOrchestrator');
} catch (_err) {
  // Optional in the public/community repo.
}
try {
  reasoningMemory = require('../services/reasoningMemory');
} catch (_err) {
  // Optional in the public/community repo.
}

// GET /ai/swarm/configs — list available swarm configurations
router.get('/swarm/configs', async (req, res) => {
  try {
    const configs = orchestrator.getSwarmConfigs();
    res.json({ success: true, data: configs });
  } catch (err) {
    console.error('Swarm configs error:', err);
    res.status(500).json({ success: false, error: 'Failed to get swarm configurations' });
  }
});

// POST /ai/swarm/execute — run a predefined or custom agent swarm in parallel
router.post('/swarm/execute', checkAIUsage, async (req, res) => {
  const { swarmType, provider, model } = req.body;
  if (!swarmType) {
    return res.status(400).json({ success: false, error: 'swarmType is required' });
  }

  // Verify sufficient quota for all agents in the swarm
  const swarmConfig = orchestrator.getSwarmConfig(swarmType);
  if (!swarmConfig) {
    return res.status(400).json({ success: false, error: `Invalid swarm type: ${swarmType}` });
  }
  if (req.aiUsageRemaining !== 'unlimited') {
    const agentCount = swarmConfig.agents ? swarmConfig.agents.length : 0;
    if (typeof req.aiUsageRemaining === 'number' && req.aiUsageRemaining < agentCount) {
      return res.status(429).json({
        success: false,
        error: `Insufficient AI quota. This swarm requires ${agentCount} requests but you have ${req.aiUsageRemaining} remaining.`,
        upgradeRequired: true
      });
    }
  }

  const startMs = Date.now();
  try {
    const hasExplicitProvider = !!provider;
    const resolvedProvider = hasExplicitProvider
      ? provider
      : await llm.getOrgDefaultProvider(req.user.organization_id);
    const result = await orchestrator.executeSwarm(swarmType, {
      organizationId: req.user.organization_id,
      provider: hasExplicitProvider ? resolvedProvider : undefined,
      model: model || null
    });
    const durationMs = Date.now() - startMs;

    // Log each agent's usage
    for (const agent of result.agents) {
      await llm.logAIUsage(
        req.user.organization_id, req.user.id,
        `swarm_${agent.agentId}`, agent.provider || resolvedProvider, agent.model || model,
        { success: agent.status === 'success', durationMs: agent.durationMs, byokUsed: !!req.aiUsageByok }
      ).catch(() => {});
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Swarm execution error:', err);
    const errorString = String((err && (err.message || err)) || 'Unknown error');
    const normalized = errorString.toLowerCase();
    const isQuotaOrRateLimitError = /quota|rate limit|429/i.test(normalized);
    const hint = /no api key/i.test(normalized)
      ? ' Verify AI provider API keys in Settings → LLM Configuration.'
      : isQuotaOrRateLimitError
        ? ' AI provider quota or rate limit reached. Try again shortly or switch providers.'
        : ' Check AI provider setup in Settings → LLM Configuration and review backend logs.';
    const statusCode = (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600)
      ? err.statusCode
      : (isQuotaOrRateLimitError ? 429 : 500);
    res.status(statusCode).json({ success: false, error: `Swarm execution failed.${hint}` });
  }
});

// ======================== REASONING MEMORY (ReasoningBank) ========================

// GET /ai/reasoning-memory/stats — get memory stats for this org
router.get('/reasoning-memory/stats', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(`
      SELECT 
        COUNT(*) AS total_entries,
        COUNT(DISTINCT feature) AS distinct_features,
        MIN(created_at) AS oldest_entry,
        MAX(created_at) AS newest_entry
      FROM ai_reasoning_memory
      WHERE organization_id = $1
    `, [orgId]);
    const stats = result.rows[0] || {};
    res.json({
      success: true,
      data: {
        totalEntries: parseInt(stats.total_entries || '0', 10),
        distinctFeatures: parseInt(stats.distinct_features || '0', 10),
        oldestEntry: stats.oldest_entry || null,
        newestEntry: stats.newest_entry || null,
        retentionDays: parseInt(process.env.REASONING_MEMORY_RETENTION_DAYS || '30', 10)
      }
    });
  } catch (err) {
    console.error('Reasoning memory stats error:', err);
    res.status(500).json({ success: false, error: 'Failed to get reasoning memory stats' });
  }
});

// GET /ai/reasoning-memory/entries — list recent reasoning memory entries
router.get('/reasoning-memory/entries', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const feature = req.query.feature || null;

    let query = `
      SELECT id, feature, input_summary, output_summary, key_findings, keywords, created_at
      FROM ai_reasoning_memory
      WHERE organization_id = $1
    `;
    const params = [orgId];

    if (feature) {
      query += ` AND feature = $2`;
      params.push(feature);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Reasoning memory entries error:', err);
    res.status(500).json({ success: false, error: 'Failed to get reasoning memory entries' });
  }
});

// DELETE /ai/reasoning-memory — clear all reasoning memory for this org
router.delete('/reasoning-memory', requireTier('enterprise'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      'DELETE FROM ai_reasoning_memory WHERE organization_id = $1',
      [orgId]
    );
    reasoningMemory.invalidateCache(orgId);
    res.json({ success: true, data: { deletedCount: result.rowCount } });
  } catch (err) {
    console.error('Reasoning memory clear error:', err);
    res.status(500).json({ success: false, error: 'Failed to clear reasoning memory' });
  }
});

// ======================== AGENT BOOSTER ========================

// GET /ai/agent-booster/status — get agent booster configuration and status
router.get('/agent-booster/status', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    // Check org settings for booster preferences
    const settingsResult = await pool.query(
      `SELECT settings FROM organizations WHERE id = $1`,
      [orgId]
    ).catch(err => { console.error('Agent booster settings query error:', err.message); return { rows: [] }; });

    const orgSettings = settingsResult.rows[0]?.settings || {};
    const boosterConfig = orgSettings.agentBooster || {};

    // Get recent swarm performance as booster metrics
    const metricsResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_runs,
        AVG(CASE WHEN metadata->>'success' = 'true' THEN (metadata->>'durationMs')::numeric END) AS avg_success_duration_ms,
        SUM(CASE WHEN metadata->>'success' = 'true' THEN 1 ELSE 0 END) AS successful_runs,
        SUM(CASE WHEN metadata->>'success' = 'false' THEN 1 ELSE 0 END) AS failed_runs
      FROM ai_usage_log
      WHERE organization_id = $1
        AND feature LIKE 'swarm_%'
        AND created_at > NOW() - INTERVAL '7 days'
    `, [orgId]).catch(err => { console.error('Agent booster metrics query error:', err.message); return { rows: [{}] }; });

    const metrics = metricsResult.rows[0] || {};

    res.json({
      success: true,
      data: {
        enabled: boosterConfig.enabled !== false,
        parallelAgents: boosterConfig.parallelAgents || 4,
        autoRouting: boosterConfig.autoRouting !== false,
        recentMetrics: {
          totalRuns: parseInt(metrics.total_runs || '0', 10),
          successfulRuns: parseInt(metrics.successful_runs || '0', 10),
          failedRuns: parseInt(metrics.failed_runs || '0', 10),
          avgSuccessDurationMs: metrics.avg_success_duration_ms ? Math.round(parseFloat(metrics.avg_success_duration_ms)) : null
        },
        availableSwarms: Object.keys(orchestrator.SWARM_CONFIGS).length,
        features: [
          'Parallel agent execution',
          'Auto-model routing across 6 providers',
          'RAG context enrichment',
          'Reasoning memory learning',
          'Per-agent usage tracking'
        ]
      }
    });
  } catch (err) {
    console.error('Agent booster status error:', err);
    res.status(500).json({ success: false, error: 'Failed to get agent booster status' });
  }
});

module.exports = router;
