'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import api from '@/lib/api';

interface CustomFramework {
  id: string;
  code: string;
  name: string;
  version: string;
  category: string;
  description: string | null;
  is_published: boolean;
  control_count: number;
  created_at: string;
}

interface CustomControl {
  id: string;
  control_id: string;
  title: string;
  description: string | null;
  priority: string;
  control_type: string;
  sort_order: number;
}

interface FrameworkDetail extends CustomFramework {
  controls: CustomControl[];
}

const PRIORITY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const TYPE_OPTIONS = ['technical', 'administrative', 'operational', 'physical', 'policy'];

export default function CustomFrameworkBuilderPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'frameworks.manage');

  const [frameworks, setFrameworks] = useState<CustomFramework[]>([]);
  const [selected, setSelected] = useState<FrameworkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newFw, setNewFw] = useState({ code: '', name: '', version: '1.0', category: 'custom', description: '' });

  const [showAddControl, setShowAddControl] = useState(false);
  const [newCtrl, setNewCtrl] = useState({ control_id: '', title: '', description: '', priority: 'medium', control_type: 'technical' });
  const [editingCtrl, setEditingCtrl] = useState<CustomControl | null>(null);

  const [showClone, setShowClone] = useState(false);
  const [cloneSource, setCloneSource] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [cloneCode, setCloneCode] = useState('');

  const loadFrameworks = useCallback(async () => {
    try {
      const res = await api.get('/frameworks/custom');
      setFrameworks(res.data?.data || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load custom frameworks.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFrameworks(); }, [loadFrameworks]);

  const openFramework = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/frameworks/custom/${id}`);
      setSelected(res.data?.data || null);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load framework.' });
    }
  }, []);

  const createFramework = useCallback(async () => {
    if (!newFw.code.trim() || !newFw.name.trim()) return;
    try {
      await api.post('/frameworks/custom', newFw);
      setShowCreate(false);
      setNewFw({ code: '', name: '', version: '1.0', category: 'custom', description: '' });
      setMessage({ type: 'success', text: 'Framework created.' });
      loadFrameworks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create framework.';
      setMessage({ type: 'error', text: msg });
    }
  }, [newFw, loadFrameworks]);

  const deleteFramework = useCallback(async (id: string) => {
    if (!confirm('Delete this custom framework?')) return;
    try {
      await api.delete(`/frameworks/custom/${id}`);
      if (selected?.id === id) setSelected(null);
      setMessage({ type: 'success', text: 'Framework deleted.' });
      loadFrameworks();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete framework.' });
    }
  }, [selected, loadFrameworks]);

  const togglePublish = useCallback(async (id: string) => {
    try {
      const res = await api.post(`/frameworks/custom/${id}/publish`);
      const published = res.data?.data?.is_published;
      setMessage({ type: 'success', text: published ? 'Framework published.' : 'Framework unpublished.' });
      loadFrameworks();
      if (selected?.id === id) openFramework(id);
    } catch {
      setMessage({ type: 'error', text: 'Failed to update publish state.' });
    }
  }, [selected, loadFrameworks, openFramework]);

  const addControl = useCallback(async () => {
    if (!selected || !newCtrl.control_id.trim() || !newCtrl.title.trim()) return;
    try {
      await api.post(`/frameworks/custom/${selected.id}/controls`, newCtrl);
      setShowAddControl(false);
      setNewCtrl({ control_id: '', title: '', description: '', priority: 'medium', control_type: 'technical' });
      setMessage({ type: 'success', text: 'Control added.' });
      openFramework(selected.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add control.';
      setMessage({ type: 'error', text: msg });
    }
  }, [selected, newCtrl, openFramework]);

  const saveControl = useCallback(async () => {
    if (!selected || !editingCtrl) return;
    try {
      await api.put(`/frameworks/custom/${selected.id}/controls/${editingCtrl.control_id}`, editingCtrl);
      setEditingCtrl(null);
      setMessage({ type: 'success', text: 'Control updated.' });
      openFramework(selected.id);
    } catch {
      setMessage({ type: 'error', text: 'Failed to update control.' });
    }
  }, [selected, editingCtrl, openFramework]);

  const deleteControl = useCallback(async (controlId: string) => {
    if (!selected) return;
    try {
      await api.delete(`/frameworks/custom/${selected.id}/controls/${controlId}`);
      setMessage({ type: 'success', text: 'Control removed.' });
      openFramework(selected.id);
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete control.' });
    }
  }, [selected, openFramework]);

  const cloneFramework = useCallback(async () => {
    if (!cloneSource || !cloneName.trim() || !cloneCode.trim()) return;
    try {
      await api.post(`/frameworks/custom/clone/${cloneSource}`, { name: cloneName, code: cloneCode });
      setShowClone(false);
      setCloneSource('');
      setCloneName('');
      setCloneCode('');
      setMessage({ type: 'success', text: 'Framework cloned successfully.' });
      loadFrameworks();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Clone failed.';
      setMessage({ type: 'error', text: msg });
    }
  }, [cloneSource, cloneName, cloneCode, loadFrameworks]);

  const priorityColor = (p: string) => {
    if (p === 'critical') return 'bg-red-100 text-red-700';
    if (p === 'high') return 'bg-orange-100 text-orange-700';
    if (p === 'medium') return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Custom Framework Builder</h1>
            <p className="text-gray-600 mt-1">Build org-specific compliance frameworks with custom controls.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/frameworks" className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
              All Frameworks
            </Link>
            {canManage && (
              <>
                <button onClick={() => setShowClone(true)} className="px-4 py-2 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50">
                  Clone from Seeded
                </button>
                <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  + New Framework
                </button>
              </>
            )}
          </div>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {message.text}
            <button className="ml-2 text-xs opacity-70 hover:opacity-100" onClick={() => setMessage(null)}>Dismiss</button>
          </div>
        )}

        {showCreate && (
          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900">New Custom Framework</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code (unique identifier)</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. my-security-policy" value={newFw.code} onChange={(e) => setNewFw({ ...newFw, code: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. Internal Security Policy v2" value={newFw.name} onChange={(e) => setNewFw({ ...newFw, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={newFw.version} onChange={(e) => setNewFw({ ...newFw, version: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={newFw.category} onChange={(e) => setNewFw({ ...newFw, category: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm" rows={2} value={newFw.description} onChange={(e) => setNewFw({ ...newFw, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={createFramework} disabled={!newFw.code.trim() || !newFw.name.trim()} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">Create</button>
            </div>
          </div>
        )}

        {showClone && (
          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-900">Clone from Seeded Framework</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Framework Code</label>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. nist_csf_2.0" value={cloneSource} onChange={(e) => setCloneSource(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Name</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Code</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={cloneCode} onChange={(e) => setCloneCode(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClone(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={cloneFramework} disabled={!cloneSource || !cloneName.trim() || !cloneCode.trim()} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">Clone</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" /></div>
        ) : frameworks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No custom frameworks yet.</p>
            <p className="text-sm mt-1">Click <strong>+ New Framework</strong> or <strong>Clone from Seeded</strong> to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {frameworks.map((fw) => (
              <div key={fw.id} className={`bg-white border-2 rounded-xl p-5 cursor-pointer transition ${selected?.id === fw.id ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`} onClick={() => openFramework(fw.id)}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{fw.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{fw.code}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${fw.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {fw.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{fw.description || 'No description.'}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold">{fw.control_count} controls</span>
                  {canManage && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => togglePublish(fw.id)} className="hover:text-purple-700">{fw.is_published ? 'Unpublish' : 'Publish'}</button>
                      <button onClick={() => deleteFramework(fw.id)} className="hover:text-red-600">Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="bg-white border rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.name}</h2>
                <p className="text-sm text-gray-500 font-mono">{selected.code} · v{selected.version}</p>
              </div>
              {canManage && (
                <button onClick={() => setShowAddControl(true)} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  + Add Control
                </button>
              )}
            </div>

            {showAddControl && (
              <div className="px-6 py-4 border-b bg-purple-50 space-y-3">
                <h3 className="font-medium text-gray-800">New Control</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Control ID</label>
                    <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. AC-1" value={newCtrl.control_id} onChange={(e) => setNewCtrl({ ...newCtrl, control_id: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                    <input className="w-full border rounded px-3 py-1.5 text-sm" value={newCtrl.title} onChange={(e) => setNewCtrl({ ...newCtrl, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                    <select className="w-full border rounded px-3 py-1.5 text-sm" value={newCtrl.priority} onChange={(e) => setNewCtrl({ ...newCtrl, priority: e.target.value })}>
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select className="w-full border rounded px-3 py-1.5 text-sm" value={newCtrl.control_type} onChange={(e) => setNewCtrl({ ...newCtrl, control_type: e.target.value })}>
                      {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea className="w-full border rounded px-3 py-1.5 text-sm" rows={2} value={newCtrl.description} onChange={(e) => setNewCtrl({ ...newCtrl, description: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddControl(false)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Cancel</button>
                  <button onClick={addControl} disabled={!newCtrl.control_id.trim() || !newCtrl.title.trim()} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">Add</button>
                </div>
              </div>
            )}

            {selected.controls.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">No controls yet. Click <strong>+ Add Control</strong> to begin.</div>
            ) : (
              <div className="divide-y">
                {selected.controls.map((ctrl) => (
                  <div key={ctrl.id} className="px-6 py-4">
                    {editingCtrl?.id === ctrl.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input className="border rounded px-2 py-1 text-sm" value={editingCtrl.title} onChange={(e) => setEditingCtrl({ ...editingCtrl, title: e.target.value })} />
                          <select className="border rounded px-2 py-1 text-sm" value={editingCtrl.priority} onChange={(e) => setEditingCtrl({ ...editingCtrl, priority: e.target.value })}>
                            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <select className="border rounded px-2 py-1 text-sm" value={editingCtrl.control_type} onChange={(e) => setEditingCtrl({ ...editingCtrl, control_type: e.target.value })}>
                            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <textarea className="w-full border rounded px-2 py-1 text-sm" rows={2} value={editingCtrl.description || ''} onChange={(e) => setEditingCtrl({ ...editingCtrl, description: e.target.value })} />
                        <div className="flex gap-2">
                          <button onClick={saveControl} className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">Save</button>
                          <button onClick={() => setEditingCtrl(null)} className="px-3 py-1 text-xs border rounded hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-500">{ctrl.control_id}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColor(ctrl.priority)}`}>{ctrl.priority}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ctrl.control_type}</span>
                          </div>
                          <p className="font-medium text-gray-900 mt-1">{ctrl.title}</p>
                          {ctrl.description && <p className="text-sm text-gray-500 mt-0.5">{ctrl.description}</p>}
                        </div>
                        {canManage && (
                          <div className="flex gap-2 text-xs shrink-0">
                            <button onClick={() => setEditingCtrl(ctrl)} className="text-purple-600 hover:text-purple-800">Edit</button>
                            <button onClick={() => deleteControl(ctrl.control_id)} className="text-red-500 hover:text-red-700">Delete</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
