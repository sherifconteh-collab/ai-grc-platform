'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';

interface FrameworkSnapshot {
  framework_code: string;
  framework_name: string;
  compliance_pct: number;
  implemented: number;
  total_controls: number;
  snapshot_date: string;
  trend: Array<{ date: string; compliance_pct: number }>;
}

interface ExecutiveSummary {
  generated_at: string;
  period_days: number;
  overall_compliance_pct: number;
  framework_count: number;
  frameworks: FrameworkSnapshot[];
}

const PERIODS = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '1 year', value: 365 },
];

function TrendSparkline({ trend }: { trend: Array<{ date: string; compliance_pct: number }> }) {
  if (trend.length < 2) return <span className="text-xs text-gray-400">No trend data yet</span>;
  const vals = trend.map((t) => t.compliance_pct);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const latest = vals[vals.length - 1];
  const first = vals[0];
  const diff = latest - first;
  const color = diff >= 0 ? '#16a34a' : '#dc2626';
  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points.join(' ')} />
      </svg>
      <span className={`text-xs font-medium ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
      </span>
    </div>
  );
}

function ComplianceBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-sm font-semibold w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [period, setPeriod] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/executive', { params: { days } });
      setSummary(res.data?.data || null);
    } catch {
      setError('Failed to load executive summary. Run a compliance snapshot first.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Executive Summary</h1>
            <p className="text-gray-600 mt-1">Cross-framework compliance overview from historical snapshots.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setPeriod(p.value); }}
                  className={`px-3 py-1 text-sm rounded-md transition ${period === p.value ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Link href="/dashboard/reports" className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
              All Reports
            </Link>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" /></div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
            {error}
            <p className="text-xs mt-1">Run <code>node scripts/snapshot-compliance.js</code> from the backend to generate snapshot data.</p>
          </div>
        )}

        {summary && !loading && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border rounded-xl p-6 text-center shadow-sm">
                <div className="text-5xl font-bold text-purple-700">{summary.overall_compliance_pct.toFixed(1)}%</div>
                <div className="text-sm text-gray-500 mt-1">Overall Compliance</div>
              </div>
              <div className="bg-white border rounded-xl p-6 text-center shadow-sm">
                <div className="text-5xl font-bold text-gray-800">{summary.framework_count}</div>
                <div className="text-sm text-gray-500 mt-1">Active Frameworks</div>
              </div>
              <div className="bg-white border rounded-xl p-6 text-center shadow-sm">
                <div className="text-sm text-gray-500 mb-1">Last Snapshot</div>
                <div className="text-base font-medium text-gray-800">
                  {summary.frameworks[0]?.snapshot_date
                    ? new Date(summary.frameworks[0].snapshot_date).toLocaleDateString()
                    : 'N/A'}
                </div>
                <div className="text-xs text-gray-400 mt-1">Generated: {new Date(summary.generated_at).toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-900">Framework Breakdown</h2>
              </div>
              {summary.frameworks.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500 text-sm">No snapshot data. Run the daily snapshot job to populate this view.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Framework</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Compliance</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Controls</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trend ({period}d)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.frameworks.map((fw) => (
                      <tr key={fw.framework_code} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{fw.framework_name}</div>
                          <div className="text-xs text-gray-400 font-mono">{fw.framework_code}</div>
                        </td>
                        <td className="px-6 py-4 w-48"><ComplianceBar pct={fw.compliance_pct} /></td>
                        <td className="px-6 py-4 text-gray-600">{fw.implemented} / {fw.total_controls}</td>
                        <td className="px-6 py-4"><TrendSparkline trend={fw.trend} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
