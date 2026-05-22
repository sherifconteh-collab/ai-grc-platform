'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import LinkedAssetsModal from '@/components/LinkedAssetsModal';
import { cmdbAPI } from '@/lib/api';

interface AIAgent {
  id: string;
  name: string;
  ai_model_type?: string;
  ai_risk_level?: string;
  status?: string;
  ai_human_oversight_required?: boolean;
  ai_bias_testing_completed?: boolean;
  notes?: string;
}

interface AIAgentForm {
  name: string;
  ai_model_type: string;
  ai_risk_level: string;
  status: string;
  ai_human_oversight_required: boolean;
  ai_bias_testing_completed: boolean;
  notes: string;
}

const DEFAULT_FORM: AIAgentForm = {
  name: '',
  ai_model_type: 'llm',
  ai_risk_level: 'limited',
  status: 'active',
  ai_human_oversight_required: false,
  ai_bias_testing_completed: false,
  notes: '',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  retired: 'bg-red-100 text-red-700',
  in_review: 'bg-yellow-100 text-yellow-700',
};

const RISK_COLORS: Record<string, string> = {
  unacceptable: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  limited: 'bg-yellow-100 text-yellow-700',
  minimal: 'bg-green-100 text-green-700',
};

export default function AIAgentsPage() {
  const [items, setItems] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<AIAgentForm>(DEFAULT_FORM);
  const [search, setSearch] = useState('');
  const [linksTarget, setLinksTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.aiAgents.getAll();
      const data = res.data?.data ?? res.data ?? [];
      setItems(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load AI agents'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this AI agent?')) return;
    try { await cmdbAPI.aiAgents.remove(id); load(); } catch { setError('Failed to delete item'); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      await cmdbAPI.aiAgents.create(form as unknown as Record<string, unknown>);
      setShowModal(false);
      setForm(DEFAULT_FORM);
      load();
    } catch { setSaveError('Failed to save AI agent'); }
    finally { setSaving(false); }
  };

  const set = (field: string, value: string | boolean) => setForm(f => ({ ...f, [field]: value }));

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/cmdb" className="text-purple-600 hover:underline text-sm">← CMDB</Link>
          <span className="text-gray-300">|</span>
          <Link href="/dashboard/ai-insights" className="text-purple-600 hover:underline text-sm">📈 AI Insights</Link>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 text-white rounded-lg w-12 h-12 flex items-center justify-center text-2xl shadow">🤖</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Agents</h1>
              <p className="text-sm text-gray-500">Models, bots, LLM integrations, and automated AI systems</p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Add New</button>
        </div>

        <input
          type="text"
          placeholder="Search AI agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />

        {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No AI agents found. Add your first one!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Model Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">EU AI Act Risk</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Human Oversight</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Bias Tested</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-gray-600">{item.ai_model_type ?? '—'}</td>
                      <td className="px-4 py-3">
                        {item.ai_risk_level ? (
                          <span className={`${RISK_COLORS[item.ai_risk_level] ?? 'bg-gray-100 text-gray-700'} px-2 py-0.5 rounded-full text-xs font-medium`}>
                            {item.ai_risk_level}
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
                      <td className="px-4 py-3 text-center">{item.ai_human_oversight_required ? '✅' : '❌'}</td>
                      <td className="px-4 py-3 text-center">{item.ai_bias_testing_completed ? '✅' : '❌'}</td>
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
                <h2 className="font-bold text-lg text-gray-900">Add New AI Agent</h2>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Type</label>
                  <select value={form.ai_model_type} onChange={e => set('ai_model_type', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="llm">LLM</option>
                    <option value="computer_vision">Computer Vision</option>
                    <option value="nlp">NLP</option>
                    <option value="recommendation">Recommendation</option>
                    <option value="predictive">Predictive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">EU AI Act Risk Level</label>
                  <select value={form.ai_risk_level} onChange={e => set('ai_risk_level', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="unacceptable">Unacceptable</option>
                    <option value="high">High</option>
                    <option value="limited">Limited</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="retired">Retired</option>
                    <option value="in_review">In Review</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="oversight" checked={form.ai_human_oversight_required}
                    onChange={e => set('ai_human_oversight_required', e.target.checked)}
                    className="h-4 w-4 text-purple-600" />
                  <label htmlFor="oversight" className="text-sm font-medium text-gray-700">Human Oversight Required</label>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="bias" checked={form.ai_bias_testing_completed}
                    onChange={e => set('ai_bias_testing_completed', e.target.checked)}
                    className="h-4 w-4 text-purple-600" />
                  <label htmlFor="bias" className="text-sm font-medium text-gray-700">Bias Testing Completed</label>
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
