// @tier: platform
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

const AUTO_REFRESH_INTERVAL_MS = 60_000;

interface ProviderStatus {
  provider: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  latency_ms: number | null;
  error: string | null;
}

interface LlmStatusResponse {
  checked_at: string;
  data: ProviderStatus[];
}

const PROVIDER_META: Record<string, { label: string; icon: string }> = {
  claude: { label: 'Anthropic Claude', icon: '🤖' },
  openai: { label: 'OpenAI', icon: '🧠' },
  gemini: { label: 'Google Gemini', icon: '✨' },
  grok: { label: 'xAI Grok', icon: '⚡' },
  groq: { label: 'Groq', icon: '🚀' },
  ollama: { label: 'Ollama (local)', icon: '🦙' },
};

function statusColor(status: ProviderStatus['status']) {
  if (status === 'ok') return 'bg-green-500';
  if (status === 'error') return 'bg-red-500';
  return 'bg-gray-400';
}

function statusLabel(status: ProviderStatus['status']) {
  if (status === 'ok') return 'Operational';
  if (status === 'error') return 'Error';
  return 'Not configured';
}

function statusBadgeClass(status: ProviderStatus['status']) {
  if (status === 'ok') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'error') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

function formatCheckedAt(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export default function LlmStatusPage() {
  const [statusData, setStatusData] = useState<LlmStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL_MS / 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await platformAdminAPI.getLlmStatus();
      setStatusData(res.data?.data ? { checked_at: res.data.checked_at, data: res.data.data } : null);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch LLM provider status');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(AUTO_REFRESH_INTERVAL_MS / 1000);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    timerRef.current = setInterval(() => fetchStatus(), AUTO_REFRESH_INTERVAL_MS);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? AUTO_REFRESH_INTERVAL_MS / 1000 : prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchStatus]);

  const operationalCount = statusData?.data.filter((p) => p.status === 'ok').length ?? 0;
  const errorCount = statusData?.data.filter((p) => p.status === 'error').length ?? 0;
  const configuredCount = statusData?.data.filter((p) => p.configured).length ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">LLM Provider Status</h1>
            <p className="text-sm text-gray-600 mt-1">
              Real-time health check for all platform-level AI provider API keys. Auto-refreshes every 60 seconds.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusData && (
              <span className="text-xs text-gray-500">
                Last checked: {formatCheckedAt(statusData.checked_at)} · next in {countdown}s
              </span>
            )}
            <button
              onClick={() => fetchStatus(true)}
              disabled={refreshing}
              className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {refreshing ? 'Checking…' : '↻ Check Now'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {loading && !statusData && (
          <div className="text-sm text-gray-500">Checking provider status…</div>
        )}

        {/* Summary bar */}
        {statusData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Configured Providers</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{configuredCount} / {statusData.data.length}</div>
            </div>
            <div className="bg-white border border-green-200 rounded-lg p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-600">Operational</div>
              <div className="mt-2 text-2xl font-bold text-green-700">{operationalCount}</div>
            </div>
            <div className={`bg-white border rounded-lg p-4 ${errorCount > 0 ? 'border-red-200' : 'border-gray-200'}`}>
              <div className={`text-xs font-semibold uppercase tracking-wide ${errorCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>Errors</div>
              <div className={`mt-2 text-2xl font-bold ${errorCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{errorCount}</div>
            </div>
          </div>
        )}

        {/* Provider cards */}
        {statusData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statusData.data.map((p) => {
              const meta = PROVIDER_META[p.provider] ?? { label: p.provider, icon: '🔌' };
              return (
                <div
                  key={p.provider}
                  className={`bg-white rounded-lg border p-5 flex flex-col gap-3 ${
                    p.status === 'error' ? 'border-red-300' : p.status === 'ok' ? 'border-green-200' : 'border-gray-200'
                  }`}
                >
                  {/* Provider header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meta.icon}</span>
                      <span className="font-semibold text-gray-900 text-sm">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(p.status)}`} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${statusBadgeClass(p.status)}`}>
                        {statusLabel(p.status)}
                      </span>
                    </div>
                  </div>

                  {/* Latency */}
                  {p.configured && p.latency_ms !== null && (
                    <div className="text-xs text-gray-500">
                      Response time:{' '}
                      <span className={`font-semibold ${p.latency_ms > 5000 ? 'text-amber-600' : 'text-gray-700'}`}>
                        {p.latency_ms.toLocaleString()} ms
                      </span>
                    </div>
                  )}

                  {/* Error details */}
                  {p.status === 'error' && p.error && (
                    <div className="text-xs bg-red-50 border border-red-100 text-red-700 rounded px-3 py-2 break-words">
                      {p.error}
                    </div>
                  )}

                  {/* Not configured hint */}
                  {!p.configured && (
                    <div className="text-xs text-gray-400">
                      No API key configured. Add one in{' '}
                      <Link href="/dashboard/platform/settings" className="underline text-amber-600 hover:text-amber-700">
                        LLM Defaults
                      </Link>
                      .
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
