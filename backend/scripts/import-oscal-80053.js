#!/usr/bin/env node
// @tier: community
/**
 * Generates scripts/lib/frameworks/nist_800_53.js from the official NIST
 * OSCAL SP 800-53 Rev 5 catalog, instead of hand-typing 300 base controls.
 * Source: https://github.com/usnistgov/oscal-content (public domain, US
 * government work -- no licensing restriction on reuse).
 *
 * Withdrawn controls are excluded; control enhancements are deferred (base
 * controls only, matching this repo's existing coverage_status convention
 * for nist_800_53 -- see docs/FRAMEWORK_CATALOG_COMPLETION_PLAN.md Wave 1).
 *
 * Usage: node scripts/import-oscal-80053.js path/to/catalog.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const INSERT_TOKEN = /\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g;

// Params can reference other params inside their own select.choice text
// (e.g. SI-4's si-04_odp.05 choices include a literal "as needed" alongside
// an embedded {{ insert: param, si-04_odp.06 }} token) -- resolve
// recursively, bounded by depth to guard against any circular reference.
function resolveParam(control, paramId, depth = 0) {
  if (depth > 5) return `[${paramId}]`;
  const param = (control.params || []).find((p) => p.id === paramId);
  if (!param) return `[${paramId}]`;
  if (param.label) return `[${param.label}]`;
  if (param.select && Array.isArray(param.select.choice)) {
    const choices = param.select.choice.map((choice) =>
      typeof choice === 'string'
        ? choice.replace(INSERT_TOKEN, (_m, nestedId) => resolveParam(control, nestedId, depth + 1)).trim()
        : ''
    );
    return `[${choices.join(' | ')}]`;
  }
  return `[${paramId}]`;
}

function proseToText(prose, control) {
  return prose.replace(INSERT_TOKEN, (_m, paramId) => resolveParam(control, paramId));
}

function flattenParts(parts, control, depth = 0) {
  if (!Array.isArray(parts)) return [];
  const lines = [];
  for (const part of parts) {
    if (part.name !== 'item') continue;
    const label = (part.props || []).find((p) => p.name === 'label');
    const prefix = label ? `${label.value} ` : '';
    if (part.prose) lines.push(`${prefix}${proseToText(part.prose, control)}`);
    if (part.parts) lines.push(...flattenParts(part.parts, control, depth + 1));
  }
  return lines;
}

function extractDescription(control) {
  const statement = (control.parts || []).find((p) => p.name === 'statement');
  if (!statement) return control.title;
  if (statement.prose) return proseToText(statement.prose, control);
  const lines = flattenParts(statement.parts, control);
  return lines.join(' ');
}

function isWithdrawn(control) {
  const status = (control.props || []).find((p) => p.name === 'status');
  return Boolean(status && status.value === 'withdrawn');
}

function priorityForControl(control) {
  const priorityProp = (control.props || []).find((p) => p.name === 'priority');
  if (!priorityProp) return '2';
  // OSCAL priority values look like "P0"/"P1"/"P2"/"P3" -- map to this
  // repo's existing '1'/'2'/'3' numeric-string convention (see seed-frameworks.js).
  const match = /P(\d)/.exec(priorityProp.value);
  if (!match) return '2';
  const p = Number(match[1]);
  if (p <= 1) return '1';
  if (p === 2) return '2';
  return '3';
}

function convertCatalog(catalogPath) {
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const catalog = raw && raw.catalog;
  if (!catalog) {
    throw new Error(`Invalid OSCAL catalog: no top-level "catalog" property in ${catalogPath}`);
  }

  // rel="related" hrefs use OSCAL ids; the catalog stores display ids. Index
  // one to the other first so the walk can resolve links in a single pass.
  const byOscalId = new Map();
  for (const group of catalog.groups || []) {
    for (const control of group.controls || []) {
      if (!isWithdrawn(control)) byOscalId.set(control.id.toLowerCase(), displayId(control));
      for (const sub of control.controls || []) {
        if (!isWithdrawn(sub)) byOscalId.set(sub.id.toLowerCase(), displayId(sub));
      }
    }
  }

  const controls = [];
  const groups = Array.isArray(catalog.groups) ? catalog.groups : [];
  for (const group of groups) {
    const groupControls = Array.isArray(group.controls) ? group.controls : [];
    for (const control of groupControls) {
      if (isWithdrawn(control)) continue;
      const baseId = displayId(control);
      controls.push({
        control_id: baseId,
        title: control.title,
        description: extractDescription(control),
        priority: priorityForControl(control),
        control_type: 'technical',
        is_enhancement: false,
        parent_control_id: null,
        baselines: baselinesFor(control.id),
        related_controls: relatedControls(control, byOscalId),
        assessment_procedures: assessmentProcedures(control)
      });

      // Enhancements are nested one level under their base control in OSCAL.
      // The previous walk simply never descended, which is the entire reason
      // this catalog was base-controls-only.
      const enhancements = Array.isArray(control.controls) ? control.controls : [];
      for (const enhancement of enhancements) {
        if (isWithdrawn(enhancement)) continue;
        controls.push({
          control_id: displayId(enhancement),
          title: enhancement.title,
          description: extractDescription(enhancement),
          // Enhancements carry no priority prop in the catalog, so
          // priorityForControl falls back to '2' for all of them. Baseline
          // membership below is the field that actually distinguishes them.
          priority: priorityForControl(enhancement),
          control_type: 'technical',
          is_enhancement: true,
          parent_control_id: baseId,
          baselines: baselinesFor(enhancement.id),
          related_controls: relatedControls(enhancement, byOscalId),
          assessment_procedures: assessmentProcedures(enhancement)
        });
      }
    }
  }

  controls.sort((a, b) => a.control_id.localeCompare(b.control_id, undefined, { numeric: true }));
  const version = (catalog.metadata && catalog.metadata.version) || 'unknown';
  return { controls, version };
}

// OSCAL ids are dotted and lower-case ("au-6.3"). Every control also carries a
// `label` prop in the parenthesized form the rest of this platform uses
// ("AU-6(3)") -- verified present on all 300 base controls and all 714
// non-withdrawn enhancements. Prefer it over uppercasing the id, because the
// frontend detects sub-controls with /\(\d+\)$/ and finds children by
// `parent + '('` prefix: emitting "AU-6.3" would silently break that nesting.
// The label appears up to three times with different `class` values
// (zero-padded, sp800-53a); the unclassed one is the display form.
function displayId(control) {
  const labels = (control.props || []).filter((p) => p.name === 'label');
  const plain = labels.find((p) => !p.class && /^[A-Z]{2}-\d+(\(\d+\))?$/.test(p.value));
  if (plain) return plain.value;
  const anyParen = labels.find((p) => /^[A-Z]{2}-\d+\(\d+\)$/.test(p.value));
  if (anyParen) return anyParen.value;
  return control.id.toUpperCase();
}

// Baseline membership, loaded from the NIST SP 800-53B profiles. Without this
// the 714 enhancements are undifferentiated bulk: the Moderate baseline
// selects 287 controls of which 110 are enhancements, and High selects 370 of
// which 182 are -- roughly half. Recording which baseline selects which
// control is what lets compliance be scored against the baseline an
// organization is actually pursuing rather than the whole catalog.
const BASELINE_INDEX = new Map();

function loadBaselines(profilePaths) {
  for (const [baseline, profilePath] of Object.entries(profilePaths)) {
    if (!profilePath || !fs.existsSync(profilePath)) continue;
    const parsed = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const imports = (parsed.profile && parsed.profile.imports) || [];
    for (const imp of imports) {
      for (const include of imp['include-controls'] || []) {
        for (const id of include['with-ids'] || []) {
          const key = String(id).toLowerCase();
          if (!BASELINE_INDEX.has(key)) BASELINE_INDEX.set(key, []);
          BASELINE_INDEX.get(key).push(baseline);
        }
      }
    }
  }
}

function baselinesFor(oscalId) {
  return BASELINE_INDEX.get(String(oscalId).toLowerCase()) || [];
}

// Intra-catalog relationships, from OSCAL rel="related" links. 362 of the 714
// enhancements carry at least one (895 links in total). These are NIST's own
// statements about which controls relate to which, and they are the only
// non-invented source of crosswalk data for the enhancements -- everything
// else would be inference. Emitted here so the crosswalk seeder can use them
// without re-parsing a 10 MB catalog.
function relatedControls(control, byOscalId) {
  return (control.links || [])
    .filter((l) => l.rel === 'related' && typeof l.href === 'string' && l.href.startsWith('#'))
    .map((l) => byOscalId.get(l.href.slice(1).toLowerCase()))
    .filter(Boolean);
}

// NIST SP 800-53A assessment data is embedded in the Rev 5.2.0 catalog rather
// than only in the separate 800-53A publication: 1,579 assessment-objective
// parts and 2,072 assessment-method parts across the catalog, including for
// every enhancement. Extracting them means enhancement procedures are the real
// NIST objectives with their real evidence lists, rather than generated
// boilerplate.
const METHOD_MAP = {
  EXAMINE: { type: 'examine', method: 'document_review' },
  INTERVIEW: { type: 'interview', method: 'personnel_interview' },
  TEST: { type: 'test', method: 'system_test' }
};

function collectProse(part, acc) {
  if (part.prose) acc.push(part.prose.trim());
  for (const child of part.parts || []) collectProse(child, acc);
  return acc;
}

function propValue(part, name) {
  return ((part.props || []).find((p) => p.name === name) || {}).value;
}

function assessmentProcedures(control) {
  const parts = control.parts || [];

  const objectives = [];
  for (const p of parts) {
    if (p.name === 'assessment-objective') collectProse(p, objectives);
  }
  const objectiveText = objectives.join(' ').replace(/\s+/g, ' ').trim();

  const procedures = [];
  for (const p of parts) {
    if (p.name !== 'assessment-method') continue;
    const mapped = METHOD_MAP[propValue(p, 'method')];
    if (!mapped) continue;

    const objects = [];
    for (const child of p.parts || []) {
      if (child.name === 'assessment-objects') collectProse(child, objects);
    }

    procedures.push({
      // OSCAL already labels these in 800-53A style, e.g. "AU-06(03)-Examine".
      procedure_id: propValue(p, 'label') || `${displayId(control)}-${mapped.type}`,
      procedure_type: mapped.type,
      title: `${mapped.type.charAt(0).toUpperCase()}${mapped.type.slice(1)}: ${control.title}`,
      description: objectiveText || control.title,
      expected_evidence: objects.join('; ').replace(/\s+/g, ' ').trim() || null,
      assessment_method: mapped.method,
      depth: 'focused',
      source_document: 'NIST SP 800-53A Rev 5 (embedded in the SP 800-53 OSCAL catalog)'
    });
  }
  return procedures;
}

function writeModule(outPath, controls, version) {
  const header = `// Auto-generated by scripts/import-oscal-80053.js from the official NIST
// OSCAL SP 800-53 Rev 5.2.0 catalog (public domain, US government work).
// Do not hand-edit -- re-run the importer against an updated catalog instead.
// Source: https://github.com/usnistgov/oscal-content
//   nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json
// Withdrawn controls excluded. Base controls AND control enhancements are
// included: enhancements are nested under their base control in OSCAL and are
// marked here with is_enhancement plus parent_control_id.
// Baseline membership comes from the NIST SP 800-53B LOW/MODERATE/HIGH profiles.

const controls = ${JSON.stringify(controls, null, 2)};

const framework = {
  code: 'nist_800_53',
  name: 'NIST SP 800-53 Rev 5',
  version: '${version}',
  description: 'Security and Privacy Controls for Information Systems and Organizations. All 20 families at full base-control coverage plus every non-withdrawn control enhancement, with NIST SP 800-53B baseline membership.',
  category: 'Cybersecurity',
  tier_required: 'community',
  coverage_status: 'comprehensive'
};

// Exported both flat and nested. The sibling repositories consume this module
// differently -- one reads framework.version, the other iterates modules
// expecting code/name/controls at the top level -- and a single generated file
// serving both keeps the two catalogs from drifting.
module.exports = {
  ...framework,
  framework,
  controls,
  expectedCount: ${controls.length}
};
`;
  fs.writeFileSync(outPath, header);
}

// The NIST source files are not vendored in this repository -- they total
// ~10 MB and are republished by NIST rather than owned here. The importer
// fetches them when no local path is given, so re-running it does not depend
// on someone having the right five files on disk. Pass paths explicitly for an
// air-gapped run.
const NIST_BASE = 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json';
const CATALOG_URL = `${NIST_BASE}/NIST_SP-800-53_rev5_catalog.json`;
const PROFILE_URLS = {
  low: `${NIST_BASE}/NIST_SP-800-53_rev5_LOW-baseline_profile.json`,
  moderate: `${NIST_BASE}/NIST_SP-800-53_rev5_MODERATE-baseline_profile.json`,
  high: `${NIST_BASE}/NIST_SP-800-53_rev5_HIGH-baseline_profile.json`
};

async function fetchToTemp(url, filename) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const target = path.join(os.tmpdir(), filename);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

async function main() {
  let catalogPath = process.argv[2];
  const profilePaths = {
    low: process.argv[3],
    moderate: process.argv[4],
    high: process.argv[5]
  };

  if (!catalogPath) {
    console.log('No catalog path given; fetching from NIST...');
    catalogPath = await fetchToTemp(CATALOG_URL, 'nist_800_53_catalog.json');
    for (const [baseline, url] of Object.entries(PROFILE_URLS)) {
      profilePaths[baseline] = await fetchToTemp(url, `nist_800_53_${baseline}_profile.json`);
    }
  }

  loadBaselines(profilePaths);

  const { controls, version } = convertCatalog(catalogPath);
  const outDir = path.join(__dirname, 'lib', 'frameworks');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'nist_800_53.js');
  writeModule(outPath, controls, version);

  const base = controls.filter((c) => !c.is_enhancement).length;
  const enhancements = controls.length - base;
  const perBaseline = ['low', 'moderate', 'high']
    .map((b) => `${b}=${controls.filter((c) => c.baselines.includes(b)).length}`)
    .join(' ');
  console.log(`Wrote ${controls.length} controls (${base} base + ${enhancements} enhancements, OSCAL v${version}) to ${outPath}`);
  console.log(`Baseline membership: ${perBaseline}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
