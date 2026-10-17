// @tier: community
// Who may create an account on this server.
//
//   REGISTRATION_MODE=open         (default) anyone can register and create an
//                                  organization; right for a public SaaS.
//   REGISTRATION_MODE=invite_only  only people an administrator invites or
//                                  creates; right for a company's own server.
//
// Any other value is treated as invite_only, so a typo closes registration
// instead of leaving it open.
const MODES = new Set(['open', 'invite_only']);

function registrationMode(env = process.env) {
  const raw = String(env.REGISTRATION_MODE || 'open').trim().toLowerCase();
  return MODES.has(raw) ? raw : 'invite_only';
}

function isRegistrationOpen(env = process.env) {
  return registrationMode(env) === 'open';
}

module.exports = { registrationMode, isRegistrationOpen };
