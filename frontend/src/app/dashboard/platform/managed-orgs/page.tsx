'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';

interface ChildOrg {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  compliance_pct?: number;
  snapshot_date?: string;
}

interface DelegatedAdmin {
  user_id: string;
  email?: string;
  granted_at: string;
  expires_at: string | null;
}

interface OrgSummary {
  organization_id: string;
  frameworks: Array<{
    framework_id: string;
    framework_name: string;
    compliance_pct: number;
    snapshot_date: string;
  }>;
}

function ComplianceBadge({ pct }: { pct: number }) {
  const cls =
    pct >= 80 ? 'bg-green-100 text-green-800' :
    pct >= 60 ? 'bg-yellow-100 text-yellow-800' :
    'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

export default function ManagedOrgsPage() {
  const [children, setChildren] = useState<ChildOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedOrg, setSelectedOrg] = useState<ChildOrg | null>(null);
  const [orgSummary, setOrgSummary] = useState<OrgSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showDelegate, setShowDelegate] = useState(false);
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);

  const [delegates, setDelegates] = useState<DelegatedAdmin[]>([]);
  const [delegatesLoading, setDelegatesLoading] = useState(false);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/organizations/children');
      setChildren(res.data?.data || []);
    } catch {
      setError('Failed to load child organizations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadChildren(); }, [loadChildren]);

  const handleCreate = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.post('/organizations/children', { name: newOrgName.trim() });
      setNewOrgName('');
      setShowCreate(false);
      loadChildren();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create child organization.';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const loadOrgSummary = useCallback(async (childId: string) => {
    setSummaryLoading(true);
    setOrgSummary(null);
    setDelegates([]);
    try {
      const [sumRes, delRes] = await Promise.all([
        api.get(`/organizations/children/${childId}/summary`),
        api.get(`/organizations/children/${childId}/delegates`).catch(() => ({ data: { data: [] } }))
      ]);
      setOrgSummary(sumRes.data?.data || null);
      setDelegates(delRes.data?.data || []);
    } catch {
      setOrgSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const handleSelectOrg = (org: ChildOrg) => {
    setSelectedOrg(org);
    loadOrgSummary(org.id);
  };

  const handleDelegate = async () => {
    if (!delegateEmail.trim() || !selectedOrg) return;
    setDelegating(true);
    setDelegateError(null);
    try {
      await api.post(`/organizations/children/${selectedOrg.id}/delegate`, { email: delegateEmail.trim() });
      setDelegateEmail('');
      setShowDelegate(false);
      loadOrgSummary(selectedOrg.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to grant delegated access.';
      setDelegateError(msg);
    } finally {
      setDelegating(false);
    }
  };

  const handleRevokeDelegate = async (userId: string) => {
    if (!selectedOrg) return;
    try {
      await api.delete(`/organizations/children/${selectedOrg.id}/delegate/${userId}`);
      loadOrgSummary(selectedOrg.id);
    } catch {
      // ignore
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Managed Organizations</h1>
            <p className="text-gray-600 mt-1">Manage child organizations and delegated admin access.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition"
          >
            + Create Child Org
          </button>
        </div>

        {showCreate && (
          <div className="bg-white border rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">New Child Organization</h2>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Organization name"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newOrgName.trim()}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewOrgName(''); setCreateError(null); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            {createError && <p className="text-red-600 text-xs mt-2">{createError}</p>}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        {!loading && !error && children.length === 0 && (
          <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
            <p className="text-lg font-medium">No child organizations yet.</p>
            <p className="text-sm mt-1">Create a child org to manage it from this dashboard.</p>
          </div>
        )}

        {!loading && children.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-2">
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider px-1">
                Child Organizations ({children.length})
              </h2>
              {children.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org)}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    selectedOrg?.id === org.id
                      ? 'border-purple-400 bg-purple-50 shadow-sm'
                      : 'bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-gray-900 text-sm">{org.name}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{org.slug || org.id.slice(0, 8)}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    Created {new Date(org.created_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2">
              {!selectedOrg && (
                <div className="bg-white border rounded-xl p-12 text-center text-gray-400 h-full flex items-center justify-center">
                  <p className="text-sm">Select an organization to view details.</p>
                </div>
              )}

              {selectedOrg && (
                <div className="space-y-4">
                  <div className="bg-white border rounded-xl shadow-sm p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="font-semibold text-gray-900 text-lg">{selectedOrg.name}</h2>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedOrg.id}</p>
                      </div>
                      <button
                        onClick={() => setShowDelegate(true)}
                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                      >
                        + Delegate Admin
                      </button>
                    </div>

                    {showDelegate && (
                      <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                        <p className="text-sm font-medium text-gray-700 mb-2">Grant delegated admin access</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={delegateEmail}
                            onChange={(e) => setDelegateEmail(e.target.value)}
                            placeholder="User email address"
                            className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <button
                            onClick={handleDelegate}
                            disabled={delegating || !delegateEmail.trim()}
                            className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
                          >
                            {delegating ? 'Granting...' : 'Grant'}
                          </button>
                          <button
                            onClick={() => { setShowDelegate(false); setDelegateEmail(''); setDelegateError(null); }}
                            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                        {delegateError && <p className="text-red-600 text-xs mt-1">{delegateError}</p>}
                      </div>
                    )}

                    {delegatesLoading && (
                      <p className="text-sm text-gray-400">Loading admins...</p>
                    )}

                    {!delegatesLoading && delegates.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Delegated Admins</p>
                        <div className="space-y-1">
                          {delegates.map((d) => (
                            <div key={d.user_id} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg text-sm">
                              <div>
                                <span className="font-medium text-gray-800">{d.email || d.user_id.slice(0, 8)}</span>
                                <span className="text-xs text-gray-400 ml-2">
                                  granted {new Date(d.granted_at).toLocaleDateString()}
                                </span>
                                {d.expires_at && (
                                  <span className="text-xs text-orange-500 ml-2">
                                    expires {new Date(d.expires_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleRevokeDelegate(d.user_id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Revoke
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b">
                      <h3 className="font-semibold text-gray-900">Compliance Summary</h3>
                    </div>
                    {summaryLoading && (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
                      </div>
                    )}
                    {!summaryLoading && (!orgSummary || orgSummary.frameworks.length === 0) && (
                      <div className="px-6 py-8 text-center text-gray-400 text-sm">
                        No compliance snapshot data for this organization.
                      </div>
                    )}
                    {!summaryLoading && orgSummary && orgSummary.frameworks.length > 0 && (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left">
                          <tr>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Framework</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Compliance</th>
                            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Snapshot Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orgSummary.frameworks.map((fw) => (
                            <tr key={fw.framework_id} className="hover:bg-gray-50">
                              <td className="px-6 py-3 font-medium text-gray-900">{fw.framework_name}</td>
                              <td className="px-6 py-3"><ComplianceBadge pct={fw.compliance_pct} /></td>
                              <td className="px-6 py-3 text-gray-500 text-xs">
                                {new Date(fw.snapshot_date).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
