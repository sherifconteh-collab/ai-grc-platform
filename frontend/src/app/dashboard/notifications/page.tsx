// @tier: community
'use client';

import { useEffect, useState, Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { notificationsAPI } from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  control_due: 'Control Due',
  assessment_needed: 'Assessment',
  status_change: 'Status Change',
  system: 'System',
  crosswalk: 'Crosswalk',
};

const TYPE_ICONS: Record<string, string> = {
  control_due: '⏰',
  assessment_needed: '📋',
  status_change: '🔄',
  crosswalk: '🔗',
  system: '⚙️',
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

function NotificationCenterInner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await notificationsAPI.getAll({
        limit: 50,
        page: p,
        unread: unreadOnly ? 'true' : undefined,
        type: typeFilter || undefined,
      });
      const data = res.data?.data || res.data || {};
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); setPage(1); }, [typeFilter, unreadOnly]);
  useEffect(() => { load(page); }, [page]);

  const handleMarkRead = async (id: string) => {
    await notificationsAPI.markRead(id).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await notificationsAPI.markAllRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    setMarkingAll(false);
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) handleMarkRead(n.id);
    if (n.link) window.location.href = n.link;
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
            >
              {markingAll ? 'Marking...' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={e => setUnreadOnly(e.target.checked)}
              className="rounded"
            />
            Unread only
          </label>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">🔔</div>
            <p className="text-gray-500">No notifications</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
                  n.is_read
                    ? 'bg-white border-gray-100 hover:bg-gray-50'
                    : 'bg-purple-50 border-purple-100 hover:bg-purple-100'
                }`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">
                  {TYPE_ICONS[n.type] || '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium text-sm ${n.is_read ? 'text-gray-700' : 'text-gray-900'}`}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0" />
                    )}
                    <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                      {formatTime(n.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                    {TYPE_LABELS[n.type] || n.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {notifications.length === 50 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm text-purple-600 hover:text-purple-700 disabled:opacity-30"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">Page {page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              className="text-sm text-purple-600 hover:text-purple-700"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-12 text-center text-gray-400">Loading…</div></DashboardLayout>}>
      <NotificationCenterInner />
    </Suspense>
  );
}
