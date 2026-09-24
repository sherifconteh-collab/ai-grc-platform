// @tier: pro
'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { settingsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface LLMConfig {
  default_provider: string | null;
  default_model: string | null;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_gemini_key: boolean;
  has_xai_key: boolean;
  has_groq_key: boolean;
}

interface ProviderConfig {
  id: string;
  name: string;
  settingKey: string;
  hasKey: boolean;
  models: string[];
  placeholder: string;
  docsUrl: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'claude',
    name: 'Anthropic (Claude)',
    settingKey: 'anthropic_api_key',
    hasKey: false,
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-fable-5'],
    placeholder: 'sk-ant-api03-…',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    settingKey: 'openai_api_key',
    hasKey: false,
    models: ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.3-codex'],
    placeholder: 'sk-proj-…',
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    settingKey: 'gemini_api_key',
    hasKey: false,
    models: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'],
    placeholder: 'AIza…',
    docsUrl: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'grok',
    name: 'xAI (Grok)',
    settingKey: 'xai_api_key',
    hasKey: false,
    models: ['grok-4.5', 'grok-4.3', 'grok-4.1-fast'],
    placeholder: 'xai-…',
    docsUrl: 'https://console.x.ai/'
  }
];

function KeyStatus({ hasKey }: { hasKey: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
      hasKey ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-green-500' : 'bg-gray-400'}`} />
      {hasKey ? 'Key configured' : 'No key'}
    </span>
  );
}

export default function AIKeysPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'settings.manage');

  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Per-provider key input state
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [removingProvider, setRemovingProvider] = useState<string | null>(null);

  // Default model/provider selection
  const [defaultProvider, setDefaultProvider] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [savingDefaults, setSavingDefaults] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await settingsAPI.getLLMConfig();
      const data: LLMConfig = res.data?.data || res.data || {};
      setConfig(data);
      setDefaultProvider(data.default_provider || '');
      setDefaultModel(data.default_model || '');
    } catch {
      setError('Failed to load LLM configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const getHasKey = (providerId: string) => {
    if (!config) return false;
    const map: Record<string, boolean> = {
      claude: config.has_anthropic_key,
      openai: config.has_openai_key,
      gemini: config.has_gemini_key,
      grok: config.has_xai_key
    };
    return map[providerId] || false;
  };

  const handleSaveKey = async (provider: ProviderConfig) => {
    const key = keyInputs[provider.id];
    if (!key?.trim()) { setError('Please enter an API key.'); return; }
    setSavingProvider(provider.id);
    setError(null);
    try {
      await settingsAPI.updateLLMConfig({ [provider.settingKey]: key.trim() });
      setKeyInputs(prev => ({ ...prev, [provider.id]: '' }));
      setSuccess(`${provider.name} API key saved successfully.`);
      await loadConfig();
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError(`Failed to save ${provider.name} API key.`);
    } finally {
      setSavingProvider(null);
    }
  };

  const handleRemoveKey = async (provider: ProviderConfig) => {
    if (!confirm(`Remove ${provider.name} API key?`)) return;
    setRemovingProvider(provider.id);
    setError(null);
    try {
      await settingsAPI.removeLLMKey(provider.id);
      setSuccess(`${provider.name} API key removed.`);
      await loadConfig();
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError(`Failed to remove ${provider.name} API key.`);
    } finally {
      setRemovingProvider(null);
    }
  };

  const handleTestKey = async (provider: ProviderConfig) => {
    const key = keyInputs[provider.id];
    if (!key?.trim() && !getHasKey(provider.id)) {
      setError('Enter a key to test, or save one first.');
      return;
    }
    setTestingProvider(provider.id);
    setError(null);
    try {
      await settingsAPI.testLLMKey({ provider: provider.id, apiKey: key?.trim() || '' });
      setSuccess(`${provider.name} connection test passed.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || `${provider.name} connection test failed.`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setError(null);
    try {
      await settingsAPI.updateLLMConfig({
        default_provider: defaultProvider || undefined,
        default_model: defaultModel || undefined
      });
      setSuccess('Default provider and model saved.');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to save defaults.');
    } finally {
      setSavingDefaults(false);
    }
  };

  const selectedProviderModels =
    PROVIDERS.find(p => p.id === defaultProvider)?.models || [];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">AI Keys & LLM Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your Bring-Your-Own-Key (BYOK) API keys for AI providers.
            Keys are encrypted at rest and never exposed after saving.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {success}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-5">
            {PROVIDERS.map(provider => {
              const hasKey = getHasKey(provider.id);
              return (
                <div key={provider.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">{provider.name}</span>
                      <KeyStatus hasKey={hasKey} />
                    </div>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Get API key →
                    </a>
                  </div>

                  {canManage && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showKey[provider.id] ? 'text' : 'password'}
                            value={keyInputs[provider.id] || ''}
                            onChange={e => setKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                            placeholder={hasKey ? '••••••••••••••••' : provider.placeholder}
                            className="w-full border border-gray-200 rounded px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                          >
                            {showKey[provider.id] ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <button
                          onClick={() => handleSaveKey(provider)}
                          disabled={savingProvider === provider.id || !keyInputs[provider.id]?.trim()}
                          className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {savingProvider === provider.id ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTestKey(provider)}
                          disabled={testingProvider === provider.id}
                          className="px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50 transition-colors"
                        >
                          {testingProvider === provider.id ? 'Testing…' : 'Test Connection'}
                        </button>
                        {hasKey && (
                          <button
                            onClick={() => handleRemoveKey(provider)}
                            disabled={removingProvider === provider.id}
                            className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {removingProvider === provider.id ? '…' : 'Remove Key'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Default provider & model */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Default Provider & Model</h3>
              <p className="text-sm text-gray-500 mb-4">
                Set the default provider for AI features. Individual features automatically select
                the best model tier (reasoning vs. extraction) for their task type.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Default Provider</label>
                  <select
                    value={defaultProvider}
                    onChange={e => { setDefaultProvider(e.target.value); setDefaultModel(''); }}
                    disabled={!canManage}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    <option value="">Platform default</option>
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Default Model Override</label>
                  <select
                    value={defaultModel}
                    onChange={e => setDefaultModel(e.target.value)}
                    disabled={!canManage || !defaultProvider}
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  >
                    <option value="">Auto (task-based tiering)</option>
                    {selectedProviderModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              {canManage && (
                <div className="mt-4">
                  <button
                    onClick={handleSaveDefaults}
                    disabled={savingDefaults}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingDefaults ? 'Saving…' : 'Save Defaults'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
