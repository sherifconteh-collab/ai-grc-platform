// @tier: enterprise
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { organizationAPI, aiAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

// Dynamically import chart components
const VendorRiskMatrix = dynamic(() => import('@/components/VendorRiskCharts').then(m => m.VendorRiskMatrix), { ssr: false });

interface VendorContract {
  id: string;
  contract_name: string;
  vendor_name: string;
  contract_number?: string;
  contract_type?: string;
  status: string;
  start_date?: string;
  end_date?: string;
  renewal_date?: string;
  notice_period_days?: number;
  security_requirements?: string;
  data_processing_terms?: string;
  sla_summary?: string;
  notes?: string;
  system_name?: string;
  cots_product_name?: string;
  created_at: string;
}

interface VendorRiskAssessment {
  vendor_name: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  assessment_summary: string;
  recommendations: string[];
  assessed_at: string;
}

export default function VendorRiskPage() {
  const [contracts, setContracts] = useState<VendorContract[]>([]);
  const [riskAssessments, setRiskAssessments] = useState<Map<string, VendorRiskAssessment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast, toastType, showToast } = useToast();
  const [showContractModal, setShowContractModal] = useState(false);
  const [assessingVendor, setAssessingVendor] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [newContract, setNewContract] = useState<{
    contract_name: string;
    vendor_name: string;
    contract_number: string;
    contract_type: 'msa' | 'sow' | 'license' | 'dpa' | 'baa' | 'sla' | 'other';
    status: 'draft' | 'active' | 'renewal_pending' | 'expired' | 'terminated';
    start_date: string;
    end_date: string;
    security_requirements: string;
    data_processing_terms: string;
  }>({
    contract_name: '',
    vendor_name: '',
    contract_number: '',
    contract_type: 'msa',
    status: 'active',
    start_date: '',
    end_date: '',
    security_requirements: '',
    data_processing_terms: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const contractsRes = await organizationAPI.getContracts();
      setContracts(contractsRes.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load vendor risk data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await organizationAPI.createContract(newContract);
      setShowContractModal(false);
      setNewContract({
        contract_name: '',
        vendor_name: '',
        contract_number: '',
        contract_type: 'msa',
        status: 'active',
        start_date: '',
        end_date: '',
        security_requirements: '',
        data_processing_terms: ''
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create contract', 'error');
    }
  };

  const handleAssessVendorRisk = async (vendorName: string) => {
    setAssessingVendor(vendorName);
    try {
      const contract = contracts.find(c => c.vendor_name === vendorName);
      const vendorInfo = {
        vendor_name: vendorName,
        contract_type: contract?.contract_type || 'unknown',
        has_security_requirements: !!contract?.security_requirements,
        has_data_processing_terms: !!contract?.data_processing_terms,
        contract_status: contract?.status || 'unknown',
      };

      const res = await aiAPI.vendorRisk({ vendorInfo });
      const assessment: VendorRiskAssessment = {
        vendor_name: vendorName,
        risk_level: 'medium', // Would be parsed from AI response
        risk_score: 50,
        assessment_summary: res.data?.data?.result || 'Assessment completed',
        recommendations: [],
        assessed_at: new Date().toISOString(),
      };

      setRiskAssessments(prev => new Map(prev).set(vendorName, assessment));
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to assess vendor risk', 'error');
    } finally {
      setAssessingVendor(null);
    }
  };

  const filteredContracts = contracts.filter(c => {
    if (selectedStatus !== 'all' && c.status !== selectedStatus) return false;
    return true;
  });

  const uniqueVendors = Array.from(new Set(contracts.map(c => c.vendor_name)));
  
  const vendorStats = uniqueVendors.map(vendor => {
    const vendorContracts = contracts.filter(c => c.vendor_name === vendor);
    const activeContracts = vendorContracts.filter(c => c.status === 'active').length;
    const assessment = riskAssessments.get(vendor);
    
    return {
      vendor_name: vendor,
      contract_count: vendorContracts.length,
      active_count: activeContracts,
      risk_level: assessment?.risk_level || 'unknown',
    };
  });

  const riskCounts = {
    critical: vendorStats.filter(v => v.risk_level === 'critical').length,
    high: vendorStats.filter(v => v.risk_level === 'high').length,
    medium: vendorStats.filter(v => v.risk_level === 'medium').length,
    low: vendorStats.filter(v => v.risk_level === 'low').length,
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
            <h1 className="text-3xl font-bold text-gray-900">Vendor Contracts</h1>
            <p className="text-sm text-gray-600 mt-1">
              Track contract inventory, renewals, and lightweight vendor risk scoring.
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

        <div className="bg-purple-50 border border-purple-200 text-purple-900 px-4 py-3 rounded-lg text-sm">
          Use this workspace for contracts, SLAs, renewals, and quick vendor scoring. Need questionnaires,
          evidence requests, or document collection? Open{' '}
          <Link href="/dashboard/tprm" className="font-medium underline hover:text-purple-700">
            Third-Party Risk
          </Link>
          .
        </div>

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/tprm"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <span className="text-xl">🔗</span>
            <div>
              <div className="text-sm font-medium text-blue-800">Third-Party Risk (TPRM)</div>
              <div className="text-xs text-blue-600">Questionnaires, documents, evidence</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            <span className="text-xl">🛡️</span>
            <div>
              <div className="text-sm font-medium text-purple-800">AI Insights</div>
              <div className="text-xs text-purple-600">AI vendor risk, model risk, supply chain</div>
            </div>
          </Link>
          <Link href="/dashboard/threat-intel"
            className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
            <span className="text-xl">🎯</span>
            <div>
              <div className="text-sm font-medium text-orange-800">Threat Intelligence</div>
              <div className="text-xs text-orange-600">CVEs, KEVs, ATT&CK techniques</div>
            </div>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading vendor risk data...</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Vendors</p>
                    <p className="text-2xl font-bold mt-1 text-purple-600">
                      {uniqueVendors.length}
                    </p>
                  </div>
                  <div className="text-3xl">🏢</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {contracts.filter(c => c.status === 'active').length} active contracts
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">High/Critical Risk</p>
                    <p className="text-2xl font-bold mt-1 text-red-600">
                      {riskCounts.critical + riskCounts.high}
                    </p>
                  </div>
                  <div className="text-3xl">⚠️</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Requiring attention</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Expiring Soon</p>
                    <p className="text-2xl font-bold mt-1 text-yellow-600">
                      {contracts.filter(c => {
                        if (!c.end_date) return false;
                        const daysUntilExpiry = Math.floor((new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return daysUntilExpiry > 0 && daysUntilExpiry <= 90;
                      }).length}
                    </p>
                  </div>
                  <div className="text-3xl">📅</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Within 90 days</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Assessments</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">
                      {riskAssessments.size}
                    </p>
                  </div>
                  <div className="text-3xl">📊</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">AI-powered analysis</p>
              </div>
            </div>

            {/* Vendor Risk Matrix */}
            {vendorStats.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">Vendor Risk Matrix</h3>
                <VendorRiskMatrix data={vendorStats} />
              </div>
            )}

            {/* Vendor Contracts Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-semibold">Vendor Contracts</h3>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="renewal_pending">Renewal Pending</option>
                    <option value="expired">Expired</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
                <button
                  onClick={() => setShowContractModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  + Add Contract
                </button>
              </div>

              {filteredContracts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No vendor contracts found. Add one to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Vendor</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Contract</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">End Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Risk</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredContracts.map(contract => {
                        const assessment = riskAssessments.get(contract.vendor_name);
                        return (
                          <tr key={contract.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {contract.vendor_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {contract.contract_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {contract.contract_type?.toUpperCase() || 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                contract.status === 'active' ? 'bg-green-100 text-green-800' :
                                contract.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                                contract.status === 'renewal_pending' ? 'bg-yellow-100 text-yellow-800' :
                                contract.status === 'expired' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {contract.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              {assessment ? (
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  assessment.risk_level === 'critical' ? 'bg-red-100 text-red-800' :
                                  assessment.risk_level === 'high' ? 'bg-orange-100 text-orange-800' :
                                  assessment.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {assessment.risk_level}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Not assessed</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleAssessVendorRisk(contract.vendor_name)}
                                disabled={assessingVendor === contract.vendor_name}
                                className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                              >
                                {assessingVendor === contract.vendor_name ? 'Assessing...' : '🤖 Assess Risk'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Risk Assessments Detail */}
            {riskAssessments.size > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">Recent Risk Assessments</h3>
                <div className="space-y-4">
                  {Array.from(riskAssessments.values()).map(assessment => (
                    <div key={assessment.vendor_name} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">{assessment.vendor_name}</h4>
                          <p className="text-xs text-gray-500">
                            Assessed: {new Date(assessment.assessed_at).toLocaleString()}
                          </p>
                        </div>
                        <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                          assessment.risk_level === 'critical' ? 'bg-red-100 text-red-800' :
                          assessment.risk_level === 'high' ? 'bg-orange-100 text-orange-800' :
                          assessment.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {assessment.risk_level.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {assessment.assessment_summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Contract Modal */}
        {showContractModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Create Vendor Contract</h3>
              <form onSubmit={handleCreateContract} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vendor Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newContract.vendor_name}
                      onChange={(e) => setNewContract({ ...newContract, vendor_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contract Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newContract.contract_name}
                      onChange={(e) => setNewContract({ ...newContract, contract_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contract Number
                    </label>
                    <input
                      type="text"
                      value={newContract.contract_number}
                      onChange={(e) => setNewContract({ ...newContract, contract_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contract Type *
                    </label>
                    <select
                      required
                      value={newContract.contract_type}
                      onChange={(e) => setNewContract({ ...newContract, contract_type: e.target.value as 'msa' | 'sow' | 'license' | 'dpa' | 'baa' | 'sla' | 'other' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="msa">MSA</option>
                      <option value="sow">SOW</option>
                      <option value="license">License</option>
                      <option value="dpa">DPA</option>
                      <option value="baa">BAA</option>
                      <option value="sla">SLA</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status *
                    </label>
                    <select
                      required
                      value={newContract.status}
                      onChange={(e) => setNewContract({ ...newContract, status: e.target.value as 'draft' | 'active' | 'renewal_pending' | 'expired' | 'terminated' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="renewal_pending">Renewal Pending</option>
                      <option value="expired">Expired</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={newContract.start_date}
                      onChange={(e) => setNewContract({ ...newContract, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={newContract.end_date}
                      onChange={(e) => setNewContract({ ...newContract, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Security Requirements
                  </label>
                  <textarea
                    value={newContract.security_requirements}
                    onChange={(e) => setNewContract({ ...newContract, security_requirements: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="Describe security requirements and obligations..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Processing Terms
                  </label>
                  <textarea
                    value={newContract.data_processing_terms}
                    onChange={(e) => setNewContract({ ...newContract, data_processing_terms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="Describe data processing and privacy terms..."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Create Contract
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowContractModal(false)}
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
