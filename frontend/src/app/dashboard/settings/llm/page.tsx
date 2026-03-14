'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { settingsAPI, aiAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderInfo {
  key: string;
  name: string;
  icon: string;
  models: string[];
  apiKeyField: string;
  isLocal?: boolean;
}

interface ProviderState {
  apiKey: string;
  ollamaUrl: string;
  showKey: boolean;
  saving: boolean;
  testing: boolean;
  removing: boolean;
  testResult: { success: boolean; latency?: number; message?: string } | null;
  error: string;
}

interface AIStatus {
  usage_count?: number;
  usage_limit?: number;
  tier?: string;
  active_providers?: string[];
  byok_unlimited?: boolean;
}

interface LLMConfig {
  anthropic_api_key?: string | null;
  openai_api_key?: string | null;
  gemini_api_key?: string | null;
  groq_api_key?: string | null;
  xai_api_key?: string | null;
  ollama_base_url?: string | null;
  default_provider?: string;
  default_model?: string;
  configured_providers?: string[];
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

const PROVIDERS: ProviderInfo[] = [
  {
    key: 'anthropic',
    name: 'Anthropic (Claude)',
    icon: '🧠',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    apiKeyField: 'anthropic_api_key',
  },
  {
    key: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    apiKeyField: 'openai_api_key',
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    icon: '💎',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    apiKeyField: 'gemini_api_key',
  },
  {
    key: 'groq',
    name: 'Groq',
    icon: '⚡',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    apiKeyField: 'groq_api_key',
  },
  {
    key: 'xai',
    name: 'Grok (xAI)',
    icon: '🚀',
    models: ['grok-3', 'grok-3-mini'],
    apiKeyField: 'xai_api_key',
  },
  {
    key: 'ollama',
    name: 'Ollama (Self-hosted)',
    icon: '🦙',
    models: ['llama3.2', 'mistral', 'codellama'],
    apiKeyField: 'ollama_base_url',
    isLocal: true,
  },
];

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return '•'.repeat(key.length - 4) + key.slice(-4);
}

function isProviderConfigured(provider: ProviderInfo, config: LLMConfig): boolean {
  if (provider.isLocal) {
    return !!config.ollama_base_url;
  }
  const val = config[provider.apiKeyField as keyof LLMConfig];
  return !!val;
}

function getMaskedValue(provider: ProviderInfo, config: LLMConfig): string {
  if (provider.isLocal) {
    return (config.ollama_base_url as string) ?? '';
  }
  return maskKey(config[provider.apiKeyField as keyof LLMConfig] as string);
}

function modelsForProvider(providerKey: string): string[] {
  return PROVIDERS.find((p) => p.key === providerKey)?.models ?? [];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LLMConfigurationPage() {
  const { user } = useAuth();

  // Global state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [config, setConfig] = useState<LLMConfig>({});
  const [aiStatus, setAIStatus] = useState<AIStatus>({});

  // Per-provider UI state
  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>(() => {
    const init: Record<string, ProviderState> = {};
    for (const p of PROVIDERS) {
      init[p.key] = {
        apiKey: '',
        ollamaUrl: DEFAULT_OLLAMA_URL,
        showKey: false,
        saving: false,
        testing: false,
        removing: false,
        testResult: null,
        error: '',
      };
    }
    return init;
  });

  // Default provider/model
  const [defaultProvider, setDefaultProvider] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [savingDefaults, setSavingDefaults] = useState(false);

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [llmRes, statusRes] = await Promise.all([
        settingsAPI.getLLMConfig().catch(() => ({ data: {} })),
        aiAPI.getStatus().catch(() => ({ data: {} })),
      ]);
      const llm: LLMConfig = llmRes.data ?? {};
      const status: AIStatus = statusRes.data ?? {};
      setConfig(llm);
      setAIStatus(status);
      setDefaultProvider(llm.default_provider ?? '');
      setDefaultModel(llm.default_model ?? '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load configuration';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------------------------
  // Provider helpers
  // ------------------------------------------------------------------

  const updateProviderState = (key: string, patch: Partial<ProviderState>) => {
    setProviderStates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSaveKey = async (provider: ProviderInfo) => {
    const ps = providerStates[provider.key];
    updateProviderState(provider.key, { saving: true, error: '', testResult: null });
    try {
      const payload: Record<string, unknown> = {};
      if (provider.isLocal) {
        payload.ollama_base_url = ps.ollamaUrl || DEFAULT_OLLAMA_URL;
      } else {
        payload[provider.apiKeyField] = ps.apiKey;
      }
      await settingsAPI.updateLLMConfig(payload as Parameters<typeof settingsAPI.updateLLMConfig>[0]);
      setToast(`${provider.name} key saved successfully`);
      updateProviderState(provider.key, { apiKey: '' });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save key';
      updateProviderState(provider.key, { error: msg });
    } finally {
      updateProviderState(provider.key, { saving: false });
    }
  };

  const handleTestKey = async (provider: ProviderInfo) => {
    const ps = providerStates[provider.key];
    updateProviderState(provider.key, { testing: true, error: '', testResult: null });
    try {
      const payload: { provider: string; apiKey: string } = {
        provider: provider.key,
        apiKey: provider.isLocal ? (ps.ollamaUrl || DEFAULT_OLLAMA_URL) : ps.apiKey,
      };
      const res = await settingsAPI.testLLMKey(payload);
      const data = res.data ?? {};
      updateProviderState(provider.key, {
        testResult: {
          success: data.success ?? true,
          latency: data.latency,
          message: data.message ?? 'Connection successful',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      updateProviderState(provider.key, {
        testResult: { success: false, message: msg },
      });
    } finally {
      updateProviderState(provider.key, { testing: false });
    }
  };

  const handleRemoveKey = async (provider: ProviderInfo) => {
    updateProviderState(provider.key, { removing: true, error: '', testResult: null });
    try {
      await settingsAPI.removeLLMKey(provider.key);
      setToast(`${provider.name} key removed`);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove key';
      updateProviderState(provider.key, { error: msg });
    } finally {
      updateProviderState(provider.key, { removing: false });
    }
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      await settingsAPI.updateLLMConfig({
        default_provider: defaultProvider || undefined,
        default_model: defaultModel || undefined,
      } as Parameters<typeof settingsAPI.updateLLMConfig>[0]);
      setToast('Default provider & model saved');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save defaults';
      setError(msg);
    } finally {
      setSavingDefaults(false);
    }
  };

  // When the default provider changes, reset the model to the first available
  const handleDefaultProviderChange = (pKey: string) => {
    setDefaultProvider(pKey);
    const models = modelsForProvider(pKey);
    setDefaultModel(models[0] ?? '');
  };

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  const usageCount = aiStatus.usage_count ?? 0;
  const usageLimit = aiStatus.usage_limit ?? 0;
  const usagePercent = usageLimit > 0 ? Math.min(100, Math.round((usageCount / usageLimit) * 100)) : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2E75B6]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">
            {toast}
          </div>
        )}

        {/* ---------------------------------------------------------- */}
        {/* Header */}
        {/* ---------------------------------------------------------- */}
        <div>
          <h1 className="text-2xl font-bold text-white">LLM Configuration</h1>
          <p className="text-gray-400 mt-1">
            Configure AI provider API keys for gap analysis, policy generation, and more.
          </p>

          {/* Quick status badges */}
          <div className="flex flex-wrap gap-3 mt-4">
            {aiStatus.active_providers && aiStatus.active_providers.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-green-900/40 text-green-300 border border-green-700 rounded-full px-3 py-1">
                ✅ {aiStatus.active_providers.length} active provider
                {aiStatus.active_providers.length !== 1 ? 's' : ''}
              </span>
            )}
            {usageLimit > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-[#1B2B3A] text-gray-300 border border-gray-700 rounded-full px-3 py-1">
                📊 {usageCount} / {usageLimit} requests this month
              </span>
            )}
            {user?.effectiveTier && (
              <span className="inline-flex items-center gap-1 text-xs bg-[#1B2B3A] text-gray-300 border border-gray-700 rounded-full px-3 py-1">
                🏷️ {user.effectiveTier} tier
              </span>
            )}
          </div>
        </div>

        {/* Global error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ---------------------------------------------------------- */}
        {/* Provider Cards */}
        {/* ---------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {PROVIDERS.map((provider) => {
            const ps = providerStates[provider.key];
            const configured = isProviderConfigured(provider, config);
            const masked = getMaskedValue(provider, config);

            return (
              <div
                key={provider.key}
                className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6 space-y-4"
              >
                {/* Card header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{provider.icon}</span>
                    <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      configured
                        ? 'bg-green-900/40 text-green-300 border border-green-700'
                        : 'bg-yellow-900/40 text-yellow-300 border border-yellow-700'
                    }`}
                  >
                    {configured ? '✅ Configured' : '⚠️ Not configured'}
                  </span>
                </div>

                {/* Models list */}
                <div className="flex flex-wrap gap-1.5">
                  {provider.models.map((m) => (
                    <span
                      key={m}
                      className="text-[11px] bg-[#0D1B2A] text-gray-400 rounded px-2 py-0.5"
                    >
                      {m}
                    </span>
                  ))}
                </div>

                {/* Existing key indicator */}
                {configured && !provider.isLocal && (
                  <p className="text-xs text-gray-500 font-mono">{masked}</p>
                )}
                {configured && provider.isLocal && (
                  <p className="text-xs text-gray-400 font-mono">{masked}</p>
                )}

                {/* Input */}
                <div className="relative">
                  {provider.isLocal ? (
                    <input
                      type="text"
                      placeholder={DEFAULT_OLLAMA_URL}
                      value={ps.ollamaUrl}
                      onChange={(e) => updateProviderState(provider.key, { ollamaUrl: e.target.value })}
                      className="w-full bg-[#0D1B2A] border border-gray-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type={ps.showKey ? 'text' : 'password'}
                        placeholder={configured ? 'Enter new key to replace' : 'Paste API key'}
                        value={ps.apiKey}
                        onChange={(e) => updateProviderState(provider.key, { apiKey: e.target.value })}
                        className="w-full bg-[#0D1B2A] border border-gray-600 text-white rounded-lg px-4 py-2 pr-10 text-sm focus:outline-none focus:border-[#2E75B6]"
                      />
                      <button
                        type="button"
                        onClick={() => updateProviderState(provider.key, { showKey: !ps.showKey })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm"
                        aria-label={ps.showKey ? 'Hide API key' : 'Show API key'}
                      >
                        {ps.showKey ? '🙈' : '👁️'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleTestKey(provider)}
                    disabled={ps.testing || (!provider.isLocal && !ps.apiKey && !configured)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-[#2E75B6] text-[#2E75B6] hover:bg-[#2E75B6]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {ps.testing ? 'Testing…' : 'Test Connection'}
                  </button>

                  <button
                    onClick={() => handleSaveKey(provider)}
                    disabled={ps.saving || (!provider.isLocal && !ps.apiKey)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-[#2E75B6] text-white hover:bg-[#2E75B6]/80 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {ps.saving ? 'Saving…' : 'Save'}
                  </button>

                  {configured && (
                    <button
                      onClick={() => handleRemoveKey(provider)}
                      disabled={ps.removing}
                      className="px-3 py-1.5 text-sm rounded-lg border border-red-600 text-red-400 hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {ps.removing ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>

                {/* Test result */}
                {ps.testResult && (
                  <div
                    className={`text-xs rounded-lg px-3 py-2 ${
                      ps.testResult.success
                        ? 'bg-green-900/20 border border-green-700 text-green-300'
                        : 'bg-red-900/20 border border-red-700 text-red-300'
                    }`}
                  >
                    {ps.testResult.success ? '✅' : '❌'} {ps.testResult.message}
                    {ps.testResult.latency != null && (
                      <span className="ml-2 text-gray-400">({ps.testResult.latency}ms)</span>
                    )}
                  </div>
                )}

                {/* Per-card error */}
                {ps.error && (
                  <p className="text-xs text-red-400">{ps.error}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* ---------------------------------------------------------- */}
        {/* Default Provider Section */}
        {/* ---------------------------------------------------------- */}
        <div className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Default Provider &amp; Model</h2>
          <p className="text-sm text-gray-400">
            Choose which provider and model to use by default for AI-powered features.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="default-provider" className="block text-sm text-gray-300 mb-1">
                Provider
              </label>
              <select
                id="default-provider"
                value={defaultProvider}
                onChange={(e) => handleDefaultProviderChange(e.target.value)}
                className="w-full bg-[#0D1B2A] border border-gray-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#2E75B6]"
              >
                <option value="">— Select provider —</option>
                {PROVIDERS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="default-model" className="block text-sm text-gray-300 mb-1">
                Model
              </label>
              <select
                id="default-model"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                disabled={!defaultProvider}
                className="w-full bg-[#0D1B2A] border border-gray-600 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#2E75B6] disabled:opacity-40"
              >
                <option value="">— Select model —</option>
                {modelsForProvider(defaultProvider).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleSaveDefaults}
            disabled={savingDefaults || !defaultProvider}
            className="px-4 py-2 text-sm rounded-lg bg-[#2E75B6] text-white hover:bg-[#2E75B6]/80 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingDefaults ? 'Saving…' : 'Save Defaults'}
          </button>
        </div>

        {/* ---------------------------------------------------------- */}
        {/* Usage Summary */}
        {/* ---------------------------------------------------------- */}
        <div className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Usage Summary</h2>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-300">Current month usage</span>
              <span className="text-gray-400">
                {usageCount} / {usageLimit > 0 ? usageLimit : '∞'} requests
              </span>
            </div>

            {usageLimit > 0 && (
              <div className="w-full bg-[#0D1B2A] rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-[#2E75B6]'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-4 text-xs text-gray-400 pt-1">
              {(user?.effectiveTier || aiStatus.tier) && (
                <span>
                  Tier: <strong className="text-gray-300">{user?.effectiveTier ?? aiStatus.tier}</strong>
                </span>
              )}
              {aiStatus.byok_unlimited && (
                <span className="text-green-400">🔓 BYOK — unlimited AI requests</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
