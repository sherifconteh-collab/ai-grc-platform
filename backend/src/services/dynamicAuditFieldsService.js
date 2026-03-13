// @tier: community
'use strict';

/**
 * Dynamic Audit Fields Service
 * 
 * Manages organization-specific custom audit fields:
 * - Field definitions and metadata
 * - User/org column visibility preferences
 * - AI-suggested fields from integration data
 */

const pool = require('../config/database');
// Optional LLM service: AI field suggestions disabled if unavailable
let llm;
try {
  llm = require('./llmService');
} catch (e) {
  llm = new Proxy({}, {
    get() { return async () => { throw new Error('AI service unavailable'); }; }
  });
}

// Configuration
const AI_RELEVANCE_THRESHOLD = 0.5; // Minimum confidence score for suggestions

/**
 * Get all custom field definitions for an organization
 */
async function getFieldDefinitions(organizationId, activeOnly = true) {
  const query = activeOnly
    ? `SELECT * FROM audit_field_definitions 
       WHERE organization_id = $1 AND is_active = true 
       ORDER BY display_name`
    : `SELECT * FROM audit_field_definitions 
       WHERE organization_id = $1 
       ORDER BY display_name`;
  
  const result = await pool.query(query, [organizationId]);
  return result.rows;
}

/**
 * Create a new custom field definition
 */
async function createFieldDefinition(params) {
  const {
    organizationId,
    fieldName,
    fieldType,
    displayName,
    description = null,
    sourceIntegration = null,
    isAiSuggested = false,
    aiConfidenceScore = null,
    suggestedByUserId = null
  } = params;

  const result = await pool.query(
    `INSERT INTO audit_field_definitions 
     (organization_id, field_name, field_type, display_name, description, 
      source_integration, is_active, is_ai_suggested, ai_confidence_score, suggested_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9)
     RETURNING *`,
    [organizationId, fieldName, fieldType, displayName, description, 
     sourceIntegration, isAiSuggested, aiConfidenceScore, suggestedByUserId]
  );

  return result.rows[0];
}

/**
 * Update a field definition
 */
async function updateFieldDefinition(id, organizationId, updates) {
  const {
    displayName,
    description,
    isActive,
    fieldType
  } = updates;

  const result = await pool.query(
    `UPDATE audit_field_definitions 
     SET display_name = COALESCE($3, display_name),
         description = COALESCE($4, description),
         is_active = COALESCE($5, is_active),
         field_type = COALESCE($6, field_type),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [id, organizationId, displayName, description, isActive, fieldType]
  );

  return result.rows[0];
}

/**
 * Delete a field definition (soft delete by setting is_active = false)
 */
async function deleteFieldDefinition(id, organizationId) {
  const result = await pool.query(
    `UPDATE audit_field_definitions 
     SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [id, organizationId]
  );

  return result.rowCount > 0;
}

/**
 * Get column preferences for a user or organization default
 */
async function getColumnPreferences(organizationId, userId = null) {
  // First try to get user-specific preferences
  if (userId) {
    const userPrefs = await pool.query(
      `SELECT * FROM audit_column_preferences 
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );
    
    if (userPrefs.rows.length > 0) {
      return userPrefs.rows[0];
    }
  }

  // Fall back to organization default
  const orgPrefs = await pool.query(
    `SELECT * FROM audit_column_preferences 
     WHERE organization_id = $1 AND is_org_default = true`,
    [organizationId]
  );

  if (orgPrefs.rows.length > 0) {
    return orgPrefs.rows[0];
  }

  // Return default columns if no preferences exist
  return {
    visible_columns: [
      'event_type', 'created_at', 'actor_name', 'outcome', 
      'resource_type', 'authentication_method', 'ip_address'
    ],
    column_order: [
      'event_type', 'created_at', 'actor_name', 'outcome', 
      'resource_type', 'authentication_method', 'ip_address'
    ]
  };
}

/**
 * Save column preferences for a user or as organization default
 */
async function saveColumnPreferences(params) {
  const {
    organizationId,
    userId = null,
    isOrgDefault = false,
    visibleColumns,
    columnOrder = null
  } = params;

  const result = await pool.query(
    `INSERT INTO audit_column_preferences 
     (organization_id, user_id, is_org_default, visible_columns, column_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, user_id) 
     DO UPDATE SET 
       visible_columns = EXCLUDED.visible_columns,
       column_order = EXCLUDED.column_order,
       is_org_default = EXCLUDED.is_org_default,
       updated_at = NOW()
     RETURNING *`,
    [organizationId, userId, isOrgDefault, JSON.stringify(visibleColumns), 
     JSON.stringify(columnOrder || visibleColumns)]
  );

  return result.rows[0];
}

/**
 * Store custom field value for an audit log entry
 */
async function storeCustomFieldValue(auditLogId, fieldDefinitionId, value) {
  const result = await pool.query(
    `INSERT INTO audit_log_custom_fields 
     (audit_log_id, field_definition_id, field_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (audit_log_id, field_definition_id)
     DO UPDATE SET field_value = EXCLUDED.field_value
     RETURNING *`,
    [auditLogId, fieldDefinitionId, JSON.stringify({ value })]
  );

  return result.rows[0];
}

/**
 * Get custom field values for audit log entries
 */
async function getCustomFieldValues(auditLogIds) {
  if (!auditLogIds || auditLogIds.length === 0) return {};

  const result = await pool.query(
    `SELECT 
       acf.audit_log_id,
       afd.field_name,
       afd.display_name,
       afd.field_type,
       acf.field_value
     FROM audit_log_custom_fields acf
     JOIN audit_field_definitions afd ON afd.id = acf.field_definition_id
     WHERE acf.audit_log_id = ANY($1) AND afd.is_active = true`,
    [auditLogIds]
  );

  // Group by audit log ID
  const grouped = {};
  result.rows.forEach(row => {
    if (!grouped[row.audit_log_id]) {
      grouped[row.audit_log_id] = {};
    }
    grouped[row.audit_log_id][row.field_name] = {
      value: row.field_value.value,
      display_name: row.display_name,
      field_type: row.field_type
    };
  });

  return grouped;
}

/**
 * Analyze integration data and suggest new fields using AI
 */
async function analyzeAndSuggestFields(organizationId, integrationData, sourceIntegration) {
  try {
    // Extract unique keys from integration data
    const allKeys = new Set();
    const keyOccurrences = {};
    const keySamples = {};

    // Analyze the data structure
    const dataArray = Array.isArray(integrationData) ? integrationData : [integrationData];
    
    dataArray.forEach(item => {
      const keys = extractAllKeys(item);
      keys.forEach(key => {
        allKeys.add(key);
        keyOccurrences[key] = (keyOccurrences[key] || 0) + 1;
        
        if (!keySamples[key]) {
          keySamples[key] = [];
        }
        const value = getValueAtPath(item, key);
        if (value !== undefined && keySamples[key].length < 5) {
          keySamples[key].push(value);
        }
      });
    });

    // Get existing field definitions to avoid duplicates
    const existingFields = await getFieldDefinitions(organizationId, false);
    const existingFieldNames = new Set(existingFields.map(f => f.field_name));

    // Filter out fields we already have
    const newKeys = Array.from(allKeys).filter(key => !existingFieldNames.has(key));

    if (newKeys.length === 0) {
      return [];
    }

    // Use AI to analyze and suggest relevant fields
    const aiPrompt = `Analyze the following fields from a ${sourceIntegration} integration and suggest which ones would be valuable to track in audit logs.

Available fields:
${newKeys.map(key => {
  const samples = keySamples[key] || [];
  const occurrences = keyOccurrences[key] || 0;
  return `- ${key}: Appears ${occurrences} times, Sample values: ${JSON.stringify(samples.slice(0, 3))}`;
}).join('\n')}

For each field, provide:
1. Whether it should be tracked (relevance score 0-1)
2. A user-friendly display name
3. A brief description of what it represents
4. The appropriate data type (text, number, boolean, datetime, json)

Focus on fields that provide security, compliance, or operational value for audit logging.

Respond in JSON format:
{
  "suggestions": [
    {
      "field_name": "original_field_name",
      "display_name": "User Friendly Name",
      "description": "What this field represents",
      "field_type": "text|number|boolean|datetime|json",
      "relevance_score": 0.95,
      "reasoning": "Why this field is valuable"
    }
  ]
}`;

    let aiResponse;
    try {
      aiResponse = await llm.complete(aiPrompt, {
        temperature: 0.3,
        maxTokens: 2000
      });
    } catch (err) {
      console.error('AI service error during field analysis:', err);
      throw new Error('AI service unavailable. Please try again later.');
    }

    // Parse AI response with improved JSON extraction
    let aiAnalysis;
    try {
      // Try to find JSON between first { and last }
      const firstBrace = aiResponse.indexOf('{');
      const lastBrace = aiResponse.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = aiResponse.substring(firstBrace, lastBrace + 1);
        aiAnalysis = JSON.parse(jsonStr);
      } else {
        console.error('Could not find JSON structure in AI response');
        return [];
      }
    } catch (err) {
      console.error('Error parsing AI response:', err, 'Response:', aiResponse.substring(0, 200));
      throw new Error('Invalid AI response format. The AI service may be experiencing issues.');
    }

    // Store suggestions in database
    const suggestions = [];
    for (const suggestion of aiAnalysis.suggestions || []) {
      if (suggestion.relevance_score >= AI_RELEVANCE_THRESHOLD) {
        const result = await pool.query(
          `INSERT INTO audit_field_suggestions 
           (organization_id, suggested_field_name, suggested_field_type, display_name, 
            description, source_integration, sample_values, occurrence_count, confidence_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (organization_id, suggested_field_name) 
           DO UPDATE SET 
             occurrence_count = audit_field_suggestions.occurrence_count + 1,
             sample_values = EXCLUDED.sample_values,
             updated_at = NOW()
           RETURNING *`,
          [
            organizationId,
            suggestion.field_name,
            suggestion.field_type,
            suggestion.display_name,
            suggestion.description,
            sourceIntegration,
            JSON.stringify(keySamples[suggestion.field_name] || []),
            keyOccurrences[suggestion.field_name] || 1,
            suggestion.relevance_score
          ]
        );
        
        suggestions.push({
          ...result.rows[0],
          reasoning: suggestion.reasoning
        });
      }
    }

    return suggestions;
  } catch (error) {
    console.error('Error analyzing integration data:', error);
    return [];
  }
}

/**
 * Helper: Extract all keys from nested object
 */
function extractAllKeys(obj, prefix = '') {
  const keys = [];
  
  if (obj === null || obj === undefined) {
    return keys;
  }

  if (typeof obj !== 'object') {
    return keys;
  }

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      keys.push(...extractAllKeys(obj[key], fullKey));
    }
  }

  return keys;
}

/**
 * Helper: Get value at path in nested object
 */
function getValueAtPath(obj, path) {
  const parts = path.split('.');
  let value = obj;
  
  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[part];
  }
  
  return value;
}

/**
 * Get pending field suggestions for an organization
 */
async function getPendingFieldSuggestions(organizationId) {
  const result = await pool.query(
    `SELECT * FROM audit_field_suggestions 
     WHERE organization_id = $1 AND status = 'pending'
     ORDER BY confidence_score DESC, occurrence_count DESC`,
    [organizationId]
  );

  return result.rows;
}

/**
 * Accept a field suggestion and create field definition
 */
async function acceptFieldSuggestion(suggestionId, organizationId, userId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get the suggestion
    const suggestion = await client.query(
      `SELECT * FROM audit_field_suggestions WHERE id = $1 AND organization_id = $2`,
      [suggestionId, organizationId]
    );

    if (suggestion.rows.length === 0) {
      throw new Error('Suggestion not found');
    }

    const sugg = suggestion.rows[0];

    // Create field definition
    await client.query(
      `INSERT INTO audit_field_definitions 
       (organization_id, field_name, field_type, display_name, description, 
        source_integration, is_ai_suggested, ai_confidence_score, suggested_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)`,
      [
        organizationId,
        sugg.suggested_field_name,
        sugg.suggested_field_type,
        sugg.display_name,
        sugg.description,
        sugg.source_integration,
        sugg.confidence_score,
        userId
      ]
    );

    // Update suggestion status
    await client.query(
      `UPDATE audit_field_suggestions 
       SET status = 'accepted', reviewed_by_user_id = $2, reviewed_at = NOW()
       WHERE id = $1`,
      [suggestionId, userId]
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reject a field suggestion
 */
async function rejectFieldSuggestion(suggestionId, organizationId, userId) {
  const result = await pool.query(
    `UPDATE audit_field_suggestions 
     SET status = 'rejected', reviewed_by_user_id = $2, reviewed_at = NOW()
     WHERE id = $1 AND organization_id = $3
     RETURNING id`,
    [suggestionId, userId, organizationId]
  );

  return result.rowCount > 0;
}

module.exports = {
  getFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  getColumnPreferences,
  saveColumnPreferences,
  storeCustomFieldValue,
  getCustomFieldValues,
  analyzeAndSuggestFields,
  getPendingFieldSuggestions,
  acceptFieldSuggestion,
  rejectFieldSuggestion
};
