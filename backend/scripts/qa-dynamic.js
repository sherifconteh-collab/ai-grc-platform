// @tier: exclude
/**
 * Dynamic end-to-end QA orchestrator.
 *
 * Default run order:
 *   1) syntax check
 *   2) mega end-to-end suite
 *   3) dynamic SBOM/vulnerability scenarios
 *
 * Usage:
 *   node scripts/qa-dynamic.js
 *
 * Optional env:
 *   QA_DYNAMIC_SUITES=syntax,mega,dynamic,auditor,legacy
 *   QA_DYNAMIC_FAIL_FAST=true
 */
const { spawnSync } = require('child_process');
const path = require('path');

const scriptMap = {
  syntax: 'check-syntax.js',
  mega: 'mega-qa-test.js',
  dynamic: 'qa-dynamic-scenarios.js',
  auditor: 'qa-auditor-workflow.js',
  legacy: 'qa-test.js'
};

const defaultSuites = ['syntax', 'mega', 'dynamic', 'auditor'];
const argSuites = process.argv
  .map((arg) => String(arg || ''))
  .find((arg) => arg.startsWith('--suites='));
const argFailFast = process.argv.includes('--fail-fast');

const requestedSuites = ((argSuites ? argSuites.slice('--suites='.length) : null) || process.env.QA_DYNAMIC_SUITES || defaultSuites.join(','))
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const failFast = argFailFast || String(process.env.QA_DYNAMIC_FAIL_FAST || 'false').toLowerCase() === 'true';

const suites = requestedSuites.filter((suite) => scriptMap[suite]);
const unknownSuites = requestedSuites.filter((suite) => !scriptMap[suite]);

if (suites.length === 0) {
  console.error('No valid suites selected. Supported suites:', Object.keys(scriptMap).join(', '));
  process.exit(1);
}

if (unknownSuites.length > 0) {
  console.warn(`Ignoring unknown suites: ${unknownSuites.join(', ')}`);
}

console.log('\n==========================================');
console.log(' Dynamic End-to-End QA Orchestrator');
console.log('==========================================');
console.log(` Suites: ${suites.join(', ')}`);
console.log(` Fail fast: ${failFast ? 'enabled' : 'disabled'}`);

let failedCount = 0;
const results = [];

for (const suite of suites) {
  const scriptName = scriptMap[suite];
  const scriptPath = path.resolve(__dirname, scriptName);
  const startedAt = Date.now();

  console.log(`\n--- Running suite: ${suite} (${scriptName}) ---`);
  const child = spawnSync(process.execPath, [scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env
  });

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const passed = child.status === 0;
  if (!passed) failedCount += 1;

  results.push({
    suite,
    script: scriptName,
    status: passed ? 'pass' : 'fail',
    code: child.status == null ? 1 : child.status,
    durationSeconds
  });

  console.log(`--- Suite ${suite} ${passed ? 'PASSED' : 'FAILED'} (${durationSeconds}s) ---`);

  if (!passed && failFast) {
    console.log('Fail-fast is enabled. Stopping remaining suites.');
    break;
  }
}

console.log('\n==========================================');
console.log(' QA Dynamic Summary');
console.log('==========================================');
for (const result of results) {
  console.log(
    ` ${result.status === 'pass' ? 'PASS' : 'FAIL'}  ${result.suite}  (${result.durationSeconds}s)  [${result.script}]`
  );
}
console.log(`\n Completed: ${results.length} suite(s), Failed: ${failedCount}`);
console.log('');

process.exit(failedCount > 0 ? 1 : 0);
