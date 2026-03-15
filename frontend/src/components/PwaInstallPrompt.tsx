'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Captures the browser's `beforeinstallprompt` event and shows a small banner
 * inviting the user to install the PWA.  Renders nothing when the prompt is
 * unavailable (e.g. app already installed, or non-supporting browser).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl bg-purple-700 px-5 py-3 text-white shadow-lg">
      <span className="text-sm font-medium">Install ControlWeave for quick access</span>
      <button
        onClick={handleInstall}
        className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-purple-700 shadow hover:bg-purple-50 active:scale-95 transition-all cursor-pointer"
      >
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 p-1 rounded-full opacity-70 hover:opacity-100 hover:bg-white/20 transition"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
