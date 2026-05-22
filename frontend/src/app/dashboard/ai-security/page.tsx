'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { plot4aiAPI, aiMonitoringAPI, aiGovernanceAPI, cmdbAPI } from '@/lib/api';

interface SectionStats {
  label: string;
  value: string | number;
  sub?: string;
}

interface HubSection {
  title: string;
  stats: SectionStats[];
  error: string | null;
  loading: boolean;
}

interface HubState {
  threats: HubSection;
  monitoring: HubSection;
  governance: HubSection;
  aiAssets: HubSection;
}

const initialSection = (title: string): HubSection => ({
  title,
  stats: [],
  error: null,
  loading: true,
});

export default function AISecurityPage() {
  const [hub, setHub] = useState<HubState>({
    threats: initialSection('AI Threat Landscape'),
    monitoring: initialSection('AI Monitoring'),
    governance: initialSection('AI Governance'),
    aiAssets: initialSection('AI Assets'),
  });

  useEffect(() => {
    const update = (key: keyof HubState, patch: Partial<HubSection>) =>
      setHub(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    plot4aiAPI.getStats()
      .then(res => {
        const d = res.data?.data ?? {};
        update('threats', {
          loading: false,
          stats: [
            { label: 'Total Threats', value: d.total_threats ?? '-' },
            { label: 'Categories', value: d.total_categories ?? '-' },
            { label: 'High Severity', value: d.high_severity ?? '-', sub: 'threats' },
          ],
        });
      })
      .catch(() => update('threats', { loading: false, error: 'Failed to load threat data' }));

    aiMonitoringAPI.getCoverage()
      .then(res => {
        const d = res.data?.data ?? {};
        update('monitoring', {
          loading: false,
          stats: [
            { label: 'Monitored Agents', value: d.monitored_agents ?? '-' },
            { label: 'Active Rules', value: d.active_rules ?? '-' },
            { label: 'Open Alerts', value: d.open_events ?? '-', sub: 'events' },
          ],
        });
      })
      .catch(() => update('monitoring', { loading: false, error: 'Failed to load monitoring data' }));

    aiGovernanceAPI.getSummary()
      .then(res => {
        const d = res.data?.data ?? {};
        update('governance', {
          loading: false,
          stats: [
            { label: 'Vendor Assessments', value: d.total_vendors ?? '-' },
            { label: 'Open Incidents', value: d.open_incidents ?? '-' },
            { label: 'Supply Chain Components', value: d.supply_chain_components ?? '-' },
          ],
        });
      })
      .catch(() => update('governance', { loading: false, error: 'Failed to load governance data' }));

    cmdbAPI.aiAgents.getAll()
      .then((res: { data?: { data?: unknown } }) => {
        const rows = (res.data?.data as unknown[]) ?? [];
        update('aiAssets', {
          loading: false,
          stats: [
            { label: 'Registered AI Agents', value: Array.isArray(rows) ? rows.length : '-' },
          ],
        });
      })
      .catch(() => update('aiAssets', { loading: false, error: 'Failed to load AI asset data' }));
  }, []);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Security Hub</h1>
          <p className="mt-1 text-sm text-gray-500">
            Unified view of AI threat exposure, monitoring alerts, governance posture, and AI asset inventory.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(Object.values(hub) as HubSection[]).map(section => (
            <div key={section.title} className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800 mb-4">{section.title}</h2>
              {section.loading && (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
              {!section.loading && section.error && (
                <p className="text-sm text-red-500">{section.error}</p>
              )}
              {!section.loading && !section.error && (
                <div className="grid grid-cols-3 gap-4">
                  {section.stats.map(stat => (
                    <div key={stat.label}>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{stat.label}{stat.sub ? ` (${stat.sub})` : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
