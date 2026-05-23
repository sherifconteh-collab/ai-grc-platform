'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';

type TierOption = 'community' | 'pro' | 'enterprise' | 'govcloud';

const API_BASE = getApiBaseUrl();

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [requestedTier, setRequestedTier] = useState<TierOption>('enterprise');
  const [wantsDemoAccount, setWantsDemoAccount] = useState(true);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const canSubmit = useMemo(() => {
    return name.trim().length > 1 && email.trim().length > 4 && message.trim().length > 8;
  }, [name, email, message]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          requestedTier,
          wantsDemoAccount,
          message: message.trim()
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true) {
        throw new Error(payload?.error || 'Unable to submit request right now.');
      }

      setResult({
        ok: true,
        text: wantsDemoAccount
          ? 'Request received. Demo credentials are being sent to your email.'
          : 'Request received. We will follow up by email shortly.'
      });
      setMessage('');
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-800 px-4 py-8">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 text-center">Contact Us</h1>
        <p className="text-gray-600 mt-2 text-center">
          Request a tier-matched demo account or send your sales questions.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4 text-sm text-gray-700">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-purple-500"
              placeholder="Your name"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Work Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-purple-500"
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-purple-500"
              placeholder="Company name"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Preferred Demo Tier</label>
            <select
              value={requestedTier}
              onChange={(e) => setRequestedTier(e.target.value as TierOption)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-purple-500"
            >
              <option value="community">Community</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
              <option value="govcloud">Gov Cloud &amp; Advisory</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={wantsDemoAccount}
              onChange={(e) => setWantsDemoAccount(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Send me demo account credentials</span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-purple-500"
              placeholder="Share your frameworks, timeline, and what you want to evaluate."
              required
            />
          </div>

          {result && (
            <div className={`rounded-lg px-3 py-2 text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.text}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full rounded-lg bg-purple-600 text-white py-2.5 font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        <div className="mt-8 flex justify-center gap-6 text-sm">
          <Link href="/login" className="text-purple-600 hover:text-purple-700 font-semibold">Sign in</Link>
          <Link href="/forgot-password" className="text-purple-600 hover:text-purple-700 font-semibold">Forgot password</Link>
        </div>
      </div>
    </div>
  );
}
