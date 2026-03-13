// @tier: community
'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { assessmentsAPI, usersAPI, aiAPI } from '@/lib/api';
import { useAutoAIResult } from '@/lib/useAutoAI';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessAuditorWorkspace, hasPermission } from '@/lib/access';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { groupByControlFamily } from '@/lib/controlFamilies';

interface Procedure {
  id: string;
  procedure_id: string;
  procedure_type: string;
  title: string;
  description: string;
  expected_evidence: string | null;
  assessment_method: string | null;
  depth: string;
  frequency_guidance: string | null;
  assessor_notes: string | null;
  source_document: string | null;
  control_id: string;
  control_title: string;
  framework_code: string;
  framework_name: string;
  result_status: string | null;
  assessed_at: string | null;
}

interface FrameworkOption {
  code: string;
  name: string;
  procedure_count: string;
  control_count: string;
  source_document: string | null;
}

interface Stats {
  summary: {
    total_procedures: number;
    findings_requiring_remediation: number;
  };
  by_framework: {
    code: string;
    name: string;
    total_procedures: string;
    satisfied: string;
    other_than_satisfied: string;
    not_applicable: string;
    assessed: string;
  }[];
  by_type: {
    procedure_type: string;
    total: string;
    assessed: string;
  }[];
  recent_results: any[];
}

function AssessmentsPageInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const canWriteAssessments = hasPermission(user, 'assessments.write');
  const canUseAuditorWorkspace = canAccessAuditorWorkspace(user);
  const canAssignAuditors = hasPermission(user, 'users.manage') && canWriteAssessments;
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState('');
  const [error, setError] = useState('');

  const auditReadiness = useAutoAIResult({
    cacheKey: `audit-readiness-${user?.organizationId}`,
    signature: `${stats?.summary?.total_procedures ?? 0}-${stats?.by_framework?.length ?? 0}`,
    enabled: !!stats,
    ttlMs: 6 * 60 * 60 * 1000,
    run: async () => {
      const res = await aiAPI.auditReadiness();
      return res.data?.data?.result;
    }
  });

  // Filters
  const [selectedFramework, setSelectedFramework] = useState('');
  const [selectedControl, setSelectedControl] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedDepth, setSelectedDepth] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'procedures' | 'results'>('overview');
  const initializedFromQuery = useRef(false);
  const [expandedProcedureFamilies, setExpandedProcedureFamilies] = useState<Record<string, boolean>>({});
  const [expandedProcedureControls, setExpandedProcedureControls] = useState<Record<string, boolean>>({});

  // Recording result modal
  const [recordingProcedure, setRecordingProcedure] = useState<Procedure | null>(null);
  const [resultStatus, setResultStatus] = useState('');
  const [resultFinding, setResultFinding] = useState('');
  const [resultEvidence, setResultEvidence] = useState('');
  const [resultRiskLevel, setResultRiskLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedHandoffEngagementId, setSelectedHandoffEngagementId] = useState('');
  const [selectedLeadAuditorId, setSelectedLeadAuditorId] = useState('');
  const [selectedOwnerUserId, setSelectedOwnerUserId] = useState('');

  useEffect(() => {
    loadInitialData();
  }, [canAssignAuditors]);

  useEffect(() => {
    if (initializedFromQuery.current) return;

    const tab = searchParams.get('tab');
    const frameworkCode = searchParams.get('framework_code');
    const controlId = searchParams.get('control_id');
    const search = searchParams.get('search');
    const procedureType = searchParams.get('procedure_type');
    const depth = searchParams.get('depth');

    if (tab === 'overview' || tab === 'procedures' || tab === 'results') {
      setActiveTab(tab);
    }
    if (frameworkCode) {
      setSelectedFramework(frameworkCode);
    }
    if (controlId) {
      setSelectedControl(controlId);
    }
    if (search) {
      setSearchQuery(search);
    }
    if (procedureType) {
      setSelectedType(procedureType);
    }
    if (depth) {
      setSelectedDepth(depth);
    }

    initializedFromQuery.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'procedures') {
      loadProcedures();
    }
  }, [activeTab, selectedFramework, selectedControl, selectedType, selectedDepth, searchQuery]);

  const procedureFamilies = useMemo(
    () => groupByControlFamily(procedures, (procedure) => procedure.control_id),
    [procedures]
  );

  const selectedHandoffEngagement = useMemo(
    () => engagements.find((entry) => entry.id === selectedHandoffEngagementId) || null,
    [engagements, selectedHandoffEngagementId]
  );

  const selectedHandoffLocked = Boolean(selectedHandoffEngagement?.lead_auditor_id);

  const auditorCandidates = useMemo(
    () => teamUsers.filter((entry) => String(entry.role || '').toLowerCase() === 'auditor'),
    [teamUsers]
  );

  useEffect(() => {
    if (procedureFamilies.length === 0) {
      setExpandedProcedureFamilies({});
      setExpandedProcedureControls({});
      return;
    }

    setExpandedProcedureFamilies((prev) => {
      const next: Record<string, boolean> = {};
      procedureFamilies.forEach((family, index) => {
        next[family.family] = prev[family.family] ?? index === 0;
      });
      return next;
    });

    setExpandedProcedureControls((prev) => {
      const next: Record<string, boolean> = {};
      let firstControlKey: string | null = null;
      for (const family of procedureFamilies) {
        for (const control of family.controls) {
          const key = `${family.family}::${control.controlId}`;
          if (!firstControlKey) firstControlKey = key;
          next[key] = prev[key] ?? key === firstControlKey;
        }
      }
      return next;
    });
  }, [procedureFamilies]);

  useEffect(() => {
    if (!canAssignAuditors) return;
    if (selectedHandoffEngagementId) return;
    if (engagements.length === 0) return;
    const preferred = engagements.find((entry) => !entry.lead_auditor_id) || engagements[0];
    setSelectedHandoffEngagementId(preferred.id);
  }, [canAssignAuditors, engagements, selectedHandoffEngagementId]);

  useEffect(() => {
    if (!selectedHandoffEngagement) {
      setSelectedLeadAuditorId('');
      setSelectedOwnerUserId('');
      return;
    }
    setSelectedLeadAuditorId(selectedHandoffEngagement.lead_auditor_id || '');
    setSelectedOwnerUserId(selectedHandoffEngagement.engagement_owner_id || '');
    setHandoffNotice('');
  }, [selectedHandoffEngagement]);

  const loadHandoffData = async () => {
    if (!canAssignAuditors) return;
    try {
      setHandoffLoading(true);
      const [engagementsRes, usersRes] = await Promise.all([
        assessmentsAPI.getEngagements({ limit: 200, offset: 0 }),
        usersAPI.getOrgUsers()
      ]);

      setEngagements(engagementsRes.data?.data?.engagements || []);
      setTeamUsers(usersRes.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load auditor handoff data');
    } finally {
      setHandoffLoading(false);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [frameworksRes, statsRes] = await Promise.all([
        assessmentsAPI.getFrameworks(),
        assessmentsAPI.getStats(),
      ]);

      // Backend historically returned one row per (framework_code, source_document).
      // Normalize to one row per framework_code to avoid duplicate dropdown entries and React key warnings.
      const frameworkRows: FrameworkOption[] = Array.isArray(frameworksRes.data?.data) ? frameworksRes.data?.data : [];
      const frameworkMap = new Map<string, { row: FrameworkOption; procedureTotal: number; controlMax: number; sources: Set<string> }>();
      for (const entry of frameworkRows) {
        const code = String(entry.code || '').trim();
        if (!code) continue;
        const name = String(entry.name || '').trim() || code;
        const procCount = Number.parseInt(String(entry.procedure_count || '0'), 10) || 0;
        const controlCount = Number.parseInt(String(entry.control_count || '0'), 10) || 0;

        const sources = new Set<string>();
        const rawSource = entry.source_document ? String(entry.source_document) : '';
        rawSource.split('|').map((s) => s.trim()).filter(Boolean).forEach((s) => sources.add(s));

        if (!frameworkMap.has(code)) {
          frameworkMap.set(code, {
            row: { code, name, procedure_count: '0', control_count: '0', source_document: null },
            procedureTotal: 0,
            controlMax: 0,
            sources
          });
        }

        const state = frameworkMap.get(code)!;
        state.procedureTotal += procCount;
        state.controlMax = Math.max(state.controlMax, controlCount);
        state.row.name = name;
        sources.forEach((s) => state.sources.add(s));
      }

      const normalizedFrameworks: FrameworkOption[] = Array.from(frameworkMap.values())
        .map((state) => ({
          ...state.row,
          procedure_count: String(state.procedureTotal),
          control_count: String(state.controlMax),
          source_document: state.sources.size > 0 ? Array.from(state.sources).sort().join(' | ') : null
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      setFrameworks(normalizedFrameworks);
      setStats(statsRes.data?.data);
      if (canAssignAuditors) {
        await loadHandoffData();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load assessment data');
    } finally {
      setLoading(false);
    }
  };

  const loadProcedures = async () => {
    try {
      const res = await assessmentsAPI.getProcedures({
        framework_code: selectedFramework || undefined,
        control_id: selectedControl || undefined,
        procedure_type: selectedType || undefined,
        depth: selectedDepth || undefined,
        search: searchQuery || undefined,
        limit: 100,
      });
      setProcedures(res.data?.data?.procedures);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load procedures');
    }
  };

  const handleAuditorHandoff = async () => {
    if (!canAssignAuditors || !selectedHandoffEngagementId || !selectedLeadAuditorId) return;
    try {
      setHandoffSaving(true);
      setHandoffNotice('');
      await assessmentsAPI.handoffEngagement(selectedHandoffEngagementId, {
        lead_auditor_id: selectedLeadAuditorId,
        engagement_owner_id: selectedOwnerUserId || null
      });
      setHandoffNotice('Assessment handed off to auditor. Assignment is now locked.');
      await loadHandoffData();
    } catch (err: any) {
      setHandoffNotice(err.response?.data?.error || 'Failed to hand off assessment to auditor');
    } finally {
      setHandoffSaving(false);
    }
  };

  const handleRecordResult = async () => {
    if (!canWriteAssessments) return;
    if (!recordingProcedure || !resultStatus) return;
    setSaving(true);
    try {
      await assessmentsAPI.recordResult({
        procedure_id: recordingProcedure.id,
        status: resultStatus,
        finding: resultFinding || undefined,
        evidence_collected: resultEvidence || undefined,
        risk_level: resultRiskLevel || undefined,
        remediation_required: resultStatus === 'other_than_satisfied',
      });
      setRecordingProcedure(null);
      setResultStatus('');
      setResultFinding('');
      setResultEvidence('');
      setResultRiskLevel('');
      // Refresh
      loadProcedures();
      loadInitialData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record result');
    } finally {
      setSaving(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'examine': return '📄';
      case 'interview': return '🎤';
      case 'test': return '🧪';
      case 'audit_step': return '📋';
      case 'inquiry': return '❓';
      case 'observation': return '👁️';
      case 'inspection': return '🔍';
      default: return '📌';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'examine': return 'Examine';
      case 'interview': return 'Interview';
      case 'test': return 'Test';
      case 'audit_step': return 'Audit Step';
      case 'inquiry': return 'Inquiry';
      case 'observation': return 'Observation';
      case 'inspection': return 'Inspection';
      default: return type;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'satisfied':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">Satisfied</span>;
      case 'other_than_satisfied':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">Other Than Satisfied</span>;
      case 'not_applicable':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">N/A</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Not Assessed</span>;
    }
  };

  const getDepthBadge = (depth: string) => {
    switch (depth) {
      case 'basic': return <span className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700">Basic</span>;
      case 'focused': return <span className="px-2 py-0.5 text-xs rounded bg-purple-50 text-purple-700">Focused</span>;
      case 'comprehensive': return <span className="px-2 py-0.5 text-xs rounded bg-orange-50 text-orange-700">Comprehensive</span>;
      default: return null;
    }
  };

  const toggleProcedureFamily = (family: string) => {
    setExpandedProcedureFamilies((prev) => ({
      ...prev,
      [family]: !prev[family]
    }));
  };

  const toggleProcedureControl = (family: string, controlId: string) => {
    const key = `${family}::${controlId}`;
    setExpandedProcedureControls((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Assessment Procedures</h1>
            <p className="text-gray-600 mt-1">NIST 800-53A testing procedures for SCAs and equivalent assessment methodologies</p>
          </div>
          {canUseAuditorWorkspace && (
            <Link
              href="/dashboard/auditor-workspace"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
            >
              Open Auditor Workspace
            </Link>
          )}
        </div>

        {!canWriteAssessments && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">
            You are in assessment read-only mode. Users with
            <code className="mx-1">assessments.write</code>
            can record and update assessment results.
          </div>
        )}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/controls"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span className="text-lg">✅</span>
            <div><div className="font-medium text-blue-800">Controls</div><div className="text-blue-600">Implementation status &amp; evidence</div></div>
          </Link>
          <Link href="/dashboard/ai-analysis"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span className="text-lg">✨</span>
            <div><div className="font-medium text-purple-800">AI Analysis</div><div className="text-purple-600">AI audit-readiness &amp; gap analysis</div></div>
          </Link>
          <Link href="/dashboard/frameworks/mappings"
            className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-xs">
            <span className="text-lg">📐</span>
            <div><div className="font-medium text-green-800">Framework Mappings</div><div className="text-green-600">Crosswalk coverage heatmap</div></div>
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
            <button onClick={() => setError('')} className="float-right text-red-500 hover:text-red-700">x</button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          {[
            { id: 'overview' as const, label: 'Overview', icon: '📊' },
            { id: 'procedures' as const, label: 'Procedures', icon: '📋' },
            { id: 'results' as const, label: 'Results', icon: '✅' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* AI Audit Readiness Panel */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 cursor-pointer"
                onClick={() => auditReadiness.status !== 'running' && auditReadiness.refresh()}
              >
                <div className="flex items-center gap-2">
                  <span className="text-purple-600">✨</span>
                  <h2 className="text-sm font-semibold text-gray-800">AI Audit Readiness Score</h2>
                  {auditReadiness.fromCache && auditReadiness.lastUpdatedAt && (
                    <span className="text-xs text-gray-400">
                      · cached {new Date(auditReadiness.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {auditReadiness.status === 'running' && (
                    <span className="text-xs text-purple-500 animate-pulse">· analyzing…</span>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); auditReadiness.refresh(); }}
                  className="text-xs text-gray-400 hover:text-purple-600 px-2 py-0.5 rounded hover:bg-purple-50"
                >
                  Refresh
                </button>
              </div>
              <div className="p-4">
                {auditReadiness.status === 'running' && !auditReadiness.result && (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-full" />
                    <div className="h-3 bg-gray-200 rounded w-5/6" />
                  </div>
                )}
                {auditReadiness.status === 'error' && (
                  <p className="text-sm text-red-500">{auditReadiness.error}</p>
                )}
                {auditReadiness.result && (
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">{auditReadiness.result}</pre>
                )}
                {auditReadiness.status === 'idle' && !auditReadiness.result && (
                  <p className="text-xs text-gray-400">AI analysis will run automatically.</p>
                )}
              </div>
            </div>

            {canAssignAuditors && (
              <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Auditor Assignment Handoff</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Assign a lead auditor and push the assessment into auditor workflow. After handoff, auditor assignment is locked and cannot be taken back by admin.
                  </p>
                </div>

                {handoffLoading ? (
                  <div className="text-sm text-gray-500">Loading engagements and team users...</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Engagement</label>
                      <select
                        value={selectedHandoffEngagementId}
                        onChange={(e) => setSelectedHandoffEngagementId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select engagement</option>
                        {engagements.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name} ({entry.status}){entry.lead_auditor_id ? ' - locked' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Lead Auditor</label>
                      <select
                        value={selectedLeadAuditorId}
                        onChange={(e) => setSelectedLeadAuditorId(e.target.value)}
                        disabled={selectedHandoffLocked}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                      >
                        <option value="">Select auditor</option>
                        {auditorCandidates.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.full_name || `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || entry.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Engagement Owner</label>
                      <select
                        value={selectedOwnerUserId}
                        onChange={(e) => setSelectedOwnerUserId(e.target.value)}
                        disabled={selectedHandoffLocked}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                      >
                        <option value="">Use current owner</option>
                        {teamUsers.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.full_name || `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || entry.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {selectedHandoffEngagement && selectedHandoffLocked && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Locked to auditor:{' '}
                    <span className="font-semibold">
                      {selectedHandoffEngagement.lead_auditor_name || selectedHandoffEngagement.lead_auditor_id}
                    </span>
                  </div>
                )}

                {handoffNotice && (
                  <div className={`text-sm rounded px-3 py-2 border ${
                    handoffNotice.toLowerCase().includes('failed') || handoffNotice.toLowerCase().includes('error')
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-green-50 border-green-200 text-green-700'
                  }`}>
                    {handoffNotice}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleAuditorHandoff}
                    disabled={
                      handoffSaving
                      || handoffLoading
                      || selectedHandoffLocked
                      || !selectedHandoffEngagementId
                      || !selectedLeadAuditorId
                    }
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                  >
                    {handoffSaving ? 'Assigning...' : 'Assign Auditor & Push to Fieldwork'}
                  </button>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Total Procedures</div>
                <div className="text-3xl font-bold text-gray-900">{stats.summary.total_procedures}</div>
                <div className="text-xs text-gray-500 mt-1">Across all frameworks</div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Frameworks Covered</div>
                <div className="text-3xl font-bold text-purple-600">{stats.by_framework.length}</div>
                <div className="text-xs text-gray-500 mt-1">With assessment procedures</div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Findings Needing Remediation</div>
                <div className="text-3xl font-bold text-red-600">{stats.summary.findings_requiring_remediation}</div>
                <div className="text-xs text-gray-500 mt-1">Other than satisfied</div>
              </div>
            </div>

            {/* Framework Progress */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Assessment Progress by Framework</h3>
              <div className="space-y-4">
                {stats.by_framework.map((fw) => {
                  const total = parseInt(fw.total_procedures);
                  const assessed = parseInt(fw.assessed);
                  const satisfied = parseInt(fw.satisfied);
                  const pct = total > 0 ? Math.round((assessed / total) * 100) : 0;
                  const satisfiedPct = total > 0 ? Math.round((satisfied / total) * 100) : 0;

                  return (
                    <div key={fw.code} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-900">{fw.name}</span>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{assessed}/{total} assessed</span>
                          <span className="text-green-600">{satisfiedPct}% satisfied</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-purple-600 transition-all" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Procedure Types */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Procedures by Assessment Method</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.by_type.map((t) => (
                  <div key={t.procedure_type} className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl mb-1">{getTypeIcon(t.procedure_type)}</div>
                    <div className="text-sm font-medium text-gray-900">{getTypeLabel(t.procedure_type)}</div>
                    <div className="text-lg font-bold text-gray-700">{t.total}</div>
                    <div className="text-xs text-gray-500">{t.assessed} assessed</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Source Documents */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Source Documents</h3>
              <div className="space-y-2">
                {frameworks.map((fw) => (
                  <div key={fw.code} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <span className="font-medium text-gray-900">{fw.name}</span>
                      <span className="text-xs text-gray-500 ml-2">({fw.procedure_count} procedures, {fw.control_count} controls)</span>
                    </div>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">{fw.source_document || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Procedures Tab */}
        {activeTab === 'procedures' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <input
                  type="text"
                  placeholder="Search procedures..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <select
                  value={selectedFramework}
                  onChange={(e) => setSelectedFramework(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Frameworks</option>
                  {frameworks.map((fw) => (
                    <option key={fw.code} value={fw.code}>{fw.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Control ID (e.g., AU-2)"
                  value={selectedControl}
                  onChange={(e) => setSelectedControl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Types</option>
                  <option value="examine">Examine</option>
                  <option value="interview">Interview</option>
                  <option value="test">Test</option>
                  <option value="audit_step">Audit Step</option>
                  <option value="inquiry">Inquiry</option>
                  <option value="observation">Observation</option>
                  <option value="inspection">Inspection</option>
                </select>
                <select
                  value={selectedDepth}
                  onChange={(e) => setSelectedDepth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Depths</option>
                  <option value="basic">Basic</option>
                  <option value="focused">Focused</option>
                  <option value="comprehensive">Comprehensive</option>
                </select>
              </div>
            </div>

            {/* Procedure Cards */}
            <div className="space-y-3">
              {procedureFamilies.length === 0 ? (
                <div className="bg-white rounded-lg shadow-md p-12 text-center text-gray-500">
                  No procedures found. Try adjusting your filters.
                </div>
              ) : (
                procedureFamilies.map((family) => {
                  const familyOpen = Boolean(expandedProcedureFamilies[family.family]);
                  return (
                    <div key={family.family} className="bg-white rounded-lg shadow-md overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleProcedureFamily(family.family)}
                        className="w-full px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-left hover:bg-gray-100"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Control Family {family.family}</div>
                          <div className="text-xs text-gray-600">
                            {family.controls.length} controls · {family.totalItems} procedures
                          </div>
                        </div>
                        <span className="text-xs text-gray-700">{familyOpen ? 'Collapse' : 'Expand'}</span>
                      </button>

                      {familyOpen && (
                        <div className="p-4 space-y-3">
                          {family.controls.map((control) => {
                            const controlKey = `${family.family}::${control.controlId}`;
                            const controlOpen = Boolean(expandedProcedureControls[controlKey]);
                            return (
                              <div key={controlKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => toggleProcedureControl(family.family, control.controlId)}
                                  className="w-full px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between text-left hover:bg-gray-50"
                                >
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">{control.controlId}</div>
                                    <div className="text-xs text-gray-600">{control.items.length} procedures</div>
                                  </div>
                                  <span className="text-xs text-gray-700">{controlOpen ? 'Hide' : 'Show'}</span>
                                </button>

                                {controlOpen && (
                                  <div className="p-4 space-y-3">
                                    {control.items.map((proc) => (
                                      <div key={proc.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                              <span className="text-lg">{getTypeIcon(proc.procedure_type)}</span>
                                              <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{proc.procedure_id}</span>
                                              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{proc.framework_code}</span>
                                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{proc.control_id}</span>
                                              {getDepthBadge(proc.depth)}
                                              {getStatusBadge(proc.result_status)}
                                            </div>
                                            <h4 className="text-sm font-bold text-gray-900 mb-1">{proc.title}</h4>
                                            <p className="text-sm text-gray-600 mb-2">{proc.description}</p>

                                            {proc.expected_evidence && (
                                              <div className="mt-2 bg-gray-50 rounded p-3">
                                                <span className="text-xs font-semibold text-gray-700">Expected Evidence: </span>
                                                <span className="text-xs text-gray-600 whitespace-pre-wrap">{proc.expected_evidence}</span>
                                              </div>
                                            )}

                                            {proc.assessor_notes && (
                                              <div className="mt-2 bg-yellow-50 rounded p-3">
                                                <span className="text-xs font-semibold text-yellow-700">Assessor Notes: </span>
                                                <span className="text-xs text-yellow-700 whitespace-pre-wrap">{proc.assessor_notes}</span>
                                              </div>
                                            )}

                                            {proc.frequency_guidance && (
                                              <div className="mt-1">
                                                <span className="text-xs text-gray-500">Frequency: {proc.frequency_guidance}</span>
                                              </div>
                                            )}
                                          </div>

                                          {canWriteAssessments ? (
                                            <button
                                              onClick={() => {
                                                setRecordingProcedure(proc);
                                                setResultStatus(proc.result_status || '');
                                              }}
                                              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 whitespace-nowrap"
                                            >
                                              Record Result
                                            </button>
                                          ) : (
                                            <span className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md whitespace-nowrap">
                                              Read-only
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && stats && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Assessment Results</h3>
              {stats.recent_results.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No assessment results recorded yet. Go to the Procedures tab to start assessing.
                </p>
              ) : (
                <div className="space-y-3">
                  {stats.recent_results.map((result: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">{result.framework_code}</span>
                          <span className="text-xs font-mono">{result.control_id}</span>
                          <span className="text-sm font-medium text-gray-900">{result.procedure_title}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Assessed by {result.assessor_name || 'Unknown'} on {new Date(result.assessed_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.risk_level && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            result.risk_level === 'critical' ? 'bg-red-100 text-red-800' :
                            result.risk_level === 'high' ? 'bg-orange-100 text-orange-800' :
                            result.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {result.risk_level}
                          </span>
                        )}
                        {getStatusBadge(result.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Record Result Modal */}
        {recordingProcedure && canWriteAssessments && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Record Assessment Result</h3>
                  <button onClick={() => setRecordingProcedure(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                </div>

                <div className="bg-gray-50 rounded p-3 mb-4">
                  <p className="text-xs text-gray-500">{recordingProcedure.procedure_id} | {recordingProcedure.framework_code} | {recordingProcedure.control_id}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{recordingProcedure.title}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Result *</label>
                    <select
                      value={resultStatus}
                      onChange={(e) => setResultStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select result...</option>
                      <option value="satisfied">Satisfied</option>
                      <option value="other_than_satisfied">Other Than Satisfied</option>
                      <option value="not_applicable">Not Applicable</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Finding / Notes</label>
                    <textarea
                      value={resultFinding}
                      onChange={(e) => setResultFinding(e.target.value)}
                      rows={3}
                      placeholder="Describe your finding..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Evidence Collected</label>
                    <textarea
                      value={resultEvidence}
                      onChange={(e) => setResultEvidence(e.target.value)}
                      rows={2}
                      placeholder="List evidence collected during assessment..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {resultStatus === 'other_than_satisfied' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                      <select
                        value={resultRiskLevel}
                        onChange={(e) => setResultRiskLevel(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">Select risk level...</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="info">Informational</option>
                      </select>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleRecordResult}
                      disabled={!resultStatus || saving}
                      className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Result'}
                    </button>
                    <button
                      onClick={() => setRecordingProcedure(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function AssessmentsPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-12 text-center text-gray-500">Loading...</div></DashboardLayout>}>
      <AssessmentsPageInner />
    </Suspense>
  );
}
