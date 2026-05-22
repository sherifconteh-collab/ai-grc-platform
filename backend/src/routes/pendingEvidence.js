// @tier: pro
// Pending Evidence — AI-powered evidence suggestions with approval workflow.
// Connected integrations produce raw data; the AI analyzes it against the org's
// frameworks and suggests evidence items that land here until a user approves or
// rejects them.
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createHash, randomBytes } = require('crypto');
const pool = require('../config/database');
const { authenticate, requireTier, requirePermission } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { isUuid } = require('../middleware/validate');
const llm = require('../services/llmService');
const splunk = require('../services/splunkService');

router.use(authenticate);
router.use(requireTier('pro'));

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── helpers ──────────────────────────────────────────────────────────
const SCAN_TIME_WINDOW = '-24h@h';
const SCAN_MAX_EVENTS = 100;
const MAX_AI_PAYLOAD_LENGTH = 3000;            // ~750 tokens — only need a representative sample
const MAX_SPLUNK_EVENTS_PER_RULE = 200;
const MAX_CONTROLS_FOR_AI = 150;               // Cap control list to keep prompt lean
const MAX_CONTROL_TITLE_LENGTH = 60;           // Truncate long titles to save tokens
const SCAN_MAX_RULES = 5;                      // Limit rule scans per invocation
const AI_EVIDENCE_SYSTEM_PROMPT = 'You map integration log data to compliance controls. Respond ONLY with valid JSON, no markdown.';

function sanitizeName(input) {
  return String(input || 'pending-evidence')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .substring(0, 120) || 'pending-evidence';
}

function getDefaultRetentionDate() {
  const days = Number(process.env.EVIDENCE_DEFAULT_RETENTION_DAYS || 365);
  const dt = new Date();
  dt.setDate(dt.getDate() + Math.max(1, days));
  return dt.toISOString().split('T')[0];
}

// Ask the LLM to analyze raw source data and map it to the org's controls.
// Returns { title, description, confidence, control_ids, tags }
// Token budget: ~2,500 input tokens per call (lightweight system + compact controls + trimmed payload).
async function aiAnalyzeEvidence(orgId, sourceType, rawPayload) {
  // Gather the org's active frameworks + controls for context — capped to keep prompt small
  const frameworksResult = await pool.query(
    `SELECT f.code, fc.id AS control_id, fc.control_id AS control_code,
            LEFT(fc.title, $2) AS truncated_title
     FROM organization_frameworks of2
     JOIN frameworks f ON f.id = of2.framework_id
     JOIN framework_controls fc ON fc.framework_id = f.id
     WHERE of2.organization_id = $1
     ORDER BY f.code, fc.control_id
     LIMIT $3`,
    [orgId, MAX_CONTROL_TITLE_LENGTH, MAX_CONTROLS_FOR_AI]
  );

  if (frameworksResult.rows.length === 0) {
    return { title: `Auto-collected from ${sourceType}`, description: 'No frameworks selected — unable to map to controls.', confidence: 0.3, control_ids: [], tags: [sourceType] };
  }

  // Compact one-line-per-control format: "NIST/AC-1 Access Control Policy [uuid]"
  const controlList = frameworksResult.rows.map(
    (r) => `${r.code}/${r.control_code} ${r.truncated_title} [${r.control_id}]`
  ).join('\n');

  // Only send a small sample of source data — AI just needs to understand the *type* of evidence
  const payloadStr = JSON.stringify(rawPayload).slice(0, MAX_AI_PAYLOAD_LENGTH);

  // Lightweight prompt — no need for the full GRC_SYSTEM with MITRE/OWASP/FIPS context
  const systemPrompt = AI_EVIDENCE_SYSTEM_PROMPT;

  const prompt = `Analyze this "${sourceType}" data and return:
1. title (max 120 chars)
2. description (why this is compliance evidence)
3. confidence (0.0-1.0)
4. control_ids (UUIDs from list below)
5. tags

Data sample:
${payloadStr}

Controls:
${controlList}

JSON only:
{"title":"...","description":"...","confidence":0.85,"control_ids":["uuid"],"tags":["tag"]}`;

  try {
    const provider = await llm.getOrgDefaultProvider(orgId) || await llm.getPlatformDefaultProvider();
    const model = await llm.getOrgDefaultModel(orgId);
    const response = await llm.chat({
      provider,
      model,
      organizationId: orgId,
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 512
    });

    // Parse JSON from AI response (strip markdown fences if present)
    const text = (response.content || response.text || '').trim();
    const jsonMatch = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonMatch);

    // Validate control_ids are real UUIDs from our list
    const validControlIds = new Set(frameworksResult.rows.map((r) => r.control_id));
    const mappedControls = (parsed.control_ids || []).filter((id) => validControlIds.has(id));

    return {
      title: sanitizeName(parsed.title || `Evidence from ${sourceType}`),
      description: String(parsed.description || '').slice(0, 2000),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      control_ids: mappedControls,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 10) : [sourceType]
    };
  } catch (err) {
    console.error('AI evidence analysis failed, using fallback:', err.message);
    return {
      title: `Auto-collected from ${sourceType}`,
      description: `Data collected from ${sourceType} integration. AI analysis unavailable — please review manually.`,
      confidence: 0.3,
      control_ids: [],
      tags: [sourceType, 'needs-review']
    };
  }
}

// ─── POST /api/v1/pending-evidence/scan — trigger AI scan of connected integrations ───
router.post(
  '/scan',
  createRateLimiter({ label: 'pending-evidence-scan', windowMs: 60 * 1000, max: 5 }),
  requirePermission('evidence.write'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const created = [];

      // 1. Check for connected Splunk integration
      const splunkSettings = await splunk.getOrgSplunkSettings(orgId);
      if (splunkSettings.baseUrl && splunkSettings.apiToken) {
        try {
          const cfg = {
            baseUrl: splunkSettings.baseUrl,
            apiToken: splunkSettings.apiToken,
            defaultIndex: splunkSettings.defaultIndex
          };

          // Collect recent audit/security logs — the kind an auditor cares about
          const searches = [
            { label: 'audit-logs', search: `index=_audit OR sourcetype=audit earliest=${SCAN_TIME_WINDOW} latest=now | head ${SCAN_MAX_EVENTS}` },
            { label: 'auth-events', search: `sourcetype=*auth* OR sourcetype=*access* earliest=${SCAN_TIME_WINDOW} latest=now | head ${SCAN_MAX_EVENTS}` }
          ];

          for (const s of searches) {
            try {
              const result = await splunk.runSearch(cfg, {
                search: s.search,
                earliestTime: SCAN_TIME_WINDOW,
                latestTime: 'now',
                maxEvents: SCAN_MAX_EVENTS
              });

              if (result.results && result.results.length > 0) {
                const rawPayload = {
                  source: 'splunk',
                  search_label: s.label,
                  query: s.search,
                  result_count: result.results.length,
                  sample_events: result.results.slice(0, 3),
                  collected_at: new Date().toISOString()
                };

                // Let AI analyze and map to controls
                const analysis = await aiAnalyzeEvidence(orgId, 'splunk', rawPayload);

                const ins = await pool.query(
                  `INSERT INTO pending_evidence
                     (organization_id, source_type, source_summary, ai_title, ai_description,
                      ai_confidence, suggested_controls, suggested_tags, raw_payload)
                   VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8, $9::jsonb)
                   RETURNING id, ai_title, ai_confidence, status`,
                  [
                    orgId,
                    'splunk',
                    `Splunk ${s.label}: ${result.results.length} events`,
                    analysis.title,
                    analysis.description,
                    analysis.confidence,
                    analysis.control_ids,
                    analysis.tags,
                    JSON.stringify(rawPayload)
                  ]
                );
                created.push(ins.rows[0]);
              }
            } catch (searchErr) {
              console.error(`Splunk scan search "${s.label}" failed:`, searchErr.message);
            }
          }
        } catch (splunkErr) {
          console.error('Splunk integration scan failed:', splunkErr.message);
        }
      }

      // 2. Scan any enabled auto-collection rules with scheduled data
      const rules = await pool.query(
        `SELECT * FROM evidence_collection_rules
         WHERE organization_id = $1 AND enabled = true AND source_type = 'splunk'
         ORDER BY created_at DESC LIMIT $2`,
        [orgId, SCAN_MAX_RULES]
      );

      for (const rule of rules.rows) {
        try {
          const splunkCfg = {
            baseUrl: splunkSettings.baseUrl,
            apiToken: splunkSettings.apiToken,
            defaultIndex: splunkSettings.defaultIndex
          };
          if (!splunkCfg.baseUrl || !splunkCfg.apiToken) continue;

          const sc = rule.source_config || {};
          const result = await splunk.runSearch(splunkCfg, {
            search: sc.search,
            earliestTime: sc.earliest_time || SCAN_TIME_WINDOW,
            latestTime: sc.latest_time || 'now',
            maxEvents: Math.min(sc.max_events || SCAN_MAX_EVENTS, MAX_SPLUNK_EVENTS_PER_RULE)
          });

          if (result.results && result.results.length > 0) {
            const rawPayload = {
              source: 'splunk',
              rule_id: rule.id,
              rule_name: rule.name,
              query: sc.search,
              result_count: result.results.length,
              sample_events: result.results.slice(0, 3),
              collected_at: new Date().toISOString()
            };

            const analysis = await aiAnalyzeEvidence(orgId, 'splunk', rawPayload);

            // Merge rule's control_ids with AI-suggested ones
            const ruleControls = Array.isArray(rule.control_ids) ? rule.control_ids : [];
            const mergedControls = [...new Set([...analysis.control_ids, ...ruleControls])];

            const ins = await pool.query(
              `INSERT INTO pending_evidence
                 (organization_id, rule_id, source_type, source_summary, ai_title, ai_description,
                  ai_confidence, suggested_controls, suggested_tags, raw_payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9, $10::jsonb)
               RETURNING id, ai_title, ai_confidence, status`,
              [
                orgId,
                rule.id,
                'splunk',
                `Rule "${rule.name}": ${result.results.length} events`,
                analysis.title,
                analysis.description,
                analysis.confidence,
                mergedControls,
                [...new Set([...analysis.tags, ...(rule.tags || [])])],
                JSON.stringify(rawPayload)
              ]
            );
            created.push(ins.rows[0]);
          }
        } catch (ruleErr) {
          console.error(`Rule scan "${rule.name}" failed:`, ruleErr.message);
        }
      }

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
         VALUES ($1, $2, 'pending_evidence_scan', 'pending_evidence', $3::jsonb, true)`,
        [orgId, req.user.id, JSON.stringify({ suggestions_created: created.length })]
      );

      res.json({
        success: true,
        message: `AI scan complete — ${created.length} evidence suggestion${created.length !== 1 ? 's' : ''} created for your review.`,
        data: created
      });
    } catch (error) {
      console.error('Pending evidence scan error:', error);
      res.status(500).json({ success: false, error: 'Failed to scan integrations for evidence' });
    }
  }
);

// ─── GET /api/v1/pending-evidence — list pending suggestions ─────────
router.get(
  '/',
  createRateLimiter({ label: 'pending-evidence-list', windowMs: 60 * 1000, max: 60 }),
  requirePermission('evidence.read'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const status = req.query.status || 'pending';
      const allowed = ['pending', 'approved', 'rejected'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${allowed.join(', ')}` });
      }

      const result = await pool.query(
        `SELECT pe.id,
                pe.organization_id,
                pe.rule_id,
                pe.source_type,
                pe.source_summary,
                pe.ai_title,
                pe.ai_description,
                pe.ai_confidence,
                pe.suggested_controls,
                pe.suggested_tags,
                pe.status,
                pe.reviewed_by,
                pe.reviewed_at,
                pe.review_notes,
                pe.promoted_evidence_id,
                pe.created_at,
                pe.updated_at,
                u.first_name || ' ' || u.last_name AS reviewed_by_name
          FROM pending_evidence pe
          LEFT JOIN users u ON u.id = pe.reviewed_by
          WHERE pe.organization_id = $1 AND pe.status = $2
          ORDER BY pe.created_at DESC
         LIMIT 100`,
        [orgId, status]
      );

      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('List pending evidence error:', error);
      res.status(500).json({ success: false, error: 'Failed to load pending evidence' });
    }
  }
);

// ─── POST /api/v1/pending-evidence/:id/approve — promote to official evidence ──
router.post(
  '/:id/approve',
  createRateLimiter({ label: 'pending-evidence-approve', windowMs: 60 * 1000, max: 30 }),
  requirePermission('evidence.write'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const pendingId = req.params.id;
      if (!isUuid(pendingId)) {
        return res.status(400).json({ success: false, error: 'Invalid pending evidence ID' });
      }

      const existing = await pool.query(
        'SELECT * FROM pending_evidence WHERE id = $1 AND organization_id = $2',
        [pendingId, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Pending evidence not found' });
      }
      const pe = existing.rows[0];
      if (pe.status !== 'pending') {
        return res.status(409).json({ success: false, error: `Cannot approve — current status is "${pe.status}"` });
      }

      // Write raw payload to disk
      const fileBody = Buffer.from(JSON.stringify(pe.raw_payload, null, 2), 'utf8');
      const fileHash = createHash('sha256').update(fileBody).digest('hex');
      const stamp = Date.now();
      const safeName = sanitizeName(pe.ai_title);
      const fileName = `${safeName}-${new Date().toISOString().split('T')[0]}.json`;
      const diskName = `${stamp}-${randomBytes(8).toString('hex')}-approved.json`;
      const filePath = path.join(uploadsDir, diskName);
      await fs.promises.writeFile(filePath, fileBody);

      const retentionUntil = getDefaultRetentionDate();
      const description = pe.ai_description || `AI-suggested evidence from ${pe.source_type}`;
      const tags = Array.isArray(pe.suggested_tags) ? pe.suggested_tags : [];

      // Insert into official evidence table
      const evidenceIns = await pool.query(
        `INSERT INTO evidence (
           organization_id, uploaded_by, file_name, file_path, file_size, mime_type,
           description, tags, integrity_hash_sha256, evidence_version, retention_until,
           integrity_verified_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, NOW())
         RETURNING id, file_name, file_size, created_at`,
        [
          orgId, req.user.id, fileName, filePath, fileBody.length,
          'application/json', description, tags, fileHash, retentionUntil
        ]
      );
      const evidenceRecord = evidenceIns.rows[0];

      // Link to suggested controls
      const controlIds = Array.isArray(pe.suggested_controls) ? pe.suggested_controls : [];
      if (controlIds.length > 0) {
        const validRows = await pool.query(
          'SELECT id FROM framework_controls WHERE id = ANY($1::uuid[])',
          [controlIds]
        );
        for (const row of validRows.rows) {
          await pool.query(
            `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [evidenceRecord.id, row.id, `AI-suggested mapping (approved by user)`]
          );
        }
      }

      // Mark pending record as approved
      await pool.query(
        `UPDATE pending_evidence
         SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(),
             review_notes = $3, promoted_evidence_id = $4, updated_at = NOW()
         WHERE id = $1`,
        [pendingId, req.user.id, req.body.notes || null, evidenceRecord.id]
      );

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
         VALUES ($1, $2, 'pending_evidence_approved', 'pending_evidence', $3, $4::jsonb, true)`,
        [orgId, req.user.id, pendingId, JSON.stringify({ evidence_id: evidenceRecord.id, title: pe.ai_title })]
      );

      res.json({
        success: true,
        message: 'Evidence approved and added to the official evidence library.',
        data: { pending_id: pendingId, evidence_id: evidenceRecord.id, file_name: evidenceRecord.file_name }
      });
    } catch (error) {
      console.error('Approve pending evidence error:', error);
      res.status(500).json({ success: false, error: 'Failed to approve pending evidence' });
    }
  }
);

// ─── POST /api/v1/pending-evidence/:id/reject — reject suggestion ────
router.post(
  '/:id/reject',
  createRateLimiter({ label: 'pending-evidence-reject', windowMs: 60 * 1000, max: 30 }),
  requirePermission('evidence.write'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const pendingId = req.params.id;
      if (!isUuid(pendingId)) {
        return res.status(400).json({ success: false, error: 'Invalid pending evidence ID' });
      }

      const existing = await pool.query(
        'SELECT * FROM pending_evidence WHERE id = $1 AND organization_id = $2',
        [pendingId, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Pending evidence not found' });
      }
      if (existing.rows[0].status !== 'pending') {
        return res.status(409).json({ success: false, error: `Cannot reject — current status is "${existing.rows[0].status}"` });
      }

      await pool.query(
        `UPDATE pending_evidence
         SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(),
             review_notes = $3, updated_at = NOW()
         WHERE id = $1`,
        [pendingId, req.user.id, req.body.notes || null]
      );

      await pool.query(
        `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
         VALUES ($1, $2, 'pending_evidence_rejected', 'pending_evidence', $3, $4::jsonb, true)`,
        [orgId, req.user.id, pendingId, JSON.stringify({ title: existing.rows[0].ai_title })]
      );

      res.json({ success: true, message: 'Pending evidence rejected.' });
    } catch (error) {
      console.error('Reject pending evidence error:', error);
      res.status(500).json({ success: false, error: 'Failed to reject pending evidence' });
    }
  }
);

// ─── GET /api/v1/pending-evidence/stats — counts by status ───────────
router.get(
  '/stats',
  createRateLimiter({ label: 'pending-evidence-stats', windowMs: 60 * 1000, max: 60 }),
  requirePermission('evidence.read'),
  async (req, res) => {
    try {
      const orgId = req.user.organization_id;
      const result = await pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM pending_evidence
         WHERE organization_id = $1
         GROUP BY status`,
        [orgId]
      );
      const stats = { pending: 0, approved: 0, rejected: 0 };
      for (const row of result.rows) {
        stats[row.status] = row.count;
      }
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Pending evidence stats error:', error);
      res.status(500).json({ success: false, error: 'Failed to load pending evidence stats' });
    }
  }
);

module.exports = router;
