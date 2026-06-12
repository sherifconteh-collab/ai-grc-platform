/**
 * AI analysis and reporting features: gap analysis, crosswalk optimization,
 * compliance forecasting, regulatory change monitoring, executive reports,
 * risk heatmaps, audit readiness, compliance Q&A, and training
 * recommendations.
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * Function bodies are identical to the original inline definitions.
 */

'use strict';

const pool = require('../../../config/database');
const { chat, compactJSON, buildPersonalizedSystem } = require('../chatCore');
const { withCacheAndDedup } = require('../aiCache');
const { buildFewShotBlock } = require('../exemplarLoader');

// =====================================================================
// 1. AUTOMATED GAP ANALYSIS
// =====================================================================
async function generateGapAnalysis({ organizationId, provider, model, schemaRetryHint = null }) {
  // Use cache and deduplication to prevent redundant AI calls
  // Skip cache on retry to get a fresh structured response
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  const cacheKey = schemaRetryHint
    ? `gap-analysis-retry:${organizationId}:${cacheProvider}:${cacheModel}`
    : `gap-analysis:${organizationId}:${cacheProvider}:${cacheModel}`;
  return withCacheAndDedup(cacheKey, async () => {
    const [frameworks, controls, evidenceStats, assessmentStats, assetStats, vulnStats, ownershipStats] = await Promise.all([
      pool.query(`
        SELECT f.code, f.name, COUNT(fc.id) as total,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
          COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress,
          COUNT(ci.id) FILTER (WHERE ci.status IS NULL OR ci.status = 'not_started') as not_started
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.code, f.name
      `, [organizationId]),
      pool.query(`
        SELECT fc.control_id, fc.title, fc.priority, f.code as framework,
          COALESCE(ci.status, 'not_started') as status
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1 AND (ci.status IS NULL OR ci.status != 'implemented')
        ORDER BY fc.priority ASC, f.code
        LIMIT 100
      `, [organizationId]),
      // Evidence coverage: how many controls have linked evidence (org-scoped)
      pool.query(`
        SELECT
          COUNT(DISTINCT fc.id) as total_controls,
          COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN ecl.control_id END) as controls_with_evidence,
          COUNT(DISTINCT e.id) as total_evidence_items
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN evidence_control_links ecl ON ecl.control_id = fc.id
        LEFT JOIN evidence e ON e.id = ecl.evidence_id AND e.organization_id = $1
        WHERE of2.organization_id = $1
      `, [organizationId]),
      // Assessment completion rates
      pool.query(`
        SELECT
          COUNT(DISTINCT ap2.assessment_procedure_id) as total_procedures_in_plans,
          COUNT(DISTINCT ar.assessment_procedure_id) as procedures_assessed,
          COUNT(ar.id) FILTER (WHERE ar.status = 'satisfied') as satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'other_than_satisfied') as other_than_satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_applicable') as not_applicable,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_assessed' OR ar.status IS NULL) as not_assessed
        FROM assessment_plans ap
        LEFT JOIN assessment_plan_procedures ap2 ON ap2.assessment_plan_id = ap.id
        LEFT JOIN assessment_results ar ON ar.assessment_procedure_id = ap2.assessment_procedure_id AND ar.organization_id = $1
        WHERE ap.organization_id = $1
      `, [organizationId]),
      // Asset and environment stats
      pool.query(`
        SELECT
          COUNT(*) as total_assets,
          COUNT(*) FILTER (WHERE criticality = 'critical') as critical_assets,
          COUNT(*) FILTER (WHERE criticality = 'high') as high_assets,
          COUNT(*) FILTER (WHERE status = 'active') as active_assets
        FROM assets WHERE organization_id = $1
      `, [organizationId]),
      // Vulnerability stats
      pool.query(`
        SELECT
          COUNT(*) as total_vulns,
          COUNT(*) FILTER (WHERE status = 'open') as open_vulns,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_vulns,
          COUNT(*) FILTER (WHERE severity = 'high') as high_vulns,
          COUNT(*) FILTER (WHERE kev_listed = true) as kev_listed
        FROM vulnerability_findings WHERE organization_id = $1
      `, [organizationId]),
      // Control ownership / assignment stats
      pool.query(`
        SELECT
          COUNT(fc.id) as total_controls,
          COUNT(ci.assigned_to) as assigned_controls
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
      `, [organizationId])
    ]);

    const ev = evidenceStats.rows[0] || {};
    const assess = assessmentStats.rows[0] || {};
    const assets = assetStats.rows[0] || {};
    const vulns = vulnStats.rows[0] || {};
    const ownership = ownershipStats.rows[0] || {};

    const kpiBlock = [
      `- Evidence Coverage: ${ev.controls_with_evidence || 0} of ${ev.total_controls || 0} controls have linked evidence (${ev.total_evidence_items || 0} total evidence items)`,
      `- Assessment Completion: ${assess.procedures_assessed || 0} of ${assess.total_procedures_in_plans || 0} procedures assessed (${assess.satisfied || 0} satisfied, ${assess.other_than_satisfied || 0} other-than-satisfied, ${assess.not_applicable || 0} not applicable, ${assess.not_assessed || 0} not assessed)`,
      `- Control Ownership: ${ownership.assigned_controls || 0} of ${ownership.total_controls || 0} controls assigned to owners`,
      `- Asset Inventory: ${assets.total_assets || 0} assets (${assets.critical_assets || 0} critical, ${assets.high_assets || 0} high criticality)`,
      `- Vulnerability Exposure: ${vulns.total_vulns || 0} total findings (${vulns.open_vulns || 0} open, ${vulns.critical_vulns || 0} critical, ${vulns.high_vulns || 0} high, ${vulns.kev_listed || 0} KEV-listed)`
    ].join('\n');

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'full', 'compliance gap analysis controls implementation evidence audit readiness', 'controls'),
      messages: [{ role: 'user', content: `Generate a comprehensive gap analysis report that tells a compelling compliance story from two expert perspectives: a **CISO** (strategic risk, business impact, board communication) and a **Lead Auditor** (evidence sufficiency, control effectiveness, audit readiness).${buildFewShotBlock('gap_analysis')}

Framework Status:
${compactJSON(frameworks.rows)}

Top Unimplemented Controls:
${compactJSON(controls.rows)}

Key Performance Indicators (KPIs):
${kpiBlock}

Structure the report as follows:

## 1. Executive KPI Dashboard
Present a concise KPI scorecard with these metrics and RAG (Red/Amber/Green) status:
- **Implementation Rate**: % of controls implemented across all frameworks
- **Evidence Coverage Rate**: % of controls backed by evidence
- **Assessment Completion Rate**: % of assessment procedures completed
- **Control Ownership Rate**: % of controls assigned to responsible owners
- **Vulnerability Exposure Index**: open critical/high vulnerabilities relative to asset count
- **Audit Readiness Score**: composite score (0-100) based on above metrics

## 2. CISO Strategic Risk Narrative
Write from the perspective of a CISO presenting to the board:
- Translate compliance gaps into **business risk** (revenue impact, regulatory penalties, reputational exposure, operational disruption)
- Identify the **top 3 strategic risks** that demand immediate executive attention
- Provide **Mean Time to Compliance (MTTC)** estimates per framework
- Quantify potential **financial exposure** from regulatory non-compliance
- Recommend **budget and resource allocation** priorities

## 3. Lead Auditor Assessment
Write from the perspective of a lead auditor conducting a readiness review:
- Assess **evidence sufficiency** — are controls supported by adequate documentation?
- Evaluate **control effectiveness** — are implemented controls operating as intended?
- Identify **material weaknesses** vs. **significant deficiencies** vs. **observations**
- Assess **audit readiness** per framework with realistic timeline to attestation/certification
- Flag controls where the gap between implementation and evidence creates **audit risk**

## 4. Bridging the Gap: Unified Remediation Roadmap
Synthesize both perspectives into an actionable plan:
- **Immediate (0-30 days)**: Critical quick wins that address both strategic risk and audit findings
- **Short-term (30-90 days)**: Core control implementation with evidence collection
- **Medium-term (90-180 days)**: Advanced controls, continuous monitoring, audit preparation
- Identify **crosswalk leverage points** where one implementation satisfies multiple frameworks
- Prioritize controls by combined risk-and-audit-impact score

## 5. Quick Wins & Momentum Builders
Highlight 5-10 specific controls that can be implemented quickly to build compliance momentum, with estimated effort and cross-framework impact.${schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : ''}` }],
      feature: 'gap_analysis'
    });
  });
}

// =====================================================================
// 2. CROSSWALK OPTIMIZER
// =====================================================================
async function optimizeCrosswalk({ organizationId, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  return withCacheAndDedup(`crosswalk-optimizer:${organizationId}:${cacheProvider}:${cacheModel}`, async () => {
    const mappings = await pool.query(`
      SELECT fc1.control_id as source_id, fc1.title as source_title, f1.code as source_fw,
        fc2.control_id as target_id, fc2.title as target_title, f2.code as target_fw,
        cm.similarity_score, cm.mapping_type,
        COALESCE(ci1.status, 'not_started') as source_status,
        COALESCE(ci2.status, 'not_started') as target_status
      FROM control_mappings cm
      JOIN framework_controls fc1 ON fc1.id = cm.source_control_id
      JOIN framework_controls fc2 ON fc2.id = cm.target_control_id
      JOIN frameworks f1 ON f1.id = fc1.framework_id
      JOIN frameworks f2 ON f2.id = fc2.framework_id
      JOIN organization_frameworks of1 ON of1.framework_id = f1.id AND of1.organization_id = $1
      LEFT JOIN control_implementations ci1 ON ci1.control_id = fc1.id AND ci1.organization_id = $1
      LEFT JOIN control_implementations ci2 ON ci2.control_id = fc2.id AND ci2.organization_id = $1
      WHERE cm.similarity_score >= 80
      ORDER BY cm.similarity_score DESC
      LIMIT 200
    `, [organizationId]);

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', 'crosswalk framework control mapping implementation', 'controls'),
      messages: [{ role: 'user', content: `Analyze crosswalk mappings and recommend optimal implementation order.

Crosswalk Mappings (score >= 80%):
${compactJSON(mappings.rows)}

Provide:
1. Top 10 "implement first" controls that satisfy the most cross-framework requirements
2. For each recommendation, list all frameworks satisfied and the similarity scores
3. Estimated effort reduction percentage from leveraging crosswalks
4. Controls that are already implemented and their crosswalk impact
5. Recommended implementation sequence for maximum coverage with minimum effort` }],
      feature: 'crosswalk_optimizer',
      maxTokens: 3072
    });
  });
}

// =====================================================================
// 3. COMPLIANCE FORECASTING
// =====================================================================
async function forecastCompliance({ organizationId, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  return withCacheAndDedup(`compliance-forecast:${organizationId}:${cacheProvider}:${cacheModel}`, async () => {
    const [history, totals, frameworkBreakdown, evidenceTrend, assessmentProgress, controlMaturity] = await Promise.all([
      pool.query(`
        SELECT DATE_TRUNC('week', ci.created_at) as week,
          COUNT(*) as controls_completed
        FROM control_implementations ci
        WHERE ci.organization_id = $1 AND ci.status = 'implemented'
        GROUP BY DATE_TRUNC('week', ci.created_at)
        ORDER BY week DESC
        LIMIT 12
      `, [organizationId]),
      pool.query(`
        SELECT COUNT(fc.id) as total,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as done,
          COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
      `, [organizationId]),
      // Per-framework progress for targeted forecasting
      pool.query(`
        SELECT f.code, f.name,
          COUNT(fc.id) as total,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
          COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.code, f.name
      `, [organizationId]),
      // Evidence collection trend
      pool.query(`
        SELECT DATE_TRUNC('week', e.created_at) as week,
          COUNT(*) as evidence_uploaded
        FROM evidence e
        WHERE e.organization_id = $1
        GROUP BY DATE_TRUNC('week', e.created_at)
        ORDER BY week DESC
        LIMIT 12
      `, [organizationId]),
      // Assessment completion rates
      pool.query(`
        SELECT
          COUNT(ar.id) as total_results,
          COUNT(ar.id) FILTER (WHERE ar.status = 'satisfied') as satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'other_than_satisfied') as other_than_satisfied,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_applicable') as not_applicable,
          COUNT(ar.id) FILTER (WHERE ar.status = 'not_assessed' OR ar.status IS NULL) as not_assessed
        FROM assessment_results ar
        WHERE ar.organization_id = $1
      `, [organizationId]),
      // Control maturity: earliest/latest implementation dates per framework
      pool.query(`
        SELECT f.code, f.name,
          MIN(ci.created_at) as earliest_implementation,
          MAX(ci.created_at) as latest_implementation,
          COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1 AND ci.status = 'implemented'
        WHERE of2.organization_id = $1
        GROUP BY f.id, f.code, f.name
      `, [organizationId])
    ]);

    const assess = assessmentProgress.rows[0] || {};
    const maturity = controlMaturity.rows || [];

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', 'compliance forecast trajectory implementation velocity evidence collection', 'controls'),
      messages: [{ role: 'user', content: `Forecast compliance trajectory with dual-perspective analysis from a **CISO** and **Lead Auditor** viewpoint.

Implementation Velocity (weekly):
${compactJSON(history.rows)}

Current Totals: ${JSON.stringify(totals.rows[0] || {})}

Per-Framework Progress:
${compactJSON(frameworkBreakdown.rows)}

Evidence Collection Velocity (weekly):
${compactJSON(evidenceTrend.rows)}

Assessment Status: ${JSON.stringify(assess)}

Control Maturity (implementation history per framework):
${compactJSON(maturity)}

Structure the forecast as follows:

## 1. Compliance KPI Dashboard
Present current KPIs with trend indicators (▲ improving, ▼ declining, ► stable):
- **Overall Implementation Rate**: % complete with week-over-week change
- **Implementation Velocity**: controls/week (current, average, peak)
- **Evidence Collection Rate**: evidence items/week trend
- **Assessment Completion Rate**: % of procedures assessed
- **Per-Framework Compliance %**: individual framework progress
- **In-Progress Pipeline**: controls currently being worked on

## 2. CISO Strategic Forecast
From a CISO's perspective communicating to the board:
- **Projected Milestone Dates**: estimated dates to reach 50%, 80%, 90%, and 100% compliance (per framework and overall)
- **Business Risk Timeline**: when key regulatory deadlines intersect with projected compliance dates
- **Resource Burn Rate**: are current resources sufficient to meet targets?
- **Risk Exposure Window**: period during which the organization remains exposed before reaching acceptable compliance levels
- **Budget Impact**: estimated cost implications of current pace vs. accelerated timelines

## 3. Lead Auditor Readiness Assessment
From a lead auditor's perspective evaluating audit preparedness:
- **Evidence Sufficiency Forecast**: at current evidence collection rate, when will evidence coverage be adequate for audit?
- **Assessment Readiness**: based on assessment completion rates, when can a formal assessment/audit be scheduled?
- **Control Maturity Projection**: using the earliest/latest implementation dates provided, forecast when controls will have sufficient operational history for SOC 2 Type II (typically 3-6 months of operational evidence) or equivalent
- **Documentation Gap Forecast**: areas where evidence collection lags behind control implementation
- **Audit Engagement Timeline**: recommended dates for readiness assessment, internal audit, and external audit

## 4. Velocity Analysis & Bottleneck Identification
- Is the team accelerating or decelerating? Analyze the trend.
- Identify specific bottlenecks (resource constraints, complexity spikes, framework-specific slowdowns)
- Compare implementation velocity against evidence collection velocity — highlight mismatches
- Identify frameworks that are falling behind their peers

## 5. Acceleration Recommendations
Provide prioritized recommendations from both perspectives:
- **CISO Priority**: actions that reduce the most business risk the fastest
- **Auditor Priority**: actions that close the most evidence and assessment gaps
- **Combined Quick Wins**: actions that satisfy both strategic and audit objectives
- Resource reallocation suggestions based on framework-specific velocity data

## 6. Risk Assessment: Current Pace Scenario
- If current velocity continues unchanged, what are the consequences?
- Quantify compliance debt accumulation
- Identify regulatory deadlines at risk of being missed
- Provide a "wake-up call" metric that makes the urgency tangible` }],
      feature: 'compliance_forecast',
      maxTokens: 4096
    });
  });
}

// =====================================================================
// 4. REGULATORY CHANGE MONITOR
// =====================================================================
async function monitorRegulatoryChanges({ organizationId, frameworks: fwList, provider, model }) {
  // Query ALL adopted frameworks with compliance status for focused analysis
  const adopted = await pool.query(`
    SELECT f.code, f.name, f.version, f.category, f.tier_required,
           COUNT(fc.id) AS total_controls,
           COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') AS implemented_controls,
           ROUND(
             COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric
             / NULLIF(COUNT(fc.id), 0) * 100, 1
           ) AS compliance_pct
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci
      ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.code, f.name, f.version, f.category, f.tier_required
    ORDER BY f.name
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId,
      'You have knowledge of regulatory changes and updates through your training data. ' +
      'Use the full organization context provided to tailor findings to their specific industry, ' +
      'deployment model, data sensitivity types, and compliance posture.',
      'full', null, 'policy'),
    messages: [{ role: 'user', content: `Analyze regulatory changes for EACH framework this organization has adopted.
Focus your analysis on every single framework listed below — do not skip any.

Adopted Frameworks (with current compliance status):
${compactJSON(adopted.rows)}

For EACH adopted framework, provide:
1. Recent and upcoming regulatory changes specific to that framework
2. Impact assessment for each change (High/Medium/Low)
3. New controls or requirements that may need to be added
4. Deprecated or modified controls
5. Timeline for compliance with new requirements
6. Recommended actions to stay ahead of changes

Also provide a cross-framework summary:
- Regulatory changes that affect multiple adopted frameworks simultaneously
- Priority actions across the entire compliance portfolio
- Gaps between current compliance posture and upcoming requirements` }]
  });
}

// =====================================================================
// 7. BOARD/EXECUTIVE REPORTS
// =====================================================================
async function generateExecutiveReport({ organizationId, provider, model }) {
  const stats = await pool.query(`
    SELECT f.code, f.name,
      COUNT(fc.id) as total,
      COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
      COUNT(ci.id) FILTER (WHERE ci.status = 'in_progress') as in_progress,
      ROUND(COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric / NULLIF(COUNT(fc.id),0) * 100, 1) as pct
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1
    GROUP BY f.id, f.code, f.name ORDER BY f.name
  `, [organizationId]);

  const assetStats = await pool.query(`
    SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE criticality = 'critical') as critical,
      COUNT(*) FILTER (WHERE criticality = 'high') as high
    FROM assets WHERE organization_id = $1
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', 'executive compliance report board risk business impact', 'risk'),
    messages: [{ role: 'user', content: `Generate a board-ready executive compliance report.

Compliance Status by Framework:
${compactJSON(stats.rows)}

Asset Summary: ${JSON.stringify(assetStats.rows[0])}

Generate a professional executive report including:
1. Executive Summary (2-3 paragraphs, non-technical)
2. Overall Compliance Score with trend indicator
3. Framework-by-framework breakdown with RAG status (Red/Amber/Green)
4. Top 5 risks requiring board attention
5. Key achievements since last report
6. Resource requirements and budget considerations
7. Recommended board actions / decisions needed
8. 90-day outlook and next milestones` }],
    feature: 'executive_report',
    maxTokens: 3072
  });
}

// =====================================================================
// 8. RISK HEATMAP
// =====================================================================
async function generateRiskHeatmap({ organizationId, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  return withCacheAndDedup(`risk-heatmap:${organizationId}:${cacheProvider}:${cacheModel}`, async () => {
    const [assets, controlGaps] = await Promise.all([
      pool.query(`
        SELECT a.name, ac.code as category, a.criticality, a.security_classification,
          a.status, e.name as environment
        FROM assets a
        JOIN asset_categories ac ON ac.id = a.category_id
        LEFT JOIN environments e ON e.id = a.environment_id
        WHERE a.organization_id = $1
      `, [organizationId]),
      pool.query(`
        SELECT f.code as framework, fc.control_id, fc.title, fc.priority
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1 AND (ci.status IS NULL OR ci.status = 'not_started')
        AND fc.priority::int <= 2
        ORDER BY fc.priority LIMIT 50
      `, [organizationId])
    ]);

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'risk'),
      messages: [{ role: 'user', content: `Generate a risk heatmap analysis.

Assets:
${compactJSON(assets.rows)}

Priority 1-2 Control Gaps:
${compactJSON(controlGaps.rows)}

Provide:
1. Risk matrix (Likelihood x Impact) with specific items placed in each cell
2. Top 10 highest risk items with scores and justification
3. Risk by category (assets, controls, processes)
4. Risk by environment (production vs staging vs dev)
5. Trend analysis and emerging risks
6. Risk acceptance recommendations vs mitigation priorities
7. Return data in a structured JSON section for heatmap visualization:
   { "heatmapData": [{ "item": "name", "likelihood": 1-5, "impact": 1-5, "category": "..." }] }` }]
    });
  });
}

// =====================================================================
// 10. AUDIT READINESS SCORE
// =====================================================================
async function assessAuditReadiness({ organizationId, framework, provider, model }) {
  // Use cache and deduplication to prevent redundant AI calls
  const cacheProvider = provider || 'default';
  const cacheModel = model || 'default';
  const cacheFramework = framework || 'all';
  return withCacheAndDedup(`audit-readiness:${organizationId}:${cacheFramework}:${cacheProvider}:${cacheModel}`, async () => {
    let fwFilter = '';
    const params = [organizationId];
    if (framework) {
      fwFilter = ' AND f.code = $2';
      params.push(framework);
    }

    const [data, evidence] = await Promise.all([
      pool.query(`
        SELECT f.code, f.name, fc.control_id, fc.title, fc.priority,
          COALESCE(ci.status, 'not_started') as status,
          ci.notes, ci.created_at as last_update
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        JOIN framework_controls fc ON fc.framework_id = f.id
        LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
        WHERE of2.organization_id = $1${fwFilter}
        ORDER BY fc.priority, f.code
      `, params),
      pool.query(`
        SELECT COUNT(*) as total_evidence,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') as recent_evidence
        FROM evidence WHERE organization_id = $1
      `, [organizationId])
    ]);

    return chat({
      provider, model, organizationId,
      systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', `audit readiness assessment ${framework || ''} evidence controls documentation`, 'audit'),
      messages: [{ role: 'user', content: `Assess audit readiness${framework ? ' for ' + framework : ''}.

Control Status:
${JSON.stringify(data.rows.slice(0, 100), null, 2)}

Evidence Stats: ${JSON.stringify(evidence.rows[0])}

Provide:
1. Overall Audit Readiness Score (0-100) with letter grade
2. Category-by-category readiness breakdown
3. Items an auditor would flag as findings
4. Missing evidence gaps
5. Controls with stale documentation (>90 days since update)
6. Recommended pre-audit actions (prioritized checklist)
7. Estimated time to become audit-ready
8. Sample auditor questions and suggested responses` }],
      feature: 'audit_readiness',
      maxTokens: 3072
    });
  });
}

// =====================================================================
// 14. NATURAL LANGUAGE COMPLIANCE QUERY
// =====================================================================
async function queryCompliance({ organizationId, question, provider, model }) {
  const stats = await pool.query(`
    SELECT f.code, f.name,
      COUNT(fc.id) as total, COUNT(ci.id) FILTER (WHERE ci.status = 'implemented') as implemented,
      ROUND(COUNT(ci.id) FILTER (WHERE ci.status = 'implemented')::numeric / NULLIF(COUNT(fc.id),0) * 100, 1) as pct
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1 GROUP BY f.id, f.code, f.name
  `, [organizationId]);

  const assetCount = await pool.query('SELECT COUNT(*) as count FROM assets WHERE organization_id = $1', [organizationId]);
  const evidenceCount = await pool.query('SELECT COUNT(*) as count FROM evidence WHERE organization_id = $1', [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, "Answer the user's compliance question based on their actual data. Be specific and cite numbers.", 'compact', null, 'copilot'),
    messages: [{ role: 'user', content: `Question: ${question}

Organization Data:
- Framework Compliance: ${JSON.stringify(stats.rows)}
- Total Assets: ${assetCount.rows[0].count}
- Total Evidence: ${evidenceCount.rows[0].count}

Answer the question thoroughly based on this data.` }]
  });
}

// =====================================================================
// 15. TRAINING RECOMMENDATIONS
// =====================================================================
async function recommendTraining({ organizationId, provider, model }) {
  const gaps = await pool.query(`
    SELECT f.code, fc.control_id, fc.title, fc.priority
    FROM organization_frameworks of2
    JOIN frameworks f ON f.id = of2.framework_id
    JOIN framework_controls fc ON fc.framework_id = f.id
    LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
    WHERE of2.organization_id = $1 AND (ci.status IS NULL OR ci.status = 'not_started')
    ORDER BY fc.priority LIMIT 50
  `, [organizationId]);

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'lean'),
    messages: [{ role: 'user', content: `Recommend security awareness training based on compliance gaps.

Unimplemented Controls:
${compactJSON(gaps.rows)}

Provide:
1. Priority training topics based on gaps (ranked)
2. Target audience for each topic (IT, management, all staff, developers)
3. Recommended training format (online, hands-on, workshop)
4. Suggested training providers/resources
5. Training schedule recommendation
6. How each training topic maps to specific control gaps
7. KPIs to measure training effectiveness` }]
  });
}

module.exports = {
  generateGapAnalysis,
  optimizeCrosswalk,
  forecastCompliance,
  monitorRegulatoryChanges,
  generateExecutiveReport,
  generateRiskHeatmap,
  assessAuditReadiness,
  queryCompliance,
  recommendTraining,
};
