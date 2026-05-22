// @tier: pro
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { evidenceAPI, implementationsAPI, integrationsAPI, autoEvidenceAPI, pendingEvidenceAPI } from '@/lib/api';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface EvidenceFile {
  id: string;
  file_name: string;
  description: string | null;
  mime_type: string;
  file_size: number;
  tags: string[];
  pii_classification: string;
  pii_types: string[];
  data_sensitivity: string;
  uploaded_at: string;
  uploaded_by_name: string;
}

interface ControlForLink {
  id: string;
  control_id: string;
  control_code: string;
  control_title: string;
  framework_code: string;
  status: string;
}

interface CollectionRule {
  id: string;
  name: string;
  description: string | null;
  source_type: 'splunk' | 'microsoft_sentinel' | 'aws_cloudtrail' | 'crowdstrike' | 'jira' | 'servicenow' | 'github' | 'connector'; // ip-hygiene:ignore
  source_config: Record<string, unknown>;
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  control_ids: string[];
  tags: string[];
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: 'success' | 'error' | 'running' | null;
  last_run_error: string | null;
  last_evidence_id: string | null;
  next_run_at: string | null;
  created_at: string;
}

interface PendingEvidenceItem {
  id: string;
  source_type: string;
  source_summary: string | null;
  ai_title: string;
  ai_description: string;
  ai_confidence: number;
  suggested_controls: string[];
  suggested_tags: string[];
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  promoted_evidence_id: string | null;
  created_at: string;
}
interface SourceMeta { key: string; label: string; category: string; description: string; evidenceExamples: string[]; configFields: string[]; }
interface SourceCategory { key: string; label: string; icon: string; }

const SOURCE_CATEGORY_COLORS: Record<string, string> = {
  siem: 'bg-red-100 text-red-700',
  cloud: 'bg-sky-100 text-sky-700',
  devops: 'bg-amber-100 text-amber-700',
  itsm: 'bg-violet-100 text-violet-700',
  custom: 'bg-gray-100 text-gray-700'
};

interface BulkUploadResult {
  success: boolean;
  file_name: string;
  id?: string;
  error?: string;
  ai_analysis?: {
    detected: boolean;
    pii_classification: string;
    data_sensitivity: string;
    pii_types: string[];
    description_detected: boolean;
    content_detected: boolean;
  };
}

const FILE_STATUS_ICON: Record<string, string> = { done: '✅', error: '❌', uploading: '⏳', pending: '📄' };
const FILE_STATUS_BG:   Record<string, string> = { done: 'bg-green-50', error: 'bg-red-50', uploading: 'bg-blue-50', pending: 'bg-purple-50' };
const PII_CLASS_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  low:      'bg-blue-100 text-blue-700',
  none:     'bg-gray-100 text-gray-600'
};
const DATA_SENS_BADGE: Record<string, string> = {
  restricted:   'bg-red-100 text-red-700',
  confidential: 'bg-orange-100 text-orange-700',
  internal:     'bg-yellow-100 text-yellow-700',
  public:       'bg-green-100 text-green-700'
};

export default function EvidencePage() {
  const { user } = useAuth();
  const canWriteEvidence = hasPermission(user, 'evidence.write');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadPiiClassification, setUploadPiiClassification] = useState('none');
  const [uploadDataSensitivity, setUploadDataSensitivity] = useState('internal');
  const [uploadPiiTypes, setUploadPiiTypes] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<BulkUploadResult[] | null>(null);
  const [fileProgress, setFileProgress] = useState<Record<number, 'pending' | 'uploading' | 'done' | 'error'>>({});

  // Splunk import state
  const [splunkConfigured, setSplunkConfigured] = useState(false);
  const [splunkModalOpen, setSplunkModalOpen] = useState(false);
  const [splunkImporting, setSplunkImporting] = useState(false);
  const [splunkSearch, setSplunkSearch] = useState('index=main sourcetype=*');
  const [splunkEarliest, setSplunkEarliest] = useState('-24h@h');
  const [splunkLatest, setSplunkLatest] = useState('now');
  const [splunkMaxEvents, setSplunkMaxEvents] = useState(200);
  const [splunkTitle, setSplunkTitle] = useState('');
  const [splunkDescription, setSplunkDescription] = useState('');
  const [splunkTags, setSplunkTags] = useState('');

  // Link modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkEvidenceId, setLinkEvidenceId] = useState('');
  const [controls, setControls] = useState<ControlForLink[]>([]);
  const [controlSearch, setControlSearch] = useState('');
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [controlsLoading, setControlsLoading] = useState(false);
  const [linkNotes, setLinkNotes] = useState('');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Auto-collection rules state
  const [collectionRules, setCollectionRules] = useState<CollectionRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CollectionRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleSourceType, setRuleSourceType] = useState<'splunk' | 'microsoft_sentinel' | 'aws_cloudtrail' | 'crowdstrike' | 'jira' | 'servicenow' | 'github' | 'connector'>('splunk'); // ip-hygiene:ignore
  const [ruleSplunkSearch, setRuleSplunkSearch] = useState('index=main sourcetype=*');
  const [ruleSplunkEarliest, setRuleSplunkEarliest] = useState('-24h@h');
  const [ruleSplunkLatest, setRuleSplunkLatest] = useState('now');
  const [ruleSplunkMaxEvents, setRuleSplunkMaxEvents] = useState(200);
  const [ruleSchedule, setRuleSchedule] = useState<'manual' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [ruleTags, setRuleTags] = useState('');
  const [ruleSaving, setRuleSaving] = useState(false);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);

  // Pending evidence (AI suggestions) state
  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidenceItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingStats, setPendingStats] = useState<{ pending: number; approved: number; rejected: number }>({ pending: 0, approved: 0, rejected: 0 });
  const [scanning, setScanning] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // Source-specific config state for non-Splunk sources
  const [ruleSourceQuery, setRuleSourceQuery] = useState('');
  const [ruleSourceTimeRange, setRuleSourceTimeRange] = useState('24h');
  const [ruleSourceMaxResults, setRuleSourceMaxResults] = useState(200);
  const [ruleSourceFilter, setRuleSourceFilter] = useState('');
  // Source metadata from API
  const [sourceMeta, setSourceMeta] = useState<SourceMeta[]>([]);
  const [sourceCategories, setSourceCategories] = useState<SourceCategory[]>([]);

  useEffect(() => {
    loadEvidence();
    loadSplunkConfig();
    loadCollectionRules();
    loadSourceMeta();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadEvidence = async () => {
    try {
      const response = await evidenceAPI.getAll({ limit: 100 });
      setEvidence(response.data?.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load evidence');
    } finally {
      setLoading(false);
    }
  };

  const loadSplunkConfig = async () => {
    try {
      const response = await integrationsAPI.getSplunkConfig();
      setSplunkConfigured(Boolean(response.data?.data?.configured));
    } catch (err) {
      setSplunkConfigured(false);
    }
  };

  const loadCollectionRules = async () => {
    setRulesLoading(true);
    try {
      const response = await autoEvidenceAPI.getRules();
      setCollectionRules(response.data?.data || []);
    } catch {
      // Non-fatal – page still works without rules
    } finally {
      setRulesLoading(false);
    }
  };

  const loadPendingEvidence = useCallback(async () => {
    setPendingLoading(true);
    try {
      const response = await pendingEvidenceAPI.getAll('pending');
      setPendingEvidence(response.data?.data || []);
    } catch {
      // Non-fatal
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadPendingStats = useCallback(async () => {
    try {
      const response = await pendingEvidenceAPI.getStats();
      setPendingStats(response.data?.data || { pending: 0, approved: 0, rejected: 0 });
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    if (canWriteEvidence) {
      loadPendingEvidence();
      loadPendingStats();
    }
  }, [canWriteEvidence, loadPendingEvidence, loadPendingStats]);

  const handleAIScan = async () => {
    setScanning(true);
    setError('');
    try {
      const response = await pendingEvidenceAPI.scan();
      showToast(response.data?.message || 'AI scan complete');
      loadPendingEvidence();
      loadPendingStats();
    } catch (err: any) {
      setError(err.response?.data?.error || 'AI scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleApprovePending = async (id: string) => {
    setApprovingId(id);
    setError('');
    try {
      const response = await pendingEvidenceAPI.approve(id);
      showToast(response.data?.message || 'Evidence approved');
      loadPendingEvidence();
      loadPendingStats();
      loadEvidence();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to approve evidence');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectPending = async (id: string) => {
    setRejectingId(id);
    setError('');
    try {
      await pendingEvidenceAPI.reject(id);
      showToast('Evidence suggestion rejected');
      loadPendingEvidence();
      loadPendingStats();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reject evidence');
    } finally {
      setRejectingId(null);
    }
  };

  const loadSourceMeta = async () => {
    try {
      const response = await autoEvidenceAPI.getSources();
      setSourceMeta(response.data?.data?.sources || []);
      setSourceCategories(response.data?.data?.categories || []);
    } catch {
      // Non-fatal — fallback to hardcoded dropdown
    }
  };

  const getSourceMeta = (key: string): SourceMeta | undefined => sourceMeta.find((s: SourceMeta) => s.key === key);

  const SOURCE_CATEGORY_LABELS: Record<string, string> = {
    siem: '🛡️ SIEM & Security',
    cloud: '☁️ Cloud Platforms',
    devops: '🔧 DevOps & SCM',
    itsm: '🎫 IT Service Management',
    custom: '🔌 Custom'
  };

  const openNewRuleModal = () => {
    setEditingRule(null);
    setRuleName('');
    setRuleDescription('');
    setRuleSourceType('splunk');
    setRuleSplunkSearch('index=main sourcetype=*');
    setRuleSplunkEarliest('-24h@h');
    setRuleSplunkLatest('now');
    setRuleSplunkMaxEvents(200);
    setRuleSourceQuery('');
    setRuleSourceTimeRange('24h');
    setRuleSourceMaxResults(200);
    setRuleSourceFilter('');
    setRuleSchedule('daily');
    setRuleTags('');
    setRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: CollectionRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleDescription(rule.description || '');
    setRuleSourceType(rule.source_type);
    const sc = rule.source_config as Record<string, unknown>;
    // Splunk-specific
    setRuleSplunkSearch(String(sc.search || 'index=main sourcetype=*'));
    setRuleSplunkEarliest(String(sc.earliest_time || '-24h@h'));
    setRuleSplunkLatest(String(sc.latest_time || 'now'));
    setRuleSplunkMaxEvents(Number(sc.max_events) || 200);
    // Generic source config — populate based on source_type so round-tripping preserves config
    let sourceQuery = '';
    let sourceFilter = '';
    const sourceTimeRange = String(sc.time_range || '24h');
    const sourceMaxResults = Number(sc.max_results || sc.max_records || 200);

    switch (rule.source_type) {
      case 'microsoft_sentinel':
        sourceQuery = String(sc.query || '');
        sourceFilter = String(sc.workspace_id || '');
        break;
      case 'aws_cloudtrail':
        sourceQuery = String(sc.event_name || '');
        sourceFilter = String(sc.region || '');
        break;
      case 'crowdstrike':
        sourceQuery = String(sc.filter || '');
        sourceFilter = '';
        break;
      case 'jira':
        sourceQuery = String(sc.jql_query || '');
        sourceFilter = String(sc.project_key || '');
        break;
      case 'servicenow': // ip-hygiene:ignore
        sourceQuery = String(sc.query_filter || '');
        sourceFilter = String(sc.table_name || '');
        break;
      case 'github':
        sourceQuery = String(sc.event_type || '');
        sourceFilter = String(sc.repository || '');
        break;
      case 'connector':
        sourceQuery = String(sc.payload_format || 'json');
        sourceFilter = String(sc.endpoint_url || '');
        break;
      default:
        sourceQuery = String(sc.query || sc.filter || sc.search || '');
        sourceFilter = String(sc.project_key || sc.table_name || sc.repository || sc.workspace_id || sc.region || sc.endpoint_url || '');
        break;
    }

    setRuleSourceQuery(sourceQuery);
    setRuleSourceTimeRange(sourceTimeRange);
    setRuleSourceMaxResults(sourceMaxResults);
    setRuleSourceFilter(sourceFilter);
    setRuleSchedule(rule.schedule);
    setRuleTags((rule.tags || []).join(', '));
    setRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleName.trim()) { setError('Rule name is required'); return; }
    setRuleSaving(true);
    setError('');
    try {
      // Build source_config based on source type
      let sourceConfig: Record<string, unknown>;
      if (ruleSourceType === 'splunk') {
        sourceConfig = {
          search: ruleSplunkSearch.trim(),
          earliest_time: ruleSplunkEarliest || undefined,
          latest_time: ruleSplunkLatest || undefined,
          max_events: ruleSplunkMaxEvents || undefined
        };
      } else if (ruleSourceType === 'microsoft_sentinel') {
        sourceConfig = {
          workspace_id: ruleSourceFilter || undefined,
          query: ruleSourceQuery || undefined,
          time_range: ruleSourceTimeRange || '24h'
        };
      } else if (ruleSourceType === 'aws_cloudtrail') {
        sourceConfig = {
          region: ruleSourceFilter || undefined,
          event_name: ruleSourceQuery || undefined,
          time_range: ruleSourceTimeRange || '24h'
        };
      } else if (ruleSourceType === 'crowdstrike') {
        sourceConfig = {
          filter: ruleSourceQuery || undefined,
          time_range: ruleSourceTimeRange || '24h'
        };
      } else if (ruleSourceType === 'jira') {
        sourceConfig = {
          jql_query: ruleSourceQuery || undefined,
          project_key: ruleSourceFilter || undefined,
          max_results: ruleSourceMaxResults || 200
        };
      } else if (ruleSourceType === 'servicenow') { // ip-hygiene:ignore
        sourceConfig = {
          table_name: ruleSourceFilter || undefined,
          query_filter: ruleSourceQuery || undefined,
          time_range: ruleSourceTimeRange || '24h',
          max_records: ruleSourceMaxResults || 200
        };
      } else if (ruleSourceType === 'github') {
        sourceConfig = {
          repository: ruleSourceFilter || undefined,
          event_type: ruleSourceQuery || undefined,
          time_range: ruleSourceTimeRange || '24h',
          max_results: ruleSourceMaxResults || 200
        };
      } else {
        // connector / custom
        sourceConfig = {
          endpoint_url: ruleSourceFilter || undefined,
          payload_format: ruleSourceQuery || 'json'
        };
      }

      const payload = {
        name: ruleName.trim(),
        description: ruleDescription.trim() || undefined,
        source_type: ruleSourceType,
        source_config: sourceConfig,
        schedule: ruleSchedule,
        tags: ruleTags ? ruleTags.split(',').map(t => t.trim()).filter(Boolean) : [],
        enabled: editingRule ? editingRule.enabled : true
      };
      if (editingRule) {
        await autoEvidenceAPI.updateRule(editingRule.id, payload);
        showToast('Collection rule updated');
      } else {
        await autoEvidenceAPI.createRule(payload);
        showToast('Collection rule created');
      }
      setRuleModalOpen(false);
      loadCollectionRules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save collection rule');
    } finally {
      setRuleSaving(false);
    }
  };

  const handleToggleRule = async (rule: CollectionRule) => {
    try {
      await autoEvidenceAPI.updateRule(rule.id, { enabled: !rule.enabled });
      showToast(rule.enabled ? 'Rule disabled' : 'Rule enabled');
      loadCollectionRules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update rule');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Delete this collection rule?')) return;
    try {
      await autoEvidenceAPI.deleteRule(ruleId);
      showToast('Collection rule deleted');
      loadCollectionRules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const handleRunRule = async (rule: CollectionRule) => {
    if (runningRuleId) return;
    setRunningRuleId(rule.id);
    setError('');
    try {
      const response = await autoEvidenceAPI.runRule(rule.id);
      showToast(response.data?.message || 'Evidence collected');
      loadCollectionRules();
      loadEvidence();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Collection run failed');
    } finally {
      setRunningRuleId(null);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) setSelectedFiles(files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (!canWriteEvidence) return;
    if (!selectedFiles.length) return;
    setUploading(true);
    setError('');
    setUploadResults(null);
    // Mark all files as pending
    setFileProgress(Object.fromEntries(selectedFiles.map((_, i) => [i, 'pending' as const])));
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append('files', file));
      if (uploadDescription) formData.append('description', uploadDescription);
      if (uploadTags) formData.append('tags', uploadTags);
      formData.append('pii_classification', uploadPiiClassification);
      formData.append('data_sensitivity', uploadDataSensitivity);
      if (uploadPiiTypes.length) formData.append('pii_types', uploadPiiTypes.join(','));
      const resp = await evidenceAPI.bulkUpload(formData);
      const { results, summary } = resp.data.data as { results: BulkUploadResult[]; summary: { total: number; succeeded: number; failed: number } };
      setUploadResults(results);
      // Map progress state from results
      const progress: Record<number, 'done' | 'error'> = {};
      results.forEach((r, i) => { progress[i] = r.success ? 'done' : 'error'; });
      setFileProgress(progress);
      showToast(`${summary.succeeded} of ${summary.total} file${summary.total !== 1 ? 's' : ''} uploaded`);
      if (summary.succeeded > 0) {
        setSelectedFiles([]);
        setUploadDescription('');
        setUploadTags('');
        setUploadPiiClassification('none');
        setUploadDataSensitivity('internal');
        setUploadPiiTypes([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadEvidence();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSplunkImport = async () => {
    if (!canWriteEvidence) return;
    if (!splunkSearch.trim()) {
      setError('Splunk search query is required');
      return;
    }
    setSplunkImporting(true);
    setError('');
    try {
      const response = await integrationsAPI.importSplunkEvidence({
        search: splunkSearch,
        earliest_time: splunkEarliest || undefined,
        latest_time: splunkLatest || undefined,
        max_events: splunkMaxEvents,
        title: splunkTitle || undefined,
        description: splunkDescription || undefined,
        tags: splunkTags || undefined
      });
      const resultCount = response.data?.data?.result_count || 0;
      showToast(`Splunk import complete (${resultCount} events)`);
      setSplunkModalOpen(false);
      setSplunkTitle('');
      setSplunkDescription('');
      setSplunkTags('');
      await loadEvidence();
    } catch (err: any) {
      setError(err.response?.data?.details || err.response?.data?.error || 'Splunk import failed');
    } finally {
      setSplunkImporting(false);
    }
  };

  const handleDownload = async (evidenceId: string, fileName: string) => {
    try {
      const response = await evidenceAPI.download(evidenceId);
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download file');
    }
  };

  const handleDelete = async (id: string) => {
    if (!canWriteEvidence) return;
    try {
      await evidenceAPI.remove(id);
      showToast('Evidence file deleted');
      setDeleteId(null);
      loadEvidence();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
      setDeleteId(null);
    }
  };

  const openLinkModal = async (evidenceId: string) => {
    if (!canWriteEvidence) return;
    setLinkEvidenceId(evidenceId);
    setSelectedControls([]);
    setLinkNotes('');
    setControlSearch('');
    setControlsLoading(true);
    setLinkModalOpen(true);
    try {
      const response = await implementationsAPI.getAll();
      setControls(response.data?.data);
    } catch (err) {
      setError('Failed to load controls');
    } finally {
      setControlsLoading(false);
    }
  };

  const handleLink = async () => {
    if (!canWriteEvidence) return;
    if (!selectedControls.length || !linkEvidenceId) return;
    try {
      await evidenceAPI.link(linkEvidenceId, {
        controlIds: selectedControls,
        notes: linkNotes || undefined
      });
      showToast(`Linked to ${selectedControls.length} control${selectedControls.length > 1 ? 's' : ''}`);
      setLinkModalOpen(false);
      loadEvidence();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to link');
    }
  };

  const toggleControlSelection = (controlId: string) => {
    setSelectedControls(prev =>
      prev.includes(controlId)
        ? prev.filter(id => id !== controlId)
        : [...prev, controlId]
    );
  };

  const filteredEvidence = evidence.filter(e =>
    e.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredControls = controls.filter(c =>
    (c.control_code || '').toLowerCase().includes(controlSearch.toLowerCase()) ||
    (c.control_title || '').toLowerCase().includes(controlSearch.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const PII_CLASSIFICATION_LABELS: Record<string, { label: string; color: string }> = {
    none: { label: 'No PII', color: 'bg-gray-100 text-gray-600' },
    low: { label: 'PII: Low', color: 'bg-yellow-100 text-yellow-700' },
    moderate: { label: 'PII: Moderate', color: 'bg-orange-100 text-orange-700' },
    high: { label: 'PII: High', color: 'bg-red-100 text-red-700' },
    critical: { label: 'PII: Critical', color: 'bg-red-200 text-red-900 font-bold' },
  };

  const DATA_SENSITIVITY_LABELS: Record<string, { label: string; color: string }> = {
    public: { label: 'Public', color: 'bg-green-100 text-green-700' },
    internal: { label: 'Internal', color: 'bg-blue-100 text-blue-700' },
    confidential: { label: 'Confidential', color: 'bg-orange-100 text-orange-700' },
    restricted: { label: 'Restricted', color: 'bg-red-100 text-red-700' },
  };

  const ALL_PII_TYPES = [
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
    { value: 'ssn', label: 'SSN' },
    { value: 'address', label: 'Address' },
    { value: 'phone', label: 'Phone' },
    { value: 'dob', label: 'Date of Birth' },
    { value: 'financial', label: 'Financial' },
    { value: 'health', label: 'Health' },
    { value: 'biometric', label: 'Biometric' },
    { value: 'other', label: 'Other' },
  ];

  const togglePiiType = (type: string) => {
    setUploadPiiTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50">
            {toast}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Evidence</h1>
          <p className="text-gray-600 mt-2">Upload and manage evidence files, then link them to compliance controls</p>
        </div>

        {/* Cross-feature navigation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Related:</strong>{' '}
            <Link href="/dashboard/controls" className="underline hover:text-blue-900">Controls</Link>{' · '}
            <Link href="/dashboard/assessments" className="underline hover:text-blue-900">Assessments</Link>{' · '}
            <Link href="/dashboard/reports" className="underline hover:text-blue-900">Reports</Link>{' · '}
            <Link href="/dashboard/vulnerabilities" className="underline hover:text-blue-900">Vulnerabilities</Link>
          </p>
        </div>

        {!canWriteEvidence && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">
            You have read-only evidence access. Upload, link, import, and delete actions require
            <code className="mx-1">evidence.write</code>.
          </div>
        )}

        {/* Upload Area */}
        {canWriteEvidence && (
          <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-lg font-bold text-gray-900">Upload Evidence</h3>
            <button
              onClick={() => {
                if (!splunkConfigured) {
                  setError('Configure Splunk in Settings before importing evidence');
                  return;
                }
                setSplunkModalOpen(true);
              }}
              className="text-sm bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Import from Splunk
            </button>
          </div>

          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="text-4xl">📁</span>
            <p className="text-gray-600 mt-2">Drag &amp; drop files here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">
              Supports PDF, images, Office docs, text, and scan artifacts (.ckl, .nessus, .fpr, .sarif, .xml, .json) (max 50 MB each by default)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.zip,.ckl,.nessus,.fpr,.sarif,.xml,.json"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Selected files ({selectedFiles.length}):</p>
              {selectedFiles.map((file, i) => {
                const status = fileProgress[i];
                return (
                  <div key={i} className={`flex items-center justify-between rounded p-2 ${FILE_STATUS_BG[status] ?? 'bg-purple-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{FILE_STATUS_ICON[status] ?? '📄'}</span>
                      <span className="text-sm text-gray-900">{file.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Describe this evidence..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="Comma-separated tags..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* PII Classification Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PII Classification</label>
              <select
                value={uploadPiiClassification}
                onChange={(e) => setUploadPiiClassification(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="none">None — No PII</option>
                <option value="low">Low — Minimal PII risk</option>
                <option value="moderate">Moderate — Some PII present</option>
                <option value="high">High — Significant PII</option>
                <option value="critical">Critical — Highly sensitive PII</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Sensitivity</label>
              <select
                value={uploadDataSensitivity}
                onChange={(e) => setUploadDataSensitivity(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
          </div>

          {uploadPiiClassification !== 'none' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">PII Types Present</label>
              <div className="flex flex-wrap gap-2">
                {ALL_PII_TYPES.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadPiiTypes.includes(value)}
                      onChange={() => togglePiiType(value)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFiles.length}
            className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? 'Analyzing & Uploading...' : `Upload ${selectedFiles.length || 0} File${selectedFiles.length !== 1 ? 's' : ''}`}
          </button>

          {/* AI Analysis Results Panel */}
          {uploadResults && uploadResults.length > 0 && (
            <div className="mt-6 border border-purple-200 rounded-lg overflow-hidden">
              <div className="bg-purple-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>🤖</span>
                  <h4 className="text-sm font-semibold text-purple-900">AI Analysis Results</h4>
                </div>
                <button onClick={() => setUploadResults(null)} className="text-purple-400 hover:text-purple-600 text-xs">Dismiss</button>
              </div>
              <div className="divide-y divide-gray-100">
                {uploadResults.map((r, i) => (
                  <div key={i} className={`px-4 py-3 ${r.success ? 'bg-white' : 'bg-red-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0">{r.success ? '✅' : '❌'}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{r.file_name}</span>
                      </div>
                      {r.success && r.id && (
                        <Link href={`/dashboard/evidence`} className="text-xs text-purple-600 hover:underline shrink-0">View</Link>
                      )}
                    </div>
                    {r.error && <p className="text-xs text-red-600 mt-1 ml-6">{r.error}</p>}
                    {r.success && r.ai_analysis && (
                      <div className="mt-2 ml-6 flex flex-wrap gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PII_CLASS_BADGE[r.ai_analysis.pii_classification] ?? PII_CLASS_BADGE.none}`}>
                          PII: {r.ai_analysis.pii_classification}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${DATA_SENS_BADGE[r.ai_analysis.data_sensitivity] ?? DATA_SENS_BADGE.internal}`}>
                          {r.ai_analysis.data_sensitivity}
                        </span>
                        {r.ai_analysis.pii_types.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                            {r.ai_analysis.pii_types.join(', ')}
                          </span>
                        )}
                        {r.ai_analysis.content_detected && (
                          <span className="text-xs text-gray-500 italic">detected in file content</span>
                        )}
                        {!r.ai_analysis.detected && (
                          <span className="text-xs text-gray-400 italic">no sensitive data detected</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}

        {/* Auto-Collection Rules */}
        {canWriteEvidence && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Auto-Collection Rules</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Schedule automated evidence collection from SIEM, cloud, DevOps, ITSM, and custom sources.
                </p>
              </div>
              <button
                onClick={openNewRuleModal}
                className="text-sm bg-purple-600 text-white px-3 py-2 rounded-md hover:bg-purple-700 transition-colors"
              >
                + New Rule
              </button>
            </div>

            {rulesLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
              </div>
            ) : collectionRules.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-3xl mb-2">🤖</p>
                <p className="text-sm">No auto-collection rules yet.</p>
                <p className="text-xs mt-1">Create a rule to automatically collect evidence on a schedule.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {collectionRules.map((rule) => (
                  <div key={rule.id} className="py-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{rule.name}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          SOURCE_CATEGORY_COLORS[getSourceMeta(rule.source_type)?.category || 'custom'] || 'bg-blue-100 text-blue-700'
                        }`}>
                          {getSourceMeta(rule.source_type)?.label || rule.source_type}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 capitalize">
                          {rule.schedule}
                        </span>
                        {rule.last_run_status === 'success' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-600">✓ Last run OK</span>
                        )}
                        {rule.last_run_status === 'error' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600" title={rule.last_run_error || ''}>⚠ Last run failed</span>
                        )}
                        {rule.last_run_status === 'running' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-600">⏳ Running…</span>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-sm text-gray-500 mt-1 truncate">{rule.description}</p>
                      )}
                      <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                        {rule.last_run_at && (
                          <span>Last run: {format(new Date(rule.last_run_at), 'PPp')}</span>
                        )}
                        {rule.next_run_at && rule.schedule !== 'manual' && (
                          <span>Next: {format(new Date(rule.next_run_at), 'PPp')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleRunRule(rule)}
                        disabled={!!runningRuleId}
                        title="Run now"
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {runningRuleId === rule.id ? '…' : '▶ Run'}
                      </button>
                      <button
                        onClick={() => handleToggleRule(rule)}
                        title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                        className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => openEditRuleModal(rule)}
                        title="Edit rule"
                        className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        title="Delete rule"
                        className="text-xs border border-red-300 text-red-600 px-2 py-1 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI-Powered Evidence Suggestions (Pending Evidence) */}
        {canWriteEvidence && (
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">🤖 AI Evidence Suggestions</h3>
                <p className="text-sm text-gray-500 mt-1">
                  AI scans your connected integrations and suggests evidence mapped to your framework controls.
                  Review and approve before adding to your official evidence library.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {pendingStats.pending > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    {pendingStats.pending} pending
                  </span>
                )}
                <button
                  onClick={handleAIScan}
                  disabled={scanning}
                  className="text-sm bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {scanning ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Scanning…
                    </>
                  ) : (
                    <>🔍 Scan Integrations</>
                  )}
                </button>
              </div>
            </div>

            {pendingLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
              </div>
            ) : pendingEvidence.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-3xl mb-2">✨</p>
                <p className="text-sm">No pending evidence suggestions.</p>
                <p className="text-xs mt-1">Click <strong>Scan Integrations</strong> to let AI analyze your connected data sources and suggest evidence.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pendingEvidence.map((item) => (
                  <div key={item.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{item.ai_title}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 capitalize">
                            {item.source_type}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            item.ai_confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                            item.ai_confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {Math.round(item.ai_confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{item.ai_description}</p>
                        {item.source_summary && (
                          <p className="text-xs text-gray-400 mt-1">Source: {item.source_summary}</p>
                        )}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {item.suggested_tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{tag}</span>
                          ))}
                        </div>
                        {item.suggested_controls.length > 0 && (
                          <p className="text-xs text-purple-600 mt-1">
                            Mapped to {item.suggested_controls.length} control{item.suggested_controls.length !== 1 ? 's' : ''}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Suggested {format(new Date(item.created_at), 'PPp')}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApprovePending(item.id)}
                          disabled={!!approvingId || !!rejectingId}
                          className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {approvingId === item.id ? '…' : '✓ Approve'}
                        </button>
                        <button
                          onClick={() => handleRejectPending(item.id)}
                          disabled={!!approvingId || !!rejectingId}
                          className="text-sm border border-red-300 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {rejectingId === item.id ? '…' : '✗ Reject'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Evidence Library */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Evidence Library</h3>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files..."
              className="w-64 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : filteredEvidence.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-purple-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">File</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Classification</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Uploaded</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEvidence.map((ev) => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span>📄</span>
                          <span className="text-sm font-medium text-gray-900">{ev.file_name}</span>
                        </div>
                        {ev.tags && ev.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {ev.tags.map((tag, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{ev.description || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {ev.pii_classification && ev.pii_classification !== 'none' ? (
                            <span className={`text-xs px-2 py-0.5 rounded ${PII_CLASSIFICATION_LABELS[ev.pii_classification]?.color || 'bg-gray-100 text-gray-600'}`}>
                              {PII_CLASSIFICATION_LABELS[ev.pii_classification]?.label || ev.pii_classification}
                            </span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">No PII</span>
                          )}
                          {ev.data_sensitivity && (
                            <span className={`text-xs px-2 py-0.5 rounded ${DATA_SENSITIVITY_LABELS[ev.data_sensitivity]?.color || 'bg-gray-100 text-gray-600'}`}>
                              {DATA_SENSITIVITY_LABELS[ev.data_sensitivity]?.label || ev.data_sensitivity}
                            </span>
                          )}
                          {ev.pii_types && ev.pii_types.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {ev.pii_types.map((t, i) => (
                                <span key={i} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatSize(ev.file_size)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(ev.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDownload(ev.id, ev.file_name)}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                          >
                            Download
                          </button>
                          {canWriteEvidence && (
                            <>
                              <button
                                onClick={() => openLinkModal(ev.id)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Link
                              </button>
                              <button
                                onClick={() => setDeleteId(ev.id)}
                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>{searchTerm ? 'No files match your search.' : 'No evidence files uploaded yet.'}</p>
            </div>
          )}
        </div>

        {/* Link to Controls Modal */}
        {linkModalOpen && canWriteEvidence && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setLinkModalOpen(false)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10">
              <div className="p-6 border-b">
                <h3 className="text-lg font-bold text-gray-900">Link Evidence to Controls</h3>
                <p className="text-sm text-gray-500 mt-1">Select controls to associate with this evidence</p>
              </div>
              <div className="p-6 max-h-80 overflow-y-auto">
                <input
                  type="text"
                  value={controlSearch}
                  onChange={(e) => setControlSearch(e.target.value)}
                  placeholder="Search controls..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                {controlsLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredControls.slice(0, 40).map((ctrl) => (
                      <label key={ctrl.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedControls.includes(ctrl.control_id)}
                          onChange={() => toggleControlSelection(ctrl.control_id)}
                          className="rounded"
                        />
                        <div>
                          <span className="text-sm font-mono text-gray-900">{ctrl.control_code}</span>
                          <span className="text-sm text-gray-600 ml-2">{ctrl.control_title}</span>
                          <span className="text-xs text-gray-400 ml-2">({ctrl.framework_code})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link Notes</label>
                  <input
                    type="text"
                    value={linkNotes}
                    onChange={(e) => setLinkNotes(e.target.value)}
                    placeholder="Notes about this link..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setLinkModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleLink}
                  disabled={!selectedControls.length}
                  className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Link {selectedControls.length} Control{selectedControls.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Splunk Import Modal */}
        {splunkModalOpen && canWriteEvidence && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setSplunkModalOpen(false)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 z-10">
              <div className="p-6 border-b">
                <h3 className="text-lg font-bold text-gray-900">Import Evidence from Splunk</h3>
                <p className="text-sm text-gray-500 mt-1">Run a Splunk search and save the results as a JSON evidence artifact.</p>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
                  <textarea
                    value={splunkSearch}
                    onChange={(e) => setSplunkSearch(e.target.value)}
                    rows={4}
                    placeholder="index=main sourcetype=* | head 200"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Time</label>
                    <input
                      type="text"
                      value={splunkEarliest}
                      onChange={(e) => setSplunkEarliest(e.target.value)}
                      placeholder="-24h@h"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Latest Time</label>
                    <input
                      type="text"
                      value={splunkLatest}
                      onChange={(e) => setSplunkLatest(e.target.value)}
                      placeholder="now"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Events</label>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={splunkMaxEvents}
                      onChange={(e) => setSplunkMaxEvents(Number(e.target.value) || 200)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Evidence Title (optional)</label>
                    <input
                      type="text"
                      value={splunkTitle}
                      onChange={(e) => setSplunkTitle(e.target.value)}
                      placeholder="Weekly failed login events"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (optional)</label>
                    <input
                      type="text"
                      value={splunkTags}
                      onChange={(e) => setSplunkTags(e.target.value)}
                      placeholder="splunk,auth,log-events"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={splunkDescription}
                    onChange={(e) => setSplunkDescription(e.target.value)}
                    placeholder="Context for auditors"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setSplunkModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleSplunkImport}
                  disabled={splunkImporting || !splunkSearch.trim()}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {splunkImporting ? 'Importing...' : 'Import to Evidence'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteId && canWriteEvidence && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setDeleteId(null)}></div>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 z-10">
              <h3 className="text-lg font-bold text-gray-900">Delete Evidence?</h3>
              <p className="text-gray-600 mt-2">This will permanently delete this file and remove all links to controls.</p>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={() => handleDelete(deleteId)} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Collection Rule Create/Edit Modal */}
        {ruleModalOpen && canWriteEvidence && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setRuleModalOpen(false)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 z-10 max-h-[90vh] flex flex-col">
              <div className="p-6 border-b">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingRule ? 'Edit Collection Rule' : 'New Auto-Collection Rule'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Define a scheduled evidence collection job that automatically imports and stores compliance evidence.
                </p>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g. Daily Failed Login Report"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={ruleDescription}
                    onChange={(e) => setRuleDescription(e.target.value)}
                    placeholder="What does this rule collect and why?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                    <select
                      value={ruleSourceType}
                      onChange={(e) => setRuleSourceType(e.target.value as typeof ruleSourceType)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      {sourceCategories.length > 0 ? (
                        sourceCategories.map((cat) => {
                          const catSources = sourceMeta.filter(s => s.category === cat.key);
                          if (catSources.length === 0) return null;
                          return (
                            <optgroup key={cat.key} label={`${cat.icon} ${cat.label}`}>
                              {catSources.map(s => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                              ))}
                            </optgroup>
                          );
                        })
                      ) : (
                        /* Fallback if source metadata hasn't loaded yet */
                        <>
                          <optgroup label="🛡️ SIEM &amp; Security">
                            <option value="splunk">Splunk</option>
                            <option value="microsoft_sentinel">Microsoft Sentinel</option>
                            <option value="crowdstrike">CrowdStrike Falcon</option>
                          </optgroup>
                          <optgroup label="☁️ Cloud Platforms">
                            <option value="aws_cloudtrail">AWS CloudTrail</option>
                          </optgroup>
                          <optgroup label="🔧 DevOps &amp; SCM">
                            <option value="jira">Jira</option>
                            <option value="github">GitHub</option>
                          </optgroup>
                          <optgroup label="🎫 IT Service Management">
                            <option value="servicenow">ServiceNow</option>{/* ip-hygiene:ignore */}
                          </optgroup>
                          <optgroup label="🔌 Custom">
                            <option value="connector">Custom Connector</option>
                          </optgroup>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                    <select
                      value={ruleSchedule}
                      onChange={(e) => setRuleSchedule(e.target.value as typeof ruleSchedule)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="manual">Manual only</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                {/* Source description & evidence examples */}
                {(() => {
                  const meta = getSourceMeta(ruleSourceType);
                  if (!meta) return null;
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                      <strong>{meta.label}</strong> <span className="text-xs text-blue-500 ml-1">({SOURCE_CATEGORY_LABELS[meta.category] || meta.category})</span>
                      <p className="mt-1">{meta.description}</p>
                      {meta.evidenceExamples.length > 0 && (
                        <div className="mt-2">
                          <span className="font-medium">Evidence collected:</span>
                          <ul className="list-disc list-inside mt-1 space-y-0.5">
                            {meta.evidenceExamples.map((ex, i) => <li key={i}>{ex}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Source-specific configuration fields */}
                {ruleSourceType === 'splunk' && (
                  <>
                    {!splunkConfigured && (
                      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
                        ⚠ Splunk is not configured. Go to <strong>Settings → Integrations → Splunk</strong> to add credentials first.
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Splunk Search Query <span className="text-red-500">*</span></label>
                      <textarea
                        rows={3}
                        value={ruleSplunkSearch}
                        onChange={(e) => setRuleSplunkSearch(e.target.value)}
                        placeholder={`index=security sourcetype=WinEventLog EventCode=4625\n| stats count by user, src_ip\n| where count > 5`}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Earliest Time</label>
                        <input
                          type="text"
                          value={ruleSplunkEarliest}
                          onChange={(e) => setRuleSplunkEarliest(e.target.value)}
                          placeholder="-24h@h"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latest Time</label>
                        <input
                          type="text"
                          value={ruleSplunkLatest}
                          onChange={(e) => setRuleSplunkLatest(e.target.value)}
                          placeholder="now"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Events</label>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={ruleSplunkMaxEvents}
                          onChange={(e) => setRuleSplunkMaxEvents(Number(e.target.value) || 200)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}

                {ruleSourceType === 'microsoft_sentinel' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Workspace ID</label>
                      <input type="text" value={ruleSourceFilter} onChange={(e) => setRuleSourceFilter(e.target.value)}
                        placeholder="e.g. 12345678-abcd-1234-abcd-1234567890ab"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">KQL Query</label>
                      <textarea rows={2} value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        placeholder="SecurityIncident | where Status == 'Active'"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
                        <select value={ruleSourceTimeRange} onChange={(e) => setRuleSourceTimeRange(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                          <option value="1h">Last 1 hour</option>
                          <option value="24h">Last 24 hours</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {ruleSourceType === 'aws_cloudtrail' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">AWS Region</label>
                        <input type="text" value={ruleSourceFilter} onChange={(e) => setRuleSourceFilter(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
                        <select value={ruleSourceTimeRange} onChange={(e) => setRuleSourceTimeRange(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                          <option value="1h">Last 1 hour</option>
                          <option value="24h">Last 24 hours</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Name Filter</label>
                      <input type="text" value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        placeholder="e.g. CreateUser, PutBucketPolicy, ConsoleLogin"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                  </div>
                )}

                {ruleSourceType === 'crowdstrike' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Detection Filter</label>
                      <textarea rows={2} value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        placeholder="e.g. severity:Critical + type:Malware"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
                      <select value={ruleSourceTimeRange} onChange={(e) => setRuleSourceTimeRange(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                        <option value="1h">Last 1 hour</option>
                        <option value="24h">Last 24 hours</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                      </select>
                    </div>
                  </div>
                )}

                {ruleSourceType === 'jira' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project Key</label>
                      <input type="text" value={ruleSourceFilter} onChange={(e) => setRuleSourceFilter(e.target.value)}
                        placeholder="e.g. SEC, RISK, COMP"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">JQL Query</label>
                      <textarea rows={2} value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        placeholder={`project = SEC AND type = "Change Request" AND status = Done`}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max Results</label>
                      <input type="number" min={1} max={5000} value={ruleSourceMaxResults}
                        onChange={(e) => setRuleSourceMaxResults(Number(e.target.value) || 200)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                  </div>
                )}

                {ruleSourceType === 'servicenow' && ( // ip-hygiene:ignore
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Table Name</label>
                        <input type="text" value={ruleSourceFilter} onChange={(e) => setRuleSourceFilter(e.target.value)}
                          placeholder="e.g. incident, change_request, cmdb_ci"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
                        <select value={ruleSourceTimeRange} onChange={(e) => setRuleSourceTimeRange(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                          <option value="24h">Last 24 hours</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Query Filter</label>
                      <textarea rows={2} value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        placeholder="e.g. category=Security^state=resolved"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max Records</label>
                      <input type="number" min={1} max={5000} value={ruleSourceMaxResults}
                        onChange={(e) => setRuleSourceMaxResults(Number(e.target.value) || 200)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                  </div>
                )}

                {ruleSourceType === 'github' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Repository (owner/repo)</label>
                      <input type="text" value={ruleSourceFilter} onChange={(e) => setRuleSourceFilter(e.target.value)}
                        placeholder="e.g. my-org/my-repo"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                      <select value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                        <option value="">All events</option>
                        <option value="pull_request_review">PR Reviews (code review evidence)</option>
                        <option value="dependabot_alert">Dependabot Alerts (vulnerability mgmt)</option>
                        <option value="code_scanning">Code Scanning / CodeQL (SAST evidence)</option>
                        <option value="audit_log">Audit Log (access control changes)</option>
                        <option value="branch_protection">Branch Protection (change mgmt evidence)</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
                        <select value={ruleSourceTimeRange} onChange={(e) => setRuleSourceTimeRange(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                          <option value="24h">Last 24 hours</option>
                          <option value="7d">Last 7 days</option>
                          <option value="30d">Last 30 days</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Results</label>
                        <input type="number" min={1} max={5000} value={ruleSourceMaxResults}
                          onChange={(e) => setRuleSourceMaxResults(Number(e.target.value) || 200)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {ruleSourceType === 'connector' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                      <input type="text" value={ruleSourceFilter} onChange={(e) => setRuleSourceFilter(e.target.value)}
                        placeholder="https://your-system.example.com/api/evidence"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payload Format</label>
                      <select value={ruleSourceQuery} onChange={(e) => setRuleSourceQuery(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm">
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                        <option value="xml">XML</option>
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={ruleTags}
                    onChange={(e) => setRuleTags(e.target.value)}
                    placeholder="splunk, auth, automated"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                  <strong>How it works:</strong> Evidence is collected as a JSON file containing the search/query results
                  and metadata (rule name, timestamp, source). Files are stored in your evidence library and can be
                  linked to controls. For scheduled rules, the next run is computed automatically after each collection.
                  Supported sources: Splunk, Microsoft Sentinel, AWS CloudTrail, CrowdStrike, Jira, ServiceNow, and GitHub. {/* ip-hygiene:ignore */}
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setRuleModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleSaveRule}
                  disabled={ruleSaving || !ruleName.trim()}
                  className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ruleSaving ? 'Saving…' : (editingRule ? 'Update Rule' : 'Create Rule')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
