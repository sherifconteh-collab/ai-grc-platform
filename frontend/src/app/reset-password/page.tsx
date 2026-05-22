'use client';

import { useMemo, useState } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authAPI } from '@/lib/api';

function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => String(searchParams.get('token') || ''), [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Reset token is missing.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 15) {
      setError('Password must be at least 15 characters.');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.resetPassword({ token, password });
      setMessage(response.data?.message || 'Password has been reset successfully.');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-800 px-4">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Reset Password</h1>
        <p className="text-gray-600 mt-2 text-center text-sm">Set a new password for your account.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
          {message && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm">{message}</div>}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter new password"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Confirm new password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-md font-semibold hover:bg-purple-700 transition duration-200 disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          <Link href="/login" className="text-purple-600 hover:text-purple-700 font-semibold">Back to sign in</Link>
          {' · '}
          <Link href="/contact" className="text-purple-600 hover:text-purple-700 font-semibold">Contact us</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
