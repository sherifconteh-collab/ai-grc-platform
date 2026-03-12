// @tier: community
/**
 * AI Security Utilities — AIDEFEND Principles
 *
 * Implements key AIDEFEND framework controls for adversarial robustness,
 * output hardening, and privacy-preserving AI operations:
 *
 *  - Adversarial Input Defense: detect prompt injection, jailbreak, and
 *    role-override attacks before they reach the LLM (AIDEFEND: Adversarial
 *    Robustness, OWASP LLM01 - Prompt Injection)
 *  - Output Hardening & Sanitization: redact sensitive patterns from AI
 *    responses before returning them to callers (AIDEFEND: Output Hardening)
 *  - Privacy Controls: enforce maximum input sizes to prevent data extraction
 *    via prompt stuffing, and detect/redact PII and PHI before data reaches
 *    external LLM providers (AIDEFEND: Privacy and Information Controls,
 *    HIPAA § 164.514, GDPR Art. 25 — Privacy by Design)
 *  - Agent Autonomy Governance: surface threat metadata so orchestrators can
 *    apply human-in-the-loop decisions (AIDEFEND: Agent & Model Autonomy)
 *
 * Dynamic extensibility:
 *  - Use addInjectionPattern() / addOutputPattern() to register new patterns
 *    at startup or in response to updated threat intelligence without redeploying.
 *  - Use updateInjectionPatterns() / updateOutputPatterns() to replace all
 *    patterns at once (e.g., from a DB feed).
 *
 * PII/PHI Classification (OWASP LLM02 — Sensitive Information Disclosure):
 *  - PII (Personally Identifiable Information): email, phone, SSN, credit card,
 *    date of birth, IP address, passport/driver's license numbers.
 *  - PHI (Protected Health Information, HIPAA): medical record numbers, health
 *    plan/insurance IDs, ICD diagnosis codes, NPI numbers, DEA numbers,
 *    prescription details, lab result markers.
 *  - PII is redacted inline with a labelled placeholder so context is preserved.
 *  - PHI triggers a block by default; set PHI_REDACT_ONLY=true to redact instead.
 */

// ---------------------------------------------------------------------------
// Prompt injection / adversarial input patterns (mutable — see addInjectionPattern)
// ---------------------------------------------------------------------------
// Each pattern is paired with a short human-readable label used in threat
// metadata returned to the caller.
let INJECTION_PATTERNS = [
  // Role / context override
  { label: 'instruction_override', pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier|your)\s+(instructions?|prompt|context|rules?|constraints?|system)/i },
  { label: 'instruction_override', pattern: /forget\s+(everything|all|your|the)\s*(instructions?|rules?|constraints?|context|training)/i },
  { label: 'instruction_override', pattern: /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|constraints?)/i },

  // Persona injection — require explicit role assignment, not just any "you are now" phrase
  { label: 'persona_injection', pattern: /\byou\s+are\s+now\s+(a|an|the)\s+(?!GRC|compliance|security|analyzing|reviewing|examining|assessing)/i },
  { label: 'persona_injection', pattern: /\bpretend\s+(you\s+are|to\s+be)\b/i },
  { label: 'persona_injection', pattern: /\bact\s+as\b.{0,60}\b(without|ignore|no)\b/i },

  // System prompt extraction attempts
  { label: 'prompt_extraction', pattern: /\b(print|reveal|show|display|output|repeat|return|give\s+me|tell\s+me|what\s+is)\b.{0,60}\b(system\s+prompt|initial\s+instructions?|original\s+prompt|hidden\s+(instructions?|context))\b/i },
  { label: 'prompt_extraction', pattern: /what\s+(are\s+)?your\s+instructions/i },

  // Jailbreak keywords
  { label: 'jailbreak', pattern: /\bjailbreak\b/i },
  { label: 'jailbreak', pattern: /\bdan\b.{0,30}\bdo\s+anything\s+now\b/i },
  { label: 'jailbreak', pattern: /\bsystem\s+override\b/i },
  { label: 'jailbreak', pattern: /\bdeveloper\s+mode\s+(enabled|on|activated)\b/i },
  { label: 'jailbreak', pattern: /\bunrestricted\s+mode\b/i },

  // Delimiter / role-tag injection (LLM template attacks)
  { label: 'delimiter_injection', pattern: /\[\/?(INST|SYS|SYSTEM|END|START)\]/i },
  { label: 'delimiter_injection', pattern: /<\/?\s*system\s*>/i },
  { label: 'delimiter_injection', pattern: /\*{2,}\s*(system|user|assistant)\s*\*{2,}/i },
  { label: 'delimiter_injection', pattern: /^(###\s*)?(System)\s*:\s*You\s+are/im },
];

// ---------------------------------------------------------------------------
// Output sensitive-data patterns (redacted before returning to caller, mutable)
// ---------------------------------------------------------------------------
let OUTPUT_SENSITIVE_PATTERNS = [
  // Common API key shapes
  { label: 'api_key_openai',     pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { label: 'api_key_anthropic',  pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/g },
  { label: 'api_key_google',     pattern: /AIza[0-9A-Za-z\-_]{35}/g },
  // Bearer / JWT tokens
  { label: 'bearer_token',       pattern: /Bearer\s+[a-zA-Z0-9\-_\.]{20,}/g },
  // Postgres-style connection strings
  { label: 'db_connection',      pattern: /postgres(?:ql)?:\/\/[^\s"']+/gi },
];

// ---------------------------------------------------------------------------
// PII detection patterns
// Each entry carries the placeholder label used when redacting the match.
// ---------------------------------------------------------------------------
const PII_PATTERNS = [
  // Email addresses
  { label: 'EMAIL',          pattern: /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g },
  // US Social Security Numbers (dashes or spaces)
  { label: 'SSN',            pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g },
  // US phone numbers (multiple common formats)
  { label: 'PHONE',          pattern: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  // Credit/debit card numbers — 16 digits in groups of 4 (hyphens, spaces, or mixed)
  { label: 'CREDIT_CARD',    pattern: /\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g },
  // IPv4 addresses — valid octets only (0-255)
  { label: 'IP_ADDRESS',     pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g },
  // Dates of birth — require contextual label to reduce false positives
  { label: 'DATE_OF_BIRTH',  pattern: /\b(?:dob|date\s+of\s+birth)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi },
  // US passport numbers — require contextual "passport" keyword to reduce false positives
  { label: 'PASSPORT',       pattern: /\b(?:passport(?:\s+(?:number|no\.?|#))?)\s*[:\-]?\s*[A-Z][0-9]{8}\b/gi },
  // US driver's license — require contextual label to reduce false positives
  { label: 'DRIVERS_LICENSE', pattern: /\b(?:driver[s']?\s+licen[sc]e|dl\s*(?:number|no\.?|#)?)\s*[:\-]?\s*[A-Z0-9]{5,15}\b/gi },
];

// ---------------------------------------------------------------------------
// PHI detection patterns (HIPAA 18 identifiers subset most detectable via regex)
// ---------------------------------------------------------------------------
const PHI_PATTERNS = [
  // Medical Record Numbers (MRN) — require contextual label
  { label: 'MRN',            pattern: /\b(?:mrn|medical\s+record\s+(?:number|no\.?|#))\s*[:\-]?\s*[A-Z0-9\-]{4,20}\b/gi },
  // Health Plan / Insurance member IDs — require contextual label
  { label: 'HEALTH_PLAN_ID', pattern: /\b(?:member\s+id|health\s+plan\s+(?:id|number)|insurance\s+(?:id|number)|policy\s+(?:id|number))\s*[:\-]?\s*[A-Z0-9\-]{5,20}\b/gi },
  // NPI (National Provider Identifier) — require contextual label + exactly 10 digits
  { label: 'NPI',            pattern: /\b(?:npi|national\s+provider\s+identifier)\s*[:\-]?\s*\d{10}\b/gi },
  // DEA number — require contextual "DEA" label to avoid false positives
  { label: 'DEA_NUMBER',     pattern: /\b(?:dea\s+(?:number|no\.?|#)?)\s*[:\-]?\s*[A-Z]{2}\d{7}\b/gi },
  // ICD-10 diagnosis codes — valid letter ranges (A–Z) with contextual label
  { label: 'ICD_CODE',       pattern: /\b(?:icd[-\s]?(?:10|9)|diagnosis\s+code|dx\s+code)\s*[:\-]?\s*[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?\b/gi },
  // SNOMED / LOINC codes — require contextual label
  { label: 'DIAGNOSIS_CODE', pattern: /\b(?:loinc|snomed)\s*[:\-]?\s*[A-Z0-9.\-]{3,15}\b/gi },
  // Prescription / medication with dosage marker
  { label: 'PRESCRIPTION',   pattern: /\b(?:prescribed?|prescription|rx)\s*[:\-]?\s*[a-zA-Z][a-zA-Z0-9\s\-]{2,40}\s+\d+\s*(?:mg|mcg|g|ml|units?)\b/gi },
  // Lab result marker patterns (e.g. "HbA1c: 7.2%", "WBC: 5.4 K/uL")
  // Note: psa removed — too ambiguous without a required unit suffix.
  // `%` is not a word character so \b cannot follow it directly; units that end
  // in a letter (mg/dL, mmol/L, K/uL, U/L) still get a word-boundary check.
  { label: 'LAB_RESULT',     pattern: /\b(?:hba1c|wbc|rbc|hgb|hematocrit|platelet|creatinine|bun|ast|alt|a1c|ldl|hdl|tsh)\s*[:\-]?\s*\d+(?:\.\d+)?\s*(?:%|(?:mg\/dL|mmol\/L|K\/uL|U\/L)\b)/gi },
];

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
const MAX_INPUT_CHARS = 32000;   // ~8k tokens — reasonable single-message cap
const MAX_OUTPUT_CHARS = 60000;  // Generous but bounded output

// ---------------------------------------------------------------------------
// Dynamic pattern management (AIDEFEND: continuous monitoring / threat feed)
// ---------------------------------------------------------------------------

/**
 * Register an additional prompt injection detection pattern at runtime.
 * Call this on startup to extend the baseline set with org-specific patterns,
 * or from a threat-feed loader to incorporate newly discovered attack signatures.
 *
 * @param {string} label  - Short identifier (e.g. 'competitor_brand_override')
 * @param {RegExp} pattern - Regular expression to match against user input
 */
function addInjectionPattern(label, pattern) {
  if (typeof label !== 'string' || !(pattern instanceof RegExp)) {
    throw new TypeError('addInjectionPattern: label must be a string and pattern must be a RegExp');
  }
  INJECTION_PATTERNS = [...INJECTION_PATTERNS, { label, pattern }];
}

/**
 * Register an additional output-redaction pattern at runtime.
 * Use to add new credential formats, secret shapes, or PII patterns.
 *
 * @param {string} label  - Short identifier (e.g. 'aws_access_key')
 * @param {RegExp} pattern - Regular expression (with 'g' flag) to match and redact
 */
function addOutputPattern(label, pattern) {
  if (typeof label !== 'string' || !(pattern instanceof RegExp)) {
    throw new TypeError('addOutputPattern: label must be a string and pattern must be a RegExp');
  }
  // Enforce global flag so all occurrences are redacted, not just the first
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const globalPattern = new RegExp(pattern.source, flags);
  OUTPUT_SENSITIVE_PATTERNS = [...OUTPUT_SENSITIVE_PATTERNS, { label, pattern: globalPattern }];
}

/**
 * Replace the entire injection pattern set (e.g. from a database-driven config).
 * @param {Array<{ label: string, pattern: RegExp }>} patterns
 */
function updateInjectionPatterns(patterns) {
  if (!Array.isArray(patterns)) throw new TypeError('updateInjectionPatterns: patterns must be an array');
  INJECTION_PATTERNS = patterns.map(p => {
    if (typeof p.label !== 'string' || !(p.pattern instanceof RegExp)) {
      throw new TypeError('Each pattern must have a string label and RegExp pattern');
    }
    return { label: p.label, pattern: p.pattern };
  });
}

/**
 * Replace the entire output-redaction pattern set.
 * @param {Array<{ label: string, pattern: RegExp }>} patterns
 */
function updateOutputPatterns(patterns) {
  if (!Array.isArray(patterns)) throw new TypeError('updateOutputPatterns: patterns must be an array');
  OUTPUT_SENSITIVE_PATTERNS = patterns.map(p => {
    if (typeof p.label !== 'string' || !(p.pattern instanceof RegExp)) {
      throw new TypeError('Each pattern must have a string label and RegExp pattern');
    }
    // Enforce global flag so all occurrences are redacted
    const flags = p.pattern.flags.includes('g') ? p.pattern.flags : p.pattern.flags + 'g';
    const globalPattern = new RegExp(p.pattern.source, flags);
    return { label: p.label, pattern: globalPattern };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan text for prompt injection / adversarial patterns.
 * Returns metadata about detected threats without modifying the original text.
 *
 * @param {string} text
 * @returns {{ detected: boolean, threats: Array<{ label: string, excerpt: string }> }}
 */
function detectPromptInjection(text) {
  if (!text || typeof text !== 'string') {
    return { detected: false, threats: [] };
  }

  const threats = [];

  for (const { label, pattern } of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      threats.push({
        label,
        excerpt: match[0].slice(0, 120),
      });
    }
  }

  return { detected: threats.length > 0, threats };
}

/**
 * Sanitize a user-supplied input before forwarding it to an LLM.
 * - Coerces non-string values to strings to prevent type-propagation bugs.
 * - Enforces a maximum character length (truncates excess).
 * - Does NOT strip or transform text content, preserving legitimate queries
 *   while bounding data-stuffing attacks.
 *
 * Call `detectPromptInjection` separately to decide whether to reject the
 * request outright based on your policy.
 *
 * @param {*} text
 * @returns {{ text: string, truncated: boolean }}
 */
function sanitizeInput(text) {
  if (text == null) {
    return { text: '', truncated: false };
  }

  if (typeof text !== 'string') {
    text = String(text);
  }

  if (text.length > MAX_INPUT_CHARS) {
    return { text: text.slice(0, MAX_INPUT_CHARS), truncated: true };
  }

  return { text, truncated: false };
}

/**
 * Harden an LLM output before returning it to the caller.
 * - Coerces non-string values to strings.
 * - Caps total length.
 * - Redacts patterns that look like API keys, tokens, or connection strings.
 *
 * @param {*} text
 * @returns {{ text: string, redacted: boolean, truncated: boolean }}
 */
function sanitizeOutput(text) {
  if (text == null) {
    return { text: '', redacted: false, truncated: false };
  }

  if (typeof text !== 'string') {
    text = String(text);
  }

  let result = text;
  let redacted = false;
  let truncated = false;

  // Cap output length first
  if (result.length > MAX_OUTPUT_CHARS) {
    result = result.slice(0, MAX_OUTPUT_CHARS) + '\n\n[Output truncated]';
    truncated = true;
  }

  // Redact sensitive patterns
  for (const { pattern } of OUTPUT_SENSITIVE_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    const replaced = result.replace(rx, '[REDACTED]');
    if (replaced !== result) {
      result = replaced;
      redacted = true;
    }
  }

  return { text: result, redacted, truncated };
}

/**
 * Scan all user-role messages in an LLM messages array for prompt injection.
 * Aggregates all threats found across all user messages and returns them
 * along with per-message metadata.
 *
 * @param {Array<{ role: string, content: string|Array }>} messages
 * @returns {{ detected: boolean, threats: Array, perMessage: Array }}
 */
function scanMessages(messages) {
  if (!Array.isArray(messages)) {
    return { detected: false, threats: [], perMessage: [] };
  }

  const perMessage = [];
  const allThreats = [];

  for (const msg of messages) {
    if (msg.role !== 'user') {
      perMessage.push({ role: msg.role, detected: false, threats: [] });
      continue;
    }

    // Content can be a string or an array of content blocks
    const contentText = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map(b => {
            if (typeof b === 'string') return b;
            if (b && typeof b.text === 'string') return b.text;
            return '';
          }).join(' ')
        : '';

    const result = detectPromptInjection(contentText);
    perMessage.push({ role: msg.role, detected: result.detected, threats: result.threats });
    if (result.detected) {
      allThreats.push(...result.threats);
    }
  }

  return { detected: allThreats.length > 0, threats: allThreats, perMessage };
}

/**
 * Scan text for PII (Personally Identifiable Information) and PHI
 * (Protected Health Information) patterns.
 *
 * Returns a classification result describing what was found without
 * modifying the original text.  The caller decides the enforcement action:
 *  - PII → redact before forwarding to LLM (use redactPiiPhi())
 *  - PHI → block request or redact only if PHI_REDACT_ONLY env flag is set
 *
 * @param {string} text
 * @returns {{
 *   hasPii:   boolean,
 *   hasPhi:   boolean,
 *   piiTypes: string[],
 *   phiTypes: string[],
 *   findings: Array<{ category: 'PII'|'PHI', label: string, excerpt: string }>
 * }}
 */
function detectPiiPhi(text) {
  if (!text || typeof text !== 'string') {
    return { hasPii: false, hasPhi: false, piiTypes: [], phiTypes: [], findings: [] };
  }

  const findings = [];
  const piiTypes = new Set();
  const phiTypes = new Set();

  for (const { label, pattern } of PII_PATTERNS) {
    // Use a fresh RegExp each call to reset lastIndex for global patterns
    const rx = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = rx.exec(text)) !== null) {
      piiTypes.add(label);
      findings.push({ category: 'PII', label, excerpt: match[0].slice(0, 60) });
      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) rx.lastIndex++;
    }
  }

  for (const { label, pattern } of PHI_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = rx.exec(text)) !== null) {
      phiTypes.add(label);
      findings.push({ category: 'PHI', label, excerpt: match[0].slice(0, 60) });
      if (match[0].length === 0) rx.lastIndex++;
    }
  }

  return {
    hasPii: piiTypes.size > 0,
    hasPhi: phiTypes.size > 0,
    piiTypes: [...piiTypes],
    phiTypes: [...phiTypes],
    findings,
  };
}

/**
 * Redact PII and PHI from text, replacing each match with a labelled
 * placeholder (e.g. [EMAIL REDACTED], [MRN REDACTED]).
 *
 * Redaction is always applied to both PII and PHI — callers that want to
 * block PHI entirely should check `detectPiiPhi().hasPhi` before calling
 * this function and skip the LLM call.
 *
 * @param {string} text
 * @returns {{ text: string, redacted: boolean, piiTypes: string[], phiTypes: string[] }}
 */
function redactPiiPhi(text) {
  if (!text || typeof text !== 'string') {
    return { text: text || '', redacted: false, piiTypes: [], phiTypes: [] };
  }

  let result = text;
  let redacted = false;
  const piiTypes = new Set();
  const phiTypes = new Set();

  for (const { label, pattern } of PII_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    const replaced = result.replace(rx, `[${label} REDACTED]`);
    if (replaced !== result) {
      result = replaced;
      redacted = true;
      piiTypes.add(label);
    }
  }

  for (const { label, pattern } of PHI_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    const replaced = result.replace(rx, `[${label} REDACTED]`);
    if (replaced !== result) {
      result = replaced;
      redacted = true;
      phiTypes.add(label);
    }
  }

  return {
    text: result,
    redacted,
    piiTypes: [...piiTypes],
    phiTypes: [...phiTypes],
  };
}

/**
 * Scan all user-role messages in an LLM messages array for PII/PHI.
 * Aggregates findings across all messages.
 *
 * @param {Array<{ role: string, content: string|Array }>} messages
 * @returns {{
 *   hasPii:   boolean,
 *   hasPhi:   boolean,
 *   piiTypes: string[],
 *   phiTypes: string[],
 *   findings: Array
 * }}
 */
function scanMessagesForPiiPhi(messages) {
  if (!Array.isArray(messages)) {
    return { hasPii: false, hasPhi: false, piiTypes: [], phiTypes: [], findings: [] };
  }

  const allFindings = [];
  const allPiiTypes = new Set();
  const allPhiTypes = new Set();

  for (const msg of messages) {
    // Only scan user-supplied content — consistent with redactMessagesForPiiPhi()
    // which only redacts user-role messages. Scanning system/assistant content would
    // produce false blocks on platform-authored prompts without a matching redaction path.
    if (msg.role !== 'user') continue;

    const contentText = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.map(b => {
            if (typeof b === 'string') return b;
            if (b && typeof b.text === 'string') return b.text;
            return '';
          }).join(' ')
        : '';

    if (!contentText) continue;

    const result = detectPiiPhi(contentText);
    result.piiTypes.forEach(t => allPiiTypes.add(t));
    result.phiTypes.forEach(t => allPhiTypes.add(t));
    allFindings.push(...result.findings);
  }

  return {
    hasPii: allPiiTypes.size > 0,
    hasPhi: allPhiTypes.size > 0,
    piiTypes: [...allPiiTypes],
    phiTypes: [...allPhiTypes],
    findings: allFindings,
  };
}

/**
 * Apply PII/PHI redaction to all user messages in an LLM messages array.
 * Returns the redacted messages array along with a summary of what was redacted.
 *
 * @param {Array<{ role: string, content: string|Array }>} messages
 * @returns {{
 *   messages: Array,
 *   redacted: boolean,
 *   piiTypes: string[],
 *   phiTypes: string[]
 * }}
 */
function redactMessagesForPiiPhi(messages) {
  if (!Array.isArray(messages)) {
    return { messages: [], redacted: false, piiTypes: [], phiTypes: [] };
  }

  const allPiiTypes = new Set();
  const allPhiTypes = new Set();
  let anyRedacted = false;

  const redactedMessages = messages.map(msg => {
    // Only redact user-supplied content; assistant/system messages are platform-controlled
    if (msg.role !== 'user') return msg;

    if (typeof msg.content === 'string') {
      const { text, redacted, piiTypes, phiTypes } = redactPiiPhi(msg.content);
      if (redacted) {
        anyRedacted = true;
        piiTypes.forEach(t => allPiiTypes.add(t));
        phiTypes.forEach(t => allPhiTypes.add(t));
        return { ...msg, content: text };
      }
      return msg;
    }

    if (Array.isArray(msg.content)) {
      let blockRedacted = false;
      const sanitizedBlocks = msg.content.map(block => {
        if (typeof block === 'string') {
          const { text, redacted, piiTypes, phiTypes } = redactPiiPhi(block);
          if (redacted) {
            blockRedacted = true;
            piiTypes.forEach(t => allPiiTypes.add(t));
            phiTypes.forEach(t => allPhiTypes.add(t));
            return text;
          }
          return block;
        }
        if (block && typeof block.text === 'string') {
          const { text, redacted, piiTypes, phiTypes } = redactPiiPhi(block.text);
          if (redacted) {
            blockRedacted = true;
            piiTypes.forEach(t => allPiiTypes.add(t));
            phiTypes.forEach(t => allPhiTypes.add(t));
            return { ...block, text };
          }
          return block;
        }
        return block;
      });
      if (blockRedacted) anyRedacted = true;
      return blockRedacted ? { ...msg, content: sanitizedBlocks } : msg;
    }

    if (msg.content != null) {
      const { text, redacted, piiTypes, phiTypes } = redactPiiPhi(String(msg.content));
      if (redacted) {
        anyRedacted = true;
        piiTypes.forEach(t => allPiiTypes.add(t));
        phiTypes.forEach(t => allPhiTypes.add(t));
        return { ...msg, content: text };
      }
    }

    return msg;
  });

  return {
    messages: redactedMessages,
    redacted: anyRedacted,
    piiTypes: [...allPiiTypes],
    phiTypes: [...allPhiTypes],
  };
}

// ---------------------------------------------------------------------------
// Internal data classification / tagging (for data-at-rest)
// ---------------------------------------------------------------------------

// Map our detector labels to the allowed pii_types values stored in the DB
// (matches ALLOWED_PII_TYPES in routes/evidence.js)
const PII_LABEL_TO_TYPE = {
  EMAIL:           'email',
  SSN:             'ssn',
  PHONE:           'phone',
  CREDIT_CARD:     'financial',
  IP_ADDRESS:      'other',
  DATE_OF_BIRTH:   'dob',
  PASSPORT:        'other',
  DRIVERS_LICENSE: 'other',
};

// PHI findings always map to the 'health' pii_type
const PHI_LABELS = new Set([
  'MRN', 'HEALTH_PLAN_ID', 'NPI', 'DEA_NUMBER',
  'ICD_CODE', 'DIAGNOSIS_CODE', 'PRESCRIPTION', 'LAB_RESULT',
]);

// Classification severity ranks (higher = more sensitive)
const CLASSIFICATION_RANK = { none: 0, low: 1, moderate: 2, high: 3, critical: 4 };

// PII labels ranked by sensitivity
const HIGH_SENSITIVITY_PII = new Set(['SSN', 'CREDIT_CARD']);
const LOW_SENSITIVITY_PII  = new Set(['IP_ADDRESS']);
// Everything else is 'moderate'

/**
 * Classify text content for storage-level data tagging.
 * Returns labels compatible with the evidence table schema (migration 072):
 *   pii_classification: 'none'|'low'|'moderate'|'high'|'critical'
 *   pii_types:          string[] (subset of ALLOWED_PII_TYPES)
 *   data_sensitivity:   'public'|'internal'|'confidential'|'restricted'
 *
 * Intended for auto-tagging data before it is persisted — call this on any
 * user-supplied text (evidence descriptions, file content, policy text, etc.)
 * and merge the result with any manually-supplied classification, taking the
 * stricter (higher-ranked) value so manual upgrades are always honoured.
 *
 * @param {string} text  - Content to classify
 * @returns {{
 *   pii_classification: string,
 *   pii_types:          string[],
 *   data_sensitivity:   string,
 *   detected:           boolean
 * }}
 */
function classifyDataSensitivity(text) {
  if (!text || typeof text !== 'string') {
    return { pii_classification: 'none', pii_types: [], data_sensitivity: 'internal', detected: false };
  }

  const scan = detectPiiPhi(text);

  if (!scan.hasPii && !scan.hasPhi) {
    return { pii_classification: 'none', pii_types: [], data_sensitivity: 'internal', detected: false };
  }

  const piiTypesSet = new Set();
  let classificationLevel = 'none';

  // Score PHI findings (critical)
  if (scan.hasPhi) {
    piiTypesSet.add('health');
    classificationLevel = 'critical';
  }

  // Score PII findings
  for (const label of scan.piiTypes) {
    const mapped = PII_LABEL_TO_TYPE[label];
    if (mapped) piiTypesSet.add(mapped);

    let levelForLabel;
    if (HIGH_SENSITIVITY_PII.has(label)) {
      levelForLabel = 'high';
    } else if (LOW_SENSITIVITY_PII.has(label)) {
      levelForLabel = 'low';
    } else {
      levelForLabel = 'moderate';
    }

    if (CLASSIFICATION_RANK[levelForLabel] > CLASSIFICATION_RANK[classificationLevel]) {
      classificationLevel = levelForLabel;
    }
  }

  // data_sensitivity derived from classification level
  let dataSensitivity;
  if (classificationLevel === 'critical' || classificationLevel === 'high') {
    dataSensitivity = 'restricted';
  } else {
    dataSensitivity = 'confidential';
  }

  return {
    pii_classification: classificationLevel,
    pii_types: [...piiTypesSet],
    data_sensitivity: dataSensitivity,
    detected: true,
  };
}

module.exports = {
  detectPromptInjection,
  sanitizeInput,
  sanitizeOutput,
  scanMessages,
  addInjectionPattern,
  addOutputPattern,
  updateInjectionPatterns,
  updateOutputPatterns,
  detectPiiPhi,
  redactPiiPhi,
  scanMessagesForPiiPhi,
  redactMessagesForPiiPhi,
  classifyDataSensitivity,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
};
