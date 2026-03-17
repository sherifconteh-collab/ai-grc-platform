// @tier: community
const fs = require('fs');
const os = require('os');
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
  try {
    const source = fs.readFileSync(file, 'utf8').replace(/^#!.*$/m, '');
    const tempBase = path.join(
      os.tmpdir(),
      `controlweave-syntax-${process.pid}-${Buffer.from(path.relative(ROOT, file)).toString('hex')}`
    );

    const runCheck = (ext) => {
      const tempFile = `${tempBase}${ext}`;
      try {
        fs.writeFileSync(tempFile, source);
        return spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
      } finally {
        try {
          fs.unlinkSync(tempFile);
        } catch (_) {
          // ignore temp cleanup failures
        }
      }
    };

    let result = runCheck('.cjs');
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (
      result.status !== 0 &&
      /Cannot use import statement outside a module|Unexpected token 'export'|Unexpected token 'import'/i.test(output)
    ) {
      result = runCheck('.mjs');
    }

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || 'Syntax check failed').trim());
      }
  } catch (error) {
    failed = true;
    process.stderr.write(`Syntax check failed: ${path.relative(ROOT, file)}\n`);
    process.stderr.write(`${error.stack || error.message}\n`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} files.`);
