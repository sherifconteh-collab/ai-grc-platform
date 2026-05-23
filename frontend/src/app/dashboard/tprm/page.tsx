// @tier: enterprise

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { tprmAPI, aiAPI, tprmPublicAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

type RiskTier = 'critical' | 'high' | 'medium' | 'low';
type ReviewStatus = 'pending_review' | 'in_review' | 'approved' | 'conditional' | 'rejected' | 'decommissioned';
type VendorType = 'software' | 'hardware' | 'services' | 'cloud' | 'managed_service' | 'data_processor' | 'other';
type DataAccess = 'none' | 'metadata' | 'limited' | 'full';
type QuestionnaireStatus = 'draft' | 'sent' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
type DocType = 'soc2_report' | 'iso27001_cert' | 'pen_test_report' | 'privacy_policy' | 'dpa' | 'baa' | 'insurance_cert' | 'business_continuity_plan' | 'incident_response_plan' | 'other';

interface Vendor {
  id: string;
  vendor_name: string;
  vendor_website?: string;
  vendor_contact_name?: string;
  vendor_contact_email?: string;
  vendor_type?: VendorType;
  risk_tier: RiskTier;
  review_status: ReviewStatus;
  next_review_date?: string;
  last_review_date?: string;
  data_access_level?: DataAccess;
  services_provided?: string;
  notes?: string;
  cmdb_asset_id?: string;
  cmdb_asset_name?: string;
  cmdb_asset_status?: string;
  cmdb_asset_category?: string;
  ai_risk_summary?: string;
  ai_risk_score?: number;
  ai_assessed_at?: string;
  questionnaire_count?: number;
  document_count?: number;
  created_at: string;
}

interface CmdbAsset {
  id: string;
  name: string;
  status?: string;
  criticality?: string;
  manufacturer?: string;
  model?: string;
  version?: string;
  category_name?: string;
}

interface Questionnaire {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  vendor_contact_email?: string;
  title: string;
  description?: string;
  status: QuestionnaireStatus;
  due_date?: string;
  sent_at?: string;
  completed_at?: string;
  opened_at?: string;
  vendor_email?: string;
  reminder_sent_at?: string;
  overall_score?: number;
  ai_generated: boolean;
  risk_tier?: RiskTier;
  created_at: string;
}

interface TprmDocument {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  document_type: DocType;
  document_name: string;
  request_status: string;
  requested_at: string;
  received_at?: string;
  expires_at?: string;
  notes?: string;
}

interface Evidence {
  id: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type?: string;
  is_sbom: boolean;
  sbom_format?: string;
  sbom_component_count?: number;
  sbom_summary?: {
    format?: string;
    component_count?: number;
    vulnerability_count?: number;
    components?: { name: string; version?: string; purl?: string }[];
    top_vulnerabilities?: { id: string; severity: string; description?: string }[];
  };
  ai_analysis?: string;
  ai_analyzed_at?: string;
  ai_risk_flags?: { severity: string; finding: string; recommendation?: string }[];
  uploaded_at: string;
}

interface Summary {
  vendors: {
    critical_count: string;
    high_count: string;
    medium_count: string;
    low_count: string;
    pending_review_count: string;
    due_for_review_count: string;
    total_count: string;
  };
  questionnaires: {
    overdue_count: string;
    open_count: string;
    completed_count: string;
    total_count: string;
  };
  documents: {
    requested_count: string;
    expiring_count: string;
    total_count: string;
  };
}

const RISK_TIER_COLORS: Record<RiskTier, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending_review: 'bg-gray-100 text-gray-800',
  in_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  conditional: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
  decommissioned: 'bg-gray-200 text-gray-600',
};

const Q_STATUS_COLORS: Record<QuestionnaireStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-200 text-gray-600',
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  soc2_report: 'SOC 2 Report',
  iso27001_cert: 'ISO 27001 Cert',
  pen_test_report: 'Pen Test Report',
  privacy_policy: 'Privacy Policy',
  dpa: 'DPA',
  baa: 'BAA',
  insurance_cert: 'Insurance Cert',
  business_continuity_plan: 'BCP',
  incident_response_plan: 'IR Plan',
  other: 'Other',
};

type ActiveTab = 'vendors' | 'questionnaires' | 'documents';

const emptyVendorForm = {
  vendor_name: '',
  vendor_website: '',
  vendor_contact_name: '',
  vendor_contact_email: '',
  vendor_type: 'software' as VendorType,
  risk_tier: 'medium' as RiskTier,
  review_status: 'pending_review' as ReviewStatus,
  next_review_date: '',
  data_access_level: 'none' as DataAccess,
  services_provided: '',
  notes: '',
  cmdb_asset_id: '',
};

const emptyDocForm = {
  vendor_id: '',
  document_type: 'soc2_report' as DocType,
  document_name: '',
  expires_at: '',
  notes: '',
};

export default function TprmPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vendors');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [documents, setDocuments] = useState<TprmDocument[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast, toastType, showToast } = useToast();

  // Modals
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showQModal, setShowQModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  // Forms
  const [vendorForm, setVendorForm] = useState({ ...emptyVendorForm });
  const [docForm, setDocForm] = useState({ ...emptyDocForm });

  // CMDB assets for vendor linkage
  const [cmdbAssets, setCmdbAssets] = useState<CmdbAsset[]>([]);
  const [cmdbSearch, setCmdbSearch] = useState('');

  // AI state
  const [aiLoadingVendorId, setAiLoadingVendorId] = useState<string | null>(null);
  const [aiQLoading, setAiQLoading] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<unknown[]>([]);
  const [qVendorId, setQVendorId] = useState('');
  const [qTitle, setQTitle] = useState('');
  const [qDueDate, setQDueDate] = useState('');
  const [qDescription, setQDescription] = useState('');

  // Questionnaire send state
  const [sendingQId, setSendingQId] = useState<string | null>(null);
  const [sendEmailOverride, setSendEmailOverride] = useState<Record<string, string>>({});

  // Evidence state
  const [evidenceByQId, setEvidenceByQId] = useState<Record<string, Evidence[]>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<string | null>(null);
  const [evidenceExpanded, setEvidenceExpanded] = useState<string | null>(null);
  const [evidenceAnalyzing, setEvidenceAnalyzing] = useState<string | null>(null);
  const [evidenceAnalysisResult, setEvidenceAnalysisResult] = useState<Record<string, string>>({});
  const [evidenceUploading, setEvidenceUploading] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [summaryRes, vendorsRes, qRes, docsRes] = await Promise.all([
        tprmAPI.getSummary(),
        tprmAPI.getVendors(),
        tprmAPI.getQuestionnaires(),
        tprmAPI.getDocuments(),
      ]);
      setSummary(summaryRes.data?.data);
      setVendors(vendorsRes.data?.data || []);
      setQuestionnaires(qRes.data?.data || []);
      setDocuments(docsRes.data?.data || []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to load TPRM data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadCmdbAssets = useCallback(async (search?: string) => {
    try {
      const res = await tprmAPI.getCmdbAssets(search || undefined);
      setCmdbAssets(res.data?.data || []);
    } catch {
      // CMDB may not be available in all editions; fail silently
      setCmdbAssets([]);
    }
  }, []);

  const handleSendQuestionnaire = async (q: Questionnaire) => {
    const emailOverride = sendEmailOverride[q.id] || '';
    let finalEmail = emailOverride || q.vendor_contact_email || '';
    if (!finalEmail) {
      const entered = window.prompt(`Enter the vendor email address to send "${q.title}" to:`);
      if (!entered) return;
      finalEmail = entered;
      setSendEmailOverride(prev => ({ ...prev, [q.id]: entered }));
    }
    setSendingQId(q.id);
    try {
      const res = await tprmAPI.sendQuestionnaire(q.id, {
        recipient_email: finalEmail
      });
      showToast(res.data.message || 'Questionnaire sent!');
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to send questionnaire', 'error');
    } finally {
      setSendingQId(null);
    }
  };

  const handleRemindQuestionnaire = async (qId: string) => {
    try {
      const res = await tprmAPI.remindQuestionnaire(qId);
      showToast(res.data.message || 'Reminder sent!');
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to send reminder', 'error');
    }
  };

  const loadEvidence = async (questionnaireId: string) => {
    setEvidenceLoading(questionnaireId);
    try {
      const res = await tprmAPI.getEvidence(questionnaireId);
      setEvidenceByQId(prev => ({ ...prev, [questionnaireId]: res.data?.data || [] }));
    } catch (err) {
      console.error('Failed to load evidence:', err);
    } finally {
      setEvidenceLoading(null);
    }
  };

  const handleToggleEvidence = (questionnaireId: string) => {
    if (evidenceExpanded === questionnaireId) {
      setEvidenceExpanded(null);
    } else {
      setEvidenceExpanded(questionnaireId);
      if (!evidenceByQId[questionnaireId]) {
        loadEvidence(questionnaireId);
      }
    }
  };

  const handleDeleteEvidence = async (questionnaireId: string, evidenceId: string) => {
    if (!confirm('Delete this evidence file?')) return;
    try {
      await tprmAPI.deleteEvidence(evidenceId);
      setEvidenceByQId(prev => ({
        ...prev,
        [questionnaireId]: (prev[questionnaireId] || []).filter(e => e.id !== evidenceId)
      }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to delete evidence', 'error');
    }
  };

  const handleAnalyzeEvidence = async (questionnaireId: string) => {
    setEvidenceAnalyzing(questionnaireId);
    try {
      const res = await aiAPI.tprmAnalyzeEvidence({ questionnaireId });
      const analysis = res.data?.data?.result || '';
      setEvidenceAnalysisResult(prev => ({ ...prev, [questionnaireId]: analysis }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'AI evidence analysis failed', 'error');
    } finally {
      setEvidenceAnalyzing(null);
    }
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await tprmAPI.createVendor({
        vendor_name: vendorForm.vendor_name,
        vendor_website: vendorForm.vendor_website || null,
        vendor_contact_name: vendorForm.vendor_contact_name || null,
        vendor_contact_email: vendorForm.vendor_contact_email || null,
        vendor_type: vendorForm.vendor_type,
        risk_tier: vendorForm.risk_tier,
        review_status: vendorForm.review_status,
        next_review_date: vendorForm.next_review_date || null,
        data_access_level: vendorForm.data_access_level,
        services_provided: vendorForm.services_provided || null,
        notes: vendorForm.notes || null,
        cmdb_asset_id: vendorForm.cmdb_asset_id || null,
      });
      setShowVendorModal(false);
      setVendorForm({ ...emptyVendorForm });
      setCmdbSearch('');
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to create vendor', 'error');
    }
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await tprmAPI.createDocument({
        vendor_id: docForm.vendor_id,
        document_type: docForm.document_type,
        document_name: docForm.document_name,
        expires_at: docForm.expires_at || null,
        notes: docForm.notes || null,
      });
      setShowDocModal(false);
      setDocForm({ ...emptyDocForm });
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to create document request', 'error');
    }
  };

  const handleDocStatusUpdate = async (docId: string, status: string) => {
    try {
      await tprmAPI.updateDocument(docId, { request_status: status });
      await loadAll();
    } catch {
      showToast('Failed to update document status', 'error');
    }
  };

  const handleVendorStatusUpdate = async (vendorId: string, review_status: ReviewStatus) => {
    try {
      await tprmAPI.updateVendor(vendorId, { review_status });
      await loadAll();
    } catch {
      showToast('Failed to update vendor status', 'error');
    }
  };

  const handleAIAssess = async (vendor: Vendor) => {
    setAiLoadingVendorId(vendor.id);
    try {
      const vendorInfo = {
        vendor_name: vendor.vendor_name,
        vendor_type: vendor.vendor_type,
        risk_tier: vendor.risk_tier,
        data_access_level: vendor.data_access_level,
        services_provided: vendor.services_provided,
        review_status: vendor.review_status,
      };
      const res = await aiAPI.vendorRisk({ vendorInfo });
      const summary = res.data?.data?.result || '';
      await tprmAPI.storeVendorAIAssessment(vendor.id, { ai_risk_score: 0, ai_risk_summary: summary });
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to run AI assessment', 'error');
    } finally {
      setAiLoadingVendorId(null);
    }
  };

  const handleGenerateQuestionnaire = async () => {
    if (!qVendorId) { showToast('Please select a vendor', 'error'); return; }
    const vendor = vendors.find(v => v.id === qVendorId);
    if (!vendor) { showToast('Vendor not found', 'error'); return; }

    setAiQLoading(true);
    try {
      const res = await aiAPI.tprmGenerateQuestionnaire({
        vendorInfo: {
          vendor_name: vendor.vendor_name,
          vendor_type: vendor.vendor_type,
          risk_tier: vendor.risk_tier,
          data_access_level: vendor.data_access_level,
          services_provided: vendor.services_provided,
        }
      });
      const raw = res.data?.data?.result || '[]';
      // Extract JSON array from the response; AI may wrap it in prose
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) {
        showToast('AI did not return a valid questionnaire format. Please try again.', 'error');
        return;
      }
      let parsed: unknown[];
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        showToast('Failed to parse AI-generated questionnaire. Please try again.', 'error');
        return;
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        showToast('AI returned an empty questionnaire. Please try again.', 'error');
        return;
      }
      setGeneratedQuestions(parsed);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to generate questionnaire', 'error');
    } finally {
      setAiQLoading(false);
    }
  };

  const handleSaveQuestionnaire = async () => {
    if (!qVendorId || !qTitle || generatedQuestions.length === 0) {
      showToast('Vendor, title, and questions are required', 'error');
      return;
    }
    try {
      await tprmAPI.createQuestionnaire({
        vendor_id: qVendorId,
        title: qTitle,
        description: qDescription || null,
        due_date: qDueDate || null,
        questions: generatedQuestions,
        ai_generated: true,
      });
      setShowQModal(false);
      setGeneratedQuestions([]);
      setQVendorId('');
      setQTitle('');
      setQDueDate('');
      setQDescription('');
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error || 'Failed to save questionnaire', 'error');
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
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Third-Party Risk Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage vendor due diligence, questionnaires, and compliance documentation
            </p>
          </div>
          <button onClick={loadAll} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
            🔄 Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/vendor-risk"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            <span className="text-xl">🤝</span>
            <div>
              <div className="text-sm font-medium text-purple-800">Vendor Contracts</div>
              <div className="text-xs text-purple-600">Contracts, renewals, SLAs, quick scoring</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <span className="text-xl">🛡️</span>
            <div>
              <div className="text-sm font-medium text-blue-800">AI Insights</div>
              <div className="text-xs text-blue-600">AI vendor risk, model risk, supply chain</div>
            </div>
          </Link>
          <Link href="/dashboard/regulatory-news"
            className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <span className="text-xl">📰</span>
            <div>
              <div className="text-sm font-medium text-green-800">Regulatory News</div>
              <div className="text-xs text-green-600">DORA, EBA, GDPR, FedRAMP updates</div>
            </div>
          </Link>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase font-medium">Total Vendors</p>
              <p className="text-3xl font-bold text-purple-600 mt-1">{summary.vendors.total_count}</p>
              <p className="text-xs text-gray-400 mt-1">
                {summary.vendors.critical_count} critical · {summary.vendors.high_count} high
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase font-medium">Pending Review</p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">{summary.vendors.pending_review_count}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.vendors.due_for_review_count} due within 30 days</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase font-medium">Questionnaires</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{summary.questionnaires.open_count}</p>
              <p className="text-xs text-gray-400 mt-1">
                {summary.questionnaires.overdue_count} overdue · {summary.questionnaires.completed_count} completed
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase font-medium">Documents</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{summary.documents.total_count}</p>
              <p className="text-xs text-gray-400 mt-1">
                {summary.documents.requested_count} requested · {summary.documents.expiring_count} expiring
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex gap-0">
              {(['vendors', 'questionnaires', 'documents'] as ActiveTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'vendors' && '🏢 Vendors'}
                  {tab === 'questionnaires' && '📋 Questionnaires'}
                  {tab === 'documents' && '📄 Documents'}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto" />
                <p className="text-gray-500 mt-3 text-sm">Loading...</p>
              </div>
            ) : (
              <>
                {/* ===== VENDORS TAB ===== */}
                {activeTab === 'vendors' && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-base font-semibold text-gray-800">Vendor Registry</h2>
                      <button
                        onClick={() => { setShowVendorModal(true); loadCmdbAssets(); }}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                      >
                        + Add Vendor
                      </button>
                    </div>

                    {vendors.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        No vendors registered yet. Add one to start tracking third-party risks.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Risk Tier</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CMDB Asset</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Access</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Review Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Next Review</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Q/Docs</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">AI Score</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {vendors.map(vendor => (
                              <tr key={vendor.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{vendor.vendor_name}</div>
                                  {vendor.vendor_contact_email && (
                                    <div className="text-xs text-gray-400">{vendor.vendor_contact_email}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-600 capitalize">
                                  {vendor.vendor_type?.replace('_', ' ') || '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_TIER_COLORS[vendor.risk_tier]}`}>
                                    {vendor.risk_tier}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  {vendor.cmdb_asset_name ? (
                                    <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                                      🗄️ {vendor.cmdb_asset_name}
                                      {vendor.cmdb_asset_category && (
                                        <span className="text-gray-400 font-normal">({vendor.cmdb_asset_category})</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-600 capitalize">
                                  {vendor.data_access_level || '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <select
                                    value={vendor.review_status}
                                    onChange={e => handleVendorStatusUpdate(vendor.id, e.target.value as ReviewStatus)}
                                    className={`text-xs px-2 py-1 rounded border-0 font-medium cursor-pointer ${REVIEW_STATUS_COLORS[vendor.review_status]}`}
                                  >
                                    <option value="pending_review">Pending Review</option>
                                    <option value="in_review">In Review</option>
                                    <option value="approved">Approved</option>
                                    <option value="conditional">Conditional</option>
                                    <option value="rejected">Rejected</option>
                                    <option value="decommissioned">Decommissioned</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs">
                                  {vendor.next_review_date
                                    ? new Date(vendor.next_review_date).toLocaleDateString()
                                    : '—'}
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs">
                                  {vendor.questionnaire_count || 0}Q / {vendor.document_count || 0}D
                                </td>
                                <td className="px-4 py-3">
                                  {vendor.ai_risk_score !== undefined && vendor.ai_risk_score !== null ? (
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                                      vendor.ai_risk_score >= 70 ? 'bg-red-100 text-red-700' :
                                      vendor.ai_risk_score >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {vendor.ai_risk_score}/100
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setSelectedVendor(vendor)}
                                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                    >
                                      Details
                                    </button>
                                    <button
                                      onClick={() => handleAIAssess(vendor)}
                                      disabled={aiLoadingVendorId === vendor.id}
                                      className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                                    >
                                      {aiLoadingVendorId === vendor.id ? '...' : '🤖 Assess'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== QUESTIONNAIRES TAB ===== */}
                {activeTab === 'questionnaires' && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-base font-semibold text-gray-800">Security Questionnaires</h2>
                      <button
                        onClick={() => setShowQModal(true)}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                      >
                        🤖 Generate Questionnaire
                      </button>
                    </div>

                    {questionnaires.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        No questionnaires yet. Use AI to generate a tailored questionnaire for a vendor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sent To</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Opened</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {questionnaires.map(q => (
                              <React.Fragment key={q.id}>
                              <tr className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{q.vendor_name || '—'}</div>
                                  {q.risk_tier && (
                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${RISK_TIER_COLORS[q.risk_tier]}`}>
                                      {q.risk_tier}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  <div>{q.title}</div>
                                  {q.ai_generated && (
                                    <span className="inline-flex px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs mt-0.5">🤖 AI</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${Q_STATUS_COLORS[q.status]}`}>
                                    {q.status.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-600">
                                  {q.vendor_email ? (
                                    <div>
                                      <div className="text-gray-700">{q.vendor_email}</div>
                                      {q.sent_at && (
                                        <div className="text-gray-400">{new Date(q.sent_at).toLocaleDateString()}</div>
                                      )}
                                      {q.reminder_sent_at && (
                                        <div className="text-yellow-600 text-xs">⏰ Reminded {new Date(q.reminder_sent_at).toLocaleDateString()}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">Not sent</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {q.opened_at ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-semibold">
                                      ✓ Opened
                                    </span>
                                  ) : q.vendor_email ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                                      Not opened
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs">
                                  {q.due_date ? new Date(q.due_date).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {q.overall_score !== undefined && q.overall_score !== null
                                    ? `${q.overall_score}/100`
                                    : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-1">
                                    {q.status === 'draft' || !q.vendor_email ? (
                                      <button
                                        onClick={() => handleSendQuestionnaire(q)}
                                        disabled={sendingQId === q.id}
                                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                      >
                                        {sendingQId === q.id ? '...' : '📧 Send'}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleRemindQuestionnaire(q.id)}
                                        className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                                      >
                                        ⏰ Remind
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleToggleEvidence(q.id)}
                                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                    >
                                      {evidenceExpanded === q.id ? '▲ Evidence' : '📎 Evidence'}
                                      {evidenceByQId[q.id]?.length ? ` (${evidenceByQId[q.id].length})` : ''}
                                    </button>
                                    <select
                                      value={q.status}
                                      onChange={e => tprmAPI.updateQuestionnaire(q.id, { status: e.target.value }).then(loadAll)}
                                      className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-700"
                                    >
                                      <option value="draft">Draft</option>
                                      <option value="sent">Sent</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="completed">Completed</option>
                                      <option value="overdue">Overdue</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                  </div>
                                </td>
                              </tr>
                              {/* Evidence panel — inline below each questionnaire row */}
                              {evidenceExpanded === q.id && (
                                <tr>
                                  <td colSpan={8} className="px-4 pb-4 bg-gray-50 border-b border-gray-100">
                                    <div className="border border-gray-200 rounded-lg p-4 bg-white mt-2">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-gray-800">📎 Vendor Evidence</h4>
                                        <div className="flex items-center gap-2">
                                          {(evidenceByQId[q.id] || []).length > 0 && (
                                            <button
                                              onClick={() => handleAnalyzeEvidence(q.id)}
                                              disabled={evidenceAnalyzing === q.id}
                                              className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 font-medium"
                                            >
                                              {evidenceAnalyzing === q.id ? '🤖 Analyzing...' : '🤖 AI Analyze Evidence'}
                                            </button>
                                          )}
                                          <label className={`text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer font-medium ${evidenceUploading === q.id ? 'opacity-50 pointer-events-none' : ''}`}>
                                            {evidenceUploading === q.id ? 'Uploading...' : '⬆ Upload Evidence'}
                                            <input
                                              type="file"
                                              className="hidden"
                                              accept=".json,.xml,.yaml,.yml,.spdx,.rdf,.swidtag,.pdf,.txt,.csv,.xlsx,.docx"
                                              disabled={evidenceUploading === q.id}
                                              onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                setEvidenceUploading(q.id);
                                                try {
                                                  const qDetail = await tprmAPI.getQuestionnaire(q.id);
                                                  const token = qDetail.data?.data?.access_token;
                                                  if (!token) {
                                                    showToast('This questionnaire has no access token — send it to the vendor first.', 'error');
                                                    return;
                                                  }
                                                  const formData = new FormData();
                                                  formData.append('file', file);
                                                  const result = await tprmPublicAPI.uploadEvidence(token, formData);
                                                  if (result.data.success) {
                                                    showToast(result.data.message || 'Evidence uploaded.');
                                                    await loadEvidence(q.id);
                                                  } else {
                                                    showToast(result.data.error || 'Upload failed', 'error');
                                                  }
                                                } catch (uploadErr: unknown) {
                                                  const ue = uploadErr as { message?: string };
                                                  showToast(ue.message || 'Evidence upload failed. Check file type (SBOM, PDF, TXT, CSV, XLSX, DOCX) and size (max 10 MB).', 'error');
                                                } finally {
                                                  setEvidenceUploading(null);
                                                  e.target.value = '';
                                                }
                                              }}
                                            />
                                          </label>
                                        </div>
                                      </div>

                                      <p className="text-xs text-gray-500 mb-3">
                                        Vendors can upload SBOMs, certification reports, pen test results, and other supporting documents via their questionnaire link.
                                        Once uploaded, use <strong>🤖 AI Analyze Evidence</strong> to cross-reference evidence against their questionnaire responses.
                                      </p>

                                      {evidenceLoading === q.id ? (
                                        <div className="text-xs text-gray-400 py-2">Loading evidence...</div>
                                      ) : !evidenceByQId[q.id] || evidenceByQId[q.id].length === 0 ? (
                                        <div className="text-xs text-gray-400 py-2">No evidence files uploaded yet.</div>
                                      ) : (
                                        <div className="space-y-2">
                                          {(evidenceByQId[q.id] || []).map(ev => (
                                            <div key={ev.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="text-sm font-medium text-gray-800 truncate">{ev.original_filename}</span>
                                                  {ev.is_sbom ? (
                                                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                                      SBOM · {ev.sbom_format || 'unknown'}
                                                    </span>
                                                  ) : (
                                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Document</span>
                                                  )}
                                                  {ev.ai_analyzed_at && (
                                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ AI analyzed</span>
                                                  )}
                                                </div>
                                                {ev.is_sbom && ev.sbom_summary && (
                                                  <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-3">
                                                    <span>📦 {ev.sbom_summary.component_count || 0} components</span>
                                                    {(ev.sbom_summary.vulnerability_count || 0) > 0 && (
                                                      <span className="text-red-600 font-medium">⚠️ {ev.sbom_summary.vulnerability_count} vulnerabilities</span>
                                                    )}
                                                  </div>
                                                )}
                                                <div className="text-xs text-gray-400 mt-0.5">
                                                  {Math.round(ev.file_size_bytes / 1024)} KB · {new Date(ev.uploaded_at).toLocaleDateString()}
                                                </div>
                                              </div>
                                              <button
                                                onClick={() => handleDeleteEvidence(q.id, ev.id)}
                                                className="ml-3 text-xs text-red-400 hover:text-red-600 shrink-0"
                                                title="Delete evidence"
                                              >
                                                🗑
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* AI analysis result */}
                                      {evidenceAnalysisResult[q.id] && (
                                        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                                          <h5 className="text-sm font-semibold text-purple-800 mb-2">🤖 AI Evidence Analysis</h5>
                                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{evidenceAnalysisResult[q.id]}</pre>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== DOCUMENTS TAB ===== */}
                {activeTab === 'documents' && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-base font-semibold text-gray-800">Documentation Requests</h2>
                      <button
                        onClick={() => setShowDocModal(true)}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                      >
                        + Request Document
                      </button>
                    </div>

                    {documents.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        No document requests yet. Request certifications or reports from your vendors.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {documents.map(doc => (
                              <tr key={doc.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-900">{doc.vendor_name || '—'}</td>
                                <td className="px-4 py-3 text-gray-700">{doc.document_name}</td>
                                <td className="px-4 py-3 text-gray-600">
                                  {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    doc.request_status === 'accepted' ? 'bg-green-100 text-green-800' :
                                    doc.request_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                    doc.request_status === 'under_review' ? 'bg-blue-100 text-blue-800' :
                                    doc.request_status === 'received' ? 'bg-purple-100 text-purple-800' :
                                    doc.request_status === 'expired' ? 'bg-gray-200 text-gray-600' :
                                    'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {doc.request_status.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                  {new Date(doc.requested_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                  {doc.expires_at ? new Date(doc.expires_at).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <select
                                    value={doc.request_status}
                                    onChange={e => handleDocStatusUpdate(doc.id, e.target.value)}
                                    className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-700"
                                  >
                                    <option value="requested">Requested</option>
                                    <option value="received">Received</option>
                                    <option value="under_review">Under Review</option>
                                    <option value="accepted">Accepted</option>
                                    <option value="rejected">Rejected</option>
                                    <option value="expired">Expired</option>
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ===== VENDOR DETAIL PANEL ===== */}
        {selectedVendor && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-start p-6 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedVendor.vendor_name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{selectedVendor.vendor_type?.replace('_', ' ')}</p>
                </div>
                <button onClick={() => setSelectedVendor(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Risk Tier:</span><br />
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${RISK_TIER_COLORS[selectedVendor.risk_tier]}`}>
                      {selectedVendor.risk_tier}
                    </span>
                  </div>
                  <div><span className="text-gray-500">Review Status:</span><br />
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${REVIEW_STATUS_COLORS[selectedVendor.review_status]}`}>
                      {selectedVendor.review_status.replace('_', ' ')}
                    </span>
                  </div>
                  <div><span className="text-gray-500">Data Access:</span><br /><span className="capitalize">{selectedVendor.data_access_level || '—'}</span></div>
                  <div><span className="text-gray-500">Next Review:</span><br />{selectedVendor.next_review_date ? new Date(selectedVendor.next_review_date).toLocaleDateString() : '—'}</div>
                  {selectedVendor.cmdb_asset_name && (
                    <div className="col-span-2">
                      <span className="text-gray-500">CMDB Asset:</span><br />
                      <span className="inline-flex items-center gap-1 text-blue-700 font-medium text-sm mt-1">
                        🗄️ {selectedVendor.cmdb_asset_name}
                        {selectedVendor.cmdb_asset_category && (
                          <span className="text-gray-400 font-normal">({selectedVendor.cmdb_asset_category})</span>
                        )}
                        {selectedVendor.cmdb_asset_status && (
                          <span className="inline-flex px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs ml-1">{selectedVendor.cmdb_asset_status}</span>
                        )}
                      </span>
                    </div>
                  )}
                  {selectedVendor.vendor_contact_name && (
                    <div><span className="text-gray-500">Contact:</span><br />{selectedVendor.vendor_contact_name}</div>
                  )}
                  {selectedVendor.vendor_contact_email && (
                    <div><span className="text-gray-500">Email:</span><br />{selectedVendor.vendor_contact_email}</div>
                  )}
                </div>
                {selectedVendor.services_provided && (
                  <div className="text-sm">
                    <span className="text-gray-500 block mb-1">Services Provided:</span>
                    <p className="text-gray-700">{selectedVendor.services_provided}</p>
                  </div>
                )}
                {selectedVendor.ai_risk_summary && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-purple-700 mb-2">🤖 AI Risk Assessment</p>
                    {selectedVendor.ai_risk_score !== undefined && (
                      <p className="text-sm font-bold text-purple-800 mb-1">Score: {selectedVendor.ai_risk_score}/100</p>
                    )}
                    <p className="text-sm text-purple-900 whitespace-pre-wrap">{selectedVendor.ai_risk_summary}</p>
                    {selectedVendor.ai_assessed_at && (
                      <p className="text-xs text-purple-500 mt-2">Assessed: {new Date(selectedVendor.ai_assessed_at).toLocaleString()}</p>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setSelectedVendor(null); setQVendorId(selectedVendor.id); setShowQModal(true); }}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    🤖 Generate Questionnaire
                  </button>
                  <button
                    onClick={() => { setSelectedVendor(null); setDocForm({ ...emptyDocForm, vendor_id: selectedVendor.id }); setShowDocModal(true); }}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                  >
                    📄 Request Document
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== ADD VENDOR MODAL ===== */}
        {showVendorModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Add Vendor</h3>
                <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <form onSubmit={handleCreateVendor} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
                    <input required type="text" value={vendorForm.vendor_name}
                      onChange={e => setVendorForm({ ...vendorForm, vendor_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Type</label>
                    <select value={vendorForm.vendor_type}
                      onChange={e => setVendorForm({ ...vendorForm, vendor_type: e.target.value as VendorType })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="software">Software</option>
                      <option value="hardware">Hardware</option>
                      <option value="services">Services</option>
                      <option value="cloud">Cloud</option>
                      <option value="managed_service">Managed Service</option>
                      <option value="data_processor">Data Processor</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Risk Tier</label>
                    <select value={vendorForm.risk_tier}
                      onChange={e => setVendorForm({ ...vendorForm, risk_tier: e.target.value as RiskTier })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data Access Level</label>
                    <select value={vendorForm.data_access_level}
                      onChange={e => setVendorForm({ ...vendorForm, data_access_level: e.target.value as DataAccess })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="none">None</option>
                      <option value="metadata">Metadata</option>
                      <option value="limited">Limited</option>
                      <option value="full">Full</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Next Review Date</label>
                    <input type="date" value={vendorForm.next_review_date}
                      onChange={e => setVendorForm({ ...vendorForm, next_review_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                    <input type="text" value={vendorForm.vendor_contact_name}
                      onChange={e => setVendorForm({ ...vendorForm, vendor_contact_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                    <input type="email" value={vendorForm.vendor_contact_email}
                      onChange={e => setVendorForm({ ...vendorForm, vendor_contact_email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                    <input type="url" value={vendorForm.vendor_website}
                      onChange={e => setVendorForm({ ...vendorForm, vendor_website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="https://..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Services Provided</label>
                    <textarea rows={2} value={vendorForm.services_provided}
                      onChange={e => setVendorForm({ ...vendorForm, services_provided: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Describe what services this vendor provides..." />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea rows={2} value={vendorForm.notes}
                      onChange={e => setVendorForm({ ...vendorForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      🗄️ Link to CMDB Asset
                      <span className="text-gray-400 font-normal ml-1">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={cmdbSearch}
                      onChange={e => { setCmdbSearch(e.target.value); loadCmdbAssets(e.target.value); }}
                      placeholder="Search CMDB assets by name..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-1"
                    />
                    {cmdbAssets.length > 0 && (
                      <select
                        value={vendorForm.cmdb_asset_id}
                        onChange={e => setVendorForm({ ...vendorForm, cmdb_asset_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        size={Math.min(cmdbAssets.length + 1, 5)}
                      >
                        <option value="">— No CMDB link —</option>
                        {cmdbAssets.map(asset => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                            {asset.category_name ? ` (${asset.category_name})` : ''}
                            {asset.manufacturer ? ` · ${asset.manufacturer}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {vendorForm.cmdb_asset_id && (
                      <p className="text-xs text-blue-600 mt-1">
                        ✓ Linked: {cmdbAssets.find(a => a.id === vendorForm.cmdb_asset_id)?.name || vendorForm.cmdb_asset_id}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
                    Add Vendor
                  </button>
                  <button type="button" onClick={() => setShowVendorModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== REQUEST DOCUMENT MODAL ===== */}
        {showDocModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Request Document</h3>
                <button onClick={() => setShowDocModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <form onSubmit={handleCreateDoc} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                  <select required value={docForm.vendor_id}
                    onChange={e => setDocForm({ ...docForm, vendor_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Select vendor...</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Type *</label>
                  <select required value={docForm.document_type}
                    onChange={e => setDocForm({ ...docForm, document_type: e.target.value as DocType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Name *</label>
                  <input required type="text" value={docForm.document_name}
                    onChange={e => setDocForm({ ...docForm, document_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="e.g., Acme Corp SOC 2 Type II Report 2024" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires</label>
                  <input type="date" value={docForm.expires_at}
                    onChange={e => setDocForm({ ...docForm, expires_at: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea rows={2} value={docForm.notes}
                    onChange={e => setDocForm({ ...docForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">
                    Request Document
                  </button>
                  <button type="button" onClick={() => setShowDocModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== GENERATE QUESTIONNAIRE MODAL ===== */}
        {showQModal && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">🤖 AI-Generated Questionnaire</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Let AI create a tailored security questionnaire for your vendor</p>
                </div>
                <button onClick={() => { setShowQModal(false); setGeneratedQuestions([]); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                  <select value={qVendorId} onChange={e => setQVendorId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">Select vendor...</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Questionnaire Title *</label>
                  <input type="text" value={qTitle} onChange={e => setQTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="e.g., Annual Security Questionnaire 2025" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input type="date" value={qDueDate} onChange={e => setQDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea rows={2} value={qDescription} onChange={e => setQDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Optional context for this questionnaire..." />
                </div>

                <button
                  onClick={handleGenerateQuestionnaire}
                  disabled={!qVendorId || aiQLoading}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {aiQLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Generating questions with AI...
                    </>
                  ) : (
                    '🤖 Generate Questions with AI'
                  )}
                </button>

                {generatedQuestions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">
                      Generated {generatedQuestions.length} questions:
                    </h4>
                    <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3">
                      {(generatedQuestions as Array<{ id: string; category: string; question: string; type: string; required: boolean }>).map((q, i) => (
                        <div key={i} className="text-xs p-2 bg-gray-50 rounded">
                          <span className="inline-flex px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs mr-1">{q.category}</span>
                          <span className="text-gray-700">{q.question}</span>
                          <span className="text-gray-400 ml-1">({q.type})</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveQuestionnaire}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        ✅ Save Questionnaire
                      </button>
                      <button
                        onClick={handleGenerateQuestionnaire}
                        disabled={aiQLoading}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm disabled:opacity-50"
                      >
                        🔄 Regenerate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
