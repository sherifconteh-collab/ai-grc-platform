'use client';

interface AiProviderSetupModalProps {
  open: boolean;
  onClose: () => void;
}

const FREE_PROVIDERS = [
  {
    name: 'Google Gemini',
    description: 'Free tier available — no credit card required',
    href: 'https://aistudio.google.com/app/apikey',
    label: 'Get Gemini API key →',
  },
  {
    name: 'Groq',
    description: 'Fast inference, generous free quota',
    href: 'https://console.groq.com/keys',
    label: 'Get Groq API key →',
  },
  {
    name: 'Ollama',
    description: 'Self-hosted, fully private, no API key needed',
    href: 'https://ollama.com/',
    label: 'Get Ollama →',
  },
];

export default function AiProviderSetupModal({ open, onClose }: AiProviderSetupModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-setup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6">
          <h2 id="ai-setup-title" className="text-xl font-semibold text-gray-900 mb-1">
            Set up an AI provider to get started
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            ControlWeave uses your own API key — your data never passes through our servers.
            Several providers offer free tiers to get started immediately.
          </p>

          <ul className="space-y-3 mb-6">
            {FREE_PROVIDERS.map((p) => (
              <li key={p.name} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                  </div>
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-medium text-purple-600 hover:text-purple-800 whitespace-nowrap"
                  >
                    {p.label}
                  </a>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex gap-3">
            <a
              href="/dashboard/settings/llm"
              className="flex-1 text-center py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              onClick={onClose}
            >
              Go to Settings → LLM Configuration
            </a>
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
