// @tier: community
'use strict';

/**
 * Update Check Service
 *
 * Polls the public ControlWeave GitHub Releases API to determine whether a
 * newer version of the application is available.  All feature code ships in
 * every build — activating a license key unlocks features already present in
 * the binary.  An "update" therefore delivers new features AND bug-fixes; it
 * never replaces or downloads feature modules separately.
 *
 * Design principles (mirrors licenseService.heartbeatCheck):
 *  - NEVER mandatory — a failed / unreachable check never breaks anything.
 *  - Results are cached for CACHE_TTL_MS (1 hour) to respect GitHub rate limits.
 *  - Uses only Node.js built-ins (https, semver comparison) — no new deps.
 *
 * When a paid license is active (`IS_PRO` from edition.js), the response
 * includes `updateRequired: true` whenever a newer version exists.  The UI
 * renders this as a persistent (snooze-only) banner rather than a dismissable
 * info notice, surfacing the update more prominently for paying customers.
 */

const https = require('https');
const { log } = require('../utils/logger');

const GITHUB_OWNER = 'sherifconteh-collab';
const GITHUB_REPO  = 'ai-grc-platform';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Module-level result cache (shared across all requests in this process). */
let _cache = null;
let _cacheTimestamp = 0;

/**
 * Read the running server's version from backend/package.json.
 * Returns '0.0.0' as a safe fallback if the file cannot be read.
 */
function getCurrentVersion() {
  try {
    // __dirname is .../backend/src/services, so package.json is two levels up.
    return require('../../package.json').version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Compare two semver strings (major.minor.patch).
 * Returns  1 if a > b
 *          0 if a === b
 *         -1 if a < b
 *
 * Handles version strings with or without a leading 'v'.
 * Pre-release suffixes (e.g. '1.2.3-beta') are stripped so only the
 * numeric parts are compared; pre-release versions sort equal to the
 * corresponding stable release.
 */
function compareSemver(a, b) {
  // Strip leading 'v', then strip any pre-release suffix (e.g. '-beta.1').
  const parse = (v) =>
    String(v || '0')
      .replace(/^v/, '')
      .split('-')[0]        // drop pre-release suffix
      .split('.')
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);

  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

/**
 * Fetch the latest GitHub release info.
 * Returns the parsed JSON body or throws on network / parse error.
 *
 * @returns {Promise<Object>} GitHub release object
 */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': `ControlWeave-UpdateCheck/${getCurrentVersion()}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(json);
          } else if (res.statusCode === 404) {
            // No releases published yet — treat as "up to date".
            resolve(null);
          } else {
            reject(new Error(`GitHub API responded with HTTP ${res.statusCode}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse GitHub API response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Update check request timed out'));
    });

    req.end();
  });
}

/**
 * Check for updates.
 *
 * Returns a cached result if the last check was within CACHE_TTL_MS.
 * Pass `force = true` to bypass the cache (used after license activation).
 *
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<UpdateCheckResult>}
 *
 * @typedef {Object} UpdateCheckResult
 * @property {string}  currentVersion  — Running server version
 * @property {string|null} latestVersion  — Latest published version (null if unknown)
 * @property {boolean} available       — True if latestVersion > currentVersion
 * @property {boolean} updateRequired  — True when licensed and an update is available
 * @property {string|null} releaseUrl  — GitHub release page URL
 * @property {string|null} releaseName — Release title from GitHub
 * @property {string}  checkedAt       — ISO timestamp of when the check ran
 * @property {boolean} cacheHit        — True if result came from cache
 * @property {string|null} error       — Non-null when the check failed
 */
async function checkForUpdates({ force = false } = {}) {
  const now = Date.now();
  const currentVersion = getCurrentVersion();

  // Return cache if fresh and not a forced refresh.
  if (!force && _cache && (now - _cacheTimestamp) < CACHE_TTL_MS) {
    return { ..._cache, cacheHit: true };
  }

  let latestVersion = null;
  let releaseUrl    = null;
  let releaseName   = null;
  let errorMsg      = null;

  try {
    const release = await fetchLatestRelease();
    if (release) {
      latestVersion = (release.tag_name || '').replace(/^v/, '');
      releaseUrl    = release.html_url || null;
      releaseName   = release.name || release.tag_name || null;
    }
  } catch (err) {
    errorMsg = err.message;
    log('warn', 'update_check.failed', { error: err.message });
  }

  const available = !!(
    latestVersion &&
    compareSemver(latestVersion, currentVersion) > 0
  );

  // Dynamically read edition module to avoid circular-require issues at startup.
  let isPaid = false;
  try {
    const edition = require('../middleware/edition');
    isPaid = Boolean(edition.IS_PRO);
  } catch {
    // edition module not loaded yet — treat as community
  }

  const result = {
    currentVersion,
    latestVersion,
    available,
    /**
     * updateRequired: true when a paid license is active and an update exists.
     * The frontend renders this as a persistent (snooze-only) banner.
     */
    updateRequired: isPaid && available,
    releaseUrl,
    releaseName,
    checkedAt: new Date().toISOString(),
    cacheHit: false,
    error: errorMsg
  };

  // Only cache successful checks.
  if (!errorMsg) {
    _cache = result;
    _cacheTimestamp = now;
  }

  return result;
}

/**
 * Fire-and-forget update check.
 * Use this after license activation to refresh the cache without blocking
 * the HTTP response.
 */
function triggerUpdateCheck() {
  checkForUpdates({ force: true }).catch((err) => {
    log('warn', 'update_check.background_failed', { error: err.message });
  });
}

/**
 * Invalidate the in-memory cache.
 * Useful in tests.
 */
function clearUpdateCache() {
  _cache = null;
  _cacheTimestamp = 0;
}

module.exports = { checkForUpdates, triggerUpdateCheck, clearUpdateCache, compareSemver };
