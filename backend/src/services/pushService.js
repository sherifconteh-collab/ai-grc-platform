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
 *
 *   apn (iOS APNs) is NOT declared as a dependency because the published v2.x
 *   releases pin node-forge@^0.7.1 and jsonwebtoken@^8.x, both of which contain
 *   unfixed high-severity CVEs that would fail the CI audit gate. To enable iOS
 *   push in a production environment, install apn separately after auditing:
 *
 *     npm install --no-save apn
 *
 *   The service will automatically detect and use it at runtime once installed.
 *   Without apn, only Android (FCM) push is delivered.
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

let _apnsProvider = null;

function getApnsProvider() {
  if (_apnsProvider !== null) return _apnsProvider;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyPath = process.env.APNS_KEY_PATH;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if (!keyId || !teamId || !keyPath || !bundleId) {
    log('info', 'push_service.apns.not_configured', {
      note: 'Set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_PATH, APNS_BUNDLE_ID to enable iOS push'
    });
    _apnsProvider = false; // false = checked, unavailable
    return false;
  }

  try {
    const apn = require('apn');
    const production = process.env.APNS_PRODUCTION === 'true';
    _apnsProvider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production
    });
    log('info', 'push_service.apns.initialised', { production, bundleId });
    return _apnsProvider;
  } catch (err) {
    log('warn', 'push_service.apns.init_failed', { error: err.message });
    _apnsProvider = false;
    return false;
  }
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
  const provider = getApnsProvider();
  if (!provider) return;

  const apn = require('apn');
  const bundleId = process.env.APNS_BUNDLE_ID;

  const notification = new apn.Notification();
  notification.alert = { title, body };
  notification.sound = 'default';
  notification.topic = bundleId;
  notification.payload = data || {};
  notification.expiry = Math.floor(Date.now() / 1000) + 86400; // 24 h

  try {
    const result = await provider.send(notification, tokens);
    if (result.failed && result.failed.length > 0) {
      const expired = result.failed
        .filter((f) => f.response && f.response.reason === 'BadDeviceToken')
        .map((f) => f.device);
      if (expired.length > 0) {
        await pruneStaleTokens(expired);
      }
    }
  } catch (err) {
    log('warn', 'push_service.apns.send_failed', { error: err.message });
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
