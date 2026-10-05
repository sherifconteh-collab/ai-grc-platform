// @tier: community
'use strict';

/**
 * Push Notification Service
 *
 * Service for sending push notifications to Android devices via FCM. The channel
 * is optional and gracefully disabled when its credentials are absent from the
 * environment. The service looks up all registered device tokens for a user
 * and sends to the Android ones.
 *
 * iOS (APNs) delivery is not implemented. Device tokens registered with
 * platform 'ios' are stored but skipped here until the iOS app can be built
 * and tested end to end; the old apn package was removed because its
 * node-forge dependency has an unpatched high-severity advisory.
 *
 * Installation:
 *   firebase-admin is declared as an optionalDependency and installed by npm ci.
 *
 * Environment variables required:
 *
 *   FCM (Android):
 *     FIREBASE_SERVICE_ACCOUNT  JSON string of the Firebase Admin SDK service account
 *
 * Sending push notifications is non-blocking — errors are logged but never
 * propagated to callers so that a push failure never breaks an API response.
 */

const pool = require('../config/database');
const { log } = require('../utils/logger');

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

  const androidTokens = rows.filter((r) => r.platform === 'android').map((r) => r.token);

  const tasks = [];
  if (androidTokens.length > 0) tasks.push(sendFcm(androidTokens, title, body, data));

  await Promise.allSettled(tasks);
}

module.exports = { sendPush };
