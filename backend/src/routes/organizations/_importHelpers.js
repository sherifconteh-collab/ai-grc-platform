/**
 * Helpers for the control-answer export/import routes
 * (GET /:orgId/controls/export and POST /:orgId/controls/import):
 * spreadsheet header mapping, value normalization, CSV escaping, and the
 * optional AI-assisted column mapping (with tier-aware usage limits).
 *
 * Extracted verbatim from routes/organizations.js (monolith split). All
 * logic is identical to the original inline definitions; the controls
 * sub-router destructures what it needs from the exported object.
 */

'use strict';

const pool = require('../../config/database');
const llm = require('../../services/llmService');
const { normalizeTier, shouldEnforceAiLimitForByok } = require('../../config/tierPolicy');
const { VALID_CONTROL_IMPLEMENTATION_STATUSES } = require('./_helpers');

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');
}

const CONTROL_ANSWER_IMPORT_HEADER_ALIASES = (() => {
  const aliases = {
    framework_control_id: [
      'framework_control_id',
      'framework_control_uuid',
      'framework_controlid',
      'framework_control',
      'control_uuid',
      'control_id_uuid',
      'framework_control_guid'
    ],
    framework_code: ['framework_code', 'framework', 'frameworkcode', 'framework_id', 'framework_key'],
    control_id: ['control_id', 'control', 'control_code', 'controlcode', 'control_number', 'control_identifier'],
    status: ['status', 'implementation_status', 'control_status'],
    implementation_notes: [
      'implementation_notes',
      'implementation_details',
      'implementation_detail',
      'implementation',
      'implementation_notesdetails'
    ],
    evidence_location: ['evidence_location', 'evidence', 'evidence_url', 'evidence_link', 'evidence_location_url'],
    notes: ['notes', 'note', 'comments', 'comment'],
    assigned_to_email: [
      'assigned_to_email',
      'assignee_email',
      'assigned_email',
      'owner_email',
      'assigned_to',
      'assignee'
    ],
    assigned_to_id: ['assigned_to_id', 'assignee_id', 'assigned_user_id', 'owner_id'],
    due_date: ['due_date', 'implementation_date', 'target_date', 'deadline', 'due']
  };

  const aliasToKey = new Map();
  Object.entries(aliases).forEach(([key, list]) => {
    list.forEach((entry) => {
      aliasToKey.set(normalizeHeaderKey(entry), key);
    });
    aliasToKey.set(normalizeHeaderKey(key), key);
  });

  return aliasToKey;
})();

function buildImportHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const headerMap = {};
  const present = new Set();

  for (let col = 1; col <= headerRow.cellCount; col++) {
    const rawHeader = String(headerRow.getCell(col)?.text || '').trim();
    if (!rawHeader) continue;

    const normalized = normalizeHeaderKey(rawHeader);
    const key = CONTROL_ANSWER_IMPORT_HEADER_ALIASES.get(normalized);
    if (!key) continue;
    if (headerMap[key]) continue;
    headerMap[key] = col;
    present.add(key);
  }

  return { headerMap, present };
}

function normalizeImplementationStatus(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) return null;

  const mapping = new Map([
    ['not started', 'not_started'],
    ['not_started', 'not_started'],
    ['notstarted', 'not_started'],
    ['todo', 'not_started'],
    ['in progress', 'in_progress'],
    ['in_progress', 'in_progress'],
    ['inprogress', 'in_progress'],
    ['started', 'in_progress'],
    ['implemented', 'implemented'],
    ['complete', 'implemented'],
    ['completed', 'implemented'],
    ['done', 'implemented'],
    ['needs review', 'needs_review'],
    ['needs_review', 'needs_review'],
    ['review', 'needs_review'],
    ['auto-crosswalked', 'satisfied_via_crosswalk'],
    ['auto_crosswalked', 'satisfied_via_crosswalk'],
    ['satisfied via crosswalk', 'satisfied_via_crosswalk'],
    ['satisfied_via_crosswalk', 'satisfied_via_crosswalk'],
    ['crosswalked', 'satisfied_via_crosswalk'],
    ['verified', 'verified'],
    ['not applicable', 'not_applicable'],
    ['not_applicable', 'not_applicable'],
    ['n/a', 'not_applicable'],
    ['na', 'not_applicable']
  ]);

  const value = mapping.get(normalized) || normalized;
  return VALID_CONTROL_IMPLEMENTATION_STATUSES.has(value) ? value : null;
}

function parseDateCellToISO(cell) {
  if (!cell) return null;
  const value = cell.value;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const rawText = String(cell.text || '').trim();
  if (!rawText) return null;

  // ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawText)) {
    return rawText;
  }

  // US date (MM/DD/YYYY)
  const usMatch = rawText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const mm = usMatch[1].padStart(2, '0');
    const dd = usMatch[2].padStart(2, '0');
    const yyyy = usMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(rawText);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[\",\\r\\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeJsonParse(raw, fallback = null) {
  if (!nonEmptyString(raw)) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function extractFirstJsonObject(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function normalizeFrameworkToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function getOrgDefaultLlmConfig(organizationId) {
  const result = await pool.query(
    `SELECT setting_key, setting_value
     FROM organization_settings
     WHERE organization_id = $1 AND setting_key IN ('default_model')`,
    [organizationId]
  );

  const values = {};
  result.rows.forEach((row) => {
    values[row.setting_key] = row.setting_value;
  });

  const provider = await llm.getOrgDefaultProvider(organizationId);

  return {
    provider,
    model: nonEmptyString(values.default_model) ? String(values.default_model) : null
  };
}

async function enforceImportAiLimit({ organizationId, organizationTier, provider }) {
  const tier = normalizeTier(organizationTier);
  const limit = llm.getUsageLimit(tier);
  const enforceByokLimits = shouldEnforceAiLimitForByok(tier);

  if (!enforceByokLimits) {
    const resolvedKey = await llm.resolveApiKey(provider, organizationId);
    if (resolvedKey.source === 'organization') {
      return { bypassed: true, tier, limit: 'unlimited', remaining: 'unlimited' };
    }
  }

  if (limit === -1) {
    return { bypassed: false, tier, limit: 'unlimited', remaining: 'unlimited' };
  }

  const used = await llm.getUsageCount(organizationId);
  if (used >= limit) {
    const err = new Error(`AI usage limit reached for ${tier} tier (${used}/${limit})`);
    err.status = 429;
    err.payload = {
      upgradeRequired: true,
      currentTier: tier,
      used,
      limit
    };
    throw err;
  }

  return {
    bypassed: false,
    tier,
    limit,
    remaining: Math.max(0, limit - used)
  };
}

function collectHeaderExamples(worksheet, headerCells, opts = {}) {
  const maxSampleRows = Number.isFinite(opts.maxSampleRows) ? opts.maxSampleRows : 10;
  const maxExamplesPerHeader = Number.isFinite(opts.maxExamplesPerHeader) ? opts.maxExamplesPerHeader : 3;
  const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : 96;

  const examples = {};
  headerCells.forEach(({ header }) => {
    examples[header] = [];
  });

  const rowLimit = Math.min(worksheet.rowCount || 0, 1 + maxSampleRows);
  for (let rowNumber = 2; rowNumber <= rowLimit; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (!row || !row.hasValues) continue;

    headerCells.forEach(({ col, header }) => {
      const list = examples[header];
      if (!Array.isArray(list) || list.length >= maxExamplesPerHeader) return;

      const raw = String(row.getCell(col)?.text || '').trim();
      if (!raw) return;

      const clipped = raw.length > maxChars ? `${raw.slice(0, maxChars)}…` : raw;
      if (!list.includes(clipped)) {
        list.push(clipped);
      }
    });
  }

  return examples;
}

function scoreHeaderForImportAi(header) {
  const normalized = normalizeHeaderKey(header);
  let score = 0;
  const weighted = [
    ['framework', 8],
    ['control', 8],
    ['uuid', 6],
    ['guid', 6],
    ['id', 5],
    ['code', 5],
    ['status', 7],
    ['implementation', 7],
    ['evidence', 7],
    ['url', 4],
    ['link', 4],
    ['note', 4],
    ['comment', 4],
    ['assign', 4],
    ['assignee', 4],
    ['owner', 3],
    ['due', 3],
    ['deadline', 3],
    ['date', 3]
  ];

  weighted.forEach(([token, weight]) => {
    if (normalized.includes(token)) score += weight;
  });

  if (normalized.length <= 2) score -= 2;
  if (normalized.length <= 4) score -= 1;
  return score;
}

function selectHeaderCellsForImportAi(headerCells, maxHeaders = 160) {
  if (!Array.isArray(headerCells) || headerCells.length <= maxHeaders) return headerCells;

  const scored = headerCells
    .map((entry, idx) => ({
      ...entry,
      _idx: idx,
      _score: scoreHeaderForImportAi(entry.header)
    }))
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return a._idx - b._idx;
    })
    .slice(0, maxHeaders);

  return scored
    .sort((a, b) => a._idx - b._idx)
    .map(({ _idx, _score, ...rest }) => rest);
}

async function inferControlAnswerImportHeaderMapWithAI({
  organizationId,
  provider,
  model,
  headers,
  examples
}) {
  const headerPayload = headers.map((header) => ({
    header,
    examples: Array.isArray(examples?.[header]) ? examples[header].slice(0, 3) : []
  }));

  const aiRaw = await llm.chat({
    organizationId,
    provider,
    model,
    maxTokens: 900,
    systemPrompt: [
      'You map spreadsheet columns to a canonical schema for importing control implementation answers into a GRC platform.',
      'Return JSON only (no markdown, no code fences, no prose outside JSON).',
      'Use exact header names from the provided list. If a field is missing, set it to null.',
      'Prefer stable identifiers: framework_control_id (UUID) if present, otherwise framework + control identifier.'
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Map spreadsheet columns to this required JSON shape:
{
  "mapping": {
    "framework_control_id": string|null,
    "framework_code": string|null,
    "control_id": string|null,
    "status": string|null,
    "implementation_notes": string|null,
    "evidence_location": string|null,
    "notes": string|null,
    "assigned_to_email": string|null,
    "assigned_to_id": string|null,
    "due_date": string|null
  },
  "confidence": {
    "framework_control_id": number,
    "framework_code": number,
    "control_id": number,
    "status": number,
    "implementation_notes": number,
    "evidence_location": number,
    "notes": number,
    "assigned_to_email": number,
    "assigned_to_id": number,
    "due_date": number
  }
}

Constraints:
- Use only header values that appear in the list below.
- Output a single JSON object only.
- Do not invent headers.

Headers with examples:
${JSON.stringify(headerPayload, null, 2)}`
    }]
  });

  const candidateJson = extractFirstJsonObject(aiRaw) || aiRaw;
  const parsed = safeJsonParse(candidateJson, null);
  if (!parsed) {
    const err = new Error('AI column mapping returned invalid JSON.');
    err.ai_raw = aiRaw;
    throw err;
  }

  const mapping = parsed.mapping && typeof parsed.mapping === 'object' ? parsed.mapping : parsed;
  return { mapping, raw: aiRaw, parsed };
}

module.exports = {
  normalizeHeaderKey,
  CONTROL_ANSWER_IMPORT_HEADER_ALIASES,
  buildImportHeaderMap,
  normalizeImplementationStatus,
  parseDateCellToISO,
  csvEscape,
  nonEmptyString,
  safeJsonParse,
  extractFirstJsonObject,
  normalizeFrameworkToken,
  getOrgDefaultLlmConfig,
  enforceImportAiLimit,
  collectHeaderExamples,
  scoreHeaderForImportAi,
  selectHeaderCellsForImportAi,
  inferControlAnswerImportHeaderMapWithAI,
};
