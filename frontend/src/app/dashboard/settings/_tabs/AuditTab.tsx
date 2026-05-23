'use client';

import Link from 'next/link';

/**
 * Audit Logs tab content for the Settings page.
 *
 * Extracted from src/app/dashboard/settings/page.tsx as part of the monolith
 * split (4.1). The JSX is identical to the original inline block — only the
 * location has changed. All state and handlers are passed in as props so the
 * parent component remains the single source of truth.
 */

export interface AuditFilterChip {
  label: string;
  value: string;
}

export interface AuditRow {
  id: string | number;
  created_at: string;
  event_type: string;
  resource_type?: string | null;
  user_name?: string | null;
  email?: string | null;
  ip_address?: string | null;
  success?: boolean;
}

export interface AuditTabProps {
  loadAuditLogs: (page: number) => void;
  auditLoading: boolean;
  auditError: string | null;
  hasAuditFilters: boolean;
  auditFilterChips: AuditFilterChip[];
  auditRows: AuditRow[];
  auditTotal: number;
  auditPage: number;
  auditLimit: number;
}

export default function AuditTab({
  loadAuditLogs,
  auditLoading,
  auditError,
  hasAuditFilters,
  auditFilterChips,
  auditRows,
  auditTotal,
  auditPage,
  auditLimit,
}: AuditTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Audit Logs</h2>
            <p className="text-sm text-gray-500 mt-1">Full event trail for your organization — user actions, configuration changes, and AI activity.</p>
          </div>
          <button onClick={() => loadAuditLogs(1)} disabled={auditLoading}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
            {auditLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {auditError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{auditError}</div>
        )}
        {hasAuditFilters && (
          <div className="bg-purple-50 border border-purple-200 text-purple-900 px-4 py-3 rounded-lg mb-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">Filtered from a related workflow</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {auditFilterChips.map((chip) => (
                    <span key={`${chip.label}:${chip.value}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-purple-800 border border-purple-200">
                      <span className="font-semibold">{chip.label}:</span>
                      <span>{chip.value}</span>
                    </span>
                  ))}
                </div>
              </div>
              <Link href="/dashboard/settings?tab=audit" className="font-medium underline hover:text-purple-700">
                Clear filters
              </Link>
            </div>
          </div>
        )}
        {auditLoading && auditRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : auditRows.length === 0 && !auditError ? (
          <div className="py-8 text-center text-sm text-gray-400">No audit events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Event</th>
                  <th className="pb-2 pr-4">Resource</th>
                  <th className="pb-2 pr-4">Actor</th>
                  <th className="pb-2 pr-4">IP</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {auditRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 text-xs">
                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-purple-700">{row.event_type}</td>
                    <td className="py-2 pr-4 text-gray-700">{row.resource_type || '—'}</td>
                    <td className="py-2 pr-4 text-gray-800">{row.user_name || row.email || '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">{row.ip_address || '—'}</td>
                    <td className="py-2">
                      {row.success === false ? (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Failed</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditTotal > auditLimit && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>{auditTotal} total</span>
                <div className="flex gap-2">
                  <button onClick={() => loadAuditLogs(auditPage - 1)} disabled={auditPage <= 1 || auditLoading}
                    className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40">Previous</button>
                  <span className="px-3 py-1">Page {auditPage}</span>
                  <button onClick={() => loadAuditLogs(auditPage + 1)} disabled={auditPage * auditLimit >= auditTotal || auditLoading}
                    className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
