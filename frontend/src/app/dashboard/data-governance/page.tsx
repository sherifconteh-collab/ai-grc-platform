// @tier: enterprise
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { dataGovernanceAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface RetentionPolicy {
  id: string;
  policy_name: string;
  data_category: string;
  retention_period_days: number;
  auto_delete_enabled: boolean;
  legal_basis?: string;
  created_at: string;
  updated_at: string;
}

interface LegalHold {
  id: string;
  hold_name: string;
  hold_reason: string;
  data_scope: string;
  custodian_name?: string;
  start_date: string;
  end_date?: string;
  status: 'active' | 'released';
  created_at: string;
}

export default function DataGovernancePage() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [legalHolds, setLegalHolds] = useState<LegalHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast, toastType, showToast } = useToast();
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showLegalHoldModal, setShowLegalHoldModal] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    policy_name: '',
    data_category: '',
    retention_period_days: 365,
    auto_delete_enabled: false,
    legal_basis: ''
  });
  const [newLegalHold, setNewLegalHold] = useState({
    hold_name: '',
    hold_reason: '',
    data_scope: '',
    custodian_name: '',
    start_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [policiesRes, holdsRes] = await Promise.all([
        dataGovernanceAPI.getPolicies(),
        dataGovernanceAPI.getLegalHolds()
      ]);

      setPolicies(policiesRes.data?.data || []);
      setLegalHolds(holdsRes.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data governance information');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dataGovernanceAPI.createPolicy(newPolicy);
      setShowPolicyModal(false);
      setNewPolicy({
        policy_name: '',
        data_category: '',
        retention_period_days: 365,
        auto_delete_enabled: false,
        legal_basis: ''
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create policy', 'error');
    }
  };

  const handleCreateLegalHold = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dataGovernanceAPI.createLegalHold(newLegalHold);
      setShowLegalHoldModal(false);
      setNewLegalHold({
        hold_name: '',
        hold_reason: '',
        data_scope: '',
        custodian_name: '',
        start_date: new Date().toISOString().split('T')[0]
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create legal hold', 'error');
    }
  };

  const handleReleaseLegalHold = async (holdId: string) => {
    if (!confirm('Are you sure you want to release this legal hold?')) return;
    try {
      await dataGovernanceAPI.releaseLegalHold(holdId);
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to release legal hold', 'error');
    }
  };

  const handleToggleAutoDelete = async (policyId: string, currentValue: boolean) => {
    try {
      await dataGovernanceAPI.updatePolicy(policyId, {
        auto_delete_enabled: !currentValue
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update policy', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {toast && (
          <div role="status" aria-live="polite" className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-lg shadow text-white ${toastType === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
            {toast}
          </div>
        )}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Data Governance</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage data retention policies, legal holds, and data sovereignty
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            🔄 Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/tprm"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <span className="text-xl">🔗</span>
            <div>
              <div className="text-sm font-medium text-blue-800">Third-Party Risk</div>
              <div className="text-xs text-blue-600">DPA, BAA, and data processor agreements</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            <span className="text-xl">🛡️</span>
            <div>
              <div className="text-sm font-medium text-purple-800">AI Insights</div>
              <div className="text-xs text-purple-600">Data provenance and training data controls</div>
            </div>
          </Link>
          <Link href="/dashboard/regulatory-news"
            className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <span className="text-xl">📰</span>
            <div>
              <div className="text-sm font-medium text-green-800">Regulatory News</div>
              <div className="text-xs text-green-600">GDPR, CCPA, and data law updates</div>
            </div>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading data governance information...</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Retention Policies</p>
                    <p className="text-2xl font-bold mt-1 text-purple-600">
                      {policies.length}
                    </p>
                  </div>
                  <div className="text-3xl">📋</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {policies.filter(p => p.auto_delete_enabled).length} with auto-delete
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Legal Holds</p>
                    <p className="text-2xl font-bold mt-1 text-yellow-600">
                      {legalHolds.filter(h => h.status === 'active').length}
                    </p>
                  </div>
                  <div className="text-3xl">⚖️</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {legalHolds.filter(h => h.status === 'released').length} released
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Compliance Status</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">
                      ✓ Active
                    </p>
                  </div>
                  <div className="text-3xl">🛡️</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">GDPR, HIPAA compliant</p>
              </div>
            </div>

            {/* Retention Policies Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Data Retention Policies</h3>
                <button
                  onClick={() => setShowPolicyModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  + Add Policy
                </button>
              </div>

              {policies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No retention policies configured. Create one to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Policy Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Retention Period</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Legal Basis</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Auto-Delete</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {policies.map(policy => (
                        <tr key={policy.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {policy.policy_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {policy.data_category}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {policy.retention_period_days} days
                            <span className="text-xs text-gray-500 ml-1">
                              ({Math.floor(policy.retention_period_days / 365)} years)
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {policy.legal_basis || 'Not specified'}
                          </td>
                          <td className="px-4 py-3">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={policy.auto_delete_enabled}
                                onChange={() => handleToggleAutoDelete(policy.id, policy.auto_delete_enabled)}
                                className="rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">
                                {policy.auto_delete_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(policy.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Legal Holds Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Legal Holds</h3>
                <button
                  onClick={() => setShowLegalHoldModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  + Add Legal Hold
                </button>
              </div>

              {legalHolds.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No legal holds in place
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Hold Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data Scope</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Start Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {legalHolds.map(hold => (
                        <tr key={hold.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {hold.hold_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {hold.hold_reason}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {hold.data_scope}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(hold.start_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              hold.status === 'active' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {hold.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {hold.status === 'active' && (
                              <button
                                onClick={() => handleReleaseLegalHold(hold.id)}
                                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Release Hold
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Policy Modal */}
        {showPolicyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create Retention Policy</h3>
              <form onSubmit={handleCreatePolicy} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPolicy.policy_name}
                    onChange={(e) => setNewPolicy({ ...newPolicy, policy_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPolicy.data_category}
                    onChange={(e) => setNewPolicy({ ...newPolicy, data_category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., User Data, Audit Logs, Backups"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retention Period (days) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newPolicy.retention_period_days}
                    onChange={(e) => setNewPolicy({ ...newPolicy, retention_period_days: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Legal Basis
                  </label>
                  <input
                    type="text"
                    value={newPolicy.legal_basis}
                    onChange={(e) => setNewPolicy({ ...newPolicy, legal_basis: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., GDPR Art. 6(1)(b), HIPAA 164.316"
                  />
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newPolicy.auto_delete_enabled}
                      onChange={(e) => setNewPolicy({ ...newPolicy, auto_delete_enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable auto-delete</span>
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Create Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPolicyModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Legal Hold Modal */}
        {showLegalHoldModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create Legal Hold</h3>
              <form onSubmit={handleCreateLegalHold} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hold Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLegalHold.hold_name}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, hold_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason *
                  </label>
                  <textarea
                    required
                    value={newLegalHold.hold_reason}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, hold_reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Scope *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLegalHold.data_scope}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, data_scope: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., All user communications 2024-present"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custodian Name
                  </label>
                  <input
                    type="text"
                    value={newLegalHold.custodian_name}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, custodian_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newLegalHold.start_date}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Create Hold
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLegalHoldModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
