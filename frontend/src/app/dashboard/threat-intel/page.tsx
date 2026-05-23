// @tier: enterprise
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { threatIntelAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

// ─── Types ───────────────────────────────────────────────────────────────────

type FeedType = 'nvd' | 'cisa_kev' | 'mitre' | 'otx';
type SyncStatus = 'success' | 'error' | 'pending' | 'never';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface ThreatFeed {
  id: string;
  feed_type: FeedType;
  feed_name: string;
  is_enabled: boolean;
  last_sync_at?: string;
  last_sync_status?: SyncStatus;
  sync_error_message?: string;
  rate_limit_remaining?: number;
  created_at: string;
}

interface ThreatItem {
  id: string;
  feed_id: string;
  item_type: string;
  external_id: string;
  title: string;
  description?: string;
  severity?: Severity;
  cvss_score?: number;
  exploit_available?: boolean;
  published_at?: string;
  due_date?: string;
}

interface ThreatStats {
  total_items?: number;
  critical_count?: number;
  high_count?: number;
  exploit_available_count?: number;
  feeds_active?: number;
  last_sync?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FEED_META: Record<FeedType, { label: string; description: string; icon: string }> = {
  nvd: { label: 'NIST NVD', description: 'National Vulnerability Database — CVE/CVSS data', icon: '🇺🇸' },
  cisa_kev: { label: 'CISA KEV', description: 'Known Exploited Vulnerabilities catalog', icon: '⚡' },
  mitre: { label: 'MITRE ATT&CK', description: 'Adversary tactics and techniques', icon: '🎯' },
  otx: { label: 'AlienVault OTX', description: 'Open Threat Exchange community feeds', icon: '👁️' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SYNC_COLORS: Record<string, string> = {
  success: 'text-green-600',
  error: 'text-red-600',
  pending: 'text-yellow-600',
  never: 'text-gray-400',
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type ActiveTab = 'feeds' | 'items';

const emptyFeedForm = {
  feed_type: 'nvd' as FeedType,
  feed_name: '',
  is_enabled: true,
  api_key: '',
};

export default function ThreatIntelPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'organizations.write');
  const [activeTab, setActiveTab] = useState<ActiveTab>('feeds');
  const [feeds, setFeeds] = useState<ThreatFeed[]>([]);
  const [items, setItems] = useState<ThreatItem[]>([]);
  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Feed modal
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [feedForm, setFeedForm] = useState(emptyFeedForm);
  const [feedSaving, setFeedSaving] = useState(false);

  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [exploitFilter, setExploitFilter] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [feedsRes, statsRes] = await Promise.all([
        threatIntelAPI.getFeeds(),
        threatIntelAPI.getStats(),
      ]);
      setFeeds(feedsRes.data?.data || []);
      setStats(statsRes.data?.data || {});
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to load threat intelligence data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { limit: 100 };
      if (severityFilter) params.severity = severityFilter;
      if (exploitFilter) params.exploit_available = true;
      const res = await threatIntelAPI.getItems(params as Parameters<typeof threatIntelAPI.getItems>[0]);
      setItems(res.data?.data || []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      console.error('Failed to load items:', e.response?.data?.error);
    }
  }, [severityFilter, exploitFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (activeTab === 'items') loadItems();
  }, [activeTab, loadItems]);

  async function saveFeed() {
    if (!feedForm.feed_name.trim()) return;
    setFeedSaving(true);
    try {
      await threatIntelAPI.createFeed({
        feed_type: feedForm.feed_type,
        feed_name: feedForm.feed_name,
        is_enabled: feedForm.is_enabled,
        ...(feedForm.api_key ? { api_key: feedForm.api_key } : {}),
      });
      setShowFeedModal(false);
      setFeedForm(emptyFeedForm);
      await loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setActionError(e.response?.data?.error || 'Failed to add feed');
    } finally {
      setFeedSaving(false);
    }
  }

  async function syncFeed(id: string, name: string) {
    setSyncing(id);
    try {
      await threatIntelAPI.syncFeed(id);
      await loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setActionError(e.response?.data?.error || `Failed to sync ${name}`);
    } finally {
      setSyncing(null);
    }
  }

  async function syncAll() {
    setSyncing('all');
    try {
      await threatIntelAPI.syncAll();
      await loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setActionError(e.response?.data?.error || 'Failed to sync all feeds');
    } finally {
      setSyncing(null);
    }
  }

  async function deleteFeed(id: string, name: string) {
    if (!confirm(`Delete feed "${name}"?`)) return;
    try {
      await threatIntelAPI.deleteFeed(id);
      await loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setActionError(e.response?.data?.error || 'Failed to delete feed');
    }
  }

  const filteredItems = items.filter(item => {
    if (severityFilter && item.severity !== severityFilter) return false;
    if (exploitFilter && !item.exploit_available) return false;
    return true;
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500">Loading threat intelligence…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Threat Intelligence</h1>
            <p className="mt-1 text-sm text-gray-500">
              Aggregate CVEs, KEVs, MITRE ATT&CK techniques, and threat indicators from external feeds.
            </p>
          </div>
          <div className="flex gap-2">
            {canWrite && feeds.length > 0 && (
              <button onClick={syncAll} disabled={syncing === 'all'}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-50">
                {syncing === 'all' ? '⏳ Syncing…' : '🔄 Sync All'}
              </button>
            )}
            {canWrite && (
            <button onClick={() => setShowFeedModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              + Add Feed
            </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm flex items-center justify-between">
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 ml-3">✕</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="text-2xl font-bold text-gray-900">{feeds.filter(f => f.is_enabled).length}</div>
            <div className="text-sm text-gray-500 mt-1">Active Feeds</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-2xl font-bold text-red-600">{stats?.critical_count ?? '—'}</div>
            <div className="text-sm text-gray-500 mt-1">Critical Items</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-2xl font-bold text-orange-600">{stats?.exploit_available_count ?? '—'}</div>
            <div className="text-sm text-gray-500 mt-1">Exploit Available</div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="text-2xl font-bold text-gray-900">{stats?.total_items ?? '—'}</div>
            <div className="text-sm text-gray-500 mt-1">Total Items</div>
          </div>
        </div>

        {/* Cross-feature link */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Link href="/dashboard/vulnerabilities"
            className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-xs">
            <span className="text-lg">🔍</span>
            <div>
              <div className="font-medium text-red-800">Vulnerabilities</div>
              <div className="text-red-600">CVE & KEV correlation with assets</div>
            </div>
          </Link>
          <Link href="/dashboard/assets"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span className="text-lg">🏗️</span>
            <div>
              <div className="font-medium text-blue-800">Assets</div>
              <div className="text-blue-600">Automatically correlated inventory</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-xs">
            <span className="text-lg">📊</span>
            <div>
              <div className="font-medium text-slate-800">AI Insights</div>
              <div className="text-slate-600">Rules triggered by threat feeds</div>
            </div>
          </Link>
          <Link href="/dashboard/plot4ai"
            className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors text-xs">
            <span className="text-lg">🃏</span>
            <div>
              <div className="font-medium text-indigo-800">AI Threat Library</div>
              <div className="text-indigo-600">PLOT4ai threat modeling cards</div>
            </div>
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {(['feeds', 'items'] as ActiveTab[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {tab === 'feeds' ? `📡 Feeds (${feeds.length})` : `🛡️ Intelligence Items`}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Feeds Tab ── */}
        {activeTab === 'feeds' && (
          <div className="space-y-3">
            {feeds.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <div className="text-4xl mb-3">📡</div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No threat feeds configured</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Connect NVD, CISA KEV, MITRE ATT&CK, or AlienVault OTX to automatically pull threat intelligence.
                </p>
                {canWrite && (
                <button onClick={() => setShowFeedModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  Add First Feed
                </button>
                )}
              </div>
            ) : (
              feeds.map(feed => {
                const meta = FEED_META[feed.feed_type];
                return (
                  <div key={feed.id} className="bg-white rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{meta?.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{feed.feed_name}</h3>
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{meta?.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${feed.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {feed.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{meta?.description}</p>
                          <div className="flex gap-4 text-xs text-gray-400 mt-1">
                            <span className={SYNC_COLORS[feed.last_sync_status || 'never']}>
                              Last sync: {feed.last_sync_status === 'never' ? 'Never' : fmtDateTime(feed.last_sync_at)}
                              {feed.last_sync_status === 'error' && feed.sync_error_message && (
                                <span className="ml-1">— {feed.sync_error_message}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {canWrite && <button onClick={() => syncFeed(feed.id, feed.feed_name)} disabled={syncing === feed.id}
                          className="text-xs px-3 py-1.5 border rounded-lg hover:bg-blue-50 text-blue-600 border-blue-200 disabled:opacity-50">
                          {syncing === feed.id ? '⏳' : '🔄'} Sync
                        </button>}
                        {canWrite && <button onClick={() => deleteFeed(feed.id, feed.feed_name)}
                          className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-600">
                          Delete
                        </button>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Items Tab ── */}
        {activeTab === 'items' && (
          <div className="space-y-4">
            <div className="flex gap-3 flex-wrap">
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exploitFilter} onChange={e => setExploitFilter(e.target.checked)} className="rounded" />
                Exploit available only
              </label>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border">
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-gray-500 text-sm">
                  {items.length === 0 ? 'No intelligence items yet. Sync a feed to pull data.' : 'No items match the current filters.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">ID / Title</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Severity</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">CVSS</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Exploit</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Published</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-blue-700">{item.external_id}</div>
                          <div className="text-sm text-gray-800 line-clamp-1">{item.title}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {item.item_type?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.severity ? (
                            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${SEVERITY_COLORS[item.severity]}`}>
                              {item.severity}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {item.cvss_score != null ? (
                            <span className={item.cvss_score >= 9 ? 'text-red-600' : item.cvss_score >= 7 ? 'text-orange-600' : 'text-gray-700'}>
                              {item.cvss_score.toFixed(1)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {item.exploit_available
                            ? <span className="text-red-600 font-medium text-xs">⚡ Yes</span>
                            : <span className="text-gray-400 text-xs">No</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(item.published_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Feed Modal */}
      {showFeedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">Add Threat Intelligence Feed</h2>
              <button onClick={() => setShowFeedModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Feed Type *</label>
                <select value={feedForm.feed_type}
                  onChange={e => setFeedForm(f => ({
                    ...f,
                    feed_type: e.target.value as FeedType,
                    feed_name: FEED_META[e.target.value as FeedType]?.label || ''
                  }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {(Object.keys(FEED_META) as FeedType[]).map(t => (
                    <option key={t} value={t}>{FEED_META[t].icon} {FEED_META[t].label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{FEED_META[feedForm.feed_type]?.description}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name *</label>
                <input type="text" value={feedForm.feed_name}
                  onChange={e => setFeedForm(f => ({ ...f, feed_name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              {(feedForm.feed_type === 'otx') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input type="password" value={feedForm.api_key}
                    onChange={e => setFeedForm(f => ({ ...f, api_key: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="OTX API key (required for authenticated access)" />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={feedForm.is_enabled}
                  onChange={e => setFeedForm(f => ({ ...f, is_enabled: e.target.checked }))} className="rounded" />
                Enable feed immediately
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowFeedModal(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">Cancel</button>
              <button onClick={saveFeed} disabled={feedSaving || !feedForm.feed_name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {feedSaving ? 'Adding…' : 'Add Feed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
