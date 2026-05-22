// @tier: community
'use strict';

/**
 * JSON Schemas for structured AI outputs.
 *
 * Each schema defines the shape of the JSON object an AI feature must return.
 * Used with Anthropic tool-use and OpenAI response_format: json_schema to force
 * deterministic structured output. Validated with the validate() helper before
 * the result is persisted or returned to the client.
 */

// ---------------------------------------------------------------------------
// Minimal JSON-Schema-subset validator (no external dependency)
// Recursively validates presence/types of properties, including nested
// objects and arrays (via `items` schema).
// Returns { valid: boolean, errors: string[] }
// ---------------------------------------------------------------------------
function validate(schema, data, path = '') {
  const errors = [];

  // Top-level or nested object validation
  if (schema.type === 'object' || schema.properties || schema.required) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push(`${path || 'root'}: expected object`);
      return { valid: false, errors };
    }

    const required = schema.required || [];
    const properties = schema.properties || {};

    for (const key of required) {
      if (!(key in data) || data[key] === null || data[key] === undefined) {
        errors.push(`${path ? path + '.' : ''}${key}: missing required property`);
      }
    }

    for (const [key, propSchema] of Object.entries(properties)) {
      if (!(key in data)) continue;
      const val = data[key];
      const subPath = path ? `${path}.${key}` : key;

      if (propSchema.type === 'array') {
        if (!Array.isArray(val)) {
          errors.push(`${subPath}: expected array`);
          continue;
        }
        if (propSchema.items) {
          val.forEach((item, idx) => {
            const itemResult = validate(propSchema.items, item, `${subPath}[${idx}]`);
            errors.push(...itemResult.errors);
          });
        }
      } else if (propSchema.type === 'string' && typeof val !== 'string') {
        errors.push(`${subPath}: expected string`);
      } else if (propSchema.type === 'number' && typeof val !== 'number') {
        errors.push(`${subPath}: expected number`);
      } else if (propSchema.type === 'boolean' && typeof val !== 'boolean') {
        errors.push(`${subPath}: expected boolean`);
      } else if (propSchema.type === 'object' || propSchema.properties || propSchema.required) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          const nested = validate(propSchema, val, subPath);
          errors.push(...nested.errors);
        } else {
          errors.push(`${subPath}: expected object`);
        }
      }

      if (propSchema.enum && !propSchema.enum.includes(val)) {
        errors.push(`${subPath}: must be one of [${propSchema.enum.join(', ')}], got "${val}"`);
      }

      if (propSchema.minLength && typeof val === 'string' && val.length < propSchema.minLength) {
        errors.push(`${subPath}: must be at least ${propSchema.minLength} characters`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Primitive/scalar validation (used when recursed as items schema)
  if (schema.type === 'string' && typeof data !== 'string') {
    errors.push(`${path || 'value'}: expected string`);
  } else if (schema.type === 'number' && typeof data !== 'number') {
    errors.push(`${path || 'value'}: expected number`);
  } else if (schema.type === 'boolean' && typeof data !== 'boolean') {
    errors.push(`${path || 'value'}: expected boolean`);
  }
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path || 'value'}: must be one of [${schema.enum.join(', ')}]`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

const GAP_ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['executive_summary', 'gaps', 'remediation_roadmap', 'audit_readiness_score'],
  properties: {
    executive_summary: { type: 'string', minLength: 100 },
    audit_readiness_score: { type: 'number' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['control_id', 'framework', 'title', 'severity', 'description'],
        properties: {
          control_id:  { type: 'string' },
          framework:   { type: 'string' },
          title:       { type: 'string' },
          severity:    { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          description: { type: 'string' }
        }
      }
    },
    remediation_roadmap: {
      type: 'object',
      properties: {
        immediate:   { type: 'array' },
        short_term:  { type: 'array' },
        medium_term: { type: 'array' }
      }
    }
  }
};

const REMEDIATION_PLAYBOOK_SCHEMA = {
  type: 'object',
  required: ['control_id', 'title', 'steps', 'estimated_effort_hours', 'evidence_artifacts'],
  properties: {
    control_id:             { type: 'string' },
    title:                  { type: 'string' },
    steps:                  { type: 'array' },
    estimated_effort_hours: { type: 'number' },
    required_skills:        { type: 'array' },
    evidence_artifacts:     { type: 'array' },
    common_pitfalls:        { type: 'array' }
  }
};

const TEST_PROCEDURE_SCHEMA = {
  type: 'object',
  required: ['control_id', 'objective', 'steps', 'expected_results'],
  properties: {
    control_id:       { type: 'string' },
    objective:        { type: 'string' },
    test_method:      { type: 'string', enum: ['examine', 'interview', 'test', 'automated', 'document_review'] },
    steps:            { type: 'array' },
    expected_results: { type: 'object' },
    sample_size:      { type: 'string' },
    frequency:        { type: 'string' },
    evidence_to_collect: { type: 'array' }
  }
};

const EVIDENCE_SUGGESTION_SCHEMA = {
  type: 'object',
  required: ['control_id', 'evidence_items'],
  properties: {
    control_id:    { type: 'string' },
    control_title: { type: 'string' },
    framework:     { type: 'string' },
    evidence_items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'description', 'collection_method'],
        properties: {
          title:                { type: 'string' },
          description:          { type: 'string' },
          collection_method:    { type: 'string' },
          format:               { type: 'string' },
          freshness_days:       { type: 'number' },
          automation_possible:  { type: 'boolean' },
          automation_hint:      { type: 'string' },
          example_filename:     { type: 'string' },
          sufficiency_criteria: { type: 'string' }
        }
      }
    },
    collection_notes:          { type: 'string' },
    estimated_collection_hours: { type: 'number' }
  }
};

const FINDING_SCHEMA = {
  type: 'object',
  required: ['title', 'severity', 'criteria', 'condition', 'cause', 'effect', 'recommendation'],
  properties: {
    title:                          { type: 'string' },
    severity:                       { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'informational'] },
    criteria:                       { type: 'string' },
    condition:                      { type: 'string' },
    cause:                          { type: 'string' },
    effect:                         { type: 'string' },
    recommendation:                 { type: 'string' },
    management_response_placeholder: { type: 'string' },
    related_controls:               { type: 'array', items: { type: 'string' } },
    evidence_of_exception:          { type: 'array', items: { type: 'string' } },
    repeat_finding:                 { type: 'boolean' },
    finding_id_hint:                { type: 'string' }
  }
};

// Map feature keys to their output schema. Keys match BOTH the route-level
// feature identifier used for usage logging AND the profile key, so the
// schema-validation-and-retry flow in aiHandler() correctly resolves a
// schema regardless of which key the caller passes.
const FEATURE_SCHEMAS = {
  gap_analysis:          GAP_ANALYSIS_SCHEMA,
  remediation_playbook:  REMEDIATION_PLAYBOOK_SCHEMA,
  test_procedures:       TEST_PROCEDURE_SCHEMA,
  evidence_suggestion:   EVIDENCE_SUGGESTION_SCHEMA,
  // Route feature id for the evidence endpoint (see routes/ai.js evidence-suggest)
  evidence_suggest:      EVIDENCE_SUGGESTION_SCHEMA,
  finding_analysis:      FINDING_SCHEMA,
  // Route feature id for the audit finding draft endpoint
  audit_finding_draft:   FINDING_SCHEMA,
  finding:               FINDING_SCHEMA
};

/**
 * Safely parse a JSON string that may be wrapped in markdown code fences.
 * Returns the parsed object, or null on failure.
 */
function parseJsonOutput(text) {
  if (!text || typeof text !== 'string') return null;

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // Attempt to extract the first JSON object from mixed prose+JSON output
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validate AI output for a given feature against its schema.
 * Returns { valid, parsed, errors }.
 *
 * @param {string} feature  - Feature key (from FEATURE_TASK_PROFILE)
 * @param {string|object} output - Raw AI output text or already-parsed object
 */
function validateFeatureOutput(feature, output) {
  const schema = FEATURE_SCHEMAS[feature];
  if (!schema) {
    // No schema for this feature — pass through without validation
    return { valid: true, parsed: typeof output === 'string' ? output : output, errors: [] };
  }

  const parsed = typeof output === 'object' ? output : parseJsonOutput(output);
  if (!parsed) {
    return { valid: false, parsed: null, errors: ['output is not valid JSON'] };
  }

  const result = validate(schema, parsed);
  return { ...result, parsed };
}

/**
 * Returns true when the given feature has a registered JSON schema.
 * Callers use this to decide whether to enable provider JSON mode
 * (OpenAI `response_format: json_object`, Gemini `response_mime_type`).
 */
function hasFeatureSchema(feature) {
  return !!(feature && FEATURE_SCHEMAS[feature]);
}

module.exports = {
  GAP_ANALYSIS_SCHEMA,
  REMEDIATION_PLAYBOOK_SCHEMA,
  TEST_PROCEDURE_SCHEMA,
  EVIDENCE_SUGGESTION_SCHEMA,
  FINDING_SCHEMA,
  FEATURE_SCHEMAS,
  validate,
  parseJsonOutput,
  validateFeatureOutput,
  hasFeatureSchema
};
