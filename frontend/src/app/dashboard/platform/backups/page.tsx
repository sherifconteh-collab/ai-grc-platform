// @tier: platform
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

interface BackupConfig {
  enabled: boolean;
  schedule: string;
  s3Configured: boolean;
  s3Bucket: string | null;
  s3Prefix: string;
  retentionDays: number;
  backupDir: string;
}

interface BackupLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  trigger: 'scheduled' | 'manual';
  backup_file: string | null;
  file_size_bytes: number | null;
  s3_key: string | null;
  error_message: string | null;
  exit_code: number | null;
  triggered_by_email: string | null;
  triggered_by_name: string | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(started: string, completed: string | null): string {
  if (!completed) return '—';
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: BackupLog['status'] }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
        Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
      Running
    </span>
  );
}

export default function BackupsPage() {
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [runSuccess, setRunSuccess] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, logsRes] = await Promise.all([
        platformAdminAPI.getBackupConfig(),
        platformAdminAPI.getBackups()
      ]);
      setConfig(configRes.data?.data ?? null);
      const rows: BackupLog[] = logsRes.data?.data ?? [];
      setLogs(rows);

      const hasRunning = rows.some((r) => r.status === 'running');
      if (hasRunning && !pollRef.current) {
        pollRef.current = setInterval(fetchData, 10_000);
      } else if (!hasRunning && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to load backup data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchData]);

  async function handleRunBackup() {
    setRunning(true);
    setRunError('');
    setRunSuccess('');
    try {
      await platformAdminAPI.runBackup();
      setRunSuccess('Backup started. The history table will update when it completes.');
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchData, 10_000);
      }
      await fetchData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRunError(msg || 'Failed to start backup');
    } finally {
      setRunning(false);
    }
  }

  const hasRunningBackup = logs.some((l) => l.status === 'running');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Database Backups</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage scheduled and manual database backups for this installation.
            </p>
          </div>
          <button
            onClick={handleRunBackup}
            disabled={running || hasRunningBackup}
            className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running || hasRunningBackup ? 'Backup Running…' : 'Run Backup Now'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        {runError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{runError}</div>
        )}
        {runSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{runSuccess}</div>
        )}

        {/* Config cards */}
        {config && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`bg-white border rounded-lg p-4 ${config.enabled ? 'border-green-200' : 'border-gray-200'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scheduler</div>
              <div className={`mt-2 text-lg font-bold ${config.enabled ? 'text-green-700' : 'text-gray-400'}`}>
                {config.enabled ? 'Enabled' : 'Disabled'}
              </div>
              <div className="text-xs text-gray-400 mt-1">BACKUP_ENABLED env var</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule</div>
              <div className="mt-2 text-lg font-bold text-gray-900 font-mono">{config.schedule}</div>
              <div className="text-xs text-gray-400 mt-1">Cron expression (UTC)</div>
            </div>
            <div className={`bg-white border rounded-lg p-4 ${config.s3Configured ? 'border-green-200' : 'border-amber-200'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">S3 Upload</div>
              <div className={`mt-2 text-lg font-bold ${config.s3Configured ? 'text-green-700' : 'text-amber-600'}`}>
                {config.s3Configured ? config.s3Bucket : 'Not configured'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {config.s3Configured ? `Prefix: ${config.s3Prefix}` : 'AWS_S3_BUCKET not set'}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Retention</div>
              <div className="mt-2 text-lg font-bold text-gray-900">{config.retentionDays} days</div>
              <div className="text-xs text-gray-400 mt-1 truncate" title={config.backupDir}>{config.backupDir}</div>
            </div>
          </div>
        )}

        {/* Backup history */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Backup History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 50 backup runs</p>
          </div>

          {loading ? (
            <div className="px-6 py-8 text-sm text-gray-500">Loading backup history…</div>
          ) : logs.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-500">
              No backup runs recorded yet. Enable the scheduler via <code className="bg-gray-100 px-1 rounded">BACKUP_ENABLED=true</code> or trigger a manual run above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trigger</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">S3 Key</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(log.started_at)}</td>
                      <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDuration(log.started_at, log.completed_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${log.trigger === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {log.trigger}
                          {log.trigger === 'manual' && log.triggered_by_email ? ` (${log.triggered_by_email})` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatBytes(log.file_size_bytes)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={log.s3_key ?? ''}>
                        {log.s3_key ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-red-600 max-w-[240px] truncate text-xs" title={log.error_message ?? ''}>
                        {log.error_message ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
