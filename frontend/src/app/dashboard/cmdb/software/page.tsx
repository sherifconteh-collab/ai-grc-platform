'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LinkedAssetsModal from '@/components/LinkedAssetsModal';
import { cmdbAPI } from '@/lib/api';

interface SoftwareAsset {
  id: string;
  name: string;
  version?: string;
  manufacturer?: string;
  license_key?: string;
  license_expiry?: string;
  environment_id?: string;
  environment_name?: string;
  status?: string;
  criticality?: string;
  notes?: string;
}

const DEFAULT_FORM: Omit<SoftwareAsset, 'id'> = {
  name: '',
  version: '',
  manufacturer: '',
  license_key: '',
  license_expiry: '',
  environment_id: '',
  status: 'active',
  criticality: 'medium',
  notes: '',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  deprecated: 'bg-red-100 text-red-700',
  end_of_life: 'bg-red-100 text-red-700',
};

const CRITICALITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

export default function SoftwarePage() {
  const [items, setItems] = useState<SoftwareAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<Omit<SoftwareAsset, 'id'>>(DEFAULT_FORM);
  const [search, setSearch] = useState('');
  const [linksTarget, setLinksTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.software.getAll();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load software assets'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this software asset?')) return;
    try { await cmdbAPI.software.remove(id); load(); } catch { setError('Failed to delete item'); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      await cmdbAPI.software.create(form as unknown as Record<string, unknown>);
      setShowModal(false);
      setForm(DEFAULT_FORM);
      load();
    } catch { setSaveError('Failed to save software asset'); }
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
            <div className="bg-indigo-600 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl shadow">💿</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Software Assets</h1>
              <p className="text-sm text-gray-500">Applications, databases, OS images, and licensed software</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add New</button>
        </div>

        <input
          type="text"
          placeholder="Search software assets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No software assets found. Add your first one!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Version</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vendor</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Environment</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">License Expiry</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-600">{item.version ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.manufacturer ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.environment_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {item.status ? (
                          <span className={`${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-700'} px-2 py-0.5 rounded-full text-xs font-medium`}>
                            {item.status}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.license_expiry ? item.license_expiry.slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setLinksTarget({ id: item.id, name: item.name })} className="text-purple-500 hover:text-purple-700 text-xs mr-3">🔗 Links</button>
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
                <h2 className="font-bold text-lg text-gray-900">Add New Software Asset</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input value={form.version} onChange={e => set('version', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Key</label>
                  <input value={form.license_key} onChange={e => set('license_key', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
                  <input type="date" value={form.license_expiry} onChange={e => set('license_expiry', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Environment ID</label>
                  <input value={form.environment_id} onChange={e => set('environment_id', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="deprecated">Deprecated</option>
                    <option value="end_of_life">End of Life</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
                  <select value={form.criticality} onChange={e => set('criticality', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
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

        {linksTarget && (
          <LinkedAssetsModal
            assetId={linksTarget.id}
            assetName={linksTarget.name}
            onClose={() => setLinksTarget(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
