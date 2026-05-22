'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { cmdbAPI } from '@/lib/api';

interface Environment {
  id: string;
  name: string;
  code: string;
  environment_type?: string;
  security_level?: string;
  criticality?: string;
  data_classification?: string;
  contains_pii?: boolean;
  contains_phi?: boolean;
  contains_pci?: boolean;
  description?: string;
}

interface EnvironmentForm {
  name: string;
  code: string;
  environment_type: string;
  security_level: string;
  criticality: string;
  data_classification: string;
  contains_pii: boolean;
  contains_phi: boolean;
  contains_pci: boolean;
  description: string;
}

const DEFAULT_FORM: EnvironmentForm = {
  name: '',
  code: '',
  environment_type: 'production',
  security_level: 'high',
  criticality: 'high',
  data_classification: 'internal',
  contains_pii: false,
  contains_phi: false,
  contains_pci: false,
  description: '',
};

const SECURITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

const CRITICALITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

export default function EnvironmentsPage() {
  const [items, setItems] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<EnvironmentForm>(DEFAULT_FORM);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.environments.getAll();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load environments'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this environment?')) return;
    try { await cmdbAPI.environments.remove(id); load(); } catch { setError('Failed to delete item'); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      await cmdbAPI.environments.create(form as unknown as Record<string, unknown>);
      setShowModal(false);
      setForm(DEFAULT_FORM);
      load();
    } catch { setSaveError('Failed to save environment'); }
    finally { setSaving(false); }
  };

  const set = (field: string, value: string | boolean) => setForm(f => ({ ...f, [field]: value }));

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/cmdb" className="text-purple-600 hover:underline text-sm">← CMDB</Link>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl shadow">🌐</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Environments</h1>
              <p className="text-sm text-gray-500">Production, staging, development, DR, and sandbox environments</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add New</button>
        </div>

        <input
          type="text"
          placeholder="Search environments..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No environments found. Add your first one!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Code</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Security Level</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Criticality</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">PII</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">PCI</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{item.code}</td>
                      <td className="px-4 py-3 text-gray-600">{item.environment_type ?? '—'}</td>
                      <td className="px-4 py-3">
                        {item.security_level ? (
                          <span className={`${SECURITY_COLORS[item.security_level] ?? 'bg-gray-100 text-gray-700'} px-2 py-0.5 rounded-full text-xs font-medium`}>
                            {item.security_level}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {item.criticality ? (
                          <span className={`${CRITICALITY_COLORS[item.criticality] ?? 'bg-gray-100 text-gray-700'} px-2 py-0.5 rounded-full text-xs font-medium`}>
                            {item.criticality}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">{item.contains_pii ? '✅' : '❌'}</td>
                      <td className="px-4 py-3 text-center">{item.contains_pci ? '✅' : '❌'}</td>
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
                <h2 className="font-bold text-lg text-gray-900">Add New Environment</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code <span className="text-red-500">*</span></label>
                  <input required value={form.code} onChange={e => set('code', e.target.value)}
                    placeholder="e.g. PROD, STG, DEV"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Environment Type</label>
                  <select value={form.environment_type} onChange={e => set('environment_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="development">Development</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                    <option value="dr">DR</option>
                    <option value="sandbox">Sandbox</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Security Level</label>
                  <select value={form.security_level} onChange={e => set('security_level', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
                  <select value={form.criticality} onChange={e => set('criticality', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Classification</label>
                  <select value={form.data_classification} onChange={e => set('data_classification', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="public">Public</option>
                    <option value="internal">Internal</option>
                    <option value="confidential">Confidential</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pii" checked={form.contains_pii}
                    onChange={e => set('contains_pii', e.target.checked)}
                    className="h-4 w-4 text-purple-600" />
                  <label htmlFor="pii" className="text-sm font-medium text-gray-700">Contains PII</label>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="phi" checked={form.contains_phi}
                    onChange={e => set('contains_phi', e.target.checked)}
                    className="h-4 w-4 text-purple-600" />
                  <label htmlFor="phi" className="text-sm font-medium text-gray-700">Contains PHI</label>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pci" checked={form.contains_pci}
                    onChange={e => set('contains_pci', e.target.checked)}
                    className="h-4 w-4 text-purple-600" />
                  <label htmlFor="pci" className="text-sm font-medium text-gray-700">Contains PCI</label>
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
