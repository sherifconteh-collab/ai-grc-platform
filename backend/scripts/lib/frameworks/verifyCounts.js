// @tier: community
/**
 * Fails loudly if the live frameworks array drifts from the expected-counts
 * manifest, so a wave PR that silently under- or over-seeds a framework
 * breaks the seed run instead of shipping unnoticed (issue #218).
 */

const expected = require('./expected-counts');

function verifyExpectedCounts(frameworks) {
  const errors = [];

  if (frameworks.length !== expected.totalFrameworks) {
    errors.push(`Expected ${expected.totalFrameworks} frameworks, found ${frameworks.length}.`);
  }

  const seenCodes = new Set();
  for (const fw of frameworks) {
    seenCodes.add(fw.code);
    const expectedCount = expected.perFramework[fw.code];
    if (expectedCount === undefined) {
      errors.push(`Framework "${fw.code}" is not in the expected-counts manifest (lib/frameworks/expected-counts.js). Regenerate it.`);
    } else if (fw.controls.length !== expectedCount) {
      errors.push(`Framework "${fw.code}": expected ${expectedCount} controls, found ${fw.controls.length}.`);
    }
  }

  for (const code of Object.keys(expected.perFramework)) {
    if (!seenCodes.has(code)) {
      errors.push(`Framework "${code}" is in the expected-counts manifest but missing from lib/frameworks/index.js.`);
    }
  }

  const totalControls = frameworks.reduce((sum, f) => sum + f.controls.length, 0);
  if (totalControls !== expected.totalControls) {
    errors.push(`Expected ${expected.totalControls} total controls, found ${totalControls}.`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Framework catalog drifted from lib/frameworks/expected-counts.js:\n  - ${errors.join('\n  - ')}\n` +
      'If this drift is intentional, regenerate the manifest (see the comment at the top of expected-counts.js).'
    );
  }
}

module.exports = { verifyExpectedCounts };
