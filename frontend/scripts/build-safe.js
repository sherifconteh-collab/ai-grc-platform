const { spawnSync } = require('child_process');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const nextBin = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const defaultDist = '.next-build';

function runBuild(distDir) {
  const env = { ...process.env, NEXT_DIST_DIR: distDir };
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: appRoot,
    env,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function hasWindowsLockError(output) {
  return /EPERM|operation not permitted|resource busy|EBUSY/i.test(output || '');
}

const explicitDist = process.env.NEXT_DIST_DIR;
const attemptDirs = explicitDist
  ? [explicitDist]
  : [
      defaultDist,
      '.next-build-fallback',
      `.next-build-${Date.now()}`,
      `.next-build-${Date.now()}-2`
    ];

let finalResult = null;
for (let i = 0; i < attemptDirs.length; i++) {
  const distDir = attemptDirs[i];
  if (i === 0) {
    console.log(`Building with NEXT_DIST_DIR=${distDir}`);
  } else {
    console.warn(`Retrying build with NEXT_DIST_DIR=${distDir}`);
  }

  const result = runBuild(distDir);
  finalResult = result;
  if (result.status === 0) {
    process.exit(0);
  }

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!hasWindowsLockError(combinedOutput)) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

process.exit(finalResult?.status == null ? 1 : finalResult.status);
