// @tier: free
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
 *    via prompt stuffing (AIDEFEND: Privacy and Information Controls)
 *  - Agent Autonomy Governance: surface threat metadata so orchestrators can
 *    apply human-in-the-loop decisions (AIDEFEND: Agent & Model Autonomy)
 *
 * Dynamic extensibility:
 *  - Use addInjectionPattern() / addOutputPattern() to register new patterns
 *    at startup or in response to updated threat intelligence without redeploying.
 *  - Use updateInjectionPatterns() / updateOutputPatterns() to replace all
 *    patterns at once (e.g., from a DB feed).
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

module.exports = {
  detectPromptInjection,
  sanitizeInput,
  sanitizeOutput,
  scanMessages,
  addInjectionPattern,
  addOutputPattern,
  updateInjectionPatterns,
  updateOutputPatterns,
  MAX_INPUT_CHARS,
  MAX_OUTPUT_CHARS,
};
