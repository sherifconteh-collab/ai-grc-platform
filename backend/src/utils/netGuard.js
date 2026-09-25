// @tier: community
'use strict';

/**
 * Outbound request guard for tenant-configured URLs (connector base URLs).
 *
 * An organization administrator types the ServiceNow or Qualys address, so without a
 * check the server could be pointed at its own network: the cloud metadata
 * endpoint, the database, or other internal services. Hostnames are resolved
 * and every address is checked, so a public name that resolves to a private
 * address is refused too. Self-hosted deployments that connect to intranet
 * systems set CONNECTOR_ALLOW_PRIVATE_HOSTS=true.
 */

const dns = require('dns').promises;
const net = require('net');

function isPrivateIpv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224;
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('::ffff:')) return isPrivateIpv4(lower.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(lower);
}

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function allowPrivate() {
  return String(process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS || '').toLowerCase() === 'true';
}

/**
 * Parse and check a tenant-supplied URL. Requires https (http only when
 * private hosts are allowed) and a host that resolves to public addresses.
 */
async function assertSafeUrl(rawUrl, { lookup = dns.lookup } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowPrivate())) {
    throw new Error('URL must use https');
  }
  if (url.username || url.password) throw new Error('URL must not contain credentials');
  if (allowPrivate()) return url;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new Error('URL must not point to a private network host');
  }
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('URL must not point to a private network host');
  }
  return url;
}

module.exports = { assertSafeUrl, isPrivateAddress };
