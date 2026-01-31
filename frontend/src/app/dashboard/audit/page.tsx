'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { auditAPI } from '@/lib/api';
import { format } from 'date-fns';

interface AuditLog {
  id: string;
  eventType: string;
  email: string;
  ipAddress: string;
  success: boolean;
  createdAt: string;
  failureReason?: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<string>('all');

  useEffect(() => {
    loadLogs();
    loadEventTypes();
  }, [selectedEventType]);

  const loadLogs = async () => {
    try {
      const params: any = { limit: 100, offset: 0 };
      if (selectedEventType !== 'all') {
        params.eventType = selectedEventType;
      }

      const response = await auditAPI.getLogs(params);
      setLogs(response.data.data.logs || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEventTypes = async () => {
    try {
      const response = await auditAPI.getEventTypes();
      setEventTypes(response.data.data.eventTypes || []);
    } catch (err) {
      console.error('Failed to load event types:', err);
    }
  };

  const getEventBadgeClass = (success: boolean) => {
    return success
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600 mt-2">
            AU-2 compliant audit trail for all security-relevant events
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Type
              </label>
              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Events</option>
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={loadLogs}
                className="px-6 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 transition"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* AU-2 Compliance Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">📝</span>
            <div>
              <h3 className="font-bold text-gray-900">NIST 800-53 AU-2 Compliant</h3>
              <p className="text-sm text-gray-700 mt-1">
                These logs capture <strong>what</strong> (event type), <strong>when</strong> (timestamp),
                <strong> where</strong> (IP address), <strong>who</strong> (user email), and{' '}
                <strong>outcome</strong> (success/failure) for all security-relevant events.
              </p>
            </div>
          </div>
        </div>

        {/* Audit Logs Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-purple-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Event Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {log.eventType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {log.email || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                          {log.ipAddress || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getEventBadgeClass(
                              log.success
                            )}`}
                          >
                            {log.success ? 'Success' : 'Failed'}
                          </span>
                          {!log.success && log.failureReason && (
                            <p className="text-xs text-red-600 mt-1">{log.failureReason}</p>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No audit logs found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results Count */}
        {!loading && logs.length > 0 && (
          <div className="text-sm text-gray-600 text-center">
            Showing {logs.length} audit logs (most recent first)
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
