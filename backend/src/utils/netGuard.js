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

const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const { Readable } = require('stream');

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
async function assertSafeUrl(rawUrl, { lookup = dns.promises.lookup, allowPrivateHosts = allowPrivate(), allowHttp = allowPrivateHosts } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowHttp)) {
    throw new Error('URL must use https');
  }
  if (url.username || url.password) throw new Error('URL must not contain credentials');
  if (allowPrivateHosts) return url;
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

function privateHostError() {
  const error = new Error('URL must not point to a private network host');
  error.code = 'EPRIVATEHOST';
  return error;
}

/**
 * dns.lookup replacement for outbound sockets. assertSafeUrl resolves the name
 * once, but a plain fetch() resolves it again when it connects, and a hostile
 * DNS server can answer with a public address the first time and a private one
 * the second (DNS rebinding). This lookup runs at connect time and refuses a
 * private address, so the address that is checked is the address used.
 */
function guardedLookup(hostname, options, callback) {
  return lookupFor(allowPrivate())(hostname, options, callback);
}

function lookupFor(allowPrivateHosts) {
  return (hostname, options, callback) => {
    const opts = typeof options === 'function' ? {} : (typeof options === 'number' ? { family: options } : options || {});
    const done = typeof options === 'function' ? options : callback;
    dns.lookup(hostname, { ...opts, all: true }, (error, addresses) => {
      if (error) return done(error);
      if (!allowPrivateHosts && (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address)))) {
        return done(privateHostError());
      }
      if (opts.all) return done(null, addresses);
      return done(null, addresses[0].address, addresses[0].family);
    });
  };
}

function headerEntries(headers) {
  if (!headers) return {};
  const out = {};
  new Headers(headers).forEach((value, key) => { out[key] = value; });
  return out;
}

function requestBody(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return Buffer.from(body.buffer || body);
  throw new Error('safeFetch supports string, Buffer and URLSearchParams bodies');
}

/**
 * fetch()-compatible client for tenant-supplied URLs: runs assertSafeUrl, pins
 * the connection with guardedLookup, and never follows redirects (a redirect
 * is an error, since it could lead to a private address). The response body
 * streams, so SDKs that stream (OpenAI-compatible Ollama) work unchanged.
 * The third argument overrides CONNECTOR_ALLOW_PRIVATE_HOSTS for callers with
 * their own setting (webhooks).
 */
async function safeFetch(input, init = {}, { allowPrivateHosts = allowPrivate(), allowHttp = allowPrivateHosts } = {}) {
  const url = await assertSafeUrl(typeof input === 'string' ? input : input.url || String(input), { allowPrivateHosts, allowHttp });
  const transport = url.protocol === 'https:' ? https : http;
  const body = requestBody(init.body);
  const headers = headerEntries(init.headers);
  if (body !== null && headers['content-length'] === undefined) headers['content-length'] = String(Buffer.byteLength(body));
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: (init.method || 'GET').toUpperCase(),
      headers,
      lookup: lookupFor(allowPrivateHosts),
      signal: init.signal || undefined
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        return reject(new Error(`${url.host} answered with a redirect, which is not followed`));
      }
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        for (const item of [].concat(value)) responseHeaders.append(key, item);
      }
      const noBody = res.statusCode === 204 || res.statusCode === 304 || req.method === 'HEAD';
      if (noBody) res.resume();
      resolve(new Response(noBody ? null : Readable.toWeb(res), { status: res.statusCode, statusText: res.statusMessage, headers: responseHeaders }));
    });
    req.on('error', (error) => {
      if (error.name === 'AbortError' && init.signal && init.signal.reason) return reject(init.signal.reason);
      return reject(error);
    });
    if (body !== null) req.write(body);
    req.end();
  });
}

module.exports = { assertSafeUrl, isPrivateAddress, guardedLookup, safeFetch };
