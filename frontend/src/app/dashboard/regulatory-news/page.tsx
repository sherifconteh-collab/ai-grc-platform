// @tier: community
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { regulatoryNewsAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string;
  title: string;
  source: string;
  content: string | null;
  url: string | null;
  impact_level: string | null;
  relevant_frameworks: string[] | null;
  keywords: string[] | null;
  is_read: boolean;
  is_archived: boolean;
  is_bookmarked: boolean;
  published_at: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
};

function ImpactBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const cls = IMPACT_COLORS[level] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>
      {level}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function RegulatoryNewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, unknown> = { limit: 100 };
      if (filter === 'unread') params.is_read = false;
      if (filter === 'archived') params.is_archived = true;
      const res = await regulatoryNewsAPI.getItems(params as Parameters<typeof regulatoryNewsAPI.getItems>[0]);
      setItems(res.data?.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load regulatory news');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await regulatoryNewsAPI.refresh();
      await fetchItems();
    } catch (err) {
      console.error('Failed to refresh news:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh news');
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await regulatoryNewsAPI.updateItem(id, { is_read: true });
      setItems(prev => prev.map(item => item.id === id ? { ...item, is_read: true } : item));
    } catch { /* ignore */ }
  };

  const handleArchive = async (id: string) => {
    try {
      await regulatoryNewsAPI.updateItem(id, { is_archived: true });
      setItems(prev => prev.map(item => item.id === id ? { ...item, is_archived: true } : item));
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await regulatoryNewsAPI.markAllRead();
      setItems(prev => prev.map(item => ({ ...item, is_read: true })));
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const unreadCount = items.filter(i => !i.is_read).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📰 Regulatory News</h1>
            <p className="text-gray-600 mt-1">
              Stay informed on regulatory changes, compliance updates, and AI governance news.
            </p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            {([
              { key: 'all' as const, label: 'All' },
              { key: 'unread' as const, label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
              { key: 'archived' as const, label: 'Archived' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`py-2 px-1 border-b-2 text-sm font-medium ${
                  filter === key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">Loading news...</span>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No regulatory news items found.</p>
            <p className="text-gray-400 text-sm mt-1">Click Refresh to fetch the latest updates.</p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="space-y-3">
            {items.map((item) => {
              const isExpanded = expandedItems.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${!item.is_read ? 'border-l-4 border-l-blue-500' : ''}`}
                >
                  <button
                    onClick={() => {
                      toggleExpand(item.id);
                      if (!item.is_read) handleMarkRead(item.id);
                    }}
                    className="w-full text-left p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <ImpactBadge level={item.impact_level} />
                          <span className="text-xs text-gray-400">{item.source}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(item.published_at || item.created_at).toLocaleDateString()}
                          </span>
                          {!item.is_read && (
                            <span className="inline-flex w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        <h3 className={`text-sm ${!item.is_read ? 'font-bold' : 'font-medium'} text-gray-900`}>
                          {item.title}
                        </h3>
                        {item.relevant_frameworks && item.relevant_frameworks.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {item.relevant_frameworks.map((fw) => (
                              <span key={fw} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                {fw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-gray-400 ml-2">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      {item.content && (
                        <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap leading-relaxed">
                          {item.content}
                        </p>
                      )}
                      <div className="flex gap-3 mt-3">
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Read original →
                          </a>
                        )}
                        {!item.is_archived && (
                          <button
                            onClick={() => handleArchive(item.id)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
