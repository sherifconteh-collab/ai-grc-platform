'use client';

import { useRouter } from 'next/navigation';

interface AiProviderSetupModalProps {
  open: boolean;
  onClose: () => void;
}

const FREE_PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Free tier',
    description: 'Gemini 3.1 Pro & Flash — free API key at aistudio.google.com',
    signupUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'groq',
    name: 'Groq',
    badge: 'Free tier',
    description: 'GPT-OSS, Llama 4, Groq Compound — free API key at console.groq.com',
    signupUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    badge: 'Self-hosted',
    description: 'Run Llama, Mistral, Qwen locally — no API key needed',
    signupUrl: 'https://ollama.com/download',
  },
];

const PAID_PROVIDERS = [
  { id: 'claude', name: 'Anthropic Claude', description: 'claude-opus-4-8, claude-sonnet-5', signupUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', description: 'gpt-5.5, gpt-5.4-mini, gpt-5.3-codex', signupUrl: 'https://platform.openai.com/api-keys' },
  { id: 'grok', name: 'xAI Grok', description: 'grok-4.5, grok-4.1-fast', signupUrl: 'https://console.x.ai/' },
];

export default function AiProviderSetupModal({ open, onClose }: AiProviderSetupModalProps) {
  const router = useRouter();

  if (!open) return null;

  function handleGoToSettings() {
    onClose();
    router.push('/dashboard/settings/ai-keys');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Choose your AI Provider</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Add your own API key to enable AI features. Free options are available.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4"
          >
            &times;
          </button>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">Free to use</p>
          <div className="space-y-2">
            {FREE_PROVIDERS.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-green-200 bg-green-50 rounded-lg px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">{p.badge}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                </div>
                <a
                  href={p.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 ml-4 text-xs font-medium text-green-700 hover:text-green-900 underline"
                >
                  Get key
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Paid providers</p>
          <div className="space-y-2">
            {PAID_PROVIDERS.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-gray-900">{p.name}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                </div>
                <a
                  href={p.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 ml-4 text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                >
                  Get key
                </a>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleGoToSettings}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          Add API key in Settings
        </button>
      </div>
    </div>
  );
}
