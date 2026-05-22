'use client';

import { useEffect } from 'react';

export default function PwaServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const disableServiceWorker = process.env.NODE_ENV !== 'production' || isLocalhost;

    const clearServiceWorkerState = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    };

    const syncServiceWorker = async () => {
      try {
        if (disableServiceWorker) {
          await clearServiceWorkerState();
          return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        await registration.update();
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    syncServiceWorker();
  }, []);

  return null;
}
