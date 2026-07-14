// @tier: community
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { exceptionsAPI, implementationsAPI, usersAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

type ExceptionStatus = 'pending' | 'active' | 'expired' | 'revoked';
type StatusFilter = ExceptionStatus | 'all';

interface ControlException {
  id: string;
  control_id: string;
  control_code?: string;
  control_title?: string;
  framework_code?: string;
  title: string;
  reason: string;
  compensating_controls?: string | null;
  business_impact?: string | null;
  owner_id?: string | null;
  owner_email?: string | null;
  status: ExceptionStatus;
  expires_at?: string | null;
  approved_by_email?: string | null;
  approved_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ControlOption {
  framework_control_id: string;
  control_code: string;
  control_title: string;
  framework_code?: string;
}

interface OwnerOption {
  id: string;
  email: string;
  full_name: string;
}

interface ExceptionFormState {
  control_id: string;
  title: string;
  reason: string;
  compensating_controls: string;
  business_impact: string;
  owner_id: string;
  expires_at: string;
}

const EMPTY_FORM: ExceptionFormState = {
  control_id: '',
  title: '',
  reason: '',
  compensating_controls: '',
  business_impact: '',
  owner_id: '',
  expires_at: '',
};

const STATUS_STYLES: Record<ExceptionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  expired: 'bg-gray-200 text-gray-700',
  revoked: 'bg-red-100 text-red-800',
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'all', label: 'All' },
];

function StatusBadge({ status }: { status: ExceptionStatus }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[status]}`}
      aria-label={`Exception status: ${status}`}
    >
      {status}
    </span>
  );
}

export default function ExceptionsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'controls.write');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [exceptions, setExceptions] = useState<ControlException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [controlOptions, setControlOptions] = useState<ControlOption[]>([]);
  const [controlsLoaded, setControlsLoaded] = useState(false);

  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownersLoaded, setOwnersLoaded] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExceptionFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [revokeNote, setRevokeNote] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadExceptions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = statusFilter === 'all' ? {} : { status: statusFilter };
      const response = await exceptionsAPI.getList(params);
      const data = Array.isArray(response.data?.data) ? response.data.data : [];
      setExceptions(data);
    } catch {
      setError('Failed to load control exceptions.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadExceptions();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadExceptions]);

  const loadControlOptions = useCallback(async () => {
    if (controlsLoaded) return;
    try {
      const response = await implementationsAPI.getAll();
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      const options: ControlOption[] = rows
        .filter((row: Record<string, unknown>) => row.framework_control_id)
        .map((row: Record<string, unknown>) => ({
          framework_control_id: String(row.framework_control_id),
          control_code: String(row.control_code || ''),
          control_title: String(row.control_title || ''),
          framework_code: row.framework_code ? String(row.framework_code) : undefined,
        }));
      // De-duplicate by framework_control_id (implementations can repeat controls across queries)
      const seen = new Set<string>();
      const deduped = options.filter((opt) => {
        if (seen.has(opt.framework_control_id)) return false;
        seen.add(opt.framework_control_id);
        return true;
      });
      setControlOptions(deduped);
      setControlsLoaded(true);
    } catch {
      setControlOptions([]);
    }
  }, [controlsLoaded]);

  const loadOwnerOptions = useCallback(async () => {
    if (ownersLoaded) return;
    try {
      const response = await usersAPI.getOrgUsers();
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      const options: OwnerOption[] = rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        email: String(row.email || ''),
        full_name: String(row.full_name || '').trim(),
      }));
      setOwnerOptions(options);
      setOwnersLoaded(true);
    } catch {
      // Owner picker is a nice-to-have; if the requesting user lacks users.read
      // permission, fall back silently and leave owner unassigned.
      setOwnerOptions([]);
    }
  }, [ownersLoaded]);

  const openForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
    void loadControlOptions();
    void loadOwnerOptions();
  };

  const submitForm = async () => {
    if (!form.control_id || !form.title.trim() || !form.reason.trim()) {
      setFormError('Control, title, and reason are required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await exceptionsAPI.create({
        control_id: form.control_id,
        title: form.title.trim(),
        reason: form.reason.trim(),
        compensating_controls: form.compensating_controls.trim() || undefined,
        business_impact: form.business_impact.trim() || undefined,
        owner_id: form.owner_id || undefined,
        expires_at: form.expires_at || undefined,
      });
      setShowForm(false);
      setMessage('Exception request created.');
      await loadExceptions();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setFormError(error.response?.data?.error || 'Failed to create exception.');
    } finally {
      setSubmitting(false);
    }
  };

  const approveException = async (id: string) => {
    setActionBusyId(id);
    try {
      await exceptionsAPI.approve(id);
      setMessage('Exception approved.');
      await loadExceptions();
    } catch {
      setMessage('Failed to approve exception.');
    } finally {
      setActionBusyId(null);
    }
  };

  const revokeException = async () => {
    if (!revokeTargetId) return;
    setActionBusyId(revokeTargetId);
    try {
      await exceptionsAPI.revoke(revokeTargetId, revokeNote.trim() ? { note: revokeNote.trim() } : {});
      setMessage('Exception revoked.');
      setRevokeTargetId(null);
      setRevokeNote('');
      await loadExceptions();
    } catch {
      setMessage('Failed to revoke exception.');
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Control Exceptions</h1>
            <p className="text-gray-600 mt-2">
              Track risk-accepted controls, compensating controls, and time-boxed exceptions.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={openForm}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              New Exception
            </button>
          )}
        </div>

        {message && (
          <div className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-3 rounded text-sm">
            {message}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  statusFilter === tab.value
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-24 rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : exceptions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-500">
            No exceptions found for this filter.
          </div>
        ) : (
          <ul role="list" className="space-y-4">
            {exceptions.map((exception) => (
              <li
                role="listitem"
                key={exception.id}
                className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900">{exception.title}</h3>
                      <StatusBadge status={exception.status} />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Control:{' '}
                      <Link
                        href={`/dashboard/controls/${exception.control_id}`}
                        className="text-purple-600 hover:underline"
                      >
                        {exception.control_code || exception.control_id}
                        {exception.control_title ? ` — ${exception.control_title}` : ''}
                      </Link>
                      {exception.framework_code ? ` (${exception.framework_code})` : ''}
                    </p>
                    <p className="text-sm text-gray-700 mt-2">{exception.reason}</p>
                    {exception.business_impact && (
                      <p className="text-sm text-gray-600 mt-2">
                        <span className="font-medium">Business impact:</span> {exception.business_impact}
                      </p>
                    )}
                    {exception.compensating_controls && (
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Compensating controls:</span>{' '}
                        {exception.compensating_controls}
                      </p>
                    )}
                    <div className="text-xs text-gray-500 mt-3 flex flex-wrap gap-x-4 gap-y-1">
                      {exception.expires_at && <span>Expires: {exception.expires_at}</span>}
                      {exception.owner_email && <span>Owner: {exception.owner_email}</span>}
                      {exception.approved_by_email && (
                        <span>Approved by: {exception.approved_by_email}</span>
                      )}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex flex-col gap-2 shrink-0">
                      {exception.status === 'pending' && (
                        <button
                          onClick={() => approveException(exception.id)}
                          disabled={actionBusyId === exception.id}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {(exception.status === 'pending' || exception.status === 'active') && (
                        <button
                          onClick={() => {
                            setRevokeTargetId(exception.id);
                            setRevokeNote('');
                          }}
                          disabled={actionBusyId === exception.id}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New Exception modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Control Exception</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {formError}
              </div>
            )}

            <div>
              <label htmlFor="exception-control" className="block text-sm font-medium text-gray-700 mb-1">
                Control
              </label>
              <select
                id="exception-control"
                value={form.control_id}
                onChange={(e) => setForm({ ...form, control_id: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select a control...</option>
                {controlOptions.map((opt) => (
                  <option key={opt.framework_control_id} value={opt.framework_control_id}>
                    {opt.control_code} — {opt.control_title}
                    {opt.framework_code ? ` (${opt.framework_code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="exception-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                id="exception-title"
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="exception-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason
              </label>
              <textarea
                id="exception-reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="exception-compensating" className="block text-sm font-medium text-gray-700 mb-1">
                Compensating Controls
              </label>
              <textarea
                id="exception-compensating"
                value={form.compensating_controls}
                onChange={(e) => setForm({ ...form, compensating_controls: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="exception-impact" className="block text-sm font-medium text-gray-700 mb-1">
                Business Impact
              </label>
              <textarea
                id="exception-impact"
                value={form.business_impact}
                onChange={(e) => setForm({ ...form, business_impact: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="exception-owner" className="block text-sm font-medium text-gray-700 mb-1">
                Owner
              </label>
              <select
                id="exception-owner"
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.full_name || owner.email}
                    {owner.full_name && owner.email ? ` (${owner.email})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="exception-expires" className="block text-sm font-medium text-gray-700 mb-1">
                Expires On
              </label>
              <input
                id="exception-expires"
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={submitForm}
                disabled={submitting}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Exception'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke prompt */}
      {revokeTargetId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Revoke Exception</h2>
            <p className="text-sm text-gray-600">
              This exception will be marked as revoked. You may add an optional note explaining why.
            </p>
            <label htmlFor="revoke-note" className="block text-sm font-medium text-gray-700 mb-1">
              Note (optional)
            </label>
            <textarea
              id="revoke-note"
              value={revokeNote}
              onChange={(e) => setRevokeNote(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRevokeTargetId(null)}
                className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={revokeException}
                disabled={actionBusyId === revokeTargetId}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {actionBusyId === revokeTargetId ? 'Revoking...' : 'Revoke Exception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
