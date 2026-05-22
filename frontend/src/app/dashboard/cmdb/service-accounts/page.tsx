'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { cmdbAPI } from '@/lib/api';

interface ServiceAccount {
  id: string;
  account_name: string;
  account_type?: string;
  credential_type?: string;
  privilege_level?: string;
  rotation_frequency_days?: number;
  description?: string;
  scope?: string;
  notes?: string;
  status?: string;
  next_rotation_date?: string;
  owner_name?: string;
}

interface ServiceAccountForm {
  account_name: string;
  account_type: string;
  credential_type: string;
  privilege_level: string;
  rotation_frequency_days: number;
  description: string;
  scope: string;
  notes: string;
}

const DEFAULT_FORM: ServiceAccountForm = {
  account_name: '',
  account_type: 'service_principal',
  credential_type: 'password',
  privilege_level: 'read',
  rotation_frequency_days: 90,
  description: '',
  scope: '',
  notes: '',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  decommissioned: 'bg-red-100 text-red-700',
};

const PRIVILEGE_COLORS: Record<string, string> = {
  root: 'bg-red-100 text-red-700',
  admin: 'bg-orange-100 text-orange-700',
  write: 'bg-yellow-100 text-yellow-700',
  read: 'bg-green-100 text-green-700',
};

export default function ServiceAccountsPage() {
  const [items, setItems] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<ServiceAccountForm>(DEFAULT_FORM);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.serviceAccounts.getAll();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load service accounts'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this service account?')) return;
    try { await cmdbAPI.serviceAccounts.remove(id); load(); } catch { setError('Failed to delete item'); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      await cmdbAPI.serviceAccounts.create(form as unknown as Record<string, unknown>);
      setShowModal(false);
      setForm(DEFAULT_FORM);
      load();
    } catch { setSaveError('Failed to save service account'); }
    finally { setSaving(false); }
  };

  const set = (field: string, value: string | number) => setForm(f => ({ ...f, [field]: value }));

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/cmdb" className="text-purple-600 hover:underline text-sm">← CMDB</Link>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl shadow">🔑</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Service Accounts</h1>
              <p className="text-sm text-gray-500">Non-human accounts, API keys, bots, and system principals</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add New</button>
        </div>

        <input
          type="text"
          placeholder="Search service accounts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No service accounts found. Add your first one!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Account Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Privilege Level</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Next Rotation</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Owner</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.account_name}</td>
                      <td className="px-4 py-3 text-gray-600">{item.account_type ?? '—'}</td>
                      <td className="px-4 py-3">
                        {item.privilege_level ? (
                          <span className={`${PRIVILEGE_COLORS[item.privilege_level] ?? 'bg-gray-100 text-gray-700'} px-2 py-0.5 rounded-full text-xs font-medium`}>
                            {item.privilege_level}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {item.status ? (
                          <span className={`${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-700'} px-2 py-0.5 rounded-full text-xs font-medium`}>
                            {item.status}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.next_rotation_date ? item.next_rotation_date.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.owner_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b">
                <h2 className="font-bold text-lg text-gray-900">Add New Service Account</h2>
                <button onClick={() => { setShowModal(false); setSaveError(''); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleSave} className="p-5 space-y-4">
                {saveError && <div className="bg-red-50 border border-red-300 text-red-700 px-3 py-2 rounded text-sm">{saveError}</div>}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name <span className="text-red-500">*</span></label>
                  <input required value={form.account_name} onChange={e => set('account_name', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                  <select value={form.account_type} onChange={e => set('account_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="bot">Bot</option>
                    <option value="api_key">API Key</option>
                    <option value="system_user">System User</option>
                    <option value="service_principal">Service Principal</option>
                    <option value="oauth_client">OAuth Client</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credential Type</label>
                  <select value={form.credential_type} onChange={e => set('credential_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="password">Password</option>
                    <option value="api_key">API Key</option>
                    <option value="certificate">Certificate</option>
                    <option value="ssh_key">SSH Key</option>
                    <option value="oauth_token">OAuth Token</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Privilege Level</label>
                  <select value={form.privilege_level} onChange={e => set('privilege_level', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                    <option value="root">Root</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rotation Frequency (days)</label>
                  <input type="number" value={form.rotation_frequency_days} onChange={e => set('rotation_frequency_days', parseInt(e.target.value) || 90)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input value={form.description} onChange={e => set('description', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                  <input value={form.scope} onChange={e => set('scope', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                  <button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
