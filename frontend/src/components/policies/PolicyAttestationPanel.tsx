'use client';

import { useState } from 'react';
import { policiesAPI, PolicyStatus } from '@/lib/api';
import { errorMessage, formatDate, primaryButton } from './policyShared';
import { invalidateMyWork } from '@/lib/useMyWork';

export interface Attestation {
  version: string;
  acknowledged_count: number;
  active_users: number;
  acknowledged_by_me: boolean;
}

interface AttestationUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  acknowledged_at: string | null;
}

interface PolicyAttestationPanelProps {
  policyId: string;
  status: PolicyStatus;
  attestation: Attestation;
  onChanged: () => Promise<void> | void;
}

export default function PolicyAttestationPanel({ policyId, status, attestation, onChanged }: PolicyAttestationPanelProps) {
  const [users, setUsers] = useState<AttestationUser[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = Math.max(0, attestation.active_users);
  const done = Math.min(total, attestation.acknowledged_count);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const acknowledge = async () => {
    setBusy(true);
    setError('');
    try {
      await policiesAPI.acknowledge(policyId);
      invalidateMyWork();
      await onChanged();
      if (users) await loadUsers();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not record your acknowledgment'));
    } finally {
      setBusy(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await policiesAPI.getAcknowledgments(policyId);
      setUsers((res.data?.data?.users || []) as AttestationUser[]);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load attestation status'));
    }
  };

  const exportCsv = () => {
    if (!users) return;
    const cell = (value: string) => `"${value.replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
    const rows = [['Name', 'Email', 'Role', 'Acknowledged at'], ...users.map((u) => [
      `${u.first_name || ''} ${u.last_name || ''}`.trim(), u.email || '', u.role || '', u.acknowledged_at || '',
    ])];
    const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `policy-attestation-v${attestation.version}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4" aria-labelledby="attestation-heading">
      <h2 id="attestation-heading" className="text-base font-semibold text-gray-900">Acknowledgments</h2>
      <p className="text-xs text-gray-500 mb-3">Version {attestation.version}</p>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 bg-gray-100 rounded" role="progressbar" aria-label="Acknowledgment progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-2 bg-green-500 rounded" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm text-gray-700">{done}/{total}</span>
      </div>
      {error && <p className="text-sm text-red-700 mb-2" role="alert">{error}</p>}
      {status === 'published' ? (
        attestation.acknowledged_by_me ? (
          <p className="text-sm text-green-700">You have acknowledged this version.</p>
        ) : (
          <button id="policy-acknowledge-button" type="button" className={`${primaryButton} w-full`} disabled={busy} onClick={acknowledge}>
            {busy ? 'Saving…' : 'I have read and agree to this policy'}
          </button>
        )
      ) : (
        <p className="text-xs text-gray-500">Employees can acknowledge the policy once it is published.</p>
      )}
      <div className="mt-3 flex gap-3 text-sm">
        <button type="button" className="text-blue-700 hover:underline" onClick={users ? () => setUsers(null) : loadUsers}>
          {users ? 'Hide who has acknowledged' : 'Show who has acknowledged'}
        </button>
        {users && <button type="button" className="text-blue-700 hover:underline" onClick={exportCsv}>Export CSV</button>}
      </div>
      {users && (
        <ul role="list" className="mt-2 divide-y divide-gray-100 max-h-72 overflow-y-auto text-sm">
          {users.map((u) => (
            <li role="listitem" key={u.user_id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="truncate">{`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}</span>
              <span className={u.acknowledged_at ? 'text-green-700 text-xs' : 'text-gray-400 text-xs'}>
                {u.acknowledged_at ? formatDate(u.acknowledged_at) : 'Pending'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
