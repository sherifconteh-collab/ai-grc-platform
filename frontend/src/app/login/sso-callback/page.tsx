'use client';

import { useEffect, useRef, useState, Suspense, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ssoAPI } from '@/lib/api';

interface ExchangeResponse {
  success?: boolean;
  totp_required?: boolean;
  error?: string;
  data?: { accessToken?: string; refreshToken?: string };
}

function readCallbackParams(searchParams: ReturnType<typeof useSearchParams>) {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = hashParams.get('code');
  const error = hashParams.get('error') || searchParams.get('error');
  return { code, error };
}

function errorMessage(error: string): string {
  if (error === 'account_required') return 'No account found for this email. Please register first.';
  if (error === 'email_not_verified') {
    return 'Your sign-in provider did not confirm this email address. Sign in with your password instead.';
  }
  return `Sign-in failed: ${error.replace(/_/g, ' ')}`;
}

function extractApiError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return null;
}

function SsoCallbackInner() {
  const searchParams = useSearchParams();
  const { loginWithTokens } = useAuth();
  const codeRef = useRef<string | null>(null);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const failTo = (msg: string) => {
    window.location.href = `/login?error=${encodeURIComponent(msg)}`;
  };

  const exchange = async (totp?: string) => {
    const code = codeRef.current;
    if (!code) {
      failTo('missing_sign_in_code');
      return;
    }
    try {
      const response = await ssoAPI.exchangeCode(code, totp);
      const body = response.data as ExchangeResponse;
      if (body.totp_required) {
        setNeedsTotp(true);
        return;
      }
      const at = body.data?.accessToken;
      const rt = body.data?.refreshToken;
      if (!at || !rt) {
        failTo('token_exchange_failed');
        return;
      }
      await loginWithTokens(at, rt);
    } catch (err: unknown) {
      failTo(extractApiError(err) || 'token_exchange_failed');
    }
  };

  useEffect(() => {
    const { code, error } = readCallbackParams(searchParams);

    // Remove the one-time code from the address bar and history.
    if (window.location.hash || searchParams.get('error')) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    if (error) {
      failTo(errorMessage(error));
      return;
    }
    codeRef.current = code;
    void exchange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmitTotp = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    await exchange(totpCode.trim());
    setSubmitting(false);
  };

  if (needsTotp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-purple-600 to-indigo-800">
        <form onSubmit={onSubmitTotp} className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-sm">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Two-factor authentication</h1>
          <label htmlFor="sso-totp" className="block text-sm text-gray-600 mb-4">
            Enter the 6-digit code from your authenticator app, or a backup code.
          </label>
          <input
            id="sso-totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4 text-gray-900"
          />
          <button
            type="submit"
            disabled={submitting || totpCode.trim().length === 0}
            className="w-full bg-purple-600 text-white rounded-md py-2 disabled:opacity-50"
          >
            {submitting ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-purple-600 to-indigo-800">
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
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-purple-600 to-indigo-800">
        <div className="bg-white p-8 rounded-lg shadow-2xl text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto" />
        </div>
      </div>
    }>
      <SsoCallbackInner />
    </Suspense>
  );
}
