/**
 * Provider + task-profile configuration for the LLM service.
 *
 * Extracted from services/llmService.js as part of monolith split (4.1).
 * The logic here is identical to the original inline definitions; only the
 * location has changed. llmService.js re-exports these symbols on its public
 * module so no downstream require path changes.
 */

'use strict';

const PROVIDERS = {
  claude:  { name: 'Claude (Anthropic)',  models: [
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-haiku-4-5-20251001',
    'claude-fable-5'
  ] },
  openai:  { name: 'OpenAI',              models: [
    'gpt-5.5',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.3-codex'
  ] },
  gemini:  { name: 'Google Gemini',       models: [
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite'
  ] },
  grok:    { name: 'xAI Grok',            models: ['grok-4.5', 'grok-4.3', 'grok-4.1-fast'] },
  groq:    { name: 'Groq (Free Tier)',    models: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'groq/compound',
    'groq/compound-mini',
    'meta-llama/llama-4-scout-17b-16e-instruct'
  ] },
  ollama:  { name: 'Ollama (Local)',      models: [
    'llama3.2',
    'llama3.2:3b-q4_K_M',
    'llama3.1:8b-q4_K_M',
    'llama3.1:8b-q5_K_M',
    'llama3.1:70b-q4_K_M',
    'mistral',
    'mistral:7b-q4_K_M',
    'qwen2.5:7b-q4_K_M',
    'qwen2.5:14b-q4_K_M',
    'phi3:mini-q4_K_M',
    'gemma2:9b-q4_K_M'
  ] }
};

// ---------- Task profile model tiering ----------
// Maps task complexity categories to preferred models per provider.
// 'reasoning' tasks (gap analysis, remediation, finding analysis, copilot) use
// stronger models; 'extraction' tasks (evidence suggestion, test procedures,
// control mapping) use lighter models. 'chat' (copilot) uses Sonnet-class.
// Temperature semantics: structured/extraction 0.2, analytical 0.4, ideation 0.7.
const TASK_PROFILES = {
  reasoning: {
    temperature: 0.4,
    models: {
      claude: 'claude-sonnet-5',
      openai: 'gpt-5.5',
      gemini: 'gemini-3.1-pro-preview',
      grok:   'grok-4.5',
      groq:   'openai/gpt-oss-120b',
      ollama: null
    }
  },
  extraction: {
    temperature: 0.2,
    models: {
      claude: 'claude-haiku-4-5-20251001',
      openai: 'gpt-5.4-mini',
      gemini: 'gemini-3.5-flash',
      grok:   'grok-4.1-fast',
      groq:   'openai/gpt-oss-20b',
      ollama: null
    }
  },
  chat: {
    temperature: 0.4,
    models: {
      claude: 'claude-sonnet-5',
      openai: 'gpt-5.5',
      gemini: 'gemini-3.1-pro-preview',
      grok:   'grok-4.5',
      groq:   'openai/gpt-oss-120b',
      ollama: null
    }
  },
  ideation: {
    temperature: 0.7,
    models: {
      claude: 'claude-sonnet-5',
      openai: 'gpt-5.5',
      gemini: 'gemini-3.1-pro-preview',
      grok:   'grok-4.5',
      groq:   'openai/gpt-oss-120b',
      ollama: null
    }
  }
};

// Which features map to which task profile
const FEATURE_TASK_PROFILE = {
  gap_analysis:             'reasoning',
  remediation_playbook:     'reasoning',
  finding_analysis:         'reasoning',
  compliance_forecast:      'reasoning',
  audit_readiness:          'reasoning',
  crosswalk_optimizer:      'reasoning',
  regulatory_monitor:       'reasoning',
  vendor_risk:              'reasoning',
  incident_response:        'reasoning',
  executive_report:         'ideation',
  policy_generator:         'ideation',
  evidence_suggestion:      'extraction',
  test_procedures:          'extraction',
  asset_control_mapping:    'extraction',
  control_analysis:         'extraction',
  training_recommendations: 'extraction',
  shadow_it:                'extraction',
  risk_heatmap:             'reasoning',
  asset_risk:               'extraction',
  chat:                     'chat',
  security_posture:         'reasoning',
  ai_governance:            'reasoning',
  compliance_query:         'chat',
  iavm_asset_alert:         'extraction'
};

/**
 * Resolve the model and temperature for a given feature/task, respecting:
 * 1. Explicit caller override (model argument)
 * 2. Per-org model setting from DB (BYOK / enterprise override)
 * 3. Task profile default for the provider
 *
 * @param {string} provider     - Provider key (claude, openai, etc.)
 * @param {string} feature      - Feature key from FEATURE_TASK_PROFILE
 * @param {string|null} callerModel - Explicit model override from the route
 * @param {string|null} orgModel    - Org-level default model from DB
 * @returns {{ model: string|null, temperature: number }}
 */
function resolveTaskModel(provider, feature, callerModel = null, orgModel = null) {
  const profileKey = FEATURE_TASK_PROFILE[feature] || 'reasoning';
  const profile = TASK_PROFILES[profileKey] || TASK_PROFILES.reasoning;

  // Always use the feature's task-profile temperature regardless of model override —
  // a custom model still benefits from the right temperature for the task type.
  if (callerModel) return { model: callerModel, temperature: profile.temperature };
  if (orgModel) return { model: orgModel, temperature: profile.temperature };

  return {
    model: profile.models[provider] || null,
    temperature: profile.temperature
  };
}

module.exports = {
  PROVIDERS,
  TASK_PROFILES,
  FEATURE_TASK_PROFILE,
  resolveTaskModel,
};
