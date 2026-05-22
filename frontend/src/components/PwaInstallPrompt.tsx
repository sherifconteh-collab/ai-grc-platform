'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  async function onInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setVisible(false);
      setInstallEvent(null);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] md:left-auto md:w-[360px] bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700 p-4">
      <p className="text-sm font-semibold">Install ControlWeave</p>
      <p className="text-xs text-gray-300 mt-1">
        Add this app to your home screen for faster access and better mobile workflows.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onInstall}
          className="px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-700"
        >
          Install
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="px-3 py-1.5 text-xs font-medium rounded border border-gray-500 text-gray-200 hover:bg-gray-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
