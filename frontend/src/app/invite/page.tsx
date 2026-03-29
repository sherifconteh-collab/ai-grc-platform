'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { authAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface InviteDetails {
  email: string;
  primary_role: string;
  role_names: string[];
  organization_name: string;
  organization_tier?: string;
  invited_by_name?: string | null;
}

const MIN_PASSWORD_LENGTH = 15;
const PASSWORD_COMPLEXITY_ERROR = 'Password must include uppercase, lowercase, number, and special character.';

function hasRequiredPasswordComplexity(password: string) {
  return /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function InvitePageContent() {
  const searchParams = useSearchParams();
  const { loginWithTokens } = useAuth();
  const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      if (!token) {
        if (active) {
          setError('This invite link is missing its token. Ask your administrator to send a new invitation.');
          setLoadingInvite(false);
        }
        return;
      }

      try {
        const response = await authAPI.validateInvite(token);
        if (!active) {
          return;
        }

        setInvite(response.data?.data || null);
      } catch (err: any) {
        if (!active) {
          return;
        }

        setError(err.response?.data?.error || 'This invite could not be validated.');
      } finally {
        if (active) {
          setLoadingInvite(false);
        }
      }
    }

    loadInvite();

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const normalizedFullName = fullName.trim();
    if (normalizedFullName.length < 2) {
      setError('Enter your full name to accept the invitation.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (!hasRequiredPasswordComplexity(password)) {
      setError(PASSWORD_COMPLEXITY_ERROR);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await authAPI.acceptInvite({
        token,
        full_name: normalizedFullName,
        password,
      });

      const accessToken = response.data?.data?.tokens?.accessToken;
      const refreshToken = response.data?.data?.tokens?.refreshToken;

      if (!accessToken || !refreshToken) {
        throw new Error('Invitation accepted, but sign-in tokens were missing from the response.');
      }

      await loginWithTokens(accessToken, refreshToken);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to accept invitation.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-950 to-indigo-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <BrandLogo
              className="flex flex-col items-start gap-3"
              imageClassName="h-16 w-16"
              showTagline={true}
              size={64}
            />
            <div className="mt-8 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-sm font-semibold text-sky-100">
                Organization Invitation
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Join your team inside ControlWeave.
              </h1>
              <p className="text-base text-slate-300">
                Invitation links work in self-hosted deployments. Accept the invite once and you&apos;ll be signed directly into the organization workspace.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Secure invite token</p>
                <p className="mt-2 text-sm text-slate-300">The link validates the pending invite before account creation.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Single-step onboarding</p>
                <p className="mt-2 text-sm text-slate-300">Create your password, accept the invite, and continue straight into the app.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">Role-aware access</p>
                <p className="mt-2 text-sm text-slate-300">Your organization roles and permissions are attached as part of invite acceptance.</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-900 shadow-2xl shadow-black/10">
            {loadingInvite ? (
              <div className="flex min-h-96 items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
              </div>
            ) : error && !invite ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Invitation unavailable</h2>
                  <p className="mt-2 text-sm text-slate-600">{error}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Back to Home
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Accept invitation</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Complete your account details to join {invite?.organization_name}.
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <dl className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</dt>
                      <dd className="mt-1 font-medium text-slate-900">{invite?.email}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organization</dt>
                      <dd className="mt-1 font-medium text-slate-900">{invite?.organization_name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Primary role</dt>
                      <dd className="mt-1 font-medium capitalize text-slate-900">{invite?.primary_role}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invited by</dt>
                      <dd className="mt-1 font-medium text-slate-900">{invite?.invited_by_name || 'Organization administrator'}</dd>
                    </div>
                  </dl>
                  {Array.isArray(invite?.role_names) && invite!.role_names.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned roles</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {invite!.role_names.map((roleName) => (
                          <span
                            key={roleName}
                            className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                          >
                            {roleName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-slate-700">
                      Full name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      placeholder="At least 15 characters"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Use at least 15 characters and include uppercase, lowercase, a number, and a special character.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">
                      Confirm password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      placeholder="Re-enter your password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Accepting invitation...' : 'Accept Invitation'}
                  </button>
                </form>

                <p className="text-sm text-slate-600">
                  Already have an account for this organization? <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">Sign in instead</Link>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-white" />
        </div>
      }
    >
      <InvitePageContent />
    </Suspense>
  );
}
