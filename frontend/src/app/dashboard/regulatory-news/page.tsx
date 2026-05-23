// @tier: community
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { regulatoryNewsAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string;
  source: string;
  title: string;
  summary?: string;
  url: string;
  published_at: string;
  relevant_frameworks?: string[];
  impact_level?: string;
  keywords?: string[];
  is_read: boolean;
  is_archived: boolean;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SOURCE_ICONS: Record<string, string> = {
  fedramp: '🇺🇸',
  nist: '📐',
  cisa: '⚡',
  gdpr: '🇪🇺',
  hipaa: '🏥',
  pci: '💳',
  iso: '🌐',
  sec: '📈',
  finra: '🏦',
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function sourceIcon(source: string) {
  const key = Object.keys(SOURCE_ICONS).find(k => source?.toLowerCase().includes(k));
  return key ? SOURCE_ICONS[key] : '📰';
}

export default function RegulatoryNewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // Filters
  const [showArchived, setShowArchived] = useState(false);
  const [impactFilter, setImpactFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [itemsRes, countRes] = await Promise.all([
        regulatoryNewsAPI.getItems({ is_archived: showArchived ? undefined : false, limit: 100 }),
        regulatoryNewsAPI.getUnreadCount(),
      ]);
      setItems(itemsRes.data?.data || []);
      setUnreadCount(countRes.data?.data?.count ?? 0);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to load regulatory news');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { loadData(); }, [loadData]);

  async function markRead(id: string) {
    try {
      await regulatoryNewsAPI.updateItem(id, { is_read: true });
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  async function archive(id: string) {
    try {
      await regulatoryNewsAPI.updateItem(id, { is_archived: true });
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      // silent
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await regulatoryNewsAPI.refresh();
      await loadData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to refresh news');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await regulatoryNewsAPI.markAllRead();
      setItems(prev => prev.map(i => ({ ...i, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    } finally {
      setMarkingAll(false);
    }
  }

  const filtered = items.filter(i => {
    if (unreadOnly && i.is_read) return false;
    if (impactFilter && i.impact_level !== impactFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-gray-500">Loading regulatory news…</p>
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
            <h1 className="text-2xl font-bold text-gray-900">Regulatory News</h1>
            <p className="mt-1 text-sm text-gray-500">
              Stay current with compliance updates from FedRAMP, NIST, CISA, GDPR, HIPAA, PCI-DSS, and more.
            </p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} disabled={markingAll}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-50">
                {markingAll ? 'Marking…' : `Mark All Read (${unreadCount})`}
              </button>
            )}
            <button onClick={handleRefresh} disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
              {refreshing ? '⏳ Refreshing…' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
        )}

        {/* Context link */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 text-sm">
          <span className="text-blue-600">🔗</span>
          <span className="text-blue-800">
            News items are tagged to frameworks. Navigate to&nbsp;
            <Link href="/dashboard/frameworks" className="font-medium underline hover:no-underline">Frameworks</Link>
            &nbsp;or&nbsp;
            <Link href="/dashboard/controls" className="font-medium underline hover:no-underline">Controls</Link>
            &nbsp;to see impact on your active compliance programs.
          </span>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 flex-wrap text-sm">
          <div className="bg-white rounded-xl border px-4 py-3 flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{unreadCount}</span>
            <span className="text-gray-500">Unread</span>
          </div>
          <div className="bg-white rounded-xl border px-4 py-3 flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{items.filter(i => i.impact_level === 'critical' || i.impact_level === 'high').length}</span>
            <span className="text-gray-500">High Impact</span>
          </div>
          <div className="bg-white rounded-xl border px-4 py-3 flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{items.length}</span>
            <span className="text-gray-500">Total Items</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select value={impactFilter} onChange={e => setImpactFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Impact Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} className="rounded" />
            Unread only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
            Show archived
          </label>
        </div>

        {/* News list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border">
            <div className="text-4xl mb-3">📰</div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No news items</h3>
            <p className="text-sm text-gray-500">Click Refresh to pull the latest regulatory updates.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <div key={item.id} className={`bg-white rounded-xl border p-4 transition-colors ${!item.is_read ? 'border-l-4 border-l-blue-500' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base">{sourceIcon(item.source)}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 uppercase font-medium">{item.source}</span>
                      {item.impact_level && (
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${IMPACT_COLORS[item.impact_level] || IMPACT_COLORS.info}`}>
                          {item.impact_level} impact
                        </span>
                      )}
                      {!item.is_read && <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">New</span>}
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      onClick={() => !item.is_read && markRead(item.id)}
                      className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline line-clamp-2">
                      {item.title}
                    </a>
                    {item.summary && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.summary}</p>
                    )}
                    <div className="flex gap-3 mt-2 text-xs text-gray-400">
                      <span>{fmtDate(item.published_at)}</span>
                      {Array.isArray(item.relevant_frameworks) && item.relevant_frameworks.length > 0 && (
                        <span>Frameworks: {item.relevant_frameworks.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!item.is_read && (
                      <button onClick={() => markRead(item.id)}
                        className="text-xs px-2 py-1 border rounded hover:bg-green-50 text-green-700 border-green-200">
                        Mark Read
                      </button>
                    )}
                    <button onClick={() => archive(item.id)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-100 text-gray-500">
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
