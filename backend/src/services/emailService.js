// @tier: community
'use strict';

const nodemailer = require('nodemailer');

/**
 * Email notification service — wraps nodemailer.
 * Config priority per send call:
 *   1. Per-org organization_settings (smtp_host etc.) — when orgId is provided
 *   2. Environment variables (SMTP_HOST etc.) — fastest, no DB query
 *   3. Platform settings table (smtp_host etc.) — backward compat for existing deployments
 * Gracefully disabled if none of the sources are configured.
 */

// Global transporter cache (env vars / platform settings — no org context)
let _globalTransporter = null;
let _globalSmtpCacheValid = true;

// Per-org transporter cache: Map<orgId, { transporter, valid }>
const _orgTransporterCache = new Map();

// Per-org from-email cache: Map<orgId, { fromEmail }>
const _orgFromEmailCache = new Map();

function invalidateSmtpCache() {
  _globalTransporter = null;
  _globalSmtpCacheValid = false;
}

function invalidateSmtpCacheForOrg(orgId) {
  if (orgId) {
    _orgTransporterCache.delete(orgId);
    _orgFromEmailCache.delete(orgId);
  } else {
    invalidateSmtpCache();
  }
}

/**
 * Build a nodemailer transporter from a config object.
 */
function _createTransporter({ host, port, user, pass }) {
  return nodemailer.createTransport({
    host,
    port: parseInt(port) || 587,
    secure: parseInt(port) === 465,
    auth: user ? { user, pass: pass || '' } : undefined
  });
}

/**
 * Get a transporter configured for a specific org.
 * Reads from organization_settings first, then falls back to global config.
 */
async function _getTransporterForOrg(orgId) {
  const cached = _orgTransporterCache.get(orgId);
  if (cached && cached.valid) return cached.transporter;

  let transporter = null;
  let foundOrgConfig = false;

  try {
    const pool = require('../config/database');
    const { decrypt } = require('../utils/encrypt');
    const result = await pool.query(
      `SELECT setting_key, setting_value, is_encrypted
       FROM organization_settings
       WHERE organization_id = $1 AND setting_key = ANY(ARRAY['smtp_host','smtp_port','smtp_user','smtp_pass'])`,
      [orgId]
    );
    const dbSettings = {};
    for (const row of result.rows) {
      dbSettings[row.setting_key] = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
    }
    if (dbSettings.smtp_host) {
      transporter = _createTransporter({
        host: dbSettings.smtp_host,
        port: dbSettings.smtp_port,
        user: dbSettings.smtp_user,
        pass: dbSettings.smtp_pass
      });
      foundOrgConfig = true;
    }
  } catch {
    // DB not available — fall through to global config
  }

  if (!foundOrgConfig) {
    // Org has no SMTP config — fall back to global (env vars / platform settings)
    transporter = await _getGlobalTransporter();
  }

  // Only cache when the org has its own SMTP config. When falling back to
  // the global transporter we intentionally skip caching so that a later
  // global SMTP configuration change is picked up without requiring an
  // explicit per-org cache invalidation.
  if (foundOrgConfig) {
    _orgTransporterCache.set(orgId, { transporter, valid: true });
  }
  return transporter;
}

/**
 * Get the global (non-org-specific) transporter.
 * Priority: env vars → platform_settings table.
 */
async function _getGlobalTransporter() {
  if (_globalTransporter && _globalSmtpCacheValid) return _globalTransporter;

  let host = process.env.SMTP_HOST;
  let port = process.env.SMTP_PORT;
  let user = process.env.SMTP_USER;
  let pass = process.env.SMTP_PASS;

  if (!host) {
    try {
      const pool = require('../config/database');
      const { decrypt } = require('../utils/encrypt');
      const result = await pool.query(
        `SELECT setting_key, setting_value, is_encrypted
         FROM platform_settings
         WHERE setting_key = ANY(ARRAY['smtp_host','smtp_port','smtp_user','smtp_pass'])`,
        []
      );
      const dbSettings = {};
      for (const row of result.rows) {
        dbSettings[row.setting_key] = row.is_encrypted ? decrypt(row.setting_value) : row.setting_value;
      }
      host = dbSettings.smtp_host;
      port = dbSettings.smtp_port;
      user = dbSettings.smtp_user;
      pass = dbSettings.smtp_pass;
    } catch {
      // DB not available — stay null
    }
  }

  if (!host) {
    _globalTransporter = null;
    _globalSmtpCacheValid = true;
    return null;
  }

  _globalTransporter = _createTransporter({ host, port, user, pass });
  _globalSmtpCacheValid = true;
  return _globalTransporter;
}

// Keep backward-compat alias used by platformAdmin.js invalidation
function getTransporterAsync() {
  return _getGlobalTransporter();
}

async function _getFromEmailForOrg(orgId) {
  if (!orgId) {
    return _getFromEmail();
  }

  const cached = _orgFromEmailCache.get(orgId);
  if (cached) {
    return cached.fromEmail;
  }

  let fromEmail = null;
  try {
    const pool = require('../config/database');
    const result = await pool.query(
      `SELECT setting_value FROM organization_settings
       WHERE organization_id = $1 AND setting_key = 'smtp_from_email' LIMIT 1`,
      [orgId]
    );
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      fromEmail = result.rows[0].setting_value;
    }
  } catch { /* ignore */ }

  if (!fromEmail) {
    fromEmail = await _getFromEmail();
  }

  _orgFromEmailCache.set(orgId, { fromEmail });
  return fromEmail;
}

async function _getFromEmail() {
  if (process.env.FROM_EMAIL) return process.env.FROM_EMAIL;
  try {
    const pool = require('../config/database');
    const result = await pool.query(
      `SELECT setting_value FROM platform_settings WHERE setting_key = 'smtp_from_email' LIMIT 1`
    );
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      return result.rows[0].setting_value;
    }
  } catch { /* ignore */ }
  return process.env.DEFAULT_FROM_EMAIL || 'ControlWeave <noreply@example.com>';
}

// Keep old name as alias for callers that don't have an org context
async function getFromEmail() {
  return _getFromEmail();
}

/**
 * Escape a string for safe embedding in HTML.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Validate that a URL uses a safe scheme (http, https, mailto).
 * Returns the URL if safe, or an empty string if the scheme is dangerous.
 */
function safeLinkUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  // Allow only http://, https://, mailto: and relative paths (starting with /)
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }
  return '';
}

/**
 * Send a notification email to a user.
 * @param {{ email: string, full_name?: string }} user
 * @param {{ title: string, message: string, link?: string|null }} notification
 * @param {string|null} [orgId] - optional org ID for per-org SMTP lookup
 */
async function sendNotificationEmail(user, notification, orgId = null) {
  const transport = orgId ? await _getTransporterForOrg(orgId) : await _getGlobalTransporter();
  if (!transport) return; // SMTP not configured — silent no-op

  const fromEmail = orgId ? await _getFromEmailForOrg(orgId) : await _getFromEmail();
  const name = escapeHtml(user.full_name || user.email);
  const safeTitle = escapeHtml(notification.title);
  const safeMessage = escapeHtml(notification.message);
  const linkHtml = notification.link && safeLinkUrl(notification.link)
    ? `<p><a href="${escapeHtml(safeLinkUrl(notification.link))}" style="color:#7c3aed">View in ControlWeave →</a></p>`
    : '';

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#7c3aed;margin-bottom:4px">ControlWeave</h2>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:24px"/>
      <p>Hi ${name},</p>
      <h3 style="margin-bottom:8px">${safeTitle}</h3>
      <p style="color:#374151">${safeMessage}</p>
      ${linkHtml}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
      <p style="color:#9ca3af;font-size:12px">You're receiving this because you have email notifications enabled.
        Manage preferences in <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/settings?tab=notifications">Settings → Notifications</a>.</p>
    </div>`;

  await transport.sendMail({
    from: fromEmail,
    to: user.email,
    subject: `ControlWeave: ${notification.title}`,
    text: `${notification.title}\n\n${notification.message}${notification.link ? '\n\n' + notification.link : ''}`,
    html
  });
}

async function sendPasswordResetEmail({ email, fullName, resetLink, orgId = null }) {
  const transport = orgId ? await _getTransporterForOrg(orgId) : await _getGlobalTransporter();
  if (!transport) return;

  const fromEmail = orgId ? await _getFromEmailForOrg(orgId) : await _getFromEmail();
  const name = escapeHtml(fullName || email);
  const safeResetLink = escapeHtml(safeLinkUrl(resetLink));
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#7c3aed;margin-bottom:4px">ControlWeave</h2>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:24px"/>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password.</p>
      <p><a href="${safeResetLink}" style="color:#7c3aed">Reset your password →</a></p>
      <p style="color:#6b7280">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
    </div>`;

  await transport.sendMail({
    from: fromEmail,
    to: email,
    subject: 'ControlWeave: Password reset',
    text: `We received a request to reset your password.\n\nUse this link: ${resetLink}\n\nThis link expires in 30 minutes.`,
    html
  });
}

function buildDemoAccountDeliveryTemplate({
  prospectName,
  accountEmail,
  accountPassword,
  loginUrl,
  tierName,
  valueBullets,
  ctaLabel,
  ctaUrl
}) {
  const safeName = escapeHtml(prospectName || 'there')
  const safeTier = escapeHtml(tierName || 'demo')
  const safeLoginUrl = escapeHtml(safeLinkUrl(loginUrl || (process.env.FRONTEND_URL || 'http://localhost:3000')))
  const safePassword = escapeHtml(accountPassword || 'Provided separately by your ControlWeave contact')
  const safeAccountEmail = escapeHtml(accountEmail)
  const bullets = Array.isArray(valueBullets) && valueBullets.length
    ? valueBullets
    : [
      'Framework crosswalk visibility across your selected controls',
      'Evidence and control implementation workflow with audit trails',
      'AI-assisted analysis and tier-aware posture views'
    ]

  const bulletHtml = bullets.map((item) => `<li style="margin:6px 0">${escapeHtml(item)}</li>`).join('')
  const safeCtaLabel = escapeHtml(ctaLabel || 'Book a 20-minute review')
  const safeCtaUrl = escapeHtml(safeLinkUrl(ctaUrl || (loginUrl || (process.env.FRONTEND_URL || 'http://localhost:3000'))))

  return {
    subject: `ControlWeave ${safeTier} demo account ready`,
    text:
`Hi ${safeName},

Your ControlWeave ${safeTier} demo account is ready.

Login URL: ${safeLoginUrl}
Email: ${accountEmail}
Password: ${safePassword}

Suggested next step: ${safeCtaLabel} — ${safeCtaUrl}
`,
    html: `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:24px">
      <h2 style="color:#7c3aed;margin-bottom:4px">ControlWeave</h2>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:20px"/>
      <p>Hi ${safeName},</p>
      <p>Your <strong>${safeTier}</strong> demo account is ready so you can evaluate ControlWeave with realistic workflows.</p>
      <p style="margin:14px 0 6px"><strong>Login details</strong></p>
      <ul style="margin-top:4px">
        <li>URL: <a href="${safeLoginUrl}">${safeLoginUrl}</a></li>
        <li>Email: ${safeAccountEmail}</li>
        <li>Password: ${safePassword}</li>
      </ul>
      <p style="margin:14px 0 6px"><strong>What to check first</strong></p>
      <ul>${bulletHtml}</ul>
      <p style="margin-top:18px"><a href="${safeCtaUrl}" style="color:#7c3aed">${safeCtaLabel} →</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
      <p style="color:#9ca3af;font-size:12px">Need a guided walkthrough? Reply to this email and we will schedule one.</p>
    </div>`
  }
}

function buildSalesFollowUpTemplate({
  prospectName,
  companyName,
  painPoint,
  ctaLabel,
  ctaUrl
}) {
  const safeName = escapeHtml(prospectName || 'there')
  const safeCompany = escapeHtml(companyName || 'your team')
  const safePainPoint = escapeHtml(painPoint || 'reducing manual compliance workload while improving audit readiness')
  const safePainPointHtml = safePainPoint.replace(/\n/g, '<br/>')
  const safeCtaLabel = escapeHtml(ctaLabel || 'Choose a time for a tailored demo')
  const safeCtaUrl = escapeHtml(ctaUrl || (process.env.FRONTEND_URL || 'http://localhost:3000'))

  return {
    subject: `Follow-up: ControlWeave for ${safeCompany}`,
    text:
`Hi ${safeName},

Following up on ControlWeave. Based on our conversation, we can help with ${safePainPoint}.

If useful, you can ${safeCtaLabel}: ${safeCtaUrl}
`,
    html: `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:24px">
      <h2 style="color:#7c3aed;margin-bottom:4px">ControlWeave</h2>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:20px"/>
      <p>Hi ${safeName},</p>
      <p>Quick follow-up from our conversation.</p>
      <p>For <strong>${safeCompany}</strong>, ControlWeave can support <strong>${safePainPointHtml}</strong> with crosswalk intelligence, evidence automation, and audit-ready workflows.</p>
      <p style="margin-top:18px"><a href="${safeCtaUrl}" style="color:#7c3aed">${safeCtaLabel} →</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
      <p style="color:#9ca3af;font-size:12px">Reply directly if you want a side-by-side tier recommendation.</p>
    </div>`
  }
}

async function sendDemoAccountDeliveryEmail({
  toEmail,
  prospectName,
  accountEmail,
  accountPassword,
  loginUrl,
  tierName,
  valueBullets,
  ctaLabel,
  ctaUrl
}) {
  const transport = await getTransporterAsync()
  if (!transport) return false

  const fromEmail = await getFromEmail()
  const template = buildDemoAccountDeliveryTemplate({
    prospectName,
    accountEmail,
    accountPassword,
    loginUrl,
    tierName,
    valueBullets,
    ctaLabel,
    ctaUrl
  })

  await transport.sendMail({
    from: fromEmail,
    to: toEmail,
    subject: template.subject,
    text: template.text,
    html: template.html
  })

  return true
}

async function sendSalesFollowUpEmail({
  toEmail,
  prospectName,
  companyName,
  painPoint,
  ctaLabel,
  ctaUrl
}) {
  const transport = await getTransporterAsync()
  if (!transport) return false

  const fromEmail = await getFromEmail()
  const template = buildSalesFollowUpTemplate({
    prospectName,
    companyName,
    painPoint,
    ctaLabel,
    ctaUrl
  })

  await transport.sendMail({
    from: fromEmail,
    to: toEmail,
    subject: template.subject,
    text: template.text,
    html: template.html
  })

  return true
}

module.exports = {
  sendNotificationEmail,
  sendPasswordResetEmail,
  sendDemoAccountDeliveryEmail,
  sendSalesFollowUpEmail,
  buildDemoAccountDeliveryTemplate,
  buildSalesFollowUpTemplate,
  invalidateSmtpCache,
  invalidateSmtpCacheForOrg
};
