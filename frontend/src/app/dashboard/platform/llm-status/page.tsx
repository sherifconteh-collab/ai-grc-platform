'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { platformAdminAPI, aiAPI } from '@/lib/api';

interface ProviderInfo {
  key: string;
  name: string;
  icon: string;
  models: string[];
  apiKeyField: string;
  isLocal?: boolean;
}

interface ProviderStatus {
  available: boolean;
  keyConfigured: boolean;
  models?: string[];
  latency?: number;
}

interface LlmDefaults {
  default_provider?: string;
  default_model?: string;
  anthropic_api_key?: string;
  openai_api_key?: string;
  gemini_api_key?: string;
  xai_api_key?: string;
  groq_api_key?: string;
  ollama_base_url?: string;
  configured_providers?: string[];
}

interface UsageSummary {
  total_requests?: number;
  per_provider?: Record<string, number>;
  period?: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

const PROVIDERS: ProviderInfo[] = [
  {
    key: 'anthropic',
    name: 'Anthropic (Claude)',
    icon: '🧠',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    apiKeyField: 'anthropic_api_key',
  },
  {
    key: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview'],
    apiKeyField: 'openai_api_key',
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    icon: '💎',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
    apiKeyField: 'gemini_api_key',
  },
  {
    key: 'groq',
    name: 'Groq',
    icon: '⚡',
    models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    apiKeyField: 'groq_api_key',
  },
  {
    key: 'xai',
    name: 'Grok (xAI)',
    icon: '🚀',
    models: ['grok-2', 'grok-2-mini'],
    apiKeyField: 'xai_api_key',
  },
  {
    key: 'ollama',
    name: 'Ollama (Local)',
    icon: '🦙',
    models: ['llama3.2', 'mistral', 'codellama'],
    apiKeyField: 'ollama_base_url',
    isLocal: true,
  },
];

function maskKey(key: string | undefined | null): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return '••••••' + key.slice(-4);
}

export default function LLMStatusPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({});
  const [defaults, setDefaults] = useState<LlmDefaults>({});
  const [usage, setUsage] = useState<UsageSummary>({});

  // API key form state
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingKeys, setSavingKeys] = useState(false);

  // Default provider/model form state
  const [defaultProvider, setDefaultProvider] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [savingDefaults, setSavingDefaults] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [statusRes, defaultsRes, aiStatusRes] = await Promise.all([
        platformAdminAPI.getLlmStatus().catch(() => ({ data: {} })),
        platformAdminAPI.getLlmDefaults().catch(() => ({ data: {} })),
        aiAPI.getStatus().catch(() => ({ data: {} })),
      ]);

      const statusData = statusRes.data || {};
      const defaultsData = defaultsRes.data || {};
      const aiData = aiStatusRes.data || {};

      // Build provider statuses from response
      const statuses: Record<string, ProviderStatus> = {};
      for (const p of PROVIDERS) {
        const providerData = statusData.providers?.[p.key] || statusData[p.key] || {};
        statuses[p.key] = {
          available: providerData.available ?? providerData.status === 'available' ?? false,
          keyConfigured: providerData.key_configured ?? providerData.keyConfigured ??
            (defaultsData.configured_providers || []).includes(p.key) ?? false,
          models: providerData.models || p.models,
          latency: providerData.latency,
        };
      }
      setProviderStatuses(statuses);

      setDefaults(defaultsData);
      setDefaultProvider(defaultsData.default_provider || '');
      setDefaultModel(defaultsData.default_model || '');

      setUsage({
        total_requests: aiData.usage_count ?? aiData.total_requests ?? 0,
        per_provider: aiData.per_provider || statusData.usage_by_provider || {},
        period: aiData.period || 'Current Month',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load LLM status';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isPlatformAdmin) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user, loadData]);

  const handleSaveKeys = async () => {
    setSavingKeys(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const p of PROVIDERS) {
        if (keyInputs[p.key] !== undefined && keyInputs[p.key] !== '') {
          payload[p.apiKeyField] = keyInputs[p.key];
        }
      }

      if (Object.keys(payload).length === 0) {
        showToast('No keys to save. Enter at least one API key.', 'error');
        setSavingKeys(false);
        return;
      }

      await platformAdminAPI.updateLlmDefaults(payload as Parameters<typeof platformAdminAPI.updateLlmDefaults>[0]);
      setKeyInputs({});
      showToast('Platform API keys saved successfully.', 'success');
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save API keys';
      showToast(message, 'error');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    try {
      await platformAdminAPI.updateLlmDefaults({
        default_provider: defaultProvider || undefined,
        default_model: defaultModel || undefined,
      });
      showToast('Default provider and model saved.', 'success');
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save defaults';
      showToast(message, 'error');
    } finally {
      setSavingDefaults(false);
    }
  };

  const selectedProviderModels =
    PROVIDERS.find((p) => p.key === defaultProvider)?.models || [];

  // Access denied guard
  if (!user?.isPlatformAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="bg-[#1B2B3A] rounded-lg border border-red-700 p-8 text-center max-w-md">
            <div className="text-4xl mb-4">🚫</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">Access Denied</h2>
            <p className="text-gray-400">
              This page is restricted to platform administrators.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
              toast.type === 'success'
                ? 'bg-green-600'
                : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">
            LLM Status &amp; Platform Defaults
          </h1>
          <p className="text-gray-400 mt-1">
            Monitor AI provider availability and configure platform-wide LLM defaults.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2E75B6]" />
            <span className="ml-3 text-gray-400">Loading LLM status…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
            <span className="font-medium">Error:</span> {error}
            <button
              onClick={loadData}
              className="ml-4 underline hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Provider Status Overview */}
            <div>
              <h2 className="text-xl font-semibold text-white mb-4">
                Provider Status Overview
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PROVIDERS.map((provider) => {
                  const status = providerStatuses[provider.key] || {
                    available: false,
                    keyConfigured: false,
                  };
                  return (
                    <div
                      key={provider.key}
                      className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{provider.icon}</span>
                          <h3 className="text-white font-semibold">
                            {provider.name}
                          </h3>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                            status.available
                              ? 'bg-green-900/40 text-green-300 border border-green-700'
                              : 'bg-red-900/40 text-red-300 border border-red-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              status.available ? 'bg-green-400' : 'bg-red-400'
                            }`}
                          />
                          {status.available ? 'Available' : 'Unavailable'}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Platform Key</span>
                          <span
                            className={
                              status.keyConfigured
                                ? 'text-green-400'
                                : 'text-yellow-400'
                            }
                          >
                            {status.keyConfigured ? '✅ Configured' : '⚠️ Not Set'}
                          </span>
                        </div>

                        <div>
                          <span className="text-gray-400">Models:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(status.models || provider.models).map(
                              (model) => (
                                <span
                                  key={model}
                                  className="bg-[#0D1B2A] text-gray-300 text-xs px-2 py-0.5 rounded"
                                >
                                  {model}
                                </span>
                              )
                            )}
                          </div>
                        </div>

                        {status.latency != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Latency</span>
                            <span className="text-gray-300">
                              {status.latency}ms
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Platform Default API Keys */}
            <div className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-1">
                Platform Default API Keys
              </h2>
              <p className="text-gray-400 text-sm mb-5">
                Platform keys are shared across all organizations as a fallback
                when they don&apos;t have their own BYOK keys configured.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {PROVIDERS.map((provider) => {
                  const existing = defaults[provider.apiKeyField as keyof LlmDefaults] as
                    | string
                    | undefined;
                  const inputVal = keyInputs[provider.key] ?? '';

                  return (
                    <div
                      key={provider.key}
                      className="bg-[#0D1B2A] rounded-lg border border-gray-700 p-4"
                    >
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                        <span>{provider.icon}</span>
                        {provider.name}{' '}
                        {provider.isLocal ? '(Base URL)' : '(API Key)'}
                      </label>

                      {existing && (
                        <p className="text-xs text-gray-500 mb-1">
                          Current: {maskKey(existing)}
                        </p>
                      )}

                      <div className="relative">
                        <input
                          type={
                            provider.isLocal || showKeys[provider.key]
                              ? 'text'
                              : 'password'
                          }
                          value={inputVal}
                          onChange={(e) =>
                            setKeyInputs((prev) => ({
                              ...prev,
                              [provider.key]: e.target.value,
                            }))
                          }
                          placeholder={
                            provider.isLocal
                              ? 'http://localhost:11434'
                              : `Enter ${provider.name} API key`
                          }
                          className="w-full bg-[#1B2B3A] border border-gray-600 rounded px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#2E75B6] pr-10"
                        />
                        {!provider.isLocal && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowKeys((prev) => ({
                                ...prev,
                                [provider.key]: !prev[provider.key],
                              }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
                            aria-label={
                              showKeys[provider.key]
                                ? 'Hide key'
                                : 'Show key'
                            }
                          >
                            {showKeys[provider.key] ? '🙈' : '👁️'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleSaveKeys}
                  disabled={savingKeys}
                  className="bg-[#2E75B6] hover:bg-[#25628f] disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {savingKeys ? 'Saving…' : 'Save Platform Keys'}
                </button>
              </div>
            </div>

            {/* Default Provider / Model */}
            <div className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-1">
                Default Provider &amp; Model
              </h2>
              <p className="text-gray-400 text-sm mb-5">
                Set the platform-wide default AI provider and model used when no
                organization override is configured.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Default Provider
                  </label>
                  <select
                    value={defaultProvider}
                    onChange={(e) => {
                      setDefaultProvider(e.target.value);
                      setDefaultModel('');
                    }}
                    className="w-full bg-[#0D1B2A] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#2E75B6]"
                  >
                    <option value="">Select provider…</option>
                    {PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.icon} {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Default Model
                  </label>
                  <select
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    disabled={!defaultProvider}
                    className="w-full bg-[#0D1B2A] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#2E75B6] disabled:opacity-50"
                  >
                    <option value="">
                      {defaultProvider
                        ? 'Select model…'
                        : 'Select a provider first'}
                    </option>
                    {selectedProviderModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleSaveDefaults}
                  disabled={savingDefaults || !defaultProvider}
                  className="bg-[#2E75B6] hover:bg-[#25628f] disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {savingDefaults ? 'Saving…' : 'Save Defaults'}
                </button>
              </div>
            </div>

            {/* Platform Usage Summary */}
            <div className="bg-[#1B2B3A] rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-white mb-1">
                Platform Usage Summary
              </h2>
              <p className="text-gray-400 text-sm mb-5">
                Total AI requests across all organizations — {usage.period || 'Current Month'}.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0D1B2A] rounded-lg border border-gray-700 p-5">
                  <p className="text-gray-400 text-sm mb-1">
                    Total Requests This Month
                  </p>
                  <p className="text-3xl font-bold text-white">
                    {(usage.total_requests ?? 0).toLocaleString()}
                  </p>
                </div>

                <div className="bg-[#0D1B2A] rounded-lg border border-gray-700 p-5">
                  <p className="text-gray-400 text-sm mb-3">
                    Per-Provider Breakdown
                  </p>
                  {usage.per_provider &&
                  Object.keys(usage.per_provider).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(usage.per_provider).map(
                        ([providerKey, count]) => {
                          const info = PROVIDERS.find(
                            (p) => p.key === providerKey
                          );
                          return (
                            <div
                              key={providerKey}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-gray-300">
                                {info?.icon || '🔹'}{' '}
                                {info?.name || providerKey}
                              </span>
                              <span className="text-white font-medium">
                                {(count as number).toLocaleString()}
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      No per-provider data available yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
