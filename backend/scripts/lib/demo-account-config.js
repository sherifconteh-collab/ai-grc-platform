/**
 * Demo account configuration — Community Edition stub
 *
 * The hosted ControlWeave service ships with pre-configured demo accounts.
 * In the self-hosted community edition there are no demo accounts by default.
 */

const DEMO_EMAILS = (process.env.DEMO_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

function isDemoEmail(email) {
  if (!email) return false;
  return DEMO_EMAILS.includes(String(email).trim().toLowerCase());
}

module.exports = { isDemoEmail, DEMO_EMAILS };
