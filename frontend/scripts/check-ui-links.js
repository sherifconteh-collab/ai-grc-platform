#!/usr/bin/env node
/**
 * TEVV-UI link integrity: every in-app link lands on the screen it names.
 *
 * Scans src/ for link targets that start with /dashboard (href="...",
 * href={`...`}, router.push/replace, redirect(), nav config, lib/deepLinks.ts)
 * and checks, for each one:
 *
 *   1. the path resolves to a page under src/app (static segments must match,
 *      [param] segments accept a value, template ${...} segments must hit a
 *      [param] segment);
 *   2. every static query key in the link (?action=..., ?tab=..., ?new=1) is
 *      read by that page, i.e. the page or a component it imports contains
 *      searchParams.get('<key>') / get('<key>');
 *   3. every static query value (?action=upload-evidence, ?tab=contracts) is
 *      mentioned as a string literal by that page or its imports, so the page
 *      actually handles that action rather than silently ignoring it.
 *
 * A link that points at a page that does not exist, or passes a parameter the
 * page never reads, would drop the user on the wrong screen; this fails CI
 * instead. Usage: node scripts/check-ui-links.js  (from controlweave/frontend)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APP = path.join(SRC, 'app');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- routes

function collectRoutes() {
  return walk(APP)
    .filter((f) => /[\\/]page\.(tsx|ts|jsx|js)$/.test(f))
    .map((file) => {
      const rel = path.relative(APP, path.dirname(file));
      const segments = rel === '' ? [] : rel.split(path.sep)
        .filter((s) => !(s.startsWith('(') && s.endsWith(')'))); // route groups add no URL segment
      return { file, segments };
    });
}

function segmentMatches(routeSeg, linkSeg) {
  const dynamic = routeSeg.startsWith('[') && routeSeg.endsWith(']');
  if (linkSeg === '*') return dynamic;
  return dynamic || routeSeg === linkSeg;
}

function findRoute(routes, linkSegments) {
  // Prefer an exact static match over a dynamic one, as Next.js does.
  const candidates = routes.filter((r) => {
    if (r.segments.some((s) => s.startsWith('[...'))) {
      const fixed = r.segments.slice(0, -1);
      return linkSegments.length > fixed.length && fixed.every((s, i) => segmentMatches(s, linkSegments[i]));
    }
    return r.segments.length === linkSegments.length && r.segments.every((s, i) => segmentMatches(s, linkSegments[i]));
  });
  candidates.sort((a, b) => a.segments.filter((s) => s.startsWith('[')).length - b.segments.filter((s) => s.startsWith('[')).length);
  return candidates[0] || null;
}

// ---------------------------------------------------------------- links

// A link target is '/dashboard', or '/dashboard' followed by '/', '?' or '#'
// ('/dashboard-builder/...' is an API path, not a page).
const QUOTED_RE = /(['"])(\/dashboard(?:[/?#][^'"\\\s]*)?)\1/g;

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function isInComment(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const before = text.slice(lineStart, index).trim();
  return before.startsWith('//') || before.startsWith('*') || before.startsWith('/*');
}

/**
 * Template literals can nest braces and backticks inside ${...}, so they are
 * scanned rather than matched: each ${...} expression becomes a placeholder.
 */
function templateLinks(text) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('`/dashboard', from);
    if (start === -1) break;
    let i = start + 1;
    let out = '';
    let ok = false;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '`') { ok = true; break; }
      if (ch === '$' && text[i + 1] === '{') {
        let depth = 1;
        i += 2;
        while (i < text.length && depth > 0) {
          if (text[i] === '{') depth += 1;
          else if (text[i] === '}') depth -= 1;
          i += 1;
        }
        out += '${}';
        continue;
      }
      out += ch;
      i += 1;
    }
    from = start + 1;
    if (ok && /^\/dashboard(?:$|[/?#]|\$\{\})/.test(out)) found.push({ index: start, raw: out });
  }
  return found;
}

function parseLink(raw) {
  let target = raw.split('#')[0];
  let query = '';
  const q = target.indexOf('?');
  if (q !== -1) {
    query = target.slice(q + 1);
    target = target.slice(0, q);
  }
  const segments = target.split('/').filter(Boolean).map((seg) => {
    if (seg === '${}') return '*';
    // A trailing ${...} on a static segment builds the query string (e.g.
    // `audit-log${qs ? `?${qs}` : ''}`); the segment itself is the static part.
    return seg.replace(/\$\{\}/g, '');
  });
  const params = [];
  if (query && !query.startsWith('${')) {
    for (const pair of query.split('&')) {
      const [key, value = ''] = pair.split('=');
      if (!key || key.includes('${')) continue;
      params.push({ key, value: value.includes('${') ? null : decodeURIComponent(value) });
    }
  }
  return { segments, params };
}

// API clients call backend paths that also start with /dashboard; they are not page links.
const NON_PAGE_FILES = [/[\\/]lib[\\/][A-Za-z]*[aA]pi\.ts$/];

function collectLinks(files) {
  const links = [];
  for (const file of files) {
    if (NON_PAGE_FILES.some((re) => re.test(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hits = [];
    let m;
    QUOTED_RE.lastIndex = 0;
    while ((m = QUOTED_RE.exec(text)) !== null) hits.push({ index: m.index, raw: m[2] });
    hits.push(...templateLinks(text));
    for (const hit of hits) {
      if (isInComment(text, hit.index)) continue;
      links.push({ file, line: lineOf(text, hit.index), raw: hit.raw, ...parseLink(hit.raw) });
    }
  }
  return links;
}

// ---------------------------------------------------------------- page sources

const sourceCache = new Map();

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The page file plus the local modules it imports (one level): where a page's params get read. */
function pageSource(pageFile) {
  if (sourceCache.has(pageFile)) return sourceCache.get(pageFile);
  const own = fs.readFileSync(pageFile, 'utf8');
  const parts = [own];
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(own)) !== null) {
    const resolved = resolveImport(pageFile, m[1]);
    if (resolved && !resolved.includes(`${path.sep}lib${path.sep}`)) parts.push(fs.readFileSync(resolved, 'utf8'));
  }
  const joined = parts.join('\n');
  sourceCache.set(pageFile, joined);
  return joined;
}

function readsParam(source, key) {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`get\\(\\s*['"\`]${k}['"\`]\\s*\\)`).test(source);
}

function mentionsValue(source, value) {
  if (value === '' || value === '1' || value === 'true') return true;
  const v = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`['"\`]${v}['"\`]`).test(source);
}

// ---------------------------------------------------------------- main

function main() {
  const routes = collectRoutes();
  const files = walk(SRC);
  const links = collectLinks(files);
  const failures = [];

  for (const link of links) {
    const where = `${path.relative(ROOT, link.file)}:${link.line}`;
    const route = findRoute(routes, link.segments);
    if (!route) {
      failures.push(`${where}  ${link.raw}\n      no page matches /${link.segments.join('/')}`);
      continue;
    }
    if (link.params.length === 0) continue;
    const source = pageSource(route.file);
    const page = path.relative(ROOT, route.file);
    for (const { key, value } of link.params) {
      if (!readsParam(source, key)) {
        failures.push(`${where}  ${link.raw}\n      ${page} never reads ?${key}= (expected searchParams.get('${key}'))`);
      } else if (value !== null && !mentionsValue(source, value)) {
        failures.push(`${where}  ${link.raw}\n      ${page} reads ?${key}= but never handles the value '${value}'`);
      }
    }
  }

  const withParams = links.filter((l) => l.params.length > 0).length;
  if (failures.length > 0) {
    console.error(`Link integrity: ${failures.length} link(s) do not land on their screen:\n`);
    failures.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log(`Link integrity: ${links.length} in-app links resolve to a page (${withParams} with query parameters the target page reads), ${routes.length} routes.`);
}

main();
