'use client';

import { useEffect, useState } from 'react';
import { authAPI } from '@/lib/api';

export type RegistrationMode = 'open' | 'invite_only';

/**
 * Whether this server lets anyone register. `null` until known; callers keep
 * their default (registration offered) if the request fails, since the API
 * enforces the mode either way.
 */
export function useRegistrationMode(): RegistrationMode | null {
  const [mode, setMode] = useState<RegistrationMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    authAPI.getServerInfo()
      .then((res) => {
        const value: unknown = res.data?.data?.registration;
        if (!cancelled && (value === 'open' || value === 'invite_only')) setMode(value);
      })
      .catch(() => {
        // Keep the default; POST /auth/register still refuses when closed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
