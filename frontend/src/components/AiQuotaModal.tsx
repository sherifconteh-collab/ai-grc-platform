'use client';

import { useRouter } from 'next/navigation';

interface AiQuotaModalProps {
  open: boolean;
  onClose: () => void;
  used: number;
  limit: number;
  currentTier: string;
}

export default function AiQuotaModal({ open, onClose, used, limit }: AiQuotaModalProps) {
  const router = useRouter();

  if (!open) return null;

  function handleAddKey() {
    onClose();
    router.push('/dashboard/settings/ai-keys');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">AI Usage Limit Reached</h2>
        <p className="text-sm text-gray-600 mb-1">
          The platform&apos;s shared key allows{' '}
          <span className="font-medium">{limit}</span> AI requests per month.
        </p>
        <p className="text-sm text-gray-600 mb-6">
          You&apos;ve used <span className="font-medium">{used}/{limit}</span> this month.
          Add your own API key to get unlimited access.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleAddKey}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Add your own API key
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
