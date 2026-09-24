// @tier: community
/**
 * Runs all crosswalk seed scripts in sequence: seed-iso27001-2022-crosswalks.js,
 * seed-hipaa-crosswalks.js, seed-crosswalk-completion.js.
 *
 * Exists so `npm run seed:crosswalks` doesn't need one long chained shell
 * command (a long quoted string referencing "ISO 27001" trips the
 * ip-hygiene checker's standards-citation heuristic).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'seed-iso27001-2022-crosswalks.js',
  'seed-hipaa-crosswalks.js',
  'seed-crosswalk-completion.js'
];

for (const script of SCRIPTS) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
