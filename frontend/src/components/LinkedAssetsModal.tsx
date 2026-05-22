'use client';

import { useEffect, useState, useCallback } from 'react';
import { cmdbAPI } from '@/lib/api';

interface AssetLink {
  id: string;
  dependency_type: string;
  criticality: string;
  notes?: string;
  related_asset_id: string;
  related_asset_name: string;
  related_category_name: string;
  related_category_code: string;
  direction: 'outbound' | 'inbound';
}

interface AssetOption {
  id: string;
  name: string;
  category_name: string;
  category_code: string;
}

interface Props {
  assetId: string;
  assetName: string;
  onClose: () => void;
}

const DEPENDENCY_TYPES = [
  { value: 'uses',              label: 'Uses' },
  { value: 'requires',         label: 'Requires' },
  { value: 'hosted_on',        label: 'Hosted on' },
  { value: 'communicates_with',label: 'Communicates with' },
];

const CRITICALITY_COLORS: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-green-100 text-green-700',
};

const DIRECTION_LABELS: Record<string, string> = {
  outbound: '→ depends on',
  inbound:  '← used by',
};

const CATEGORY_ICONS: Record<string, string> = {
  hardware:  '🖥️',
  software:  '💿',
  ai_agent:  '🤖',
};

export default function LinkedAssetsModal({ assetId, assetName, onClose }: Props) {
  const [links, setLinks]           = useState<AssetLink[]>([]);
  const [allAssets, setAllAssets]   = useState<AssetOption[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [form, setForm] = useState({
    depends_on_asset_id: '',
    dependency_type: 'uses',
    criticality: 'medium',
    notes: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [linksRes, assetsRes] = await Promise.all([
        cmdbAPI.relationships.getByAsset(assetId),
        cmdbAPI.allAssets(),
      ]);
      setLinks(linksRes.data?.data ?? []);
      // Exclude the current asset from the picker
      const opts: AssetOption[] = (assetsRes.data?.data ?? []).filter(
        (a: AssetOption) => a.id !== assetId
      );
      setAllAssets(opts);
    } catch {
      setError('Failed to load linked assets');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.depends_on_asset_id) return;
    setSaving(true);
    setError('');
    try {
      await cmdbAPI.relationships.create({
        asset_id: assetId,
        depends_on_asset_id: form.depends_on_asset_id,
        dependency_type: form.dependency_type,
        criticality: form.criticality,
        notes: form.notes || undefined,
      });
      setForm({ depends_on_asset_id: '', dependency_type: 'uses', criticality: 'medium', notes: '' });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to add link');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this asset link?')) return;
    try {
      await cmdbAPI.relationships.remove(id);
      load();
    } catch {
      alert('Failed to remove link');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h2 className="font-bold text-lg text-gray-900">Linked Assets</h2>
            <p className="text-sm text-gray-500 mt-0.5">{assetName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
          )}

          {/* Existing links */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Existing Links</h3>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No links yet. Add one below.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {links.map(link => (
                  <li key={`${link.id}-${link.direction}`} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg shrink-0">
                        {CATEGORY_ICONS[link.related_category_code] ?? '📦'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{link.related_asset_name}</p>
                        <p className="text-xs text-gray-500">{link.related_category_name}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {DIRECTION_LABELS[link.direction]}
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0">
                        {DEPENDENCY_TYPES.find(d => d.value === link.dependency_type)?.label ?? link.dependency_type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${CRITICALITY_COLORS[link.criticality] ?? 'bg-gray-100 text-gray-600'}`}>
                        {link.criticality}
                      </span>
                    </div>
                    {link.direction === 'outbound' && (
                      <button
                        onClick={() => handleRemove(link.id)}
                        className="ml-3 text-red-400 hover:text-red-600 text-xs shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add new link */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Link</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Link to asset <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.depends_on_asset_id}
                  onChange={e => setForm(f => ({ ...f, depends_on_asset_id: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <option value="">— select an asset —</option>
                  {allAssets.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.category_name}] {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Relationship type</label>
                  <select
                    value={form.dependency_type}
                    onChange={e => setForm(f => ({ ...f, dependency_type: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    {DEPENDENCY_TYPES.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Criticality</label>
                  <select
                    value={form.criticality}
                    onChange={e => setForm(f => ({ ...f, criticality: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes about this relationship"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !form.depends_on_asset_id}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Linking…' : '🔗 Add Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
