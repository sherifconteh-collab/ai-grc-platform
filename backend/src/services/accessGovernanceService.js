// @tier: community
/**
 * Access governance service: entitlement reporting, separation-of-duties
 * (toxic permission combination) evaluation, role/permission simulation, and
 * access review certification campaigns.
 *
 * Effective-permission resolution intentionally mirrors middleware/auth.js:
 * role_permissions rows are authoritative; the legacy role fallback applies
 * only when a user has zero rows, and primary role 'admin' always implies '*'.
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const pool = require('../config/database');
const { getRoleFallbackPermissions } = require('../middleware/auth');
const { decrypt } = require('../utils/encrypt');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function resolveEffectivePermissions(primaryRole, rolePermissions) {
  const resolved = rolePermissions.length > 0
    ? new Set(rolePermissions)
    : new Set(getRoleFallbackPermissions(primaryRole));
  if (primaryRole === 'admin') resolved.add('*');
  return Array.from(resolved).sort();
}

async function getUserEntitlements(orgId) {
  // users.email is field-level encrypted at rest (see routes/users.js); decrypt
  // post-query and sort by name rather than the encrypted column, whose
  // ciphertext order (random IV per row) does not reflect plaintext order.
  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role AS primary_role, u.is_active,
           COALESCE(ARRAY_AGG(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL), '{}') AS roles,
           COALESCE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.id IS NOT NULL), '{}') AS role_permissions
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.organization_id = $1
    GROUP BY u.id
    ORDER BY u.first_name, u.last_name
  `, [orgId]);

  return rows.map((row) => ({
    id: row.id,
    email: decrypt(row.email),
    first_name: row.first_name,
    last_name: row.last_name,
    primary_role: row.primary_role,
    is_active: row.is_active,
    roles: row.roles,
    permissions: resolveEffectivePermissions(row.primary_role, row.role_permissions)
  }));
}

async function getActiveSodRules(orgId) {
  const { rows } = await pool.query(`
    SELECT id, organization_id, name, description, conflicting_permissions, severity
    FROM sod_rules
    WHERE is_active = true AND (organization_id = $1 OR organization_id IS NULL)
    ORDER BY severity, name
  `, [orgId]);
  return rows;
}

function findRuleViolations(permissions, rules) {
  const held = new Set(permissions);
  return rules.filter((rule) => {
    const conflicting = Array.isArray(rule.conflicting_permissions) ? rule.conflicting_permissions : [];
    return conflicting.length > 0 && conflicting.every((name) => held.has(name));
  });
}

/**
 * Who-has-what report with over-privilege flags. Wildcard holders are surfaced
 * as over-privileged rather than being run through per-rule SoD matching
 * (a '*' account trivially violates every rule, which is noise, not signal).
 */
async function getEntitlementReport(orgId) {
  const users = await getUserEntitlements(orgId);

  const permissionHolderCounts = users.reduce((acc, user) => {
    user.permissions.forEach((name) => {
      acc[name] = (acc[name] || 0) + 1;
    });
    return acc;
  }, {});

  return {
    users,
    permission_holder_counts: permissionHolderCounts,
    flags: {
      wildcard_users: users.filter((user) => user.permissions.includes('*')).map((user) => user.id),
      inactive_users_with_roles: users
        .filter((user) => !user.is_active && user.roles.length > 0)
        .map((user) => user.id)
    },
    totals: {
      users: users.length,
      active_users: users.filter((user) => user.is_active).length
    }
  };
}

async function evaluateSodViolations(orgId) {
  const [users, rules] = await Promise.all([getUserEntitlements(orgId), getActiveSodRules(orgId)]);

  const violations = [];
  const wildcardUsers = [];

  users.forEach((user) => {
    if (user.permissions.includes('*')) {
      wildcardUsers.push({ user_id: user.id, email: user.email });
      return;
    }
    findRuleViolations(user.permissions, rules).forEach((rule) => {
      violations.push({
        user_id: user.id,
        email: user.email,
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        conflicting_permissions: rule.conflicting_permissions
      });
    });
  });

  return { violations, wildcard_users: wildcardUsers, rules_evaluated: rules.length };
}

/**
 * Positive/negative access test for a proposed role set and/or explicit
 * permission list: returns allowed/denied for every permission in the catalog
 * plus any SoD rules the proposed set would violate.
 */
async function simulateAccess(orgId, { roleIds = [], permissions = [] }) {
  const proposed = new Set(permissions);

  if (roleIds.length > 0) {
    const validRoles = await pool.query(
      `SELECT id FROM roles WHERE id = ANY($1::uuid[]) AND (organization_id = $2 OR is_system_role = true)`,
      [roleIds, orgId]
    );
    if (validRoles.rows.length !== roleIds.length) {
      throw httpError(400, 'One or more roles are invalid for this organization');
    }
    const rolePerms = await pool.query(
      `SELECT DISTINCT p.name
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ANY($1::uuid[])`,
      [roleIds]
    );
    rolePerms.rows.forEach((row) => proposed.add(row.name));
  }

  const catalog = await pool.query('SELECT name, resource, action, description FROM permissions ORDER BY resource, action');
  const hasWildcard = proposed.has('*');

  const results = catalog.rows.map((permission) => ({
    permission: permission.name,
    resource: permission.resource,
    action: permission.action,
    description: permission.description,
    allowed: hasWildcard || proposed.has(permission.name)
  }));

  const rules = await getActiveSodRules(orgId);
  const sodViolations = hasWildcard ? [] : findRuleViolations(Array.from(proposed), rules);

  return {
    proposed_permissions: Array.from(proposed).sort(),
    results,
    allowed_count: results.filter((entry) => entry.allowed).length,
    denied_count: results.filter((entry) => !entry.allowed).length,
    sod_violations: sodViolations,
    wildcard: hasWildcard
  };
}

/**
 * Creates a draft campaign and snapshots every active org user's entitlements
 * (including their current SoD violations) into review items.
 */
async function createCampaign(orgId, createdBy, { name, description, dueDate }) {
  const [users, rules] = await Promise.all([getUserEntitlements(orgId), getActiveSodRules(orgId)]);
  const activeUsers = users.filter((user) => user.is_active);
  if (activeUsers.length === 0) throw httpError(400, 'No active users to review');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [campaign] } = await client.query(
      `INSERT INTO access_review_campaigns (organization_id, name, description, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, name, description || null, dueDate || null, createdBy]
    );

    for (const user of activeUsers) {
      const snapshot = {
        roles: user.roles,
        permissions: user.permissions,
        primary_role: user.primary_role,
        sod_violations: user.permissions.includes('*')
          ? []
          : findRuleViolations(user.permissions, rules).map((rule) => rule.name),
        wildcard: user.permissions.includes('*')
      };
      await client.query(
        `INSERT INTO access_review_items (campaign_id, organization_id, subject_user_id, entitlement_snapshot)
         VALUES ($1, $2, $3, $4)`,
        [campaign.id, orgId, user.id, JSON.stringify(snapshot)]
      );
    }

    await client.query('COMMIT');
    return { ...campaign, item_count: activeUsers.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getCampaign(orgId, campaignId) {
  const { rows: [campaign] } = await pool.query(
    'SELECT * FROM access_review_campaigns WHERE id = $1 AND organization_id = $2',
    [campaignId, orgId]
  );
  if (!campaign) throw httpError(404, 'Campaign not found');
  return campaign;
}

async function transitionCampaign(orgId, campaignId, fromStatuses, toStatus) {
  const { rows: [campaign] } = await pool.query(
    `UPDATE access_review_campaigns
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3 AND status = ANY($4::text[])
     RETURNING *`,
    [toStatus, campaignId, orgId, fromStatuses]
  );
  if (!campaign) {
    await getCampaign(orgId, campaignId); // 404 if missing; otherwise it is a state conflict
    throw httpError(409, `Campaign cannot transition to ${toStatus} from its current status`);
  }
  return campaign;
}

async function listCampaignItems(orgId, campaignId) {
  await getCampaign(orgId, campaignId);
  const { rows } = await pool.query(`
    SELECT i.*, su.email AS subject_email, su.first_name AS subject_first_name,
           su.last_name AS subject_last_name, rv.email AS reviewer_email
    FROM access_review_items i
    JOIN users su ON su.id = i.subject_user_id
    LEFT JOIN users rv ON rv.id = i.reviewer_id
    WHERE i.campaign_id = $1 AND i.organization_id = $2
    ORDER BY su.first_name, su.last_name
  `, [campaignId, orgId]);
  // subject_email/reviewer_email come from users.email, which is field-level
  // encrypted at rest (see routes/users.js) — decrypt post-query.
  return rows.map((row) => ({
    ...row,
    subject_email: decrypt(row.subject_email),
    reviewer_email: row.reviewer_email ? decrypt(row.reviewer_email) : null
  }));
}

async function decideItem(orgId, campaignId, itemId, reviewerId, { decision, notes }) {
  const campaign = await getCampaign(orgId, campaignId);
  if (campaign.status !== 'active') {
    throw httpError(409, 'Decisions can only be recorded on an active campaign');
  }

  const { rows: [item] } = await pool.query(
    `UPDATE access_review_items
     SET decision = $1, notes = $2, reviewer_id = $3, decided_at = NOW(), updated_at = NOW()
     WHERE id = $4 AND campaign_id = $5 AND organization_id = $6
     RETURNING *`,
    [decision, notes || null, reviewerId, itemId, campaignId, orgId]
  );
  if (!item) throw httpError(404, 'Review item not found');
  return item;
}

/**
 * Completes an active campaign once every item is decided, writing a
 * generated evidence record (JSON summary of decisions) so the review itself
 * becomes audit evidence. evidence.file_name/file_path are NOT NULL in this
 * schema, so a real summary file is written under uploads/ rather than a
 * file-less row.
 */
async function completeCampaign(orgId, campaignId, completedBy) {
  const campaign = await getCampaign(orgId, campaignId);
  if (campaign.status !== 'active') throw httpError(409, 'Only an active campaign can be completed');

  const { rows: [counts] } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE decision = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE decision = 'certified')::int AS certified,
            COUNT(*) FILTER (WHERE decision = 'revoked')::int AS revoked
     FROM access_review_items WHERE campaign_id = $1 AND organization_id = $2`,
    [campaignId, orgId]
  );
  if (counts.pending > 0) {
    throw httpError(409, `Campaign has ${counts.pending} undecided item(s)`);
  }

  const items = await listCampaignItems(orgId, campaignId);
  const summaryPayload = {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    completed_at: new Date().toISOString(),
    decision_counts: counts,
    items: items.map((item) => ({
      subject_email: item.subject_email,
      decision: item.decision,
      reviewer_email: item.reviewer_email,
      decided_at: item.decided_at,
      notes: item.notes
    }))
  };
  const fileBody = Buffer.from(JSON.stringify(summaryPayload, null, 2), 'utf8');
  const fileHash = createHash('sha384').update(fileBody).digest('hex');
  const fileName = `access-review-${campaign.id}-${new Date().toISOString().split('T')[0]}.json`;
  const diskName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-access-review.json`;
  const filePath = path.join(uploadsDir, diskName);
  await fs.promises.writeFile(filePath, fileBody);

  const retentionUntil = new Date();
  retentionUntil.setDate(retentionUntil.getDate() + 365);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const description = `Access review campaign "${campaign.name}" completed: `
      + `${counts.total} user(s) reviewed, ${counts.certified} certified, ${counts.revoked} marked for revocation. `
      + 'Generated by the access governance module as AC-2 user access review evidence.';
    const { rows: [evidence] } = await client.query(
      `INSERT INTO evidence (
         organization_id, uploaded_by, file_name, file_path, file_size, mime_type,
         description, tags, integrity_hash_sha256, evidence_version, retention_until,
         integrity_verified_at
       )
       VALUES ($1, $2, $3, $4, $5, 'application/json', $6, $7, $8, 1, $9, NOW())
       RETURNING id`,
      [orgId, completedBy, fileName, filePath, fileBody.length, description,
       ['access-review', 'ac-2'], fileHash, retentionUntil.toISOString().split('T')[0]]
    );
    const { rows: [completed] } = await client.query(
      `UPDATE access_review_campaigns
       SET status = 'completed', completed_at = NOW(), evidence_id = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 AND status = 'active' RETURNING *`,
      [evidence.id, campaignId, orgId]
    );
    if (!completed) throw httpError(409, 'Campaign is no longer active');
    await client.query('COMMIT');
    return { ...completed, decision_counts: counts };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getEntitlementReport,
  evaluateSodViolations,
  simulateAccess,
  createCampaign,
  getCampaign,
  transitionCampaign,
  listCampaignItems,
  decideItem,
  completeCampaign,
  // Exported for unit tests
  resolveEffectivePermissions,
  findRuleViolations
};
