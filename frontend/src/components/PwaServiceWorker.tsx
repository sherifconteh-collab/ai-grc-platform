'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker (`/sw.js`) for PWA offline support and
 * push-notification handling.  Renders nothing visible.
 */
export default function PwaServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.error('[PwaServiceWorker] registration failed:', err));
  }, []);

  return null;
}
