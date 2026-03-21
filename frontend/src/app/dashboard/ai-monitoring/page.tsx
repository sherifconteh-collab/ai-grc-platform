// @tier: pro
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { aiMonitoringAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MonitoringRule {
  id: string;
  rule_name: string;
  rule_type: string;
  severity: string;
  enabled: boolean;
  condition: string;
  threshold: number | null;
  created_at: string;
}

interface MonitoringEvent {
  id: string;
  rule_id: string;
  rule_name?: string;
  severity: string;
  status: string;
  ai_agent_id: string | null;
  description: string;
  created_at: string;
}

interface DashboardData {
  total_rules: number;
  active_rules: number;
  total_events: number;
  unresolved_events: number;
  events_by_severity: Record<string, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
  info: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-red-100 text-red-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
};

function Badge({ text, colorMap }: { text: string; colorMap: Record<string, string> }) {
  const cls = colorMap[text] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>
      {text}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AIMonitoringPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [rules, setRules] = useState<MonitoringRule[]>([]);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rules' | 'events'>('dashboard');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, rulesRes, eventsRes] = await Promise.all([
        aiMonitoringAPI.getDashboard().catch(() => ({ data: { data: null } })),
        aiMonitoringAPI.getRules().catch(() => ({ data: { data: [] } })),
        aiMonitoringAPI.getEvents({ limit: 50 }).catch(() => ({ data: { data: [] } })),
      ]);
      setDashboard(dashRes.data?.data || null);
      setRules(rulesRes.data?.data || []);
      setEvents(eventsRes.data?.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResolveEvent = async (eventId: string) => {
    try {
      await aiMonitoringAPI.resolveEvent(eventId, { resolution_notes: 'Resolved from dashboard' });
      fetchData();
    } catch (err) {
      console.error('Failed to resolve event:', err);
      setError(err instanceof Error ? err.message : 'Could not resolve event.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🤖 AI Continuous Monitoring</h1>
          <p className="text-gray-600 mt-1">
            Monitor AI model behavior, detect anomalies, and manage monitoring rules across your organization.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            {(['dashboard', 'rules', 'events'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 text-sm font-medium capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">Loading monitoring data...</span>
          </div>
        )}

        {/* Dashboard Tab */}
        {!loading && activeTab === 'dashboard' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Rules</p>
              <p className="text-2xl font-bold text-gray-900">{dashboard?.total_rules ?? 0}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Active Rules</p>
              <p className="text-2xl font-bold text-green-700">{dashboard?.active_rules ?? 0}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Events</p>
              <p className="text-2xl font-bold text-gray-900">{dashboard?.total_events ?? 0}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Unresolved</p>
              <p className="text-2xl font-bold text-red-700">{dashboard?.unresolved_events ?? 0}</p>
            </div>
            {dashboard?.events_by_severity && Object.keys(dashboard.events_by_severity).length > 0 && (
              <div className="col-span-full bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Events by Severity</h3>
                <div className="flex gap-4 flex-wrap">
                  {Object.entries(dashboard.events_by_severity).map(([sev, count]) => (
                    <div key={sev} className="flex items-center gap-2">
                      <Badge text={sev} colorMap={SEVERITY_COLORS} />
                      <span className="text-sm font-medium text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rules Tab */}
        {!loading && activeTab === 'rules' && (
          <div className="space-y-3">
            {rules.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No monitoring rules configured yet.</p>
                <p className="text-gray-400 text-sm mt-1">Create rules to automatically detect AI anomalies.</p>
              </div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{rule.rule_name}</h3>
                      <p className="text-xs text-gray-500 mt-1">Type: {rule.rule_type} · Condition: {rule.condition}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge text={rule.severity} colorMap={SEVERITY_COLORS} />
                      <span className={`text-xs font-medium ${rule.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                        {rule.enabled ? '● Active' : '○ Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Events Tab */}
        {!loading && activeTab === 'events' && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No monitoring events recorded yet.</p>
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge text={event.severity} colorMap={SEVERITY_COLORS} />
                        <Badge text={event.status} colorMap={STATUS_COLORS} />
                        {event.ai_agent_id && (
                          <span className="text-xs text-gray-500">Agent: {event.ai_agent_id}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-2">{event.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(event.created_at).toLocaleString()}</p>
                    </div>
                    {event.status !== 'resolved' && (
                      <button
                        onClick={() => handleResolveEvent(event.id)}
                        className="ml-3 px-3 py-1 text-xs bg-green-50 text-green-700 rounded-md hover:bg-green-100 border border-green-200"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
