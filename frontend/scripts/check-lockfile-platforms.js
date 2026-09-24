// Guards against a real incident: frontend/package-lock.json was regenerated
// with `npm install --package-lock-only`, which silently prunes every
// platform variant of a multi-platform native optional dependency down to
// just the platform the command ran on. The Windows release build (which
// needs `lightningcss-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`,
// etc. to run `next build`) then fails ~40 minutes into the CI matrix with a
// cryptic "Cannot find module" error instead of a clear one at commit time.
// Run with `node scripts/check-lockfile-platforms.js` from `frontend/`.
'use strict';

const fs = require('fs');
const path = require('path');

const LOCKFILE_PATH = path.join(__dirname, '..', 'package-lock.json');

// Base packages known to ship OS/CPU-specific optional dependencies that the
// Electron release build (Windows, macOS x64 + arm64, Linux) requires.
const NATIVE_PACKAGE_BASES = [
  'node_modules/lightningcss',
  'node_modules/@tailwindcss/oxide',
  'node_modules/sharp',
  'node_modules/unrs-resolver'
];

// Platform variants every release build target needs present in the lockfile.
const REQUIRED_PLATFORM_SUFFIXES = ['win32-x64-msvc', 'darwin-arm64', 'darwin-x64'];

function main() {
  const lockfile = JSON.parse(fs.readFileSync(LOCKFILE_PATH, 'utf8'));
  const pkgs = lockfile.packages || {};
  const missing = [];

  for (const base of NATIVE_PACKAGE_BASES) {
    const baseEntry = pkgs[base];
    if (!baseEntry || !baseEntry.optionalDependencies) continue;

    const declaredVariants = Object.keys(baseEntry.optionalDependencies);
    for (const suffix of REQUIRED_PLATFORM_SUFFIXES) {
      const variantName = declaredVariants.find((v) => v.endsWith(suffix));
      if (!variantName) continue; // this base doesn't ship that platform at all
      if (!pkgs[`node_modules/${variantName}`]) {
        missing.push(variantName);
      }
    }
  }

  if (missing.length > 0) {
    console.error('frontend/package-lock.json is missing cross-platform native binding entries:');
    missing.forEach((name) => console.error(`  - ${name}`));
    console.error('\nThis happens when the lockfile is regenerated with `npm install --package-lock-only`,');
    console.error('which only resolves optional dependencies for the current platform. Fix by running a');
    console.error('full `npm install` (not --package-lock-only) in frontend/ and committing the result.');
    process.exit(1);
  }

  console.log('frontend/package-lock.json has all required cross-platform native binding entries.');
}

main();
