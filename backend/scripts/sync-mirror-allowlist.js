// @tier: community
// ip-hygiene:ignore-file
'use strict';

/**
 * sync-mirror-allowlist.js
 *
 * Scans the codebase for files not yet classified in the public mirror
 * allowlist and auto-classifies each as community-tier or paid-tier.
 *
 * Classification uses a two-step approach:
 *   1. ANNOTATION (authoritative): reads  // @tier: <value>  from the first
 *      10 lines of every file.  Valid values:
 *        community   → add to active allowlist
 *        pro | enterprise | govcloud | platform | exclude
 *                    → add to EXCLUDED comment block
 *   2. HEURISTICS (fallback): when no @tier annotation is present the script
 *      applies pattern-matching rules and emits a ::warning:: asking the
 *      developer to add an explicit annotation.
 *
 * Scanned categories:
 *   backend/src/middleware, backend/src/routes, backend/src/services,
 *   backend/src/utils, backend/scripts,
 *   frontend/src/lib, frontend/src/app/dashboard/* (page directories)
 *
 * Usage:
 *   node backend/scripts/sync-mirror-allowlist.js [--dry-run]
 *
 * Exit codes:
 *   0 — success (allowlist up-to-date or successfully updated)
 *   1 — fatal error (allowlist file missing)
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT      = path.resolve(__dirname, '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, '.github', 'public-mirror-allowlist.txt');
const DRY_RUN        = process.argv.includes('--dry-run');

// ─── Paid-tier signals ────────────────────────────────────────────────────────

/** requireTier() values that signal a paid gate. */
const PAID_TIERS = ['pro', 'enterprise', 'govcloud'];

/**
 * require() calls that pull in a known paid-tier service.
 * Matches common paid-service filenames inside a require string.
 */
const PAID_REQUIRE_RE = new RegExp(
  `require\\s*\\(\\s*['"][^'"]*` +
  `(?:subscriptionService|stripeService|ssoService|siemService|splunkService` +
  `|threatIntelService|vendorSecurityService|sbomService|regulatoryNewsService` +
  `|regulatoryImpactService|realtimeEventService|mitreService|nvdService` +
  `|cisaKevService|alienVaultService|orgRagService|multiAgentOrchestrator` +
  `|config/tierPolicy)` +
  `[^'"]*['"]\\s*\\)`
);

/** File base-name patterns that are inherently paid or security-sensitive. */
const PAID_NAME_RE =
  /(?:billing|stripe|subscription|mitreMapping|geolocation)/i;

/** Backend script names that are security-sensitive (admin provisioning, demo data). */
const SENSITIVE_SCRIPT_RE =
  /(?:(?:create|setup|seed)[_-]?.*(?:admin|platform)|demo[_-]?account|repair[_-]?.*demo|test[_-]?demo)/i;

/**
 * Script base-names that are safe to include in the community mirror.
 * Only explicitly-curated scripts are auto-added; all others default to excluded
 * to prevent internal QA/demo/test scripts from leaking into the public mirror.
 */
const SAFE_SCRIPT_RE =
  /^(?:check-syntax|check-db|ip-hygiene-check|sync-mirror-allowlist|apply-security-baseline|mcp-server|mcp-server-secure|mcp-tool-registry)\.js$/i;

// ─── Annotation reader (primary classification source) ────────────────────────

/** Valid tier values recognised by this script. */
const VALID_TIERS = new Set(['community', 'pro', 'enterprise', 'govcloud', 'platform', 'exclude']);

/** Backwards-compat mapping for old tier names → new tier names. */
const TIER_ALIASES = { free: 'community', starter: 'pro', professional: 'enterprise', utilities: 'govcloud' };

/**
 * Read the  // @tier: <value>  annotation from the first 10 lines of a file.
 * Returns { tier, annotated: true } when found, or { tier: null, annotated: false }.
 */
function readTierAnnotation(src) {
  const lines = src.split('\n').slice(0, 10);
  for (const line of lines) {
    const m = line.match(/^\s*\/\/\s*@tier:\s*(\S+)/);
    if (m) {
      let tier = m[1].toLowerCase();
      if (TIER_ALIASES[tier]) tier = TIER_ALIASES[tier];
      if (VALID_TIERS.has(tier)) return { tier, annotated: true };
    }
  }
  return { tier: null, annotated: false };
}

/**
 * Wrap any classifier so that @tier annotations take priority.
 * If no annotation is present, the heuristic is used and a warning is emitted.
 */
function withAnnotation(heuristicFn) {
  return (name, src) => {
    const { tier, annotated } = readTierAnnotation(src);
    if (annotated) {
      return tier === 'community'
        ? { tier: 'community',  reason: `@tier annotation: community`,           annotated: true }
        : { tier: 'paid',  reason: `@tier annotation: ${tier}`,        annotated: true };
    }
    // Fallback: heuristic — and flag that the file should get an annotation
    const result = heuristicFn(name, src);
    return { ...result, annotated: false };
  };
}

// ─── Backend classifiers ──────────────────────────────────────────────────────

/**
 * Returns true if the source has a router-level requireTier gate on any paid tier.
 * This means the entire route file is tier-gated, not just individual endpoints.
 */
function hasGlobalTierGate(src) {
  for (const t of PAID_TIERS) {
    if (new RegExp(`router\\.use\\([^)]*requireTier\\s*\\(\\s*['"]${t}['"]`).test(src)) return true;
  }
  return /router\.use\(.*requireProEdition/.test(src);
}

function hasPaidRequire(src)     { return PAID_REQUIRE_RE.test(src); }
function hasBillingRef(src)      { return /\b(?:billing|stripe|subscription)\b/i.test(src); }
function hasDemoCredentials(src) { return /DEMO_ACCOUNT_BY_TIER|demoAccountPassword|sendDemoAccount/i.test(src); }

function classifyRoute(name, src) {
  if (hasDemoCredentials(src))    return paid('delivers demo account credentials — security risk');
  if (PAID_NAME_RE.test(name))    return paid('paid-tier route by filename');
  if (hasGlobalTierGate(src))     return paid('globally gated by requireTier on paid tier');
  if (hasPaidRequire(src))        return paid('imports paid-tier service');
  // Routes that directly import tierPolicy for per-tier logic (not just auth)
  if (/require\s*\(\s*['"][^'"]*tierPolicy[^'"]*['"]\s*\)/.test(src)) {
    return paid('imports tierPolicy for tier-specific limiting/gating');
  }
  return free('no global tier gate — individual endpoint requireTier guards stay in code');
}

function classifyService(name, src) {
  if (PAID_NAME_RE.test(name)) return paid('paid service identified by filename');
  if (hasPaidRequire(src))     return paid('imports paid-tier service');
  return free('no paid-tier dependencies');
}

function classifyMiddleware(name, src) {
  // auth.js is annotated @tier: community but excluded from the mirror for a different
  // reason (it contains the requireTier implementation itself).  The heuristic
  // marks it paid so that unannotated copies would be excluded by default;
  // the annotation on the actual file correctly overrides this when present.
  if (name === 'auth.js')      return paid('contains requireTier implementation — excluded from community mirror');
  if (hasPaidRequire(src))     return paid('imports paid-tier service');
  if (hasBillingRef(src))      return paid('references billing/subscription logic');
  return free('general-purpose middleware');
}

function classifyScript(name, src) {
  if (SENSITIVE_SCRIPT_RE.test(name)) return paid('security-sensitive: admin provisioning or demo data');
  if (PAID_NAME_RE.test(name))        return paid('paid feature by filename');
  if (hasPaidRequire(src))            return paid('imports paid-tier service');
  // Only explicitly curated scripts go into the community mirror.
  // QA tests, demo seeders, internal reports, and ad-hoc tooling are excluded.
  if (!SAFE_SCRIPT_RE.test(name))     return paid('not in curated script list — internal QA/demo/test script');
  return free('curated community utility script');
}

function classifyUtil(name, src) {
  if (PAID_NAME_RE.test(name)) return paid('paid utility by filename');
  if (hasPaidRequire(src))     return paid('imports paid-tier service');
  return free('general utility');
}

// ─── Frontend classifiers ─────────────────────────────────────────────────────

/**
 * API client variable names used exclusively by paid-tier pages.
 * These are imported from @/lib/api and represent paid-tier backend endpoints.
 */
const PAID_API_CLIENT_RE =
  /\b(?:cmdbAPI|sbomAPI|regulatoryNewsAPI|ragAPI|evidenceAPI|reportsAPI|siemAPI|splunkAPI|ssoAPI|threatIntelAPI|vendorAPI|aiMonitoringAPI|dataGovernanceAPI|vulnerabilitiesAPI|tprmAPI|aiGovernanceAPI|stateAiLawsAPI|internationalAiLawsAPI)\b/;

/** URL path fragments for known paid-tier backend routes. */
const PAID_API_PATH_RE =
  /\/api\/v1\/(?:billing|reports|sbom|siem|splunk|sso|threat-intel|vendor|cmdb|assets|environments|service-accounts|regulatory-news|ai-monitoring|data-governance|vulnerabilities|realtime|rag|evidence|tprm|ai-governance|external-ai|platform-admin|state-ai-laws|international-ai-laws)/;

/** Billing/subscription-specific UI patterns. */
const BILLING_UI_RE =
  /\b(?:billingStatus|stripeCustomer|subscriptionTier|trialEnds|cancelAccount|DEMO_ACCOUNT)\b/i;

function classifyFrontendLib(name, src) {
  if (/assets|cmdb/i.test(name)) return paid('CMDB / asset management — Pro+');
  if (hasPaidRequire(src))       return paid('imports paid-tier service');
  return free('core frontend utility');
}

/**
 * Classify a frontend dashboard page directory.
 * Reads the page's page.tsx source and inspects API calls and tier guards.
 */
function classifyDashboardPage(dirName, src) {
  // Hard page guard: early return/redirect based on paid tier
  const paidGuardRe =
    /hasTierAtLeast\s*\([^,]+,\s*['"](?:pro|enterprise|govcloud)['"]\s*\)/;
  const earlyExitRe =
    /(?:router\.push|redirect\s*\(|return\s+null\s*;|<Forbidden|Access\s*Denied|Upgrade\s*Required)/;
  if (paidGuardRe.test(src) && earlyExitRe.test(src)) {
    return paid('primary page guard: hasTierAtLeast redirects/blocks free users');
  }

  // Page calls a paid-tier API client
  if (PAID_API_CLIENT_RE.test(src)) return paid('page uses paid-tier API client');

  // Page calls paid-tier API paths directly
  if (PAID_API_PATH_RE.test(src)) return paid('page calls paid-tier API endpoint');

  // Billing/subscription UI
  if (BILLING_UI_RE.test(src)) return paid('contains billing/subscription UI elements');

  return free('no paid-tier gate or paid API usage detected');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function free(reason) { return { tier: 'community', reason }; }
function paid(reason) { return { tier: 'paid', reason }; }
function readSrc(p)   { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

// ─── Allowlist parsing ────────────────────────────────────────────────────────

/**
 * Parse the allowlist text into two sets:
 *   activeSet   — relative paths that are actively allowed
 *   excludedSet — basenames/paths mentioned in `# - name (reason)` comment lines
 *
 * Both sets index by full relPath AND bare basename so `isKnown()` can match either.
 */
function parseAllowlist(text) {
  const activeSet   = new Set();
  const excludedSet = new Set();

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const m = line.match(/^#\s*-\s*(\S+)/);
      if (m) {
        const val = m[1];
        // Only treat as a file/path exclusion if the value looks like one
        // (contains a dot for extension, or a slash for path separator)
        if (!val.includes('.') && !val.includes('/')) continue;
        const cleanVal = val.replace(/\/\*\*$/, '');
        excludedSet.add(val);
        excludedSet.add(cleanVal);
        excludedSet.add(path.basename(cleanVal)); // basename of dir, not of '/**'
      }
      continue;
    }

    activeSet.add(line);
    if (line.endsWith('/**')) {
      const dir = line.slice(0, -3);
      activeSet.add(dir);
      activeSet.add(path.basename(dir)); // e.g. 'controls'
    } else {
      activeSet.add(path.basename(line));
    }
  }

  return { activeSet, excludedSet };
}

function isKnown(relPath, { activeSet, excludedSet }) {
  // Strip /** suffix before computing basename so we get 'controls' not '**'
  const cleanPath = relPath.endsWith('/**') ? relPath.slice(0, -3) : relPath;
  const base      = path.basename(cleanPath);
  const withGlob  = cleanPath + '/**';

  for (const v of [relPath, withGlob, cleanPath, base]) {
    if (activeSet.has(v) || excludedSet.has(v)) return true;
  }
  return false;
}

// ─── Allowlist mutation ───────────────────────────────────────────────────────

const SEP_RE = /^# ={10,}/;

/**
 * Insert an active entry after the last non-comment, non-blank line in the
 * named section (before the EXCLUDED comment block).
 *
 * Allowlist section headers look like:
 *   # ============================================   ← previous section's closer / our opener
 *   # Backend - Scripts                             ← sectionTitle found here → inSection = true
 *   # ============================================   ← closing decorator; skip it (pastHeader)
 *   backend/scripts/...                             ← active entries start here
 */
function insertActive(text, sectionTitle, entry) {
  const lines = text.split('\n');
  let inSection      = false;
  let pastHeader     = false;
  let lastActiveLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (!inSection) {
      if (lines[i].includes(sectionTitle)) inSection = true;
      continue;
    }
    if (SEP_RE.test(lines[i])) {
      if (!pastHeader) { pastHeader = true; continue; } // skip closing === of header
      break; // start of next section
    }
    if (lines[i].trim() && !lines[i].startsWith('#')) lastActiveLine = i;
  }

  if (lastActiveLine === -1) {
    console.warn(`  [warn] Cannot find insertion point for section: "${sectionTitle}"`);
    return text;
  }
  lines.splice(lastActiveLine + 1, 0, entry);
  return lines.join('\n');
}

/**
 * Append `# - basename (reason)` after the last `# -` or `# EXCLUDED` line
 * in the named section's excluded comment block.
 */
function insertExcluded(text, sectionTitle, entry, reason) {
  const lines = text.split('\n');
  let inSection  = false;
  let pastHeader = false;
  let lastExcLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (!inSection) {
      if (lines[i].includes(sectionTitle)) inSection = true;
      continue;
    }
    if (SEP_RE.test(lines[i])) {
      if (!pastHeader) { pastHeader = true; continue; } // skip closing === of header
      break; // start of next section
    }
    if (/^# -/.test(lines[i]) || /^#\s+(?:EXCLUDED|NOTE:.*EXCLUDED)/.test(lines[i])) {
      lastExcLine = i;
    }
  }

  if (lastExcLine === -1) {
    console.warn(`  [warn] Cannot find excluded block for section: "${sectionTitle}"`);
    return text;
  }
  // For glob patterns (frontend pages), use the last 2 path segments + /**
  // so the parser can index it by a path that contains '/'.
  // For regular files, use just the basename.
  let label;
  if (entry.endsWith('/**')) {
    const clean = entry.slice(0, -3);               // strip /**
    const parts = clean.split('/');
    label = parts.slice(-2).join('/') + '/**';       // e.g. dashboard/cmdb/**
  } else {
    label = path.basename(entry);                    // e.g. billing-routes.js
  }
  lines.splice(lastExcLine + 1, 0, `# - ${label} (${reason})`);
  return lines.join('\n');
}

// ─── Scan categories ──────────────────────────────────────────────────────────

const BACKEND_CATS = [
  { section: 'Backend - Middleware',                       dir: 'backend/src/middleware', classify: withAnnotation(classifyMiddleware) },
  { section: 'Backend - Routes (Community Features Only)', dir: 'backend/src/routes',    classify: withAnnotation(classifyRoute)     },
  { section: 'Backend - Services (Community Only)',        dir: 'backend/src/services',   classify: withAnnotation(classifyService)   },
  { section: 'Backend - Utilities',                        dir: 'backend/src/utils',      classify: withAnnotation(classifyUtil)      },
  { section: 'Backend - Scripts',                          dir: 'backend/scripts',        classify: withAnnotation(classifyScript)    },
];

function scanBackend(knownSets) {
  const result = [];
  for (const cat of BACKEND_CATS) {
    const absDir = path.join(REPO_ROOT, cat.dir);
    if (!fs.existsSync(absDir)) continue;
    const files = fs.readdirSync(absDir)
      .filter(f => f.endsWith('.js') && fs.statSync(path.join(absDir, f)).isFile())
      .sort();
    for (const file of files) {
      const relPath = `${cat.dir}/${file}`;
      if (isKnown(relPath, knownSets)) continue;
      const src = readSrc(path.join(REPO_ROOT, relPath));
      const { tier, reason, annotated } = cat.classify(file, src);
      result.push({ relPath, section: cat.section, tier, reason, annotated });
    }
  }
  return result;
}

function scanFrontendLib(knownSets) {
  const result = [];
  const dir    = 'frontend/src/lib';
  const absDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absDir)) return result;
  const files = fs.readdirSync(absDir)
    .filter(f => /\.(ts|tsx)$/.test(f) && fs.statSync(path.join(absDir, f)).isFile())
    .sort();
  for (const file of files) {
    const relPath = `${dir}/${file}`;
    if (isKnown(relPath, knownSets)) continue;
    const src = readSrc(path.join(absDir, file));
    const { tier, reason, annotated } = withAnnotation(classifyFrontendLib)(file, src);
    result.push({ relPath, section: 'Frontend - Lib/Utils', tier, reason, annotated });
  }
  return result;
}

function scanFrontendDashboardPages(knownSets) {
  const result    = [];
  const baseDir   = 'frontend/src/app/dashboard';
  const absBase   = path.join(REPO_ROOT, baseDir);
  if (!fs.existsSync(absBase)) return result;
  const entries = fs.readdirSync(absBase)
    .filter(e => fs.statSync(path.join(absBase, e)).isDirectory())
    .sort();
  for (const entry of entries) {
    const globPattern = `${baseDir}/${entry}/**`;
    if (isKnown(globPattern, knownSets)) continue;
    const pagePath = path.join(absBase, entry, 'page.tsx');
    const src = fs.existsSync(pagePath) ? readSrc(pagePath) : '';
    const { tier, reason, annotated } = withAnnotation(classifyDashboardPage)(entry, src);
    result.push({ relPath: globPattern, section: 'Frontend - Dashboard (Community Features)', tier, reason, annotated });
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.error(`ERROR: Allowlist not found: ${ALLOWLIST_PATH}`);
    process.exit(1);
  }

  let text = fs.readFileSync(ALLOWLIST_PATH, 'utf8');
  const knownSets = parseAllowlist(text);

  const found = [
    ...scanBackend(knownSets),
    ...scanFrontendLib(knownSets),
    ...scanFrontendDashboardPages(knownSets),
  ];

  const freeItems       = found.filter(i => i.tier === 'community');
  const paidItems       = found.filter(i => i.tier === 'paid');
  const unannotated     = found.filter(i => !i.annotated);

  if (found.length === 0) {
    console.log('Allowlist sync: all files are already classified. Nothing to update.');
    return;
  }

  console.log(`Allowlist sync: ${freeItems.length} new community-tier, ${paidItems.length} new paid-tier items found.\n`);

  if (paidItems.length > 0) {
    console.log('New PAID-tier files detected (documenting in excluded block):');
    for (const item of paidItems) {
      const tag = item.annotated ? '[annotated]' : '[heuristic]';
      console.log(`  [paid] ${tag} ${item.relPath}  —  ${item.reason}`);
      if (!DRY_RUN) {
        text = insertExcluded(text, item.section, item.relPath, item.reason);
      }
    }
    console.log('');
  }

  if (freeItems.length > 0) {
    console.log('New COMMUNITY-tier files detected (adding to active allowlist):');
    for (const item of freeItems) {
      const tag = item.annotated ? '[annotated]' : '[heuristic]';
      console.log(`  [community] ${tag} ${item.relPath}  —  ${item.reason}`);
      if (!DRY_RUN) {
        text = insertActive(text, item.section, item.relPath);
      }
    }
    console.log('');
  }

  if (!DRY_RUN) {
    fs.writeFileSync(ALLOWLIST_PATH, text, 'utf8');
    console.log(`Allowlist updated: ${ALLOWLIST_PATH}`);
    if (paidItems.length > 0) {
      console.log('::warning::New paid-tier files were detected — review the EXCLUDED blocks in the allowlist to confirm classifications are correct.');
    }
    if (unannotated.length > 0) {
      console.log(`::warning::${unannotated.length} file(s) were classified by heuristic (no // @tier: annotation). Add // @tier: <value> to the top of each file for authoritative classification: ${unannotated.map(i => i.relPath).join(', ')}`);
    }
  } else {
    console.log('[dry-run] No changes written to disk.');
    if (unannotated.length > 0) {
      console.log(`\nFiles using heuristic classification (missing // @tier: annotation):`);
      for (const item of unannotated) {
        console.log(`  [no-annotation] ${item.relPath}`);
      }
    }
  }
}

main();
