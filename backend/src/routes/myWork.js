// @tier: community
// My Work: one list of everything waiting on the signed-in user, gathered from
// the modules that assign work (controls, POA&M, risks, exceptions, audit
// requests).
//
// Every source is filtered by organization_id and gated by the same permission
// that guards the module's own list, so this endpoint never shows a record the
// user could not already open. Items carry the record ids the frontend needs to
// build a link to the exact screen (lib/deepLinks.ts); routes live there, not here.
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auditService = require('../services/auditService');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { createOrgRateLimiter } = require('../middleware/rateLimit');
const { log, serializeError } = require('../utils/logger');

// Per-IP ceiling ahead of authentication, then a per-organization limit once the caller is known.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }));
router.use(authenticate);
router.use(createOrgRateLimiter({ windowMs: 60 * 1000, max: 120, label: 'my-work' }));

const PER_SOURCE_LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function can(req, permission) {
  const perms = req.user.permissions || [];
  return perms.includes('*') || perms.includes(permission);
}

// Controls assigned to me that are not yet implemented: the next step is evidence.
async function controlItems(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT ci.id, fc.id AS record_id, fc.control_id AS ref, fc.title, f.name AS context,
            ci.due_date, ci.status
       FROM control_implementations ci
       JOIN framework_controls fc ON fc.id = ci.control_id
       JOIN frameworks f ON f.id = fc.framework_id
      WHERE ci.organization_id = $1 AND ci.assigned_to = $2
        AND ci.status IN ('not_started', 'in_progress', 'needs_review')
      ORDER BY ci.due_date ASC NULLS LAST, fc.control_id
      LIMIT $3`,
    [orgId, userId, PER_SOURCE_LIMIT]
  );
  return rows.map((r) => ({ ...r, kind: 'control' }));
}

async function poamItems(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.id AS record_id, NULL AS ref, p.title, p.priority AS context, p.due_date, p.status
       FROM poam_items p
      WHERE p.organization_id = $1 AND p.owner_id = $2
        AND p.status IN ('open', 'in_progress', 'auditor_rejected')
      ORDER BY p.due_date ASC NULLS LAST
      LIMIT $3`,
    [orgId, userId, PER_SOURCE_LIMIT]
  );
  return rows.map((r) => ({ ...r, kind: 'poam' }));
}

// POA&M closures waiting for an auditor decision; only shown to people who can decide.
async function poamApprovalItems(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.id AS record_id, NULL AS ref, p.title, 'Closure submitted for review' AS context,
            p.due_date, p.status
       FROM poam_items p
      WHERE p.organization_id = $1 AND p.status = 'pending_auditor_review'
        AND p.submitted_by IS DISTINCT FROM $2
      ORDER BY p.submitted_for_review_at ASC NULLS LAST
      LIMIT $3`,
    [orgId, userId, PER_SOURCE_LIMIT]
  );
  return rows.map((r) => ({ ...r, kind: 'poam_approval' }));
}

// Risks I own whose scheduled review is due within two weeks (or already past).
async function riskItems(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.id AS record_id, r.reference AS ref, r.title, r.category AS context,
            r.next_review_date AS due_date, r.status
       FROM risks r
      WHERE r.organization_id = $1 AND r.owner_user_id = $2 AND r.status <> 'closed'
        AND r.next_review_date IS NOT NULL AND r.next_review_date <= CURRENT_DATE + 14
      ORDER BY r.next_review_date ASC
      LIMIT $3`,
    [orgId, userId, PER_SOURCE_LIMIT]
  );
  return rows.map((r) => ({ ...r, kind: 'risk' }));
}

// Exceptions awaiting approval. The requester cannot approve their own (SoD),
// so their own pending requests are left out.
async function exceptionApprovalItems(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT ce.id, ce.id AS record_id, fc.control_id AS ref, ce.title, ce.reason AS context,
            ce.expires_at AS due_date, ce.status
       FROM control_exceptions ce
       JOIN framework_controls fc ON fc.id = ce.control_id
      WHERE ce.organization_id = $1 AND ce.status = 'pending'
        AND ce.created_by IS DISTINCT FROM $2
      ORDER BY ce.created_at ASC
      LIMIT $3`,
    [orgId, userId, PER_SOURCE_LIMIT]
  );
  return rows.map((r) => ({ ...r, kind: 'exception_approval' }));
}

async function pbcItems(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.id AS record_id, NULL AS ref, p.title, e.name AS context,
            p.due_date, p.status, p.engagement_id AS parent_id
       FROM audit_pbc_requests p
       JOIN audit_engagements e ON e.id = p.engagement_id AND e.organization_id = p.organization_id
      WHERE p.organization_id = $1 AND p.assigned_to = $2
        AND p.status IN ('open', 'in_progress', 'rejected')
      ORDER BY p.due_date ASC NULLS LAST
      LIMIT $3`,
    [orgId, userId, PER_SOURCE_LIMIT]
  );
  return rows.map((r) => ({ ...r, kind: 'pbc' }));
}

// Each source runs only when the user holds the permission its own module requires.
// This edition has no ERP module and no Policies frontend page yet (the backend
// tables exist, migration 021/061, but there is no /dashboard/policies screen to
// deep-link into) -- so, unlike ControlWeaver-Pro, there are no erp_review or
// policy sources here.
const SOURCES = [
  { permission: 'controls.read', load: controlItems },
  { permission: 'controls.read', load: poamItems },
  { permission: 'audit.write', load: poamApprovalItems },
  { permission: 'risks.read', load: riskItems },
  { permission: 'controls.write', load: exceptionApprovalItems },
  { permission: 'assessments.read', load: pbcItems }
];

const APPROVAL_KINDS = new Set(['poam_approval', 'exception_approval']);

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function summarize(items) {
  const today = new Date().toISOString().slice(0, 10);
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return {
    total: items.length,
    overdue: items.filter((i) => i.due_date && i.due_date < today).length,
    due_this_week: items.filter((i) => i.due_date && i.due_date >= today && i.due_date <= weekOut).length,
    approvals: items.filter((i) => APPROVAL_KINDS.has(i.kind)).length
  };
}

// GET /api/v1/my-work
router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const active = SOURCES.filter((s) => can(req, s.permission));
    const batches = await Promise.all(active.map((s) => s.load(orgId, userId)));
    const items = batches.flat()
      .map((i) => ({ ...i, id: `${i.kind}:${i.id}`, due_date: toDateOnly(i.due_date) }))
      .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    res.json({ success: true, data: { items, summary: summarize(items) } });
  } catch (error) {
    log('error', 'my_work.list_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to load your work' });
  }
});

const CHECKLIST_SQL = `
  SELECT
    EXISTS (SELECT 1 FROM organization_frameworks WHERE organization_id = $1) AS framework_selected,
    EXISTS (SELECT 1 FROM control_implementations WHERE organization_id = $1 AND status <> 'not_started') AS control_updated,
    EXISTS (SELECT 1 FROM evidence WHERE organization_id = $1) AS evidence_uploaded,
    (SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = true) > 1 AS teammate_invited,
    EXISTS (SELECT 1 FROM risks WHERE organization_id = $1) AS risk_recorded,
    EXISTS (SELECT 1 FROM integration_connectors WHERE organization_id = $1) AS integration_connected`;

// GET /api/v1/my-work/getting-started
router.get('/getting-started', async (req, res) => {
  try {
    const { rows: [flags] } = await pool.query(CHECKLIST_SQL, [req.user.organization_id]);
    res.json({ success: true, data: flags });
  } catch (error) {
    log('error', 'my_work.checklist_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to load the getting-started checklist' });
  }
});

// Audit requests (PBC) assigned to someone outside the audit team had no screen:
// the Auditor Workspace is limited to auditor roles. These two endpoints give the
// assignee a way to read and answer their own request.
async function loadRequest(req) {
  const { rows: [row] } = await pool.query(
    `SELECT p.id, p.engagement_id, p.title, p.request_details, p.priority, p.status, p.due_date,
            p.assigned_to, p.response_notes, p.updated_at, e.name AS engagement_name
       FROM audit_pbc_requests p
       JOIN audit_engagements e ON e.id = p.engagement_id AND e.organization_id = p.organization_id
      WHERE p.id = $1 AND p.organization_id = $2`,
    [req.params.id, req.user.organization_id]
  );
  if (!row) return null;
  const mine = row.assigned_to === req.user.id;
  return mine || can(req, 'assessments.read') ? { row, mine } : null;
}

function requireUuidParam(req, res, next) {
  return UUID_RE.test(req.params.id) ? next() : res.status(400).json({ success: false, error: 'Invalid request id' });
}

// GET /api/v1/my-work/requests/:id
router.get('/requests/:id', requireUuidParam, async (req, res) => {
  try {
    const found = await loadRequest(req);
    if (!found) return res.status(404).json({ success: false, error: 'Request not found' });
    res.json({ success: true, data: { ...found.row, can_respond: found.mine || can(req, 'assessments.write') } });
  } catch (error) {
    log('error', 'my_work.request_get_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to load the request' });
  }
});

// POST /api/v1/my-work/requests/:id/respond
router.post('/requests/:id/respond', requireUuidParam, async (req, res) => {
  try {
    const notes = typeof req.body?.response_notes === 'string' ? req.body.response_notes.trim() : '';
    if (!notes) return res.status(400).json({ success: false, error: 'A response is required' });
    if (notes.length > 10000) return res.status(400).json({ success: false, error: 'Response is too long (10,000 characters max)' });

    const found = await loadRequest(req);
    if (!found) return res.status(404).json({ success: false, error: 'Request not found' });
    if (!found.mine && !can(req, 'assessments.write')) {
      return res.status(403).json({ success: false, error: 'Only the assignee or the audit team can respond' });
    }
    if (['accepted', 'closed'].includes(found.row.status)) {
      return res.status(409).json({ success: false, error: 'This request is already closed' });
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE audit_pbc_requests SET response_notes = $1, status = 'submitted', updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
        RETURNING id, status, response_notes, updated_at`,
      [notes, req.params.id, req.user.organization_id]
    );
    await auditService.logFromRequest(req, {
      eventType: 'assessment.pbc_responded',
      resourceType: 'audit_pbc_request',
      resourceId: req.params.id,
      details: { engagement_id: found.row.engagement_id, previous_status: found.row.status }
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    log('error', 'my_work.request_respond_failed', { error: serializeError(error) });
    res.status(500).json({ success: false, error: 'Failed to save the response' });
  }
});

module.exports = router;
module.exports._internal = { summarize, SOURCES };
