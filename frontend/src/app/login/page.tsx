'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { APP_POSITIONING_SHORT } from '@/lib/branding';
import BrandLogo from '@/components/BrandLogo';
import { passkeyAPI, ssoAPI } from '@/lib/api';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'Your sign-in session expired. Please try again.',
  sso_failed: 'Single sign-on failed. Please try again or use your password instead.',
  social_failed: 'Social sign-in failed. Please try again.',
  sso_not_configured: 'Single sign-on is not configured for this organization.',
  no_email: 'Your identity provider did not return an email address.',
  account_disabled: 'Your account is disabled.',
  missing_tokens: 'The sign-in response was incomplete. Please try again.',
  token_exchange_failed: 'We could not complete sign-in. Please try again.'
};

const SOCIAL_LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  github: 'GitHub',
};

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  google: (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  microsoft: (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
      <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
    </svg>
  ),
  apple: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  github: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  ),
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [socialProviders, setSocialProviders] = useState<string[]>([]);
  const { login, loginWithTokens } = useAuth();

  useEffect(() => {
    // Load available social providers from the server
    ssoAPI.getProviders()
      .then(res => setSocialProviders(res.data?.data || []))
      .catch(() => { /* server may not have any configured */ });

    // Check for error from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const cbError = params.get('error');
    if (cbError) {
      let decoded = cbError;
      try {
        decoded = decodeURIComponent(cbError);
      } catch {
        // If decoding fails due to malformed percent-encoding, fall back to raw value
      }
      setError(ERROR_MESSAGES[cbError] || ERROR_MESSAGES[decoded] || decoded);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, requiresTotp ? totpCode : undefined);
    } catch (err: any) {
      if (err?.code === 'TOTP_REQUIRED') {
        setRequiresTotp(true);
        setUseBackupCode(false);
        setError('');
        return;
      }
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setPasskeyLoading(true);
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const optRes = await passkeyAPI.getAuthOptions(email || undefined);
      const { options, challengeId } = optRes.data?.data || {};
      const authResp = await startAuthentication({ optionsJSON: options });
      const verifyRes = await passkeyAPI.verifyAuth({ response: authResp, challengeId });
      const { accessToken, refreshToken } = verifyRes.data?.data || {};
      await loginWithTokens(accessToken, refreshToken);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Passkey authentication failed.';
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) {
        setError(msg);
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    window.location.href = ssoAPI.socialLoginUrl(provider);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-800">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <BrandLogo
            className="flex flex-col items-center gap-3"
            imageClassName="h-20 w-20"
            showTagline={true}
            size={80}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter your password"
            />
            <div className="mt-2 text-right">
              <Link href="/forgot-password" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                Forgot password?
              </Link>
            </div>
          </div>

          {requiresTotp && (
            <div>
              <label htmlFor="totpCode" className="block text-sm font-medium text-gray-700 mb-2">
                Authenticator Code
              </label>
              <input
                id="totpCode"
                type="text"
                inputMode={useBackupCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                maxLength={useBackupCode ? 10 : 6}
                value={totpCode}
                onChange={(e) => {
                  const rawValue = e.target.value.trim();
                  setTotpCode(
                    useBackupCode
                      ? rawValue.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 10)
                      : rawValue.replace(/\D/g, '').slice(0, 6)
                  );
                }}
                required={requiresTotp}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder={useBackupCode ? 'Enter 10-character backup code' : 'Enter 6-digit code'}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-500">
                  {useBackupCode
                    ? 'Enter one of your saved backup codes.'
                    : 'Enter the 6-digit code from your authenticator app.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode((current) => !current);
                    setTotpCode('');
                  }}
                  className="text-sm font-medium text-purple-600 hover:text-purple-700"
                >
                  {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || passkeyLoading}
            className="w-full bg-purple-600 text-white py-3 rounded-md font-semibold hover:bg-purple-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : requiresTotp ? 'Verify & Sign In' : 'Sign In'}
          </button>
        </form>

        {/* Passkey */}
        <div className="mt-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-gray-400">or</span></div>
          </div>
          <button
            onClick={handlePasskeyLogin}
            disabled={loading || passkeyLoading}
            className="mt-3 w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-2.5 rounded-md font-medium hover:bg-gray-50 transition duration-200 disabled:opacity-50 text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            {passkeyLoading ? 'Authenticating...' : 'Sign in with Passkey'}
          </button>
        </div>

        {/* Social login buttons */}
        {socialProviders.length > 0 && (
          <div className="mt-4 space-y-2">
            {socialProviders.map(provider => (
              <button
                key={provider}
                onClick={() => handleSocialLogin(provider)}
                disabled={loading || passkeyLoading}
                className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-2.5 rounded-md font-medium hover:bg-gray-50 transition duration-200 disabled:opacity-50 text-sm"
              >
                {SOCIAL_ICONS[provider]}
                Continue with {SOCIAL_LABELS[provider] || provider}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-purple-600 hover:text-purple-700 font-semibold">
              Register
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-center mb-2">
            <Link href="/contact" className="text-purple-600 hover:text-purple-700 font-semibold">Contact us</Link>
          </p>
          <p className="text-sm text-gray-500 text-center">{APP_POSITIONING_SHORT}</p>
        </div>
      </div>
    </div>
  );
}
