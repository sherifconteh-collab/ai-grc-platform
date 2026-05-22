'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { authAPI } from '@/lib/api';
import Link from 'next/link';
import { APP_NAME } from '@/lib/branding';

interface InviteDetails {
  email: string;
  primary_role: string;
  role_names: string[];
  organization_name: string;
  organization_tier: string;
  invited_by_name: string;
}

function InvitePageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invite token provided. Please use the link from your invitation.');
      setLoading(false);
      return;
    }
    authAPI.validateInvite(token)
      .then((res: any) => {
        setInvite(res.data.data);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.response?.data?.error || 'Invalid or expired invite link');
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 15) {
      setError('Password must be at least 15 characters');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Password must include uppercase, lowercase, number, and special character');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Please enter your full name');
      return;
    }

    setSubmitting(true);
    try {
      await authAPI.acceptInvite({ token, full_name: fullName.trim(), password });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Validating invite...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to {invite?.organization_name}!</h1>
          <p className="text-gray-600 mb-6">
            Your account has been created with the <span className="font-semibold">{invite?.primary_role}</span> role.
            You can now sign in to access the platform.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invite</h1>
          <p className="text-red-600 mb-6">{error}</p>
          <Link
            href="/register"
            className="inline-block px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Create a New Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Join {invite.organization_name}</h1>
          <p className="text-gray-500 mt-1">
            {invite.invited_by_name} has invited you to join {APP_NAME}
          </p>
        </div>

        {/* Pre-configured details */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-purple-900 mb-2">Your pre-configured access:</p>
          <div className="space-y-1 text-sm text-purple-800">
            <p><span className="font-medium">Email:</span> {invite.email}</p>
            <p><span className="font-medium">Role:</span> {invite.primary_role}</p>
            {invite.role_names.length > 0 && (
              <p><span className="font-medium">Custom roles:</span> {invite.role_names.join(', ')}</p>
            )}
            <p><span className="font-medium">Organization tier:</span> {invite.organization_tier}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 15 characters"
              required
              minLength={15}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-gray-400 mt-1">Must include uppercase, lowercase, number, and special character</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating Account…' : 'Complete Setup'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-purple-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>}>
      <InvitePageInner />
    </Suspense>
  );
}
