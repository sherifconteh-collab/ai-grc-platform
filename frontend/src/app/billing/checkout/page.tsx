'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BillingCheckoutPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.removeItem('pendingPlan');
      localStorage.removeItem('pendingBillingPlan');
      localStorage.removeItem('billingPlan');
      sessionStorage.removeItem('pendingPlan');
      sessionStorage.removeItem('pendingBillingPlan');
    } catch {
      // Storage not available (SSR or private mode)
    }
    router.replace('/dashboard');
  }, [router]);

  return null;
}
