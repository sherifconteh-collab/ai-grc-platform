// @tier: community
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TARGET_DIRS = ['src', 'scripts'];

function collectJsFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = TARGET_DIRS
  .map((dir) => path.join(ROOT, dir))
  .filter((dir) => fs.existsSync(dir))
  .flatMap((dir) => collectJsFiles(dir));

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`Syntax check failed: ${path.relative(ROOT, file)}\n`);
    process.stderr.write(result.stderr.toString());
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} files.`);