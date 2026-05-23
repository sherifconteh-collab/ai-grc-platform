'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { APP_NAME } from '@/lib/branding';

function planDisplayName(plan: string): string {
  if (plan.includes('pro')) return 'Pro';
  if (plan.includes('enterprise')) return 'Enterprise';
  if (plan.includes('govcloud')) return 'Gov Cloud & Advisory';
  return 'your plan';
}

function SuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  const plan = searchParams.get('plan') || '';
  const tierName = planDisplayName(plan);

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    // Clear any pending billing plan — Stripe checkout has succeeded
    localStorage.removeItem('pendingPlan');

    refreshUser()
      .catch(() => {})
      .finally(() => {
        redirectTimer = setTimeout(() => router.push('/dashboard'), 3000);
      });

    return () => {
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [refreshUser, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-10 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            width="32" height="32" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            className="text-green-600"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re all set!</h1>
        <p className="text-gray-700 mb-2">
          Welcome to{' '}
          <span className="font-semibold text-purple-700">
            {APP_NAME} {tierName}
          </span>
          .
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Your subscription is now active. Taking you to your dashboard…
        </p>

        <Link
          href="/dashboard"
          className="inline-block bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-all"
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
