#!/usr/bin/env node
/**
 * README <-> website stats sync.
 *
 * The marketing homepage quotes the platform's scale (frameworks, controls,
 * crosswalk mappings, MCP tool count) from src/lib/platformStats.ts.
 * README.md quotes the same numbers in prose. Nothing enforced the two
 * stayed equal, which is exactly how the homepage drifted to stale numbers
 * ('30+' frameworks, '670+' controls) while the README was corrected. This
 * script parses both sources and fails when they disagree, so a README
 * update and a website update can't silently split apart again.
 *
 * Usage: node scripts/check-readme-website-sync.js  (from frontend/)
 */
const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');
const STATS_PATH = path.join(FRONTEND_ROOT, 'src', 'lib', 'platformStats.ts');

function readFile(p) {
  if (!fs.existsSync(p)) {
    console.error(`Missing file: ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

function extractStatsConstant(source, name) {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*['"]?([^;'"]+)['"]?;`));
  return match ? match[1].trim() : null;
}

function allMatches(source, regex) {
  const out = [];
  let m;
  const re = new RegExp(regex, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

const readme = readFile(README_PATH);
const stats = readFile(STATS_PATH);

const checks = [
  {
    label: 'Frameworks count',
    website: extractStatsConstant(stats, 'FRAMEWORKS_COUNT'),
    readme: allMatches(readme, /(\d+) frameworks with [\d,+]+ controls/g)
      .concat(allMatches(readme, /(\d+) major compliance frameworks/g)),
  },
  {
    label: 'Controls count label',
    website: extractStatsConstant(stats, 'CONTROLS_COUNT_LABEL'),
    readme: allMatches(readme, /\d+ frameworks with ([\d,+]+) controls/g),
  },
  {
    label: 'Crosswalks count label',
    website: extractStatsConstant(stats, 'CROSSWALKS_COUNT_LABEL'),
    readme: allMatches(readme, /([\d,+]+) mappings showing control overlaps/g)
      .concat(allMatches(readme, /Crosswalks\*\*: ([\d,+]+) cross-framework mappings/g)),
  },
  {
    label: 'Route modules count',
    website: extractStatsConstant(stats, 'ROUTE_MODULES_COUNT'),
    readme: allMatches(readme, /(\d+) route modules/g),
  },
  {
    label: 'Migrations count',
    website: extractStatsConstant(stats, 'MIGRATIONS_COUNT'),
    readme: allMatches(readme, /(\d+) (?:sequential[, ].*?migration files|migration files)/g),
  },
  {
    label: 'MCP tools count',
    website: extractStatsConstant(stats, 'MCP_TOOLS_COUNT'),
    readme: allMatches(readme, /\((\d+) tools\)/g)
      .concat(allMatches(readme, /exposes (\d+) tools/g))
      .concat(allMatches(readme, /MCP Server<br\/>(\d+) tools/g)),
  },
  {
    label: 'Node.js version floor',
    website: extractStatsConstant(stats, 'NODE_VERSION_LABEL'),
    readme: allMatches(readme, /Node\.js (\d+\+)/g),
  },
  {
    label: 'PostgreSQL version floor',
    website: extractStatsConstant(stats, 'POSTGRES_VERSION_LABEL'),
    readme: allMatches(readme, /PostgreSQL (\d+\+)/g),
  },
];

let failed = false;

for (const check of checks) {
  const { label, website, readme: readmeValues } = check;

  if (website == null) {
    console.error(`❌ ${label}: could not find this constant in platformStats.ts`);
    failed = true;
    continue;
  }
  if (readmeValues.length === 0) {
    console.error(`❌ ${label}: could not find a matching claim in README.md (regex may need updating)`);
    failed = true;
    continue;
  }
  const mismatches = readmeValues.filter((v) => v !== website);
  if (mismatches.length > 0) {
    console.error(`❌ ${label}: website says "${website}", README says "${[...new Set(mismatches)].join('" / "')}"`);
    failed = true;
  } else {
    console.log(`✅ ${label}: "${website}" matches README (${readmeValues.length} mention(s))`);
  }
}

if (failed) {
  console.error('\nREADME.md and src/lib/platformStats.ts disagree on at least one platform stat.');
  console.error('Update whichever one is stale, or both if the number genuinely changed.');
  process.exit(1);
}

console.log('\nREADME.md and the website agree on every tracked platform stat.');
