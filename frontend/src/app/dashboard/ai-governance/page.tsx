// @tier: enterprise
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { aiGovernanceAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GovernanceSummary {
  total_vendors: number;
  high_risk_vendors: number;
  total_incidents: number;
  open_incidents: number;
  supply_chain_components: number;
}

interface VendorAssessment {
  id: string;
  vendor_name: string;
  vendor_type: string;
  risk_level: string;
  business_criticality: string;
  status: string;
  last_assessed_at: string | null;
  created_at: string;
}

interface Incident {
  id: string;
  vendor_assessment_id: string;
  incident_type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  investigating: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
};

function Badge({ text, colorMap }: { text: string; colorMap: Record<string, string> }) {
  const cls = colorMap[text] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>
      {text}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AIGovernancePage() {
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [vendors, setVendors] = useState<VendorAssessment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'vendors' | 'incidents'>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, vendorsRes, incidentsRes] = await Promise.all([
        aiGovernanceAPI.getSummary().catch(() => ({ data: { data: {} } })),
        aiGovernanceAPI.getVendors().catch(() => ({ data: { data: [] } })),
        aiGovernanceAPI.getIncidents().catch(() => ({ data: { data: [] } })),
      ]);
      setSummary(summaryRes.data?.data || null);
      setVendors(vendorsRes.data?.data || []);
      setIncidents(incidentsRes.data?.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load governance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏛️ AI Governance</h1>
          <p className="text-gray-600 mt-1">
            Manage AI vendor risk assessments, track incidents, and monitor your AI supply chain.
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
            {(['overview', 'vendors', 'incidents'] as const).map((tab) => (
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
            <span className="ml-3 text-gray-600">Loading governance data...</span>
          </div>
        )}

        {/* Overview Tab */}
        {!loading && activeTab === 'overview' && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Vendors" value={summary?.total_vendors ?? 0} />
            <StatCard label="High-Risk Vendors" value={summary?.high_risk_vendors ?? 0} color="text-red-700" />
            <StatCard label="Total Incidents" value={summary?.total_incidents ?? 0} />
            <StatCard label="Open Incidents" value={summary?.open_incidents ?? 0} color="text-orange-700" />
            <StatCard label="Supply Chain Components" value={summary?.supply_chain_components ?? 0} />
          </div>
        )}

        {/* Vendors Tab */}
        {!loading && activeTab === 'vendors' && (
          <div className="space-y-3">
            {vendors.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No AI vendor assessments yet.</p>
                <p className="text-gray-400 text-sm mt-1">Add vendors to begin tracking AI supply chain risk.</p>
              </div>
            ) : (
              vendors.map((vendor) => (
                <div key={vendor.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{vendor.vendor_name}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Type: {vendor.vendor_type} · Criticality: {vendor.business_criticality}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge text={vendor.risk_level} colorMap={RISK_COLORS} />
                      <Badge text={vendor.status} colorMap={STATUS_COLORS} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Incidents Tab */}
        {!loading && activeTab === 'incidents' && (
          <div className="space-y-3">
            {incidents.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No AI incidents recorded.</p>
              </div>
            ) : (
              incidents.map((incident) => (
                <div key={incident.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge text={incident.severity} colorMap={RISK_COLORS} />
                        <Badge text={incident.status} colorMap={STATUS_COLORS} />
                        <span className="text-xs text-gray-400">{incident.incident_type}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">{incident.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{incident.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(incident.created_at).toLocaleString()}</p>
                    </div>
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
