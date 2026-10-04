// @tier: community
'use strict';

/**
 * Push Notification Service
 *
 * Unified service for sending push notifications to iOS (APNs) and Android (FCM).
 * Both channels are optional and gracefully disabled when their credentials are
 * absent from the environment. The service looks up all registered device tokens
 * for a user and routes each to the appropriate provider.
 *
 * Installation:
 *   firebase-admin is declared as an optionalDependency and installed by npm ci.
 *   iOS push talks to APNs directly over HTTP/2 using Node's built-in http2
 *   module and a provider token signed with jsonwebtoken (ES256). It needs no
 *   extra package: the old apn package pinned node-forge and jsonwebtoken
 *   releases with unfixed high-severity CVEs, so it is no longer used.
 *
 * Environment variables required:
 *
 *   APNs (iOS):
 *     APNS_KEY_ID       10-character key ID from Apple Developer portal
 *     APNS_TEAM_ID      10-character Apple Developer team ID
 *     APNS_KEY_PATH     Absolute path to the .p8 private key file
 *     APNS_BUNDLE_ID    App bundle ID (e.g. com.yourcompany.controlweave)
 *     APNS_PRODUCTION   'true' for production APNs, default is sandbox
 *
 *   FCM (Android):
 *     FIREBASE_SERVICE_ACCOUNT  JSON string of the Firebase Admin SDK service account
 *
 * Sending push notifications is non-blocking — errors are logged but never
 * propagated to callers so that a push failure never breaks an API response.
 */

const pool = require('../config/database');
const { log } = require('../utils/logger');

// ── APNs client (lazy-initialised) ────────────────────────────────────────

const http2 = require('http2');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const APNS_TOKEN_TTL_MS = 50 * 60 * 1000; // Apple rejects provider tokens older than 60 min
const APNS_REQUEST_TIMEOUT_MS = 10000;

let _apnsConfig = null;
let _apnsSession = null;
let _apnsToken = null;

function getApnsConfig() {
  if (_apnsConfig !== null) return _apnsConfig;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyPath = process.env.APNS_KEY_PATH;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if (!keyId || !teamId || !keyPath || !bundleId) {
    log('info', 'push_service.apns.not_configured', {
      note: 'Set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_PATH, APNS_BUNDLE_ID to enable iOS push'
    });
    _apnsConfig = false; // false = checked, unavailable
    return false;
  }

  try {
    const production = process.env.APNS_PRODUCTION === 'true';
    _apnsConfig = {
      key: fs.readFileSync(keyPath, 'utf8'),
      keyId,
      teamId,
      bundleId,
      origin: production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com'
    };
    log('info', 'push_service.apns.initialised', { production, bundleId });
    return _apnsConfig;
  } catch (err) {
    log('warn', 'push_service.apns.init_failed', { error: err.message });
    _apnsConfig = false;
    return false;
  }
}

function getApnsToken(config) {
  const now = Date.now();
  if (_apnsToken && now - _apnsToken.issuedAt < APNS_TOKEN_TTL_MS) return _apnsToken.value;
  const value = jwt.sign({ iss: config.teamId }, config.key, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: config.keyId }
  });
  _apnsToken = { value, issuedAt: now };
  return value;
}

function getApnsSession(config) {
  if (_apnsSession && !_apnsSession.closed && !_apnsSession.destroyed) return _apnsSession;
  const session = http2.connect(config.origin);
  session.on('error', () => { _apnsSession = null; });
  session.on('close', () => { _apnsSession = null; });
  session.unref();
  _apnsSession = session;
  return session;
}

// Resolves to { status, reason } for one device token.
function postApns(config, deviceToken, payload) {
  return new Promise((resolve, reject) => {
    const session = getApnsSession(config);
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${getApnsToken(config)}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), // 24 h
      'content-type': 'application/json'
    });
    let status = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.setTimeout(APNS_REQUEST_TIMEOUT_MS, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.on('response', (headers) => { status = headers[':status']; });
    req.on('data', (chunk) => { raw += chunk; });
    req.on('error', reject);
    req.on('close', () => {
      let reason;
      try { reason = raw ? JSON.parse(raw).reason : undefined; } catch (_) { reason = undefined; }
      resolve({ status, reason });
    });
    req.end(payload);
  });
}

// ── FCM admin app (lazy-initialised) ──────────────────────────────────────

let _firebaseApp = null;

function getFirebaseApp() {
  if (_firebaseApp !== null) return _firebaseApp;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    log('info', 'push_service.fcm.not_configured', {
      note: 'Set FIREBASE_SERVICE_ACCOUNT to enable Android push'
    });
    _firebaseApp = false;
    return false;
  }

  try {
    const admin = require('firebase-admin');
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      log('warn', 'push_service.fcm.invalid_json', { note: 'FIREBASE_SERVICE_ACCOUNT must be valid JSON' });
      _firebaseApp = false;
      return false;
    }

    // Avoid re-initialising if already done (e.g. in tests or hot reload)
    const appName = 'controlweave-push';
    try {
      _firebaseApp = admin.app(appName);
    } catch {
      _firebaseApp = admin.initializeApp(
        { credential: admin.credential.cert(serviceAccount) },
        appName
      );
    }

    log('info', 'push_service.fcm.initialised', { projectId: serviceAccount.project_id });
    return _firebaseApp;
  } catch (err) {
    log('warn', 'push_service.fcm.init_failed', { error: err.message });
    _firebaseApp = false;
    return false;
  }
}

// ── APNs delivery ─────────────────────────────────────────────────────────

async function sendApns(tokens, title, body, data) {
  const config = getApnsConfig();
  if (!config) return;

  const payload = JSON.stringify({
    ...(data || {}),
    aps: { alert: { title, body }, sound: 'default' }
  });

  const expired = [];
  await Promise.all(tokens.map(async (deviceToken) => {
    try {
      const { status, reason } = await postApns(config, deviceToken, payload);
      if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
        expired.push(deviceToken);
      } else if (status !== 200) {
        log('warn', 'push_service.apns.send_failed', { status, reason });
      }
    } catch (err) {
      log('warn', 'push_service.apns.send_failed', { error: err.message });
    }
  }));

  if (expired.length > 0) {
    await pruneStaleTokens(expired);
  }
}

// ── FCM delivery ──────────────────────────────────────────────────────────

async function sendFcm(tokens, title, body, data) {
  const app = getFirebaseApp();
  if (!app) return;

  const admin = require('firebase-admin');
  const messaging = admin.messaging(app);

  const stringData = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = String(v);
    }
  }

  const batchSize = 500; // FCM sendEachForMulticast limit
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    try {
      const result = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: stringData,
        android: { priority: 'high' }
      });

      const stale = [];
      result.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          const code = r.error.code || '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            stale.push(batch[idx]);
          }
        }
      });
      if (stale.length > 0) {
        await pruneStaleTokens(stale);
      }
    } catch (err) {
      log('warn', 'push_service.fcm.send_failed', { error: err.message });
    }
  }
}

// ── Prune invalid tokens ───────────────────────────────────────────────────

async function pruneStaleTokens(tokens) {
  if (!tokens || tokens.length === 0) return;
  try {
    await pool.query(
      'DELETE FROM device_push_tokens WHERE token = ANY($1::text[])',
      [tokens]
    );
    log('info', 'push_service.tokens.pruned', { count: tokens.length });
  } catch (err) {
    log('warn', 'push_service.tokens.prune_failed', { error: err.message });
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Send a push notification to all active devices for a user.
 *
 * Non-blocking: errors are logged and swallowed so callers are never affected.
 *
 * @param {string} userId
 * @param {string} title
 * @param {string} body
 * @param {object} [data] - Optional key/value payload delivered alongside the notification
 */
async function sendPush(userId, title, body, data) {
  if (!userId) return;

  let rows;
  try {
    const result = await pool.query(
      'SELECT token, platform FROM device_push_tokens WHERE user_id = $1',
      [userId]
    );
    rows = result.rows;
  } catch (err) {
    log('warn', 'push_service.lookup_failed', { userId, error: err.message });
    return;
  }

  if (!rows || rows.length === 0) return;

  const iosTokens = rows.filter((r) => r.platform === 'ios').map((r) => r.token);
  const androidTokens = rows.filter((r) => r.platform === 'android').map((r) => r.token);

  const tasks = [];
  if (iosTokens.length > 0) tasks.push(sendApns(iosTokens, title, body, data));
  if (androidTokens.length > 0) tasks.push(sendFcm(androidTokens, title, body, data));

  await Promise.allSettled(tasks);
}

module.exports = { sendPush };
