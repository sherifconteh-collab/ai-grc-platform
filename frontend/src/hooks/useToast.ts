'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error';

export interface UseToastReturn {
  toast: string;
  toastType: ToastType;
  showToast: (message: string, type?: ToastType) => void;
}

/**
 * Shared toast hook with proper timer cleanup.
 * Clears previous timer on each new toast so rapid calls don't race.
 * Cleans up on unmount to avoid setting state after component is gone.
 */
export function useToast(duration = 3000): UseToastReturn {
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(message);
    setToastType(type);
    timerRef.current = setTimeout(() => setToast(''), duration);
  }, [duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toast, toastType, showToast };
}
