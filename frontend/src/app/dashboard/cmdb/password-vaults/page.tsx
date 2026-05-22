'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { cmdbAPI } from '@/lib/api';

interface PasswordVault {
  id: string;
  name: string;
  vault_type?: string;
  vault_url?: string;
  is_active?: boolean;
  description?: string;
}

interface PasswordVaultForm {
  name: string;
  vault_type: string;
  vault_url: string;
  description: string;
}

const DEFAULT_FORM: PasswordVaultForm = {
  name: '',
  vault_type: 'hashicorp_vault',
  vault_url: '',
  description: '',
};

const VAULT_TYPE_LABELS: Record<string, string> = {
  hashicorp_vault: 'HashiCorp Vault',
  aws_secrets_manager: 'AWS Secrets Manager',
  azure_key_vault: 'Azure Key Vault',
  cyberark: 'CyberArk',
  '1password': '1Password',
  bitwarden: 'Bitwarden',
};

export default function PasswordVaultsPage() {
  const [items, setItems] = useState<PasswordVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<PasswordVaultForm>(DEFAULT_FORM);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.passwordVaults.getAll();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load password vaults'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this password vault?')) return;
    try { await cmdbAPI.passwordVaults.remove(id); load(); } catch { setError('Failed to delete item'); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      await cmdbAPI.passwordVaults.create(form as unknown as Record<string, unknown>);
      setShowModal(false);
      setForm(DEFAULT_FORM);
      load();
    } catch { setSaveError('Failed to save password vault'); }
    finally { setSaving(false); }
  };

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/cmdb" className="text-purple-600 hover:underline text-sm">← CMDB</Link>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-rose-600 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl shadow">🔐</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Password Vaults</h1>
              <p className="text-sm text-gray-500">Vault instances and credential stores for secrets management</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add New</button>
        </div>

        <input
          type="text"
          placeholder="Search password vaults..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No password vaults found. Add your first one!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vault Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vault URL</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Active</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-600">{item.vault_type ? (VAULT_TYPE_LABELS[item.vault_type] ?? item.vault_type) : '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs truncate max-w-[200px]">{item.vault_url ?? '—'}</td>
                      <td className="px-4 py-3 text-center">{item.is_active ? '✅' : '❌'}</td>
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
                <h2 className="font-bold text-lg text-gray-900">Add New Password Vault</h2>
                <button onClick={() => { setShowModal(false); setSaveError(''); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleSave} className="p-5 space-y-4">
                {saveError && <div className="bg-red-50 border border-red-300 text-red-700 px-3 py-2 rounded text-sm">{saveError}</div>}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input required value={form.name} onChange={e => set('name', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vault Type</label>
                  <select value={form.vault_type} onChange={e => set('vault_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="hashicorp_vault">HashiCorp Vault</option>
                    <option value="aws_secrets_manager">AWS Secrets Manager</option>
                    <option value="azure_key_vault">Azure Key Vault</option>
                    <option value="cyberark">CyberArk</option>
                    <option value="1password">1Password</option>
                    <option value="bitwarden">Bitwarden</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vault URL</label>
                  <input type="url" value={form.vault_url} onChange={e => set('vault_url', e.target.value)}
                    placeholder="https://vault.example.com"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
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
