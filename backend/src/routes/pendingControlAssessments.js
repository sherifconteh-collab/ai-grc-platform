// @tier: pro
// Pending Control Assessments — AI-suggested control status changes with
// approval workflow. Connected integrations (Splunk today, via
// evidence_collection_rules) produce evidence linked to controls, but
// nothing ever re-evaluated whether that new evidence should change the
// control's implementation status. This mirrors pending_evidence's
// "AI proposes, human approves" pattern (migration 089) for status changes:
// the AI never touches control_implementations directly, only an explicit
// approval does. Ported from ControlWeaver-Pro PR #612.
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const rateLimit = require('express-rate-limit');
const llm = require('../services/llmService');
const { VALID_CONTROL_IMPLEMENTATION_STATUSES } = require('./organizations/_helpers');

// express-rate-limit applied router-wide, ahead of authenticate, so a cheap
// IP-based bound is in place before authenticate's own DB/JWT work runs, and
// so static analysis (CodeQL) can trace a recognized rate-limiting
// middleware covering these routes. The stricter per-route
// createRateLimiter below additionally bounds the AI-calling /scan route.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

router.use(authenticate);
router.use(requireTier('pro'));

const MAX_EVIDENCE_PER_CONTROL = 5;
const MAX_AI_EVIDENCE_SAMPLE_LENGTH = 2000;
const MAX_RULES_PER_SCAN = 10;
const AI_ASSESSMENT_SYSTEM_PROMPT =
  'You assess whether new evidence changes a compliance control\'s implementation status. Respond ONLY with valid JSON, no markdown.';

// Statuses that represent forward compliance progress vs. regression --
// used only to phrase the AI prompt clearly, not to gate what it may
// suggest (unlike the manual PATCH /implementations/:id/status endpoint,
// this workflow is explicitly meant to also surface regressions a human
// reviews before anything is applied).
const STATUS_LIST = Array.from(VALID_CONTROL_IMPLEMENTATION_STATUSES);

function sanitizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return VALID_CONTROL_IMPLEMENTATION_STATUSES.has(status) ? status : null;
}

// Ask the LLM whether new evidence changes a control's implementation status.
// Returns { suggested_status, confidence, reasoning } or null if the AI
// declines to suggest a change (i.e. the evidence doesn't warrant one).
async function aiAssessControlStatus(orgId, control, currentStatus, evidenceSummaries) {
  const payloadStr = JSON.stringify(evidenceSummaries).slice(0, MAX_AI_EVIDENCE_SAMPLE_LENGTH);

  const prompt = `Control: ${control.control_code} - ${control.title}
Current implementation status: ${currentStatus}
Valid statuses: ${STATUS_LIST.join(', ')}

Recent evidence linked to this control:
${payloadStr}

Based on this evidence, should the status change? Consider both forward
progress (evidence supports a more complete status) and regressions
(evidence shows a previously-satisfied control is now failing).

JSON only:
{"should_change": true, "suggested_status": "...", "confidence": 0.75, "reasoning": "..."}
or if no change is warranted:
{"should_change": false}`;

  try {
    const provider = await llm.getOrgDefaultProvider(orgId) || await llm.getPlatformDefaultProvider();
    const model = await llm.getOrgDefaultModel(orgId);
    const response = await llm.chat({
      provider,
      model,
      organizationId: orgId,
      systemPrompt: AI_ASSESSMENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400
    });

    const text = (response.content || response.text || '').trim();
    const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch);
    } catch (parseErr) {
      throw new Error(`Failed to parse LLM response JSON. Raw response snippet: "${text.slice(0, 200)}". Error: ${parseErr.message}`);
    }

    if (!parsed.should_change) return null;

    const suggestedStatus = sanitizeStatus(parsed.suggested_status);
    if (!suggestedStatus || suggestedStatus === currentStatus) return null;

    return {
      suggested_status: suggestedStatus,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      reasoning: String(parsed.reasoning || '').slice(0, 2000) || 'No reasoning provided.'
    };
  } catch (err) {
    console.error('AI control assessment failed:', err.message);
    return null;
  }
}

// ─── POST /api/v1/pending-control-assessments/scan ─────────────────────
// Trigger an AI assessment pass over controls with recent connector-sourced
// evidence, staging any suggested status changes for review.
router.post(
  '/scan',
  createRateLimiter({ label: 'pending-control-assessments-scan', windowMs: 60 * 1000, max: 5 }),
  requirePermission('implementations.write'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const created = [];

      const rules = await pool.query(
        `SELECT id, name, source_type, control_ids
           FROM evidence_collection_rules
          WHERE organization_id = $1 AND enabled = true AND array_length(control_ids, 1) > 0
          ORDER BY last_run_at DESC NULLS LAST
          LIMIT $2`,
        [orgId, MAX_RULES_PER_SCAN]
      );

      const controlIds = [...new Set(rules.rows.flatMap((r) => r.control_ids || []))];
      if (controlIds.length === 0) {
        return res.json({ success: true, message: 'No connector rules with mapped controls to assess.', data: [] });
      }

      const controlsResult = await pool.query(
        `SELECT fc.id, fc.control_id AS control_code, fc.title,
                COALESCE(ci.status, 'not_started') AS current_status
           FROM framework_controls fc
           LEFT JOIN control_implementations ci
             ON ci.control_id = fc.id AND ci.organization_id = $1
          WHERE fc.id = ANY($2::uuid[])`,
        [orgId, controlIds]
      );

      const ruleByControl = new Map();
      for (const rule of rules.rows) {
        for (const cid of rule.control_ids || []) {
          if (!ruleByControl.has(cid)) ruleByControl.set(cid, rule);
        }
      }

      for (const control of controlsResult.rows) {
        try {
          const evidenceResult = await pool.query(
            `SELECT e.id, e.file_name AS title, e.description, e.created_at
               FROM evidence e
               JOIN evidence_control_links ecl ON ecl.evidence_id = e.id
              WHERE e.organization_id = $1 AND ecl.control_id = $2
              ORDER BY e.created_at DESC
              LIMIT $3`,
            [orgId, control.id, MAX_EVIDENCE_PER_CONTROL]
          );
          if (evidenceResult.rows.length === 0) continue;

          const rule = ruleByControl.get(control.id);
          const assessment = await aiAssessControlStatus(
            orgId,
            control,
            control.current_status,
            evidenceResult.rows.map((e) => ({ title: e.title, description: e.description, collected_at: e.created_at }))
          );
          if (!assessment) continue;

          const ins = await pool.query(
            `INSERT INTO pending_control_assessments (
               organization_id, control_id, rule_id, source_type, source_summary,
               current_status, ai_suggested_status, ai_confidence, ai_reasoning, evidence_ids
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[])
             ON CONFLICT (organization_id, control_id) WHERE status = 'pending'
             DO UPDATE SET
               rule_id = EXCLUDED.rule_id, source_type = EXCLUDED.source_type,
               source_summary = EXCLUDED.source_summary, ai_suggested_status = EXCLUDED.ai_suggested_status,
               ai_confidence = EXCLUDED.ai_confidence, ai_reasoning = EXCLUDED.ai_reasoning,
               evidence_ids = EXCLUDED.evidence_ids, updated_at = NOW()
             RETURNING id, ai_suggested_status, ai_confidence, status`,
            [
              orgId,
              control.id,
              rule ? rule.id : null,
              rule ? rule.source_type : 'connector',
              `${evidenceResult.rows.length} evidence item${evidenceResult.rows.length === 1 ? '' : 's'} linked to ${control.control_code}`,
              control.current_status,
              assessment.suggested_status,
              assessment.confidence,
              assessment.reasoning,
              evidenceResult.rows.map((e) => e.id)
            ]
          );
          created.push(ins.rows[0]);
        } catch (controlErr) {
          console.error(`Control assessment failed for ${control.control_code}:`, controlErr.message);
        }
      }

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
         VALUES ($1, $2, 'pending_control_assessment_scan', 'pending_control_assessment', $3::jsonb, true)`,
        [orgId, req.user.id, JSON.stringify({ suggestions_created: created.length })]
      );

      res.json({
        success: true,
        message: `AI assessment complete — ${created.length} status suggestion${created.length !== 1 ? 's' : ''} for your review.`,
        data: created
      });
    } catch (error) {
      console.error('Pending control assessment scan error:', error);
      res.status(500).json({ success: false, error: 'Failed to scan for control status suggestions' });
    }
  }
);

// ─── GET /api/v1/pending-control-assessments ────────────────────────────
router.get('/', requirePermission('implementations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const status = String(req.query.status || 'pending').toLowerCase();
    const validStatuses = ['pending', 'approved', 'rejected', 'all'];
    const filterStatus = validStatuses.includes(status) ? status : 'pending';

    const params = [orgId];
    let statusFilter = '';
    if (filterStatus !== 'all') {
      statusFilter = 'AND pca.status = $2';
      params.push(filterStatus);
    }

    const result = await pool.query(
      `SELECT pca.*, fc.control_id AS control_code, fc.title AS control_title,
              f.code AS framework_code, f.name AS framework_name,
              CONCAT(reviewer.first_name, ' ', reviewer.last_name) AS reviewed_by_name
         FROM pending_control_assessments pca
         JOIN framework_controls fc ON fc.id = pca.control_id
         JOIN frameworks f ON f.id = fc.framework_id
         LEFT JOIN users reviewer ON reviewer.id = pca.reviewed_by
        WHERE pca.organization_id = $1 ${statusFilter}
        ORDER BY pca.created_at DESC
        LIMIT 200`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List pending control assessments error:', error);
    res.status(500).json({ success: false, error: 'Failed to list pending control assessments' });
  }
});

// ─── GET /api/v1/pending-control-assessments/stats ──────────────────────
router.get('/stats', requirePermission('implementations.read'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*)::int AS count
         FROM pending_control_assessments
        WHERE organization_id = $1
        GROUP BY status`,
      [req.user.organization_id]
    );
    const stats = { pending: 0, approved: 0, rejected: 0 };
    for (const row of result.rows) stats[row.status] = row.count;
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Pending control assessment stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load pending control assessment stats' });
  }
});

// ─── POST /api/v1/pending-control-assessments/:id/approve ──────────────
// Applies the suggested status to control_implementations. The only real
// RBAC boundary preserved from the manual status-update endpoint
// (routes/implementations.js) is that only admins/auditors may approve a
// suggestion whose target status is 'verified' -- that endpoint's
// forward-only ordering is intentionally NOT enforced here, since
// surfacing regressions a human then reviews and approves is this
// feature's purpose, not a bug to guard against.
router.post('/:id/approve', requirePermission('implementations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const suggestion = await client.query(
      `SELECT * FROM pending_control_assessments WHERE id = $1 AND organization_id = $2 AND status = 'pending'`,
      [req.params.id, orgId]
    );
    if (suggestion.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending control assessment not found or already reviewed' });
    }
    const row = suggestion.rows[0];

    if (row.ai_suggested_status === 'verified' && req.user.role !== 'admin' && req.user.role !== 'auditor') {
      return res.status(403).json({ success: false, error: 'Only auditors or admins can approve a suggestion setting status to Verified.' });
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO control_implementations (control_id, organization_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (control_id, organization_id) DO UPDATE SET status = $3`,
      [row.control_id, orgId, row.ai_suggested_status]
    );

    await client.query(
      `UPDATE pending_control_assessments
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(),
           review_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, req.body?.notes || null, row.id]
    );

    await client.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
       VALUES ($1, $2, 'control_status_changed', 'control', $3, $4::jsonb)`,
      [
        orgId,
        req.user.id,
        row.control_id,
        JSON.stringify({
          old_status: row.current_status,
          status: row.ai_suggested_status,
          source: 'ai_suggested',
          pending_control_assessment_id: row.id,
          ai_confidence: row.ai_confidence
        })
      ]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { id: row.id, applied_status: row.ai_suggested_status } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Approve pending control assessment error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve control assessment' });
  } finally {
    client.release();
  }
});

// ─── POST /api/v1/pending-control-assessments/:id/reject ───────────────
router.post('/:id/reject', requirePermission('implementations.write'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE pending_control_assessments
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 AND status = 'pending'
       RETURNING id`,
      [req.user.id, req.body?.notes || null, req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending control assessment not found or already reviewed' });
    }
    res.json({ success: true, data: { id: result.rows[0].id, rejected: true } });
  } catch (error) {
    console.error('Reject pending control assessment error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject control assessment' });
  }
});

module.exports = router;
