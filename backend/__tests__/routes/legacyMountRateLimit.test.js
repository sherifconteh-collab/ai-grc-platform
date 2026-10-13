'use strict';

/**
 * server.js cannot be required in a unit test (it opens the database and
 * listens on a port), so this checks the registration order in the source:
 * every unversioned /api/<name> mount must be covered by an
 * app.use([...], apiRateLimiter) statement that appears before the mount.
 */

const fs = require('fs');
const path = require('path');

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'server.js'), 'utf8');

function limitedLegacyPaths() {
  const covered = new Map();
  const re = /app\.use\(\s*(\[[^\]]*\]|'[^']*')\s*,\s*apiRateLimiter\s*\)/g;
  let match;
  while ((match = re.exec(SERVER_SRC)) !== null) {
    const paths = match[1].match(/'(\/api\/[^']*)'/g) || [];
    for (const p of paths) covered.set(p.replace(/'/g, ''), match.index);
  }
  return covered;
}

function legacyMounts() {
  const mounts = [];
  // Route mounts only: the limiter statement itself is followed by apiRateLimiter.
  const re = /app\.use\(\s*'(\/api\/(?!v1(?:\/|'))[^']*)'\s*,\s*(?!apiRateLimiter)/g;
  let match;
  while ((match = re.exec(SERVER_SRC)) !== null) {
    mounts.push({ mountPath: match[1], index: match.index });
  }
  return mounts;
}

describe('legacy unversioned /api mounts', () => {
  const covered = limitedLegacyPaths();
  const mounts = legacyMounts();

  test('the three known legacy mounts exist', () => {
    const names = mounts.map((m) => m.mountPath).sort();
    expect(names).toEqual(['/api/assets', '/api/environments', '/api/service-accounts']);
  });

  test.each(['/api/assets', '/api/environments', '/api/service-accounts'])(
    '%s is behind apiRateLimiter before it is mounted',
    (mountPath) => {
      expect(covered.has(mountPath)).toBe(true);
      const mount = mounts.find((m) => m.mountPath === mountPath);
      expect(covered.get(mountPath)).toBeLessThan(mount.index);
    }
  );

  test('the limiter is the same apiRateLimiter used for /api/v1', () => {
    expect(SERVER_SRC).toMatch(/app\.use\('\/api\/v1',\s*apiRateLimiter\)/);
    expect(SERVER_SRC.match(/const apiRateLimiter = createRateLimiter\(/g)).toHaveLength(1);
  });
});
