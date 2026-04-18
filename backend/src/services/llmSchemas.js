// @tier: community
'use strict';

/**
 * llmSchemas.js — JSON Schemas for structured AI outputs (v3.0.0).
 *
 * The validator is a deliberately small recursive walker that supports the
 * subset of JSON Schema draft-07 needed by our prompt contracts:
 *   - type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean'
 *   - required: string[]
 *   - properties: { [k]: schema }
 *   - items: schema   (for arrays)
 *   - enum: any[]
 *   - minimum / maximum (number)
 *   - minLength (string)
 *   - additionalProperties: boolean (default true)
 *
 * The prior top-level-only validator let malformed gaps[] / steps[] items
 * through silently. This walker descends into nested object properties and
 * array items, accumulating Ajv-style errors with a JSON-pointer-ish path so
 * aiHandler() can inject them back into the user prompt as a correction hint.
 */

const GAP_ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['readiness_score', 'summary', 'gaps', 'recommended_roadmap'],
  properties: {
    readiness_score: { type: 'number', minimum: 0, maximum: 100 },
    summary: { type: 'string', minLength: 1 },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['control', 'severity', 'description'],
        properties: {
          control: { type: 'string', minLength: 1 },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          description: { type: 'string', minLength: 1 },
          evidence_required: { type: 'array', items: { type: 'string' } },
          estimated_effort_days: { type: 'number', minimum: 0 },
        },
      },
    },
    recommended_roadmap: { type: 'array', items: { type: 'string' } },
  },
};

const REMEDIATION_PLAYBOOK_SCHEMA = {
  type: 'object',
  required: ['objective', 'steps'],
  properties: {
    objective: { type: 'string', minLength: 1 },
    prerequisites: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['order', 'action'],
        properties: {
          order: { type: 'integer', minimum: 1 },
          action: { type: 'string', minLength: 1 },
          owner: { type: 'string' },
          estimated_hours: { type: 'number', minimum: 0 },
        },
      },
    },
    tools: { type: 'array', items: { type: 'string' } },
    artifacts: { type: 'array', items: { type: 'string' } },
    estimated_total_hours: { type: 'number', minimum: 0 },
  },
};

const TEST_PROCEDURES_SCHEMA = {
  type: 'object',
  required: ['objective', 'steps'],
  properties: {
    objective: { type: 'string', minLength: 1 },
    scope: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['order', 'procedure'],
        properties: {
          order: { type: 'integer', minimum: 1 },
          procedure: { type: 'string', minLength: 1 },
          method: { type: 'string', enum: ['walkthrough', 'inspection', 'observation', 're-performance', 'inquiry'] },
          pass_criteria: { type: 'string' },
          fail_criteria: { type: 'string' },
        },
      },
    },
    sample_size: { type: 'string' },
    frequency: { type: 'string' },
  },
};

const EVIDENCE_SUGGESTION_SCHEMA = {
  type: 'object',
  required: ['control_title', 'framework', 'evidence_items'],
  properties: {
    control_title: { type: 'string', minLength: 1 },
    framework: { type: 'string', minLength: 1 },
    evidence_items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'format'],
        properties: {
          name: { type: 'string', minLength: 1 },
          format: { type: 'string' },
          cadence: { type: 'string' },
          source_system: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    collection_notes: { type: 'string' },
    estimated_collection_hours: { type: 'number', minimum: 0 },
  },
};

const FINDING_SCHEMA = {
  type: 'object',
  required: ['criteria', 'condition', 'cause', 'effect', 'recommendation'],
  properties: {
    criteria: { type: 'string', minLength: 1 },
    condition: { type: 'string', minLength: 1 },
    cause: { type: 'string', minLength: 1 },
    effect: { type: 'string', minLength: 1 },
    recommendation: { type: 'string', minLength: 1 },
    management_response_placeholder: { type: 'string' },
    related_controls: { type: 'array', items: { type: 'string' } },
    repeat_finding: { type: 'boolean' },
    finding_id_hint: { type: 'string' },
  },
};

// Map feature key -> schema. Includes the route-level aliases noted in v3.0.0
// (evidence_suggest, audit_finding_draft) so those routes also trigger
// validation + retry instead of slipping through unchecked.
const FEATURE_SCHEMAS = {
  gap_analysis: GAP_ANALYSIS_SCHEMA,
  remediation_playbook: REMEDIATION_PLAYBOOK_SCHEMA,
  test_procedures: TEST_PROCEDURES_SCHEMA,
  evidence_suggestion: EVIDENCE_SUGGESTION_SCHEMA,
  evidence_suggest: EVIDENCE_SUGGESTION_SCHEMA, // alias
  finding: FINDING_SCHEMA,
  audit_finding_draft: FINDING_SCHEMA, // alias
};

function getSchemaForFeature(featureKey) {
  if (!featureKey) return null;
  return FEATURE_SCHEMAS[featureKey] || null;
}

function _typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function _typeMatches(actual, expected) {
  if (expected === 'integer') return actual === 'integer';
  if (expected === 'number') return actual === 'integer' || actual === 'number';
  return actual === expected;
}

/**
 * Recursive validator. Returns { valid, errors } where errors is an array of
 * { instancePath, message } in Ajv style.
 */
function validate(schema, value, path = '') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return { valid: true, errors };

  if (schema.type) {
    const actual = _typeOf(value);
    if (!_typeMatches(actual, schema.type)) {
      errors.push({ instancePath: path || '/', message: `expected type ${schema.type} but got ${actual}` });
      return { valid: false, errors };
    }
  }

  if (Array.isArray(schema.enum)) {
    const ok = schema.enum.some(e => e === value);
    if (!ok) errors.push({ instancePath: path || '/', message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  if (schema.type === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push({ instancePath: path || '/', message: `must be at least ${schema.minLength} characters` });
    }
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push({ instancePath: path || '/', message: `must be >= ${schema.minimum}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push({ instancePath: path || '/', message: `must be <= ${schema.maximum}` });
    }
  }

  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) {
        if (!(k in value)) {
          errors.push({ instancePath: path || '/', message: `missing required property "${k}"` });
        }
      }
    }
    if (schema.properties) {
      for (const [k, subSchema] of Object.entries(schema.properties)) {
        if (k in value) {
          const sub = validate(subSchema, value[k], `${path}/${k}`);
          if (!sub.valid) errors.push(...sub.errors);
        }
      }
    }
    // additionalProperties: false → reject keys not declared in `properties`.
    // Default (true / omitted) leaves extras alone.
    if (schema.additionalProperties === false) {
      const declared = schema.properties ? Object.keys(schema.properties) : [];
      for (const k of Object.keys(value)) {
        if (!declared.includes(k)) {
          errors.push({ instancePath: path || '/', message: `unexpected additional property "${k}"` });
        }
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, idx) => {
      const sub = validate(schema.items, item, `${path}/${idx}`);
      if (!sub.valid) errors.push(...sub.errors);
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format an error list as a human-readable correction hint suitable for
 * appending to a follow-up prompt during a one-shot retry.
 */
function formatErrorsForRetry(errors) {
  if (!errors || !errors.length) return '';
  const lines = errors.slice(0, 10).map(e => `- ${e.instancePath}: ${e.message}`);
  return [
    'Your previous response did not validate against the required schema. Errors:',
    ...lines,
    'Please respond again with valid JSON that satisfies the schema. Do not include any prose outside the JSON object.',
  ].join('\n');
}

module.exports = {
  GAP_ANALYSIS_SCHEMA,
  REMEDIATION_PLAYBOOK_SCHEMA,
  TEST_PROCEDURES_SCHEMA,
  EVIDENCE_SUGGESTION_SCHEMA,
  FINDING_SCHEMA,
  FEATURE_SCHEMAS,
  getSchemaForFeature,
  validate,
  formatErrorsForRetry,
};
