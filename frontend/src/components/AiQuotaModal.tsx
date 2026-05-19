'use client';

interface AiQuotaModalProps {
  open: boolean;
  onClose: () => void;
  used: number;
  limit: number;
  currentTier: string;
}

export default function AiQuotaModal({ open, onClose, used, limit, currentTier }: AiQuotaModalProps) {
  if (!open) return null;

  const tierLabel = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-quota-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h2 id="ai-quota-title" className="text-xl font-semibold text-gray-900 mb-1">
            AI usage limit reached
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Your <span className="font-medium">{tierLabel}</span> tier allows{' '}
            <span className="font-medium">{limit.toLocaleString()}</span> AI requests per month.
            You&apos;ve used <span className="font-medium">{used.toLocaleString()}</span>.
          </p>

          <div className="mb-5">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{used.toLocaleString()} used</span>
              <span>{limit.toLocaleString()} limit</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% of AI quota used`}
              className="h-2 bg-gray-200 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <a
              href="/dashboard/settings/llm"
              className="flex-1 text-center py-2 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              Add your own API key
            </a>
            <a
              href="https://controlweave.com/#pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              onClick={onClose}
            >
              Upgrade plan
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
