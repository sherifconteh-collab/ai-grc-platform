/**
 * Auditor AI drafting features (PBC requests, workpapers, findings) and
 * TPRM vendor features (vendor risk assessment, questionnaire generation,
 * response analysis, and evidence analysis).
 *
 * Extracted from services/llmService.js as part of the monolith split.
 * Function bodies are identical to the original inline definitions.
 */

'use strict';

const pool = require('../../../config/database');
const { chat, compactJSON, buildPersonalizedSystem } = require('../chatCore');
const { buildFewShotBlock } = require('../exemplarLoader');

// =====================================================================
// 9. VENDOR RISK ASSESSMENT
// =====================================================================
async function assessVendorRisk({ organizationId, vendorInfo, provider, model }) {
  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'compact', null, 'risk'),
    messages: [{ role: 'user', content: `Perform a third-party vendor risk assessment.

Vendor Information:
${compactJSON(vendorInfo)}

Provide:
1. Overall vendor risk score (1-100) with justification
2. Risk breakdown by category:
   - Data security & privacy
   - Business continuity
   - Regulatory compliance
   - Financial stability
   - Operational resilience
3. Key risk factors identified
4. Required contractual controls
5. Recommended monitoring frequency
6. Questionnaire items to send to the vendor
7. Due diligence checklist
8. Compliance framework alignment (which controls does this vendor impact)` }]
  });
}

// =====================================================================
// AUDITOR AI: PBC REQUEST DRAFTING
// =====================================================================
async function generateAuditPbcDraft({
  organizationId,
  provider,
  model,
  requestContext,
  controlId,
  frameworkCode,
  dueDate,
  priority,
  templateStandard
}) {
  if (!requestContext || !String(requestContext).trim()) {
    throw new Error('requestContext is required');
  }

  let control = null;
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.control_id, fc.title, fc.description, f.code as framework_code, f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
      LIMIT 1
    `, [controlId]);
    control = controlResult.rows[0] || null;
  }

  const recentResults = await pool.query(`
    SELECT ar.status, ar.risk_level, ar.finding, ar.evidence_collected,
      ap.procedure_id, ap.title AS procedure_title, fc.control_id, f.code AS framework_code
    FROM assessment_results ar
    JOIN assessment_procedures ap ON ap.id = ar.assessment_procedure_id
    JOIN framework_controls fc ON fc.id = ap.framework_control_id
    JOIN frameworks f ON f.id = fc.framework_id
    WHERE ar.organization_id = $1
    ORDER BY COALESCE(ar.assessed_at, ar.updated_at, ar.created_at) DESC
    LIMIT 20
  `, [organizationId]);

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'You are helping an auditor draft request-for-evidence (PBC) items.', 'compact', null, 'audit'),
    messages: [{
      role: 'user',
      content: `Draft a high-quality PBC (Provided By Client) request that is auditor-ready.

Audit Request Context:
${requestContext}

Optional Metadata:
- frameworkCode: ${frameworkCode || 'not provided'}
- controlId: ${controlId || 'not provided'}
- dueDate: ${dueDate || 'not provided'}
- priority: ${priority || 'not provided'}

Template Standard (follow this structure and tone when provided):
${templateStandard || 'No custom template provided.'}

Control Context (if available):
${compactJSON(control)}

Recent Assessment Context:
${compactJSON(recentResults.rows)}

Return:
1. PBC request title
2. Exact artifacts requested (bulleted list)
3. Period covered and sampling expectations
4. Acceptance criteria (what makes evidence sufficient)
5. Follow-up questions if evidence is incomplete
6. A JSON block:
{
  "title": "...",
  "request_details": "...",
  "requested_artifacts": ["..."],
  "acceptance_criteria": ["..."],
  "suggested_due_date": "${dueDate || ''}",
  "priority": "${priority || 'medium'}"
}`
    }]
  });
}

// =====================================================================
// AUDITOR AI: WORKPAPER DRAFTING
// =====================================================================
async function generateAuditWorkpaperDraft({
  organizationId,
  provider,
  model,
  controlId,
  objective,
  procedurePerformed,
  evidenceSummary,
  testOutcome,
  templateStandard
}) {
  if (!objective || !String(objective).trim()) {
    throw new Error('objective is required');
  }

  let control = null;
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.control_id, fc.title, fc.description, f.code as framework_code, f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
      LIMIT 1
    `, [controlId]);
    control = controlResult.rows[0] || null;
  }

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'You are helping an auditor draft formal workpaper narratives.', 'compact', null, 'audit'),
    messages: [{
      role: 'user',
      content: `Draft an auditor workpaper narrative.

Control Context:
${compactJSON(control)}

Inputs:
- Objective: ${objective}
- Procedure Performed: ${procedurePerformed || 'not provided'}
- Evidence Summary: ${evidenceSummary || 'not provided'}
- Test Outcome: ${testOutcome || 'not provided'}

Template Standard (follow this structure and tone when provided):
${templateStandard || 'No custom template provided.'}

Return:
1. Workpaper title
2. Objective section
3. Scope and sampling section
4. Procedure performed (auditor-style narrative)
5. Results and exceptions
6. Conclusion with alignment to control intent
7. Reviewer checklist
8. A JSON block:
{
  "title": "...",
  "objective": "...",
  "procedure_performed": "...",
  "conclusion": "...",
  "status_recommendation": "draft|in_review|finalized"
}`
    }]
  });
}

// =====================================================================
// AUDITOR AI: FINDING DRAFTING
// =====================================================================
async function generateAuditFindingDraft({
  organizationId,
  provider,
  model,
  controlId,
  issueSummary,
  evidenceSummary,
  severityHint,
  recommendationScope,
  templateStandard,
  schemaRetryHint = null
}) {
  if (!issueSummary || !String(issueSummary).trim()) {
    throw new Error('issueSummary is required');
  }

  let control = null;
  if (controlId) {
    const controlResult = await pool.query(`
      SELECT fc.control_id, fc.title, fc.description, f.code as framework_code, f.name as framework_name
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE fc.id = $1
      LIMIT 1
    `, [controlId]);
    control = controlResult.rows[0] || null;
  }

  const peerFindings = await pool.query(`
    SELECT status, risk_level, finding
    FROM assessment_results
    WHERE organization_id = $1
      AND status = 'other_than_satisfied'
      AND finding IS NOT NULL
    ORDER BY COALESCE(assessed_at, updated_at, created_at) DESC
    LIMIT 10
  `, [organizationId]);

  const retryBlock = schemaRetryHint ? `\n\n[CORRECTION REQUIRED]\n${schemaRetryHint}` : '';

  return chat({
    provider,
    model,
    organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, 'You are helping an auditor draft findings using observation/criteria/cause/effect format.', 'compact', null, 'audit'),
    messages: [{
      role: 'user',
      content: `Draft a formal audit finding.${buildFewShotBlock('finding')}

Control Context:
${compactJSON(control)}

Inputs:
- Issue Summary: ${issueSummary}
- Evidence Summary: ${evidenceSummary || 'not provided'}
- Severity Hint: ${severityHint || 'not provided'}
- Recommendation Scope: ${recommendationScope || 'not provided'}

Template Standard (follow this structure and tone when provided):
${templateStandard || 'No custom template provided.'}

Recent Comparable Findings:
${compactJSON(peerFindings.rows)}

Return a JSON object with:
{
  "title": "...",
  "severity": "low|medium|high|critical",
  "criteria": "...",
  "condition": "...",
  "cause": "...",
  "effect": "...",
  "recommendation": "...",
  "management_response_placeholder": "...",
  "related_controls": ["..."],
  "repeat_finding": false
}${retryBlock}`
    }]
  });
}

// =====================================================================
// TPRM: GENERATE VENDOR QUESTIONNAIRE
// =====================================================================
async function generateVendorQuestionnaire({ organizationId, vendorInfo, provider, model }) {
  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'risk'),
    messages: [{
      role: 'user',
      content: `Generate a security questionnaire for a third-party vendor to assess their security posture and compliance.

Vendor Information:
${compactJSON(vendorInfo)}

Create a comprehensive questionnaire with 15-20 questions covering:
1. Information Security Program (policies, ISMS, certifications)
2. Data Protection & Privacy (data handling, encryption, retention, GDPR/CCPA)
3. Access Control & Identity Management (MFA, PAM, least privilege)
4. Incident Response & Business Continuity (IR plan, RTO/RPO, BCP testing)
5. Vulnerability Management (patching, pen testing, vulnerability scanning)
6. Supply Chain & Subprocessors (fourth-party risk, subprocessor list)
7. Physical Security (data center controls, media disposal)

Return a JSON array of question objects. Each object must have:
- id: sequential string (e.g., "Q1", "Q2")
- category: one of the categories above
- question: the question text
- type: "yes_no", "text", "multiple_choice", or "rating_1_5"
- options: array of strings (only for multiple_choice type, otherwise omit)
- required: boolean
- guidance: brief guidance note for the vendor answering the question

Return ONLY the JSON array, no other text.`
    }]
  });
}

// =====================================================================
// TPRM: ANALYZE QUESTIONNAIRE RESPONSES
// =====================================================================
async function analyzeQuestionnaireResponses({ organizationId, vendorInfo, questions, responses, provider, model }) {
  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'risk'),
    messages: [{
      role: 'user',
      content: `Analyze the completed security questionnaire responses for this third-party vendor.

Vendor Information:
${compactJSON(vendorInfo)}

Questions and Responses:
${compactJSON({ questions, responses })}

Provide:
1. Overall security posture score (0-100) with justification
2. Risk rating: critical / high / medium / low
3. Key findings — both positive and negative
4. Compliance gaps identified
5. Recommended risk mitigations (specific, actionable)
6. Documentation or certifications that should be requested
7. Recommended re-assessment timeline
8. Whether this vendor should be approved, conditionally approved, or rejected

Format your response as structured analysis with clear sections.`
    }]
  });
}

// =====================================================================
// TPRM: ANALYZE VENDOR EVIDENCE (SBOM + DOCUMENTS)
// =====================================================================
const MAX_CONTENT_PREVIEW_LENGTH = 1500;

async function analyzeVendorEvidence({ organizationId, vendorInfo, questionnaireTitle, questions, responses, evidenceList, provider, model }) {
  // Build a concise summary of each evidence file for the prompt (avoid sending full file content for large files)
  const evidenceSummary = evidenceList.map((ev, i) => {
    const parts = [`[Evidence ${i + 1}] "${ev.original_filename}" (${Math.round(ev.file_size_bytes / 1024)} KB)`];
    if (ev.is_sbom && ev.sbom_summary) {
      let s = ev.sbom_summary;
      if (typeof s === 'string') {
        try { s = JSON.parse(s); } catch { s = {}; }
      }
      if (!s || typeof s !== 'object') s = {};
      parts.push(`  Type: SBOM (${s.format || 'unknown format'})`);
      parts.push(`  Components: ${s.component_count || 0}`);
      parts.push(`  Vulnerabilities found: ${s.vulnerability_count || 0}`);
      if (Array.isArray(s.top_vulnerabilities) && s.top_vulnerabilities.length > 0) {
        const vulnList = s.top_vulnerabilities.slice(0, 5).map(v => `${v.id} [${v.severity}]`).join(', ');
        parts.push(`  Top vulnerabilities: ${vulnList}`);
      }
      if (Array.isArray(s.components) && s.components.length > 0) {
        const sampleComponents = s.components.slice(0, 10).map(c => `${c.name}@${c.version || '?'}`).join(', ');
        parts.push(`  Sample components: ${sampleComponents}`);
      }
    } else {
      parts.push(`  Type: Document (${ev.mime_type || 'unknown'})`);
      if (ev.file_content && !ev.file_content.startsWith('base64:')) {
        const preview = ev.file_content.slice(0, MAX_CONTENT_PREVIEW_LENGTH).replace(/\s+/g, ' ').trim();
        if (preview.length > 50) {
          parts.push(`  Content preview: ${preview}${ev.file_content.length > MAX_CONTENT_PREVIEW_LENGTH ? '...' : ''}`);
        }
      }
    }
    return parts.join('\n');
  }).join('\n\n');

  return chat({
    provider, model, organizationId,
    systemPrompt: await buildPersonalizedSystem(organizationId, null, 'minimal', null, 'evidence'),
    messages: [{
      role: 'user',
      content: `You are a third-party risk analyst. A vendor has submitted their security questionnaire responses AND evidence files for review.

Vendor Information:
${compactJSON(vendorInfo)}

Questionnaire: "${questionnaireTitle}"

Questionnaire Responses Summary:
${compactJSON({ questions: (questions || []).slice(0, 10), responses: responses || {} })}

Evidence Submitted (${evidenceList.length} file${evidenceList.length !== 1 ? 's' : ''}):
${evidenceSummary || '(No evidence provided)'}

Analyze the evidence in the context of the questionnaire responses. For each evidence file:
1. Does it corroborate or contradict the vendor's questionnaire answers?
2. For SBOMs: are there known vulnerabilities? Prohibited or high-risk licenses? Outdated components?
3. For documents (certs, reports): are they current? Do they satisfy the control areas asked about?

Then provide an overall evidence-based verification:
- Evidence quality score (0-100)
- Which questionnaire claims are VERIFIED by evidence
- Which claims are UNVERIFIED or CONTRADICTED
- Risk flags identified in the evidence (list with severity: critical/high/medium/low)
- Recommended follow-up requests or remediation actions
- Overall vendor trust assessment

Format your response with clear sections. Be specific and cite the evidence file names.`
    }]
  });
}

module.exports = {
  assessVendorRisk,
  generateAuditPbcDraft,
  generateAuditWorkpaperDraft,
  generateAuditFindingDraft,
  generateVendorQuestionnaire,
  analyzeQuestionnaireResponses,
  analyzeVendorEvidence,
};
