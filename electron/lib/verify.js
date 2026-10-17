'use strict';

/**
 * End-to-end check of a running stack, shared by the packaged app's
 * --smoke-test flag and scripts/stack-smoke.js: sign in through the frontend
 * proxy with the first-run administrator credentials, exactly as a user would.
 */

const http = require('http');

function postJson(url, body) {
  const target = new URL(url);
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data),
        'x-cw-client': 'web',
        origin: `${target.protocol}//${target.host}`,
      },
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.setTimeout(30_000, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end(data);
  });
}

async function verifySignIn(stack) {
  const { status, text } = await postJson(`${stack.frontendUrl}/api/v1/auth/login`, {
    email: stack.admin.email,
    password: stack.admin.password,
  });
  if (status !== 200) {
    throw new Error(`Sign-in through the frontend returned HTTP ${status}: ${text.slice(0, 300)}`);
  }
  const body = JSON.parse(text);
  if (!body.success || !body.data || !body.data.user || !body.data.user.is_platform_admin) {
    throw new Error(`Sign-in succeeded but did not return the platform administrator: ${text.slice(0, 300)}`);
  }
}

module.exports = { verifySignIn };
