// @tier: pro
'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import DashboardLayout from '@/components/DashboardLayout';
import { vulnerabilitiesAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

const VulnerabilitySourceChart = dynamic(
  () => import('@/components/VulnerabilityCharts').then((module) => module.VulnerabilitySourceChart),
  { ssr: false }
);
const VulnerabilitySeverityChart = dynamic(
  () => import('@/components/VulnerabilityCharts').then((module) => module.VulnerabilitySeverityChart),
  { ssr: false }
);
const VulnerabilityStatusChart = dynamic(
  () => import('@/components/VulnerabilityCharts').then((module) => module.VulnerabilityStatusChart),
  { ssr: false }
);
const VulnerabilityTrendChart = dynamic(
  () => import('@/components/VulnerabilityCharts').then((module) => module.VulnerabilityTrendChart),
  { ssr: false }
);

type Summary = {
  total_findings: number;
  active_findings: number;
  critical_open: number;
  affected_assets: number;
  kev_listed_count: number;
  avg_cvss: number | null;
};

type CountRow = { source?: string; severity?: string; status?: string; count: number };
type TrendRow = { day: string; count: number };

type Finding = {
  id: string;
  source: string;
  standard?: string | null;
  finding_key: string;
  vulnerability_id: string;
  title: string;
  description?: string | null;
  severity: string;
  cvss_score?: number | null;
  status: string;
  last_seen_at?: string | null;
  due_date?: string | null;
  cwe_id?: string | null;
  stig_id?: string | null;
  package_name?: string | null;
  component_name?: string | null;
  version_detected?: string | null;
  kev_listed?: boolean;
  exploit_available?: boolean;
  asset_id?: string | null;
  asset_name?: string | null;
  asset_hostname?: string | null;
  linked_audit_events?: number;
  control_work_items_total?: number;
  control_work_items_open?: number;
};

type ArtifactMap = {
  framework: string;
  controls: string[];
  required_artifacts: string[];
};

type MetaResponse = {
  sources: Array<{ source: string; count: number }>;
  standards: Array<{ standard: string; count: number }>;
  frameworkRequiredArtifacts: ArtifactMap[];
};

type DetailResponse = {
  finding: Finding;
  relatedAuditEvents: Array<{
    id: string;
    event_type: string;
    created_at: string;
    success: boolean;
    ip_address?: string;
    user_email?: string;
  }>;
  controlImpactWorkflow?: WorkflowResponse;
};

type WorkflowItem = {
  id: string;
  framework_control_id: string;
  control_code: string;
  control_title: string;
  framework_code: string;
  framework_name: string;
  action_type: 'poam' | 'close_control_gap' | 'risk_acceptance' | 'false_positive_review';
  action_status: 'open' | 'in_progress' | 'resolved' | 'accepted' | 'closed';
  control_effect: 'non_compliant' | 'partial' | 'compliant';
  response_summary?: string | null;
  response_details?: string | null;
  due_date?: string | null;
  implementation_status?: string;
};

type WorkflowResponse = {
  items: WorkflowItem[];
  summary: {
    total: number;
    open: number;
    in_progress: number;
    resolved: number;
    accepted: number;
    closed: number;
  };
};

const DEFAULT_SOURCES = ['ACAS', 'SBOM', 'STIG'];
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_ORDER = ['open', 'in_progress', 'remediated', 'risk_accepted', 'false_positive'];

function toTitle(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toNum(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function severityClass(value: string) {
  switch (value.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
}

function statusClass(value: string) {
  switch (value.toLowerCase()) {
    case 'open':
      return 'bg-red-100 text-red-800';
    case 'in_progress':
      return 'bg-yellow-100 text-yellow-800';
    case 'remediated':
      return 'bg-green-100 text-green-800';
    case 'risk_accepted':
      return 'bg-blue-100 text-blue-800';
    case 'false_positive':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function buildAuditLink(finding: Finding) {
  const query = new URLSearchParams({
    tab: 'audit',
    eventType: 'vulnerability_scan_imported',
    resourceType: 'vulnerability',
    resourceId: finding.id,
    findingKey: finding.finding_key,
    vulnerabilityId: finding.vulnerability_id,
    source: finding.source,
  });
  return `/dashboard/settings?${query.toString()}`;
}

function actionTypeLabel(actionType: WorkflowItem['action_type']) {
  switch (actionType) {
    case 'poam':
      return 'Remediation Plan';
    case 'close_control_gap':
      return 'Closure Validation';
    case 'risk_acceptance':
      return 'Residual Risk Decision';
    case 'false_positive_review':
      return 'False Positive Review';
    default:
      return actionType;
  }
}

function controlEffectLabel(effect: WorkflowItem['control_effect']) {
  switch (effect) {
    case 'non_compliant':
      return 'Control Not Met';
    case 'partial':
      return 'Control Partially Met';
    case 'compliant':
      return 'Control Met';
    default:
      return effect;
  }
}

function controlEffectClass(effect: WorkflowItem['control_effect']) {
  switch (effect) {
    case 'non_compliant':
      return 'bg-red-100 text-red-800';
    case 'partial':
      return 'bg-yellow-100 text-yellow-800';
    case 'compliant':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function VulnerabilitiesPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canImportScans = hasPermission(user, 'evidence.write');
  const linkedAssetId = searchParams.get('assetId')?.trim() || '';
  const scanFileRef = useRef<HTMLInputElement>(null);
  const findingsLoadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanImporting, setScanImporting] = useState(false);
  const [scanImportMessage, setScanImportMessage] = useState<string | null>(null);
  const [scanImportOk, setScanImportOk] = useState<boolean>(true);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [charts, setCharts] = useState<{
    bySource: CountRow[];
    bySeverity: CountRow[];
    byStatus: CountRow[];
    trend30d: TrendRow[];
  }>({
    bySource: [],
    bySeverity: [],
    byStatus: [],
    trend30d: [],
  });
  const [total, setTotal] = useState(0);

  const [sources, setSources] = useState<Array<{ source: string; count: number }>>([]);
  const [standards, setStandards] = useState<Array<{ standard: string; count: number }>>([]);
  const [artifacts, setArtifacts] = useState<ArtifactMap[]>([]);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [standardFilter, setStandardFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [detailAudit, setDetailAudit] = useState<DetailResponse['relatedAuditEvents']>([]);
  const [workflow, setWorkflow] = useState<WorkflowResponse>({ items: [], summary: { total: 0, open: 0, in_progress: 0, resolved: 0, accepted: 0, closed: 0 } });
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [vulnAiAnalysis, setVulnAiAnalysis] = useState<string | null>(null);
  const [vulnAiLoading, setVulnAiLoading] = useState(false);

  const updateFindingQuery = useCallback((findingId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (findingId) {
      params.set('findingId', findingId);
    } else {
      params.delete('findingId');
    }

    const query = params.toString();
    router.replace(query ? `/dashboard/vulnerabilities?${query}` : '/dashboard/vulnerabilities', {
      scroll: false,
    });
  }, [router, searchParams]);

  const loadMeta = useCallback(async () => {
    try {
      const response = await vulnerabilitiesAPI.getSources();
      const payload: MetaResponse = response.data?.data || { sources: [], standards: [], frameworkRequiredArtifacts: [] };
      setSources(payload.sources || []);
      setStandards(payload.standards || []);
      setArtifacts(payload.frameworkRequiredArtifacts || []);
    } catch (loadError) {
      console.error('Failed to load vulnerability metadata:', loadError);
    }
  }, []);

  const loadFindings = useCallback(async () => {
    const isInitialLoad = !findingsLoadedRef.current;
    try {
      if (isInitialLoad) setLoading(true);
      else setRefreshing(true);
      setError('');

      const params: {
        limit: number;
        offset: number;
        assetId?: string;
        source?: string[];
        standard?: string;
        severity?: string;
        status?: string;
        search?: string;
      } = {
        limit: 100,
        offset: 0,
      };

      if (linkedAssetId) params.assetId = linkedAssetId;
      if (sourceFilter.length) params.source = sourceFilter;
      if (standardFilter !== 'all') params.standard = standardFilter;
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const response = await vulnerabilitiesAPI.getAll(params);
      const payload = response.data?.data || {};
      const found = Array.isArray(payload.findings) ? payload.findings : [];

      setFindings(found);
      setSummary(payload.summary || null);
      setCharts({
        bySource: payload.charts?.bySource || [],
        bySeverity: payload.charts?.bySeverity || [],
        byStatus: payload.charts?.byStatus || [],
        trend30d: payload.charts?.trend30d || [],
      });
      setTotal(toNum(payload.pagination?.total, found.length));
    } catch (loadError: any) {
      console.error('Failed to load findings:', loadError);
      setError(loadError.response?.data?.error || 'Failed to load vulnerability findings');
    } finally {
      findingsLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [linkedAssetId, search, severityFilter, sourceFilter, standardFilter, statusFilter]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadFindings();
  }, [loadFindings]);

  const sourceButtons = useMemo(() => {
    const discovered = sources.map((entry) => entry.source.toUpperCase());
    return Array.from(new Set([...DEFAULT_SOURCES, ...discovered]));
  }, [sources]);

  const sourceChart = useMemo(
    () => charts.bySource.map((row) => ({ name: row.source || 'Unknown', count: toNum(row.count) })),
    [charts.bySource]
  );
  const severityChart = useMemo(() => {
    const rows = charts.bySeverity.map((row) => ({
      name: (row.severity || 'unknown').toLowerCase(),
      count: toNum(row.count),
    }));
    rows.sort((a, b) => SEVERITY_ORDER.indexOf(a.name) - SEVERITY_ORDER.indexOf(b.name));
    return rows;
  }, [charts.bySeverity]);
  const statusChart = useMemo(() => {
    const rows = charts.byStatus.map((row) => ({
      name: toTitle((row.status || 'unknown').toLowerCase()),
      count: toNum(row.count),
    }));
    rows.sort((a, b) => {
      // Convert title-cased names back to underscore format for sort lookup
      const aKey = a.name.toLowerCase().replace(/ /g, '_');
      const bKey = b.name.toLowerCase().replace(/ /g, '_');
      return STATUS_ORDER.indexOf(aKey) - STATUS_ORDER.indexOf(bKey);
    });
    return rows;
  }, [charts.byStatus]);
  const trendChart = useMemo(
    () => charts.trend30d.map((row) => ({ day: row.day, count: toNum(row.count) })),
    [charts.trend30d]
  );

  async function importScanArtifact() {
    if (!canImportScans) return;
    if (!scanFile) return;

    setScanImporting(true);
    setScanImportMessage(null);
    setScanImportOk(true);

    try {
      const formData = new FormData();
      formData.append('file', scanFile);
      const response = await vulnerabilitiesAPI.importScan(formData);
      const payload = response.data?.data;
      const detected = payload?.detected_type || 'unknown';
      const total = toNum(payload?.ingested?.total, 0);
      const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];

      const warningSuffix = warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : '';
      setScanImportMessage(`Imported ${total} finding${total === 1 ? '' : 's'} (${detected})${warningSuffix}.`);
      setScanImportOk(true);
      setScanFile(null);
      if (scanFileRef.current) scanFileRef.current.value = '';
      await loadMeta();
      await loadFindings();
    } catch (err: any) {
      setScanImportMessage(err.response?.data?.error || 'Scan import failed');
      setScanImportOk(false);
    } finally {
      setScanImporting(false);
    }
  }

  function toggleSource(source: string) {
    setSourceFilter((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source]
    );
  }

  function clearFilters() {
    setSearch('');
    setSourceFilter([]);
    setStandardFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
  }

  function exportCsv() {
    if (!findings.length) return;
    const headers = [
      'finding_key',
      'vulnerability_id',
      'title',
      'source',
      'standard',
      'severity',
      'cvss_score',
      'status',
      'asset_name',
      'asset_hostname',
      'last_seen_at',
      'due_date',
      'linked_audit_events',
    ];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = findings.map((finding) => [
      finding.finding_key,
      finding.vulnerability_id,
      finding.title,
      finding.source,
      finding.standard || '',
      finding.severity,
      finding.cvss_score ?? '',
      finding.status,
      finding.asset_name || '',
      finding.asset_hostname || '',
      finding.last_seen_at || '',
      finding.due_date || '',
      finding.linked_audit_events ?? 0,
    ]);
    const csv = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vulnerabilities-${format(new Date(), 'yyyyMMdd-HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const loadFindingDetail = useCallback(async (findingId: string, seedFinding: Finding | null = null) => {
    setSelectedFinding(seedFinding);
    setDetailAudit([]);
    setWorkflow({ items: [], summary: { total: 0, open: 0, in_progress: 0, resolved: 0, accepted: 0, closed: 0 } });
    setWorkflowError('');
    setVulnAiAnalysis(null);
    setDetailLoading(true);
    // Trigger lazy AI analysis
    setVulnAiLoading(true);
    vulnerabilitiesAPI.analyzeVulnerability(findingId)
      .then(r => {
        const text = r.data?.data?.result;
        setVulnAiAnalysis(typeof text === 'string' ? text : null);
      })
      .catch(err => console.error('Vuln AI analysis failed:', err))
      .finally(() => setVulnAiLoading(false));
    try {
      const response = await vulnerabilitiesAPI.getById(findingId);
      const payload: DetailResponse = response.data?.data;
      if (payload?.finding) setSelectedFinding(payload.finding);
      setDetailAudit(Array.isArray(payload?.relatedAuditEvents) ? payload.relatedAuditEvents : []);
      if (payload?.controlImpactWorkflow) {
        setWorkflow({
          items: Array.isArray(payload.controlImpactWorkflow.items) ? payload.controlImpactWorkflow.items : [],
          summary: payload.controlImpactWorkflow.summary || { total: 0, open: 0, in_progress: 0, resolved: 0, accepted: 0, closed: 0 }
        });
      } else {
        const workflowResponse = await vulnerabilitiesAPI.getWorkflow(findingId);
        const workflowPayload: WorkflowResponse = workflowResponse.data?.data || { items: [], summary: { total: 0, open: 0, in_progress: 0, resolved: 0, accepted: 0, closed: 0 } };
        setWorkflow(workflowPayload);
      }
    } catch (loadError) {
      console.error('Failed to load finding detail:', loadError);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (finding: Finding, syncUrl = true) => {
    setSelectedFindingId(finding.id);
    if (syncUrl) {
      updateFindingQuery(finding.id);
    }
    await loadFindingDetail(finding.id, finding);
  }, [loadFindingDetail, updateFindingQuery]);

  const openDetailById = useCallback(async (findingId: string, syncUrl = true) => {
    setSelectedFindingId(findingId);
    if (syncUrl) {
      updateFindingQuery(findingId);
    }
    const seedFinding = findings.find((finding) => finding.id === findingId) || null;
    await loadFindingDetail(findingId, seedFinding);
  }, [findings, loadFindingDetail, updateFindingQuery]);

  async function updateWorkflowItem(
    findingId: string,
    item: WorkflowItem,
    update: {
      actionType?: WorkflowItem['action_type'];
      actionStatus?: WorkflowItem['action_status'];
      controlEffect?: WorkflowItem['control_effect'];
      responseSummary?: string;
    }
  ) {
    try {
      setWorkflowBusyId(item.id);
      setWorkflowError('');
      const response = await vulnerabilitiesAPI.updateWorkflowItem(findingId, item.id, update);
      const workflowPayload: WorkflowResponse = response.data?.data?.workflow || { items: [], summary: { total: 0, open: 0, in_progress: 0, resolved: 0, accepted: 0, closed: 0 } };
      setWorkflow(workflowPayload);
      await loadFindings();
    } catch (updateError: any) {
      console.error('Failed to update workflow item:', updateError);
      setWorkflowError(updateError.response?.data?.error || 'Failed to update workflow item');
    } finally {
      setWorkflowBusyId(null);
    }
  }

  const closeDetail = useCallback((syncUrl = true) => {
    setSelectedFindingId(null);
    setSelectedFinding(null);
    setDetailAudit([]);
    setWorkflow({ items: [], summary: { total: 0, open: 0, in_progress: 0, resolved: 0, accepted: 0, closed: 0 } });
    setWorkflowBusyId(null);
    setVulnAiAnalysis(null);
    setWorkflowError('');
    setDetailLoading(false);
    if (syncUrl) {
      updateFindingQuery(null);
    }
  }, [updateFindingQuery]);

  useEffect(() => {
    if (!selectedFindingId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedFindingId, closeDetail]);

  useEffect(() => {
    const findingIdFromQuery = searchParams.get('findingId');
    if (findingIdFromQuery) {
      if (findingIdFromQuery !== selectedFindingId) {
        openDetailById(findingIdFromQuery, false);
      }
      return;
    }

    if (selectedFindingId) {
      closeDetail(false);
    }
  }, [closeDetail, openDetailById, searchParams, selectedFindingId]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vulnerabilities</h1>
            <p className="text-gray-600 mt-2">
              Unified vulnerability analytics across ACAS, SBOM, STIG, SCAP, and related standards.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadFindings}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!findings.length}
              className="px-4 py-2 border border-purple-600 text-purple-700 rounded-md hover:bg-purple-50 transition disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Link href="/dashboard/threat-intel"
            className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
            <span className="text-xl">🎯</span>
            <div>
              <div className="text-sm font-medium text-orange-800">Threat Intelligence</div>
              <div className="text-xs text-orange-600">NVD CVEs, CISA KEV, MITRE ATT&CK</div>
            </div>
          </Link>
          <Link href="/dashboard/assets"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <span className="text-xl">🏗️</span>
            <div>
              <div className="text-sm font-medium text-blue-800">Assets</div>
              <div className="text-xs text-blue-600">Correlate findings with your asset inventory</div>
            </div>
          </Link>
          <Link href="/dashboard/sbom"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            <span className="text-xl">📦</span>
            <div>
              <div className="text-sm font-medium text-purple-800">SBOM</div>
              <div className="text-xs text-purple-600">Software bill of materials vulnerability scan</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors">
            <span className="text-xl">📈</span>
            <div>
              <div className="text-sm font-medium text-violet-800">AI Insights</div>
              <div className="text-xs text-violet-600">Gap analysis & remediation guidance</div>
            </div>
          </Link>
        </div>

        {linkedAssetId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">Filtered to a linked asset</p>
                <p className="mt-1">
                  Asset scope: <code className="rounded bg-white px-1.5 py-0.5 text-xs">{linkedAssetId}</code>
                </p>
              </div>
              <a href="/dashboard/vulnerabilities" className="font-medium underline hover:text-blue-700">
                Clear asset filter
              </a>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import Scan Artifacts</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload STIG checklists (<code>.ckl</code>), ACAS/Nessus scans (<code>.nessus</code>), or SARIF (<code>.sarif</code>/<code>.json</code>). Fortify <code>.fpr</code> uploads are stored as Evidence (parsing pending).
              </p>
              {!canImportScans && (
                <p className="text-xs text-gray-500 mt-1">
                  Requires <code>evidence.write</code> permission.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={importScanArtifact}
              disabled={!canImportScans || scanImporting || !scanFile}
              className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scanImporting ? 'Importing...' : 'Import'}
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <input
              ref={scanFileRef}
              type="file"
              accept=".ckl,.nessus,.xml,.sarif,.json,.fpr,.zip"
              disabled={!canImportScans || scanImporting}
              onChange={(event) => setScanFile(event.target.files?.[0] || null)}
              className="w-full md:flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
            />
            <div className="text-xs text-gray-500 md:w-56">
              Max size is configured server-side.
            </div>
          </div>

          {scanImportMessage && (
            <div className={`text-sm px-3 py-2 rounded border ${scanImportOk ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {scanImportMessage}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <SummaryCard label="Total Findings" value={toNum(summary?.total_findings).toString()} />
          <SummaryCard label="Active Findings" value={toNum(summary?.active_findings).toString()} />
          <SummaryCard label="Critical Open" value={toNum(summary?.critical_open).toString()} />
          <SummaryCard label="Affected Assets" value={toNum(summary?.affected_assets).toString()} />
          <SummaryCard
            label="Avg CVSS"
            value={summary?.avg_cvss !== null && summary?.avg_cvss !== undefined ? String(summary.avg_cvss) : '-'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Findings by Source">
            <VulnerabilitySourceChart data={sourceChart} />
          </ChartCard>
          <ChartCard title="Findings by Severity">
            <VulnerabilitySeverityChart data={severityChart} />
          </ChartCard>
          <ChartCard title="Findings by Status">
            <VulnerabilityStatusChart data={statusChart} />
          </ChartCard>
          <ChartCard title="30 Day Trend">
            <VulnerabilityTrendChart data={trendChart} />
          </ChartCard>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search CVE, title, finding key, asset"
              className="lg:col-span-2 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
            />
            <select
              value={standardFilter}
              onChange={(event) => setStandardFilter(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Standards</option>
              {standards.map((entry) => (
                <option key={entry.standard} value={entry.standard}>
                  {entry.standard} ({entry.count})
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Severity</option>
              {SEVERITY_ORDER.map((severity) => (
                <option key={severity} value={severity}>
                  {toTitle(severity)}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Status</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {toTitle(status)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">Sources:</span>
            {sourceButtons.map((source) => {
              const active = sourceFilter.includes(source);
              return (
                <button
                  key={source}
                  type="button"
                  onClick={() => toggleSource(source)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition ${
                    active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {source}
                </button>
              );
            })}
            <button type="button" onClick={clearFilters} className="ml-1 text-sm text-purple-700 hover:text-purple-900">
              Clear filters
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Finding</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Control Impact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Audit Link</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    </td>
                  </tr>
                ) : findings.length ? (
                  findings.map((finding) => (
                    <tr
                      key={finding.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openDetail(finding)}
                    >
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${severityClass(finding.severity)}`}>
                          {toTitle(finding.severity)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{finding.vulnerability_id}</div>
                        <div className="text-sm text-gray-700 truncate max-w-[320px]">{finding.title}</div>
                        <div className="text-xs text-gray-500">{finding.finding_key}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div>{finding.source}</div>
                        <div className="text-xs text-gray-500">{finding.standard || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {finding.asset_id && finding.asset_name ? (
                          <Link
                            href={`/dashboard/assets?assetId=${encodeURIComponent(finding.asset_id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-purple-700 hover:text-purple-900 font-medium"
                          >
                            {finding.asset_name}
                          </Link>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                        <div className="text-xs text-gray-500">{finding.asset_hostname || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${statusClass(finding.status)}`}>
                          {toTitle(finding.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span className="font-medium">{toNum(finding.control_work_items_open)} open</span>
                        <span className="text-gray-500"> / {toNum(finding.control_work_items_total)} total</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={buildAuditLink(finding)}
                          onClick={(event) => event.stopPropagation()}
                          className="text-purple-700 hover:text-purple-900"
                        >
                          {toNum(finding.linked_audit_events)} events
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      No vulnerability findings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-sm text-gray-600 border-t">Showing {findings.length} of {total} findings</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Framework Artifact Requirements</h2>
          <p className="text-sm text-gray-600 mb-4">
            Vulnerability evidence mapped for NIST, ISO, SOC 2, HIPAA, PCI DSS, FedRAMP, and AI governance.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {artifacts.length ? (
              artifacts.map((item) => (
                <div key={item.framework} className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-gray-900">{item.framework}</h3>
                  <p className="text-xs text-gray-500 mt-1">Controls: {item.controls.join(', ')}</p>
                  <div className="mt-2 space-y-1">
                    {item.required_artifacts.map((artifact) => (
                      <p key={artifact} className="text-sm text-gray-700">- {artifact}</p>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No framework mappings found.</p>
            )}
          </div>
        </div>

        {selectedFindingId && (
          <div className="fixed inset-0 z-50">
            <button type="button" className="absolute inset-0 bg-black/40" onClick={() => closeDetail()} aria-label="Close" />
            <aside className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-gray-500 tracking-wide">Vulnerability Detail</p>
                  <h2 className="text-lg font-bold text-gray-900">{selectedFinding?.vulnerability_id || 'Loading'}</h2>
                </div>
                <button type="button" onClick={() => closeDetail()} className="text-sm text-gray-600 hover:text-gray-900">
                  Close
                </button>
              </div>
              <div className="p-6 space-y-4">
                {detailLoading ? (
                  <div className="py-8 text-center text-gray-500">Loading details...</div>
                ) : selectedFinding ? (
                  <>
                    <p className="text-sm text-gray-900">{selectedFinding.title}</p>
                    {selectedFinding.description && <p className="text-sm text-gray-600">{selectedFinding.description}</p>}

                    {/* AI Remediation Analysis */}
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-purple-600 text-sm">✨</span>
                        <span className="text-xs font-semibold text-purple-800">AI Remediation Plan</span>
                        {vulnAiLoading && <span className="text-xs text-purple-500 animate-pulse">analyzing…</span>}
                      </div>
                      {vulnAiLoading && !vulnAiAnalysis && (
                        <div className="space-y-1.5 animate-pulse">
                          <div className="h-2.5 bg-purple-200 rounded w-full" />
                          <div className="h-2.5 bg-purple-200 rounded w-4/5" />
                          <div className="h-2.5 bg-purple-200 rounded w-3/4" />
                        </div>
                      )}
                      {vulnAiAnalysis && (
                        <pre className="whitespace-pre-wrap text-xs text-purple-900 leading-relaxed font-sans">{vulnAiAnalysis}</pre>
                      )}
                      {!vulnAiLoading && !vulnAiAnalysis && (
                        <p className="text-xs text-purple-400">No AI analysis available.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <DetailField label="Finding Key" value={selectedFinding.finding_key} mono />
                      <DetailField label="Source / Standard" value={`${selectedFinding.source} / ${selectedFinding.standard || '-'}`} />
                      <DetailField label="CVSS" value={selectedFinding.cvss_score !== undefined && selectedFinding.cvss_score !== null ? String(selectedFinding.cvss_score) : '-'} />
                      <DetailField label="CWE ID" value={selectedFinding.cwe_id || '-'} />
                      <DetailField label="STIG ID" value={selectedFinding.stig_id || '-'} />
                      <DetailField label="Due Date" value={selectedFinding.due_date ? format(new Date(selectedFinding.due_date), 'MMM d, yyyy') : '-'} />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {selectedFinding.asset_id && (
                        <Link
                          href={`/dashboard/assets?assetId=${encodeURIComponent(selectedFinding.asset_id)}`}
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                        >
                          Open Asset
                        </Link>
                      )}
                      <Link
                        href={buildAuditLink(selectedFinding)}
                        className="px-3 py-1.5 border border-purple-300 text-purple-700 rounded-md text-sm hover:bg-purple-50"
                      >
                        Open Related Audit Logs
                      </Link>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">Control Impact Workflow</h3>
                        <div className="text-xs text-gray-500">
                          {workflow.summary.open} open | {workflow.summary.in_progress} in progress | {workflow.summary.resolved} resolved
                        </div>
                      </div>

                      {workflowError && (
                        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                          {workflowError}
                        </div>
                      )}

                      {workflow.items.length ? (
                        <div className="space-y-3">
                          {workflow.items.map((item) => (
                            <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  href={`/dashboard/controls/${item.framework_control_id}`}
                                  className="text-sm font-semibold text-purple-700 hover:text-purple-900"
                                >
                                  {item.control_code}
                                </Link>
                                <span className="text-xs text-gray-500">{item.framework_code}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${statusClass(item.action_status)}`}>
                                  {toTitle(item.action_status)}
                                </span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${controlEffectClass(item.control_effect)}`}>
                                  {controlEffectLabel(item.control_effect)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mt-1">{item.control_title}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Response path: {actionTypeLabel(item.action_type)} | Control status: {toTitle(item.implementation_status || 'not_started')}
                                {item.due_date ? ` | Due ${format(new Date(item.due_date), 'MMM d, yyyy')}` : ''}
                              </p>
                              {item.response_summary && <p className="text-sm text-gray-600 mt-2">{item.response_summary}</p>}

                              <div className="flex flex-wrap gap-2 mt-3">
                                <button
                                  type="button"
                                  disabled={workflowBusyId === item.id}
                                  onClick={() =>
                                    updateWorkflowItem(selectedFinding.id, item, {
                                      actionStatus: 'in_progress',
                                      responseSummary: 'Response workflow started. Remediation evidence is being assembled.',
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-50"
                                >
                                  Start Review
                                </button>
                                <button
                                  type="button"
                                  disabled={workflowBusyId === item.id}
                                  onClick={() =>
                                    updateWorkflowItem(selectedFinding.id, item, {
                                      actionType: 'close_control_gap',
                                      actionStatus: 'resolved',
                                      controlEffect: 'compliant',
                                      responseSummary: 'Remediation complete. Control is ready for validation closure.',
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-50"
                                >
                                  Record Remediation
                                </button>
                                <button
                                  type="button"
                                  disabled={workflowBusyId === item.id}
                                  onClick={() =>
                                    updateWorkflowItem(selectedFinding.id, item, {
                                      actionType: 'risk_acceptance',
                                      actionStatus: 'accepted',
                                      controlEffect: 'partial',
                                      responseSummary: 'Residual risk documented and accepted by governance owner.',
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs border border-yellow-300 text-yellow-700 rounded hover:bg-yellow-50 disabled:opacity-50"
                                >
                                  Accept Residual Risk
                                </button>
                                <button
                                  type="button"
                                  disabled={workflowBusyId === item.id}
                                  onClick={() =>
                                    updateWorkflowItem(selectedFinding.id, item, {
                                      actionStatus: 'closed',
                                      responseSummary: 'Workflow item closed after review.',
                                    })
                                  }
                                  className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-50"
                                >
                                  Close Workflow Item
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No control impact workflow items generated yet.</p>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Related Audit Events</h3>
                      {detailAudit.length ? (
                        <div className="space-y-2">
                          {detailAudit.map((event) => (
                            <div key={event.id} className="border rounded-lg p-3 bg-gray-50">
                              <p className="text-sm font-medium text-gray-900">{toTitle(event.event_type)}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {format(new Date(event.created_at), 'MMM d, yyyy HH:mm:ss')} | {event.user_email || '-'} | {event.ip_address || '-'}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No related audit events found.</p>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function VulnerabilitiesPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex items-center justify-center h-64 text-gray-500">
            Loading vulnerabilities...
          </div>
        </DashboardLayout>
      }
    >
      <VulnerabilitiesPageInner />
    </Suspense>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm text-gray-900 mt-1 break-words ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
