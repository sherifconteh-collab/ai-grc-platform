'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function SsoCallbackInner() {
  const searchParams = useSearchParams();
  const { loginWithTokens } = useAuth();

  useEffect(() => {
    const at = searchParams.get('at');
    const rt = searchParams.get('rt');
    const error = searchParams.get('error');

    if (error) {
      const msg = error === 'account_required'
        ? 'No account found for this email. Please register first.'
        : `Sign-in failed: ${error.replace(/_/g, ' ')}`;
      window.location.href = `/login?error=${encodeURIComponent(msg)}`;
      return;
    }

    if (at && rt) {
      loginWithTokens(at, rt).catch(() => {
        window.location.href = '/login?error=token_exchange_failed';
      });
    } else {
      window.location.href = '/login?error=missing_tokens';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-800">
      <div className="bg-white p-8 rounded-lg shadow-2xl text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
        <p className="text-gray-600">Completing sign-in...</p>
      </div>
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-800">
        <div className="bg-white p-8 rounded-lg shadow-2xl text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto" />
        </div>
      </div>
    }>
      <SsoCallbackInner />
    </Suspense>
  );
}
