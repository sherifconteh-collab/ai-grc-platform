// @tier: free
// ip-hygiene:ignore-file
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STRICT_MODE = String(process.env.IP_HYGIENE_FAIL_ON_STANDARDS || '').toLowerCase() === 'true';
const MAX_WARNINGS = 200;

const INCLUDE_EXTENSIONS = new Set([
  '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
  '.sql', '.md', '.txt', '.yaml', '.yml', '.json'
]);

const EXCLUDED_DIRS = new Set([
  '.git',
  '.github/actions',
  '.next',
  '.next-build',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tmp',
  'temp',
  '.cache'
]);

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.tsbuildinfo',
  'plot4ai-library.json'
]);

const COMPETITOR_RULES = [
  {
    id: 'competitor.reference.onetrust',
    regex: /\b(?:one\s*trust|onetrust)\b/i,
    guidance: 'Remove competitor brand references from product code/docs.'
  },
  {
    id: 'competitor.reference.archer',
    regex: /\b(?:rsa\s+archer|archer\s+grc|archer-like|archer)\b/i,
    guidance: 'Use neutral wording like "engagement-centric workflow" instead of competitor labels.'
  },
  {
    id: 'competitor.reference.auditboard',
    regex: /\bauditboard\b/i,
    guidance: 'Do not reference competitor brands in product artifacts.'
  },
  {
    id: 'competitor.reference.logicgate',
    regex: /\blogicgate\b/i,
    guidance: 'Do not reference competitor brands in product artifacts.'
  },
  {
    id: 'competitor.reference.metricstream',
    regex: /\bmetricstream\b/i,
    guidance: 'Do not reference competitor brands in product artifacts.'
  },
  {
    id: 'competitor.reference.servicenow-grc',
    regex: /\bservicenow(?:\s+grc)?\b/i,
    guidance: 'Do not reference competitor brands in product artifacts.'
  }
];

const STANDARD_CITATION = /\b(?:ISO\/IEC\s*\d{4,5}(?::\d{4})?|ISO\s*27001|ISO\s*42001|SOC\s*2|AICPA|Trust Services Criteria|45\s*CFR\s*(?:160|162|164)|HIPAA)\b/i;
const SHALL_GLOBAL = /\bshall\b/gi;
const SOC_CRITERIA_ID = /\bCC\d\.\d{1,2}\b/i;

function shouldIgnoreLine(line) {
  return /ip-hygiene:\s*ignore/i.test(line);
}

function shouldIgnoreFile(text) {
  const header = String(text).split(/\r?\n/).slice(0, 10).join('\n');
  return /ip-hygiene:\s*ignore-file/i.test(header);
}

function collectFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(REPO_ROOT, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const top = relPath.split('/')[0];
      const isGeneratedNextDir = entry.name.startsWith('.next-build') || top.startsWith('.next-build');
      if (EXCLUDED_DIRS.has(entry.name) || EXCLUDED_DIRS.has(top) || isGeneratedNextDir) continue;
      collectFiles(fullPath, acc);
      continue;
    }

    if (!entry.isFile()) continue;

    if (EXCLUDED_FILES.has(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!INCLUDE_EXTENSIONS.has(ext)) continue;
    if (entry.name.endsWith('.min.js')) continue;

    acc.push(fullPath);
  }

  return acc;
}

function isLikelyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function wordCount(text) {
  return (String(text).trim().match(/\S+/g) || []).length;
}

function clipSnippet(text) {
  const clean = String(text).trim().replace(/\s+/g, ' ');
  if (clean.length <= 200) return clean;
  return clean.slice(0, 197) + '...';
}

function checkCompetitorReferences(filePath, text, errors) {
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (shouldIgnoreLine(line)) return;
    for (const rule of COMPETITOR_RULES) {
      if (!rule.regex.test(line)) continue;
      errors.push({
        file: rel,
        line: index + 1,
        rule: rule.id,
        message: rule.guidance,
        snippet: clipSnippet(line)
      });
    }
  });
}

function checkPotentialStandardsCopy(filePath, text, warnings) {
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const lines = text.split(/\r?\n/);

  // 1) Suspicious markdown blockquotes that cite standards and are long.
  lines.forEach((line, index) => {
    if (shouldIgnoreLine(line)) return;
    if (!line.trim().startsWith('>')) return;
    if (!STANDARD_CITATION.test(line)) return;
    if (wordCount(line) < 26) return;

    warnings.push({
      file: rel,
      line: index + 1,
      rule: 'standards.possible-verbatim.blockquote',
      message: 'Review quoted standards text for licensing/copyright restrictions.',
      snippet: clipSnippet(line)
    });
  });

  // 2) Multi-line windows with standard citation + repeated "shall".
  const windowSize = 6;
  for (let i = 0; i < lines.length - windowSize + 1; i++) {
    const slice = lines.slice(i, i + windowSize);
    if (slice.some(shouldIgnoreLine)) continue;

    const windowText = slice.join(' ');
    if (!STANDARD_CITATION.test(windowText)) continue;
    const shallCount = (windowText.match(SHALL_GLOBAL) || []).length;
    if (shallCount < 3) continue;
    if (wordCount(windowText) < 60) continue;

    warnings.push({
      file: rel,
      line: i + 1,
      rule: 'standards.possible-verbatim.shall-window',
      message: 'Pattern resembles verbatim standards language; review and paraphrase if needed.',
      snippet: clipSnippet(windowText)
    });
  }

  // 3) Long quoted strings with standard citations.
  lines.forEach((line, index) => {
    if (shouldIgnoreLine(line)) return;
    if (!STANDARD_CITATION.test(line)) return;
    if (!/(["'`]).{120,}\1/.test(line)) return;

    warnings.push({
      file: rel,
      line: index + 1,
      rule: 'standards.possible-verbatim.long-quote',
      message: 'Long quoted standards-like language detected; confirm this is licensed or paraphrased.',
      snippet: clipSnippet(line)
    });
  });

  // 4) SOC criteria-like lines with prescriptive prose.
  lines.forEach((line, index) => {
    if (shouldIgnoreLine(line)) return;
    if (!SOC_CRITERIA_ID.test(line)) return;
    if (!/\b(?:shall|must|requires?)\b/i.test(line)) return;
    if (wordCount(line) < 18) return;

    warnings.push({
      file: rel,
      line: index + 1,
      rule: 'standards.possible-verbatim.soc-criteria',
      message: 'SOC criteria-style sentence detected; verify it is original wording.',
      snippet: clipSnippet(line)
    });
  });
}

function printFindings(title, findings, level) {
  if (findings.length === 0) return;
  console.log(`\n${title} (${findings.length})`);
  for (const finding of findings) {
    const prefix = level === 'error' ? 'ERROR' : 'WARN ';
    console.log(`- [${prefix}] ${finding.file}:${finding.line} ${finding.rule}`);
    console.log(`  ${finding.message}`);
    if (finding.snippet) {
      console.log(`  ${finding.snippet}`);
    }
  }
}

function main() {
  const files = collectFiles(REPO_ROOT);
  const errors = [];
  const warnings = [];

  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(file);
    } catch (err) {
      continue;
    }

    if (isLikelyBinary(raw)) continue;
    const text = raw.toString('utf8');
    if (shouldIgnoreFile(text)) continue;

    checkCompetitorReferences(file, text, errors);
    if (warnings.length < MAX_WARNINGS) {
      checkPotentialStandardsCopy(file, text, warnings);
    }
  }

  printFindings('Competitor Reference Violations', errors, 'error');
  printFindings('Potential Standards Text Flags', warnings.slice(0, MAX_WARNINGS), 'warn');

  console.log('\nIP hygiene summary:');
  console.log(`- Files scanned: ${files.length}`);
  console.log(`- Competitor violations: ${errors.length}`);
  console.log(`- Standards flags: ${warnings.length}`);
  console.log(`- Strict standards mode: ${STRICT_MODE ? 'on' : 'off'}`);
  console.log('- Ignore marker: add "ip-hygiene:ignore" to bypass a specific line when justified.');

  if (errors.length > 0) {
    process.exit(1);
  }

  if (STRICT_MODE && warnings.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main();
