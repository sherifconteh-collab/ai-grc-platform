// @tier: community
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { AuditRequestDetail, myWorkAPI } from '@/lib/api';
import { invalidateMyWork } from '@/lib/useMyWork';

function requestDetailsText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: unknown } } }).response?.data;
    if (typeof data?.error === 'string') return data.error;
  }
  return fallback;
}

// Audit requests (PBC) assigned to people outside the audit team. The Auditor
// Workspace is limited to auditor roles, so this is where an assignee reads the
// request and answers it; My Work's "Respond" button opens this page.
export default function AuditRequestPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const [request, setRequest] = useState<AuditRequestDetail | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    myWorkAPI.getRequest(id)
      .then((res) => {
        const data = res.data?.data ?? null;
        setRequest(data);
        setNotes(data?.response_notes || '');
      })
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load this request')))
      .finally(() => setLoading(false));
  }, [id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    setSaving(true);
    setError('');
    try {
      await myWorkAPI.respondToRequest(id, notes.trim());
      invalidateMyWork();
      setSaved(true);
      setRequest((r) => (r ? { ...r, status: 'submitted', response_notes: notes.trim() } : r));
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save your response'));
    } finally {
      setSaving(false);
    }
  };

  const closed = request ? ['accepted', 'closed'].includes(request.status) : false;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
          <Link href="/dashboard" className="hover:underline">My Work</Link>
          <span aria-hidden="true"> / </span>
          <span>Audit request</span>
        </nav>

        {loading && <div className="h-40 animate-pulse rounded-xl bg-white" aria-busy="true" />}
        {!loading && !request && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || 'Request not found.'}</div>
        )}

        {request && (
          <>
            <div>
              <p className="text-sm text-gray-500">{request.engagement_name}</p>
              <h1 className="text-2xl font-semibold text-gray-900">{request.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-md bg-gray-100 px-2 py-0.5 capitalize text-gray-700">Status: {request.status.replace(/_/g, ' ')}</span>
                <span className="rounded-md bg-gray-100 px-2 py-0.5 capitalize text-gray-700">Priority: {request.priority}</span>
                {request.due_date && <span className="rounded-md bg-gray-100 px-2 py-0.5 text-gray-700">Due {String(request.due_date).slice(0, 10)}</span>}
              </div>
            </div>

            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-2 text-base font-semibold text-gray-900">What the auditor asked for</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{requestDetailsText(request.request_details) || 'No further details were given.'}</p>
            </section>

            <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
              <label htmlFor="pbc-response" className="block text-base font-semibold text-gray-900">Your response</label>
              <p className="text-sm text-gray-500">
                Describe what you are providing. To attach files, upload them in Evidence and name them here.
              </p>
              <textarea
                id="pbc-response"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
                rows={6}
                maxLength={10000}
                disabled={!request.can_respond || closed}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-purple-500 disabled:bg-gray-50"
              />
              {error && <div role="alert" className="text-sm text-red-700">{error}</div>}
              {saved && <div role="status" className="text-sm text-green-700">Response sent to the audit team.</div>}
              {closed && <p className="text-sm text-gray-500">This request is closed.</p>}
              {!request.can_respond && !closed && <p className="text-sm text-gray-500">Only the assignee or the audit team can respond.</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !notes.trim() || !request.can_respond || closed}
                  className="min-h-[40px] rounded-lg bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
                >
                  {saving ? 'Sending...' : 'Send response'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
