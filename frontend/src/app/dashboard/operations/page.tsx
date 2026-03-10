// @tier: free
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { poamAPI, vulnerabilitiesAPI } from '@/lib/api';

type OpsTab = 'poam' | 'vulnerabilities' | 'controls_at_risk';

interface PoamItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  owner_name: string | null;
  control_id: string | null;
  control_title?: string | null;
}

interface VulnItem {
  id: string;
  title: string;
  cve_id: string | null;
  severity: string;
  status: string;
  asset_name?: string | null;
}

const POAM_STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  closed: 'bg-green-100 text-green-800',
  risk_accepted: 'bg-purple-100 text-purple-800',
  delayed: 'bg-red-100 text-red-800',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
  info: 'bg-gray-100 text-gray-700',
};

function StatusBadge({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  const cls = colorMap[value?.toLowerCase()] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {value?.replace(/_/g, ' ')}
    </span>
  );
}

export default function OperationsCenterPage() {
  const [activeTab, setActiveTab] = useState<OpsTab>('poam');

  // POA&M state
  const [poams, setPoams] = useState<PoamItem[]>([]);
  const [poamLoading, setPoamLoading] = useState(false);
  const [poamFilter, setPoamFilter] = useState('');

  // Vulnerability state
  const [vulns, setVulns] = useState<VulnItem[]>([]);
  const [vulnLoading, setVulnLoading] = useState(false);
  const [vulnFilter, setVulnFilter] = useState('');

  const [error, setError] = useState('');

  // Create POA&M modal state
  const [showCreatePoam, setShowCreatePoam] = useState(false);
  const [createPoamData, setCreatePoamData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'open',
    due_date: '',
    remediation_plan: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (activeTab === 'poam' && poams.length === 0) loadPoams();
    if (activeTab === 'vulnerabilities' && vulns.length === 0) loadVulns();
    if (activeTab === 'controls_at_risk' && poams.length === 0) {
      loadPoams();
      loadVulns();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadPoams = async () => {
    try {
      setPoamLoading(true);
      const res = await poamAPI.getList({ limit: 200 });
      setPoams(res.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load POA&Ms');
    } finally {
      setPoamLoading(false);
    }
  };

  const loadVulns = async () => {
    try {
      setVulnLoading(true);
      const res = await vulnerabilitiesAPI.getAll({ limit: 500 });
      setVulns(res.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load vulnerabilities');
    } finally {
      setVulnLoading(false);
    }
  };

  const handleCreatePoam = async () => {
    const trimmedTitle = createPoamData.title.trim();
    if (!trimmedTitle || trimmedTitle.length < 3) {
      setError('Title is required (min 3 characters)');
      return;
    }
    try {
      setCreating(true);
      setError('');
      await poamAPI.create({
        title: trimmedTitle,
        description: createPoamData.description.trim() || undefined,
        priority: createPoamData.priority,
        status: createPoamData.status,
        due_date: createPoamData.due_date || undefined,
        remediation_plan: createPoamData.remediation_plan.trim() || undefined,
        source_type: 'manual',
      });
      setShowCreatePoam(false);
      setCreatePoamData({ title: '', description: '', priority: 'medium', status: 'open', due_date: '', remediation_plan: '' });
      await loadPoams();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create POA&M');
    } finally {
      setCreating(false);
    }
  };

  // Summaries
  const poamCounts = {
    open: poams.filter(p => p.status === 'open').length,
    in_progress: poams.filter(p => p.status === 'in_progress').length,
    closed: poams.filter(p => p.status === 'closed').length,
    risk_accepted: poams.filter(p => p.status === 'risk_accepted').length,
  };

  const vulnCounts = {
    critical: vulns.filter(v => v.severity?.toLowerCase() === 'critical').length,
    high: vulns.filter(v => v.severity?.toLowerCase() === 'high').length,
    medium: vulns.filter(v => v.severity?.toLowerCase() === 'medium').length,
    low: vulns.filter(v => v.severity?.toLowerCase() === 'low').length,
    open: vulns.filter(v => !['remediated', 'closed', 'risk_accepted'].includes(v.status?.toLowerCase())).length,
    remediated: vulns.filter(v => ['remediated', 'closed'].includes(v.status?.toLowerCase())).length,
  };

  // Controls at risk: controls that have open POAMs or open vulns
  const controlsWithPoam = poams
    .filter(p => p.control_id && p.status !== 'closed')
    .reduce<Record<string, { controlId: string; title: string; openPoams: number }>>(
      (acc, p) => {
        if (!p.control_id) return acc;
        if (!acc[p.control_id]) acc[p.control_id] = { controlId: p.control_id, title: p.control_title || p.control_id, openPoams: 0 };
        acc[p.control_id].openPoams++;
        return acc;
      },
      {}
    );
  const controlsAtRisk = Object.values(controlsWithPoam);

  const filteredPoams = poamFilter
    ? poams.filter(p =>
        p.title?.toLowerCase().includes(poamFilter.toLowerCase()) ||
        p.status?.toLowerCase().includes(poamFilter.toLowerCase()) ||
        p.priority?.toLowerCase().includes(poamFilter.toLowerCase())
      )
    : poams;

  const filteredVulns = vulnFilter
    ? vulns.filter(v =>
        v.title?.toLowerCase().includes(vulnFilter.toLowerCase()) ||
        v.cve_id?.toLowerCase().includes(vulnFilter.toLowerCase()) ||
        v.severity?.toLowerCase().includes(vulnFilter.toLowerCase()) ||
        v.status?.toLowerCase().includes(vulnFilter.toLowerCase())
      )
    : vulns;

  const tabs: { id: OpsTab; label: string }[] = [
    { id: 'poam', label: 'POA&Ms' },
    { id: 'vulnerabilities', label: 'Vulnerabilities' },
    { id: 'controls_at_risk', label: 'Controls at Risk' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Operations</h1>
          <p className="text-sm text-gray-600 mt-1">
            Active compliance work items, risk signals, and remediation tracking.
          </p>
        </div>

        {/* Cross-feature navigation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Related:</strong>{' '}
            <Link href="/dashboard/controls" className="underline hover:text-blue-900">Controls</Link>{' · '}
            <Link href="/dashboard/vulnerabilities" className="underline hover:text-blue-900">Vulnerabilities</Link>{' · '}
            <Link href="/dashboard/evidence" className="underline hover:text-blue-900">Evidence</Link>{' · '}
            <Link href="/dashboard/assessments" className="underline hover:text-blue-900">Assessments</Link>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Open POA&Ms" value={poamCounts.open} color="yellow" />
          <SummaryCard label="In-Progress POA&Ms" value={poamCounts.in_progress} color="blue" />
          <SummaryCard label="Critical Vulns" value={vulnCounts.critical} color="red" />
          <SummaryCard label="High Vulns" value={vulnCounts.high} color="orange" />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* POA&M Tab */}
        {activeTab === 'poam' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Open: <strong>{poamCounts.open}</strong></span>
                <span>In Progress: <strong>{poamCounts.in_progress}</strong></span>
                <span>Closed: <strong>{poamCounts.closed}</strong></span>
                <span>Risk Accepted: <strong>{poamCounts.risk_accepted}</strong></span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Filter POA&Ms..."
                  value={poamFilter}
                  onChange={e => setPoamFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => setShowCreatePoam(true)}
                  className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  + Create POA&M
                </button>
              </div>
            </div>

            {poamLoading ? (
              <div className="py-8 text-center text-gray-500 text-sm">Loading POA&Ms...</div>
            ) : filteredPoams.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No POA&M items found.</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPoams.map(poam => (
                      <tr key={poam.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{poam.title}</td>
                        <td className="px-4 py-3">
                          <StatusBadge value={poam.priority || 'medium'} colorMap={{ high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-blue-100 text-blue-800', critical: 'bg-red-100 text-red-800' }} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={poam.status} colorMap={POAM_STATUS_COLORS} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {poam.due_date ? new Date(poam.due_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{poam.owner_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Vulnerabilities Tab */}
        {activeTab === 'vulnerabilities' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="text-red-700 font-medium">Critical: {vulnCounts.critical}</span>
                <span className="text-orange-700 font-medium">High: {vulnCounts.high}</span>
                <span className="text-yellow-700 font-medium">Medium: {vulnCounts.medium}</span>
                <span className="text-blue-700 font-medium">Low: {vulnCounts.low}</span>
                <span className="text-gray-500">Open: {vulnCounts.open} · Remediated: {vulnCounts.remediated}</span>
              </div>
              <input
                type="text"
                placeholder="Filter vulnerabilities..."
                value={vulnFilter}
                onChange={e => setVulnFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {vulnLoading ? (
              <div className="py-8 text-center text-gray-500 text-sm">Loading vulnerabilities...</div>
            ) : filteredVulns.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No vulnerabilities found.</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID / Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredVulns.map(vuln => (
                      <tr key={vuln.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {vuln.cve_id && (
                            <span className="text-xs font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded mr-2">{vuln.cve_id}</span>
                          )}
                          <span className="font-medium text-gray-900">{vuln.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={vuln.severity} colorMap={SEVERITY_COLORS} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={vuln.status || 'open'} colorMap={{ open: 'bg-yellow-100 text-yellow-800', remediated: 'bg-green-100 text-green-800', closed: 'bg-green-100 text-green-800', risk_accepted: 'bg-purple-100 text-purple-800', in_progress: 'bg-blue-100 text-blue-800' }} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">{vuln.asset_name || '—'}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/vulnerabilities/${vuln.id}`}
                            className="text-xs text-purple-600 hover:text-purple-800"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Controls at Risk Tab */}
        {activeTab === 'controls_at_risk' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Controls with open POA&M items that require attention.
            </p>

            {poamLoading || vulnLoading ? (
              <div className="py-8 text-center text-gray-500 text-sm">Loading data...</div>
            ) : controlsAtRisk.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                No controls with open risk items. Well done!
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Control</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Open POA&Ms</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {controlsAtRisk.map(ctrl => (
                      <tr key={ctrl.controlId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{ctrl.title}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            {ctrl.openPoams} open
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/controls/${ctrl.controlId}`}
                            className="text-xs text-purple-600 hover:text-purple-800"
                          >
                            View control →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {/* Create POA&M Modal */}
        {showCreatePoam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Create POA&M Item</h2>
                <button onClick={() => setShowCreatePoam(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={createPoamData.title}
                    onChange={e => setCreatePoamData(d => ({ ...d, title: e.target.value }))}
                    placeholder="e.g. Remediate critical vulnerability in web server"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={createPoamData.description}
                    onChange={e => setCreatePoamData(d => ({ ...d, description: e.target.value }))}
                    rows={3}
                    placeholder="Detailed description of the action item..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={createPoamData.priority}
                      onChange={e => setCreatePoamData(d => ({ ...d, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={createPoamData.status}
                      onChange={e => setCreatePoamData(d => ({ ...d, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="pending_review">Pending Review</option>
                      <option value="closed">Closed</option>
                      <option value="risk_accepted">Risk Accepted</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={createPoamData.due_date}
                    onChange={e => setCreatePoamData(d => ({ ...d, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remediation Plan</label>
                  <textarea
                    value={createPoamData.remediation_plan}
                    onChange={e => setCreatePoamData(d => ({ ...d, remediation_plan: e.target.value }))}
                    rows={2}
                    placeholder="Steps to resolve this item..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCreatePoam(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePoam}
                  disabled={creating || !createPoamData.title.trim().length}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create POA&M'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    yellow: 'text-yellow-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorMap[color] || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
