// @tier: platform
'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

type Tab = 'rate-limits' | 'sessions' | 'headers' | 'audit-logs';

// ─── Rate Limits ─────────────────────────────────────────────────────────────

interface RateLimitEntry {
  label: string;
  windowMs: number;
  max: number;
}

interface RateLimitsData {
  auth: RateLimitEntry;
  refresh: RateLimitEntry;
  api: RateLimitEntry;
  platformAdmin: RateLimitEntry;
}

function formatWindow(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms < 3_600_000) return `${ms / 60_000}m`;
  return `${ms / 3_600_000}h`;
}

function RateLimitsTab() {
  const [data, setData] = useState<RateLimitsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    platformAdminAPI.getSecurityRateLimits()
      .then((res) => setData(res.data?.data ?? null))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'Failed to load rate limits');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-500 py-4">Loading…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>;
  if (!data) return null;

  const entries = Object.values(data) as RateLimitEntry[];

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
        Rate limits are configured via environment variables and take effect at server startup. Changes require a redeploy.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map((entry) => (
          <div key={entry.label} className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="text-sm font-semibold text-gray-700">{entry.label}</div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Window</div>
                <div className="mt-1 text-xl font-bold text-gray-900">{formatWindow(entry.windowMs)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Max Requests</div>
                <div className="mt-1 text-xl font-bold text-gray-900">{entry.max.toLocaleString()}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  org_name: string;
  created_at: string;
  expires_at: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function SessionsTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmRevokeUser, setConfirmRevokeUser] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const limit = 50;

  const fetchSessions = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await platformAdminAPI.getActiveSessions({ page: p, limit });
      setSessions(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(page); }, [fetchSessions, page]);

  async function handleRevoke(sessionId: string) {
    setRevoking(true);
    try {
      await platformAdminAPI.revokeSession(sessionId);
      setConfirmRevoke(null);
      await fetchSessions(page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to revoke session');
    } finally {
      setRevoking(false);
    }
  }

  async function handleRevokeUser(userId: string) {
    setRevoking(true);
    try {
      await platformAdminAPI.revokeUserSessions(userId);
      setConfirmRevokeUser(null);
      await fetchSessions(page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to revoke user sessions');
    } finally {
      setRevoking(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Active Sessions</h3>
            <p className="text-xs text-gray-500">{total.toLocaleString()} active sessions platform-wide</p>
          </div>
        </div>
        {loading ? (
          <div className="px-6 py-6 text-sm text-gray-500">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-6 text-sm text-gray-500">No active sessions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{s.full_name}</div>
                      <div className="text-xs text-gray-500">{s.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.org_name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.expires_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {confirmRevoke === s.id ? (
                          <>
                            <button
                              onClick={() => handleRevoke(s.id)}
                              disabled={revoking}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmRevoke(null)}
                              className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmRevoke(s.id)}
                            className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50"
                          >
                            Revoke
                          </button>
                        )}
                        {confirmRevokeUser === s.user_id ? (
                          <>
                            <button
                              onClick={() => handleRevokeUser(s.user_id)}
                              disabled={revoking}
                              className="text-xs px-2 py-1 bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50"
                            >
                              Confirm all
                            </button>
                            <button
                              onClick={() => setConfirmRevokeUser(null)}
                              className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmRevokeUser(s.user_id)}
                            className="text-xs px-2 py-1 text-gray-500 border border-gray-200 rounded hover:bg-gray-50"
                          >
                            Revoke all for user
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Headers ──────────────────────────────────────────────────────────────────

interface HeadersData {
  corsOrigins: string[];
  headers: Record<string, string>;
}

function HeadersTab() {
  const [data, setData] = useState<HeadersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    platformAdminAPI.getSecurityHeaders()
      .then((res) => setData(res.data?.data ?? null))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'Failed to load security headers');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-500 py-4">Loading…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
        Security headers are set in <code className="font-mono bg-amber-100 px-1 rounded">server.js</code> and require a redeploy to change.
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Response Headers</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-56">Header</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(Object.entries(data.headers) as [string, string][]).map(([name, value]) => (
              <tr key={name} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{name}</td>
                <td className="px-4 py-3 text-xs text-gray-600 break-all">{value}</td>
                <td className="px-4 py-3">
                  {value.startsWith('(') ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Inactive</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="text-sm font-semibold text-gray-700 mb-2">CORS Allowed Origins</div>
        <div className="flex flex-wrap gap-2">
          {data.corsOrigins.map((origin) => (
            <code key={origin} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">{origin}</code>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  created_at: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  success: boolean;
  outcome: string | null;
  failure_reason: string | null;
  user_email: string | null;
  user_name: string | null;
  org_name: string | null;
  organization_id: string | null;
}

function OutcomeBadge({ outcome, success }: { outcome: string | null; success: boolean }) {
  const label = outcome || (success ? 'success' : 'failure');
  if (label === 'success') {
    return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">Success</span>;
  }
  if (label === 'failure') {
    return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">Failure</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">{label}</span>;
}

function exportCsv(logs: AuditLog[]) {
  const header = ['Date', 'User', 'Org', 'Event Type', 'Resource Type', 'Outcome', 'IP', 'Failure Reason'];
  const rows = logs.map((l) => [
    l.created_at,
    l.user_email ?? '',
    l.org_name ?? '',
    l.event_type,
    l.resource_type ?? '',
    l.outcome ?? (l.success ? 'success' : 'failure'),
    l.ip_address ?? '',
    l.failure_reason ?? ''
  ]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    eventType: '', outcome: '', startDate: '', endDate: '', orgId: ''
  });
  const limit = 50;

  const fetchLogs = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await platformAdminAPI.getPlatformAuditLogs({
        page: p,
        limit,
        ...(filters.eventType ? { eventType: filters.eventType } : {}),
        ...(filters.outcome ? { outcome: filters.outcome } : {}),
        ...(filters.startDate ? { startDate: filters.startDate } : {}),
        ...(filters.endDate ? { endDate: filters.endDate } : {}),
        ...(filters.orgId ? { orgId: filters.orgId } : {}),
      });
      setLogs(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchLogs(page); }, [fetchLogs, page]);

  function applyFilters() {
    setPage(1);
    fetchLogs(1);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Event type"
            value={filters.eventType}
            onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <select
            value={filters.outcome}
            onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="partial">Partial</option>
          </select>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 px-3 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              Filter
            </button>
            <button
              onClick={() => exportCsv(logs)}
              disabled={logs.length === 0}
              className="px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Platform Audit Log</h3>
          <p className="text-xs text-gray-500">{total.toLocaleString()} matching entries</p>
        </div>
        {loading ? (
          <div className="px-6 py-6 text-sm text-gray-500">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-6 text-sm text-gray-500">No audit log entries match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Org</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Resource</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Outcome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{formatDate(l.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-gray-800">{l.user_name ?? '—'}</div>
                      <div className="text-xs text-gray-400">{l.user_email ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{l.org_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-700">{l.event_type}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{l.resource_type ?? '—'}</td>
                    <td className="px-4 py-3"><OutcomeBadge outcome={l.outcome} success={l.success} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{l.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'rate-limits', label: 'Rate Limits' },
  { id: 'sessions', label: 'Active Sessions' },
  { id: 'headers', label: 'Security Headers' },
  { id: 'audit-logs', label: 'Audit Logs' }
];

export default function SecurityAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('rate-limits');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Security Administration</h1>
          <p className="text-sm text-gray-600 mt-1">
            Monitor rate limits, active sessions, security headers, and platform-wide audit logs.
          </p>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'rate-limits' && <RateLimitsTab />}
        {activeTab === 'sessions' && <SessionsTab />}
        {activeTab === 'headers' && <HeadersTab />}
        {activeTab === 'audit-logs' && <AuditLogsTab />}
      </div>
    </DashboardLayout>
  );
}
