// @tier: community
const fs = require('fs');
const path = require('path');
const Module = require('module');
const vm = require('vm');

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
    const source = fs.readFileSync(file, 'utf8').replace(/^#!.*\r?\n/, '');
    new vm.Script(Module.wrap(source), { filename: file });
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
