// @tier: free
'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { assessmentsAPI, aiAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessAuditorWorkspace, hasPermission } from '@/lib/access';
import { groupByControlFamily, sameControlRef } from '@/lib/controlFamilies';

type WorkspaceTab = 'summary' | 'procedures' | 'pbc' | 'workpapers' | 'findings' | 'signoffs' | 'analytics' | 'ai_insights' | 'client_portal';

const engagementStatuses = ['planning', 'fieldwork', 'reporting', 'completed', 'archived'];
const pbcStatuses = ['open', 'in_progress', 'submitted', 'accepted', 'rejected', 'closed'];
const workpaperStatuses = ['draft', 'in_review', 'finalized'];
const findingStatuses = ['open', 'accepted', 'remediating', 'verified', 'closed'];
const signoffTypes = [
  'customer_acknowledgment',
  'auditor',
  'company_leadership',
  'auditor_firm_recommendation'
];
const templateArtifactTypes = ['pbc', 'workpaper', 'finding', 'signoff', 'engagement_report'];

function labelize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function asList(payload: any, key?: string) {
  if (Array.isArray(payload)) return payload;
  if (key && Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function parseCsv(value: string) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeControlRef(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase();
}

export default function AuditorWorkspacePage() {
  const { user } = useAuth();
  const canViewWorkspace = canAccessAuditorWorkspace(user);
  const canWrite = canViewWorkspace && hasPermission(user, 'assessments.write');

  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [engagements, setEngagements] = useState<any[]>([]);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<WorkspaceTab>('summary');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [engagement, setEngagement] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [pbc, setPbc] = useState<any[]>([]);
  const [workpapers, setWorkpapers] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [signoffs, setSignoffs] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [signoffReadiness, setSignoffReadiness] = useState<any>(null);

  const [selectedPbcId, setSelectedPbcId] = useState<string | null>(null);
  const [selectedWorkpaperId, setSelectedWorkpaperId] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [expandedProcedureFamilies, setExpandedProcedureFamilies] = useState<Record<string, boolean>>({});
  const [expandedProcedureControls, setExpandedProcedureControls] = useState<Record<string, boolean>>({});

  const [newEngagementName, setNewEngagementName] = useState('');
  const [newEngagementType, setNewEngagementType] = useState('internal_audit');
  const [newEngagementScope, setNewEngagementScope] = useState('');
  const [newEngagementFrameworkCodes, setNewEngagementFrameworkCodes] = useState('nist_800_53');
  const [newEngagementPeriodStart, setNewEngagementPeriodStart] = useState('');
  const [newEngagementPeriodEnd, setNewEngagementPeriodEnd] = useState('');

  const [newPbcTitle, setNewPbcTitle] = useState('');
  const [newPbcDetails, setNewPbcDetails] = useState('');
  const [newPbcPriority, setNewPbcPriority] = useState('medium');
  const [newPbcDueDate, setNewPbcDueDate] = useState('');
  const [autoPbcContext, setAutoPbcContext] = useState('');

  const [newWorkpaperTitle, setNewWorkpaperTitle] = useState('');
  const [newWorkpaperObjective, setNewWorkpaperObjective] = useState('');
  const [newWorkpaperProcedure, setNewWorkpaperProcedure] = useState('');
  const [newWorkpaperConclusion, setNewWorkpaperConclusion] = useState('');

  const [newFindingTitle, setNewFindingTitle] = useState('');
  const [newFindingDescription, setNewFindingDescription] = useState('');
  const [newFindingSeverity, setNewFindingSeverity] = useState('medium');
  const [newFindingRecommendation, setNewFindingRecommendation] = useState('');
  const [newFindingDueDate, setNewFindingDueDate] = useState('');

  const [newSignoffType, setNewSignoffType] = useState('auditor');
  const [newSignoffStatus, setNewSignoffStatus] = useState('approved');
  const [newSignoffComments, setNewSignoffComments] = useState('');
  const [templateArtifactType, setTemplateArtifactType] = useState('pbc');
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templateSetDefault, setTemplateSetDefault] = useState(true);
  const [templateUploadFile, setTemplateUploadFile] = useState<File | null>(null);

  const [engagementStatusDraft, setEngagementStatusDraft] = useState('planning');
  const [pbcStatusDraft, setPbcStatusDraft] = useState('open');
  const [workpaperStatusDraft, setWorkpaperStatusDraft] = useState('draft');
  const [findingStatusDraft, setFindingStatusDraft] = useState('open');

  // AI Insights state
  const [aiRiskAssessment, setAiRiskAssessment] = useState<any>(null);
  const [aiExecutiveSummary, setAiExecutiveSummary] = useState<any>(null);
  const [aiComplianceForecast, setAiComplianceForecast] = useState<any>(null);
  const [aiGapAnalysis, setAiGapAnalysis] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [swarmResult, setSwarmResult] = useState<any>(null);
  const [swarmRunning, setSwarmRunning] = useState(false);

  // Client portal state
  const [workspaceLinks, setWorkspaceLinks] = useState<any[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkDays, setNewLinkDays] = useState('30');
  const [linkCopied, setLinkCopied] = useState<string | null>(null);

  const selectedPbc = pbc.find((item) => item.id === selectedPbcId) || null;
  const selectedWorkpaper = workpapers.find((item) => item.id === selectedWorkpaperId) || null;
  const selectedFinding = findings.find((item) => item.id === selectedFindingId) || null;
  const primarySelectedProcedureId = selectedProcedureIds[0] || null;
  const primarySelectedProcedure = procedures.find((item) => item.id === primarySelectedProcedureId) || null;

  const filteredEngagements = useMemo(() => {
    return engagements.filter((row) => {
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch = !query ||
        String(row.name || '').toLowerCase().includes(query) ||
        String(row.scope || '').toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [engagements, search, statusFilter]);

  const procedureFamilies = useMemo(
    () => groupByControlFamily(procedures, (row) => row.control_id),
    [procedures]
  );

  const procedureControlKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of procedures) {
      const controlKey = normalizeControlRef(row.control_id);
      if (!row.id || !controlKey) continue;
      map.set(String(row.id), controlKey);
    }
    return map;
  }, [procedures]);

  const pbcByControlKey = useMemo(() => {
    const grouped = new Map<string, any[]>();
    const pbcById = new Map<string, any>();
    const add = (controlKey: string, row: any) => {
      if (!controlKey) return;
      if (!grouped.has(controlKey)) grouped.set(controlKey, []);
      const list = grouped.get(controlKey)!;
      if (!list.some((entry: any) => entry.id === row.id)) {
        list.push(row);
      }
    };

    for (const row of pbc) {
      if (row.id) pbcById.set(String(row.id), row);
      const directControlKey = normalizeControlRef(row.assessment_control_id);
      add(directControlKey, row);

      const procedureControlKey = row.assessment_procedure_id
        ? procedureControlKeyById.get(String(row.assessment_procedure_id)) || ''
        : '';
      add(procedureControlKey, row);
    }

    return { grouped, pbcById };
  }, [pbc, procedureControlKeyById]);

  const findingsByControlKey = useMemo(() => {
    const grouped = new Map<string, any[]>();
    const add = (controlKey: string, row: any) => {
      if (!controlKey) return;
      if (!grouped.has(controlKey)) grouped.set(controlKey, []);
      const list = grouped.get(controlKey)!;
      if (!list.some((entry: any) => entry.id === row.id)) {
        list.push(row);
      }
    };

    for (const row of findings) {
      add(normalizeControlRef(row.control_ref), row);

      if (row.related_pbc_request_id) {
        const linkedPbc = pbcByControlKey.pbcById.get(String(row.related_pbc_request_id));
        if (linkedPbc) {
          add(normalizeControlRef(linkedPbc.assessment_control_id), row);
          const pbcProcedureControlKey = linkedPbc.assessment_procedure_id
            ? procedureControlKeyById.get(String(linkedPbc.assessment_procedure_id)) || ''
            : '';
          add(pbcProcedureControlKey, row);
        }
      }
    }

    return grouped;
  }, [findings, pbcByControlKey.pbcById, procedureControlKeyById]);

  useEffect(() => {
    if (procedureFamilies.length === 0) {
      setExpandedProcedureFamilies({});
      setExpandedProcedureControls({});
      return;
    }

    setExpandedProcedureFamilies((prev) => {
      const next: Record<string, boolean> = {};
      procedureFamilies.forEach((family, index) => {
        const key = family.family;
        next[key] = prev[key] ?? index === 0;
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
    if (!canViewWorkspace) {
      setLoading(false);
      return;
    }
    loadInitial();
  }, [canViewWorkspace]);

  useEffect(() => {
    if (!canViewWorkspace || !selectedEngagementId) return;
    loadWorkspace(selectedEngagementId);
  }, [canViewWorkspace, selectedEngagementId]);

  useEffect(() => {
    if (engagement?.status) setEngagementStatusDraft(engagement.status);
  }, [engagement]);

  useEffect(() => {
    if (selectedPbc?.status) setPbcStatusDraft(selectedPbc.status);
  }, [selectedPbc]);

  useEffect(() => {
    if (selectedWorkpaper?.status) setWorkpaperStatusDraft(selectedWorkpaper.status);
  }, [selectedWorkpaper]);

  useEffect(() => {
    if (selectedFinding?.status) setFindingStatusDraft(selectedFinding.status);
  }, [selectedFinding]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 2400);
  }

  async function refreshEngagements() {
    const response = await assessmentsAPI.getEngagements({ limit: 100, offset: 0 });
    const rows = asList(response.data?.data, 'engagements');
    setEngagements(rows);
    return rows;
  }

  async function loadInitial() {
    try {
      setLoading(true);
      setError('');
      await refreshEngagements();
    } catch (loadError: any) {
      setError(loadError.response?.data?.error || 'Failed to load auditor workspace');
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(engagementId: string) {
    try {
      setWorkspaceLoading(true);
      const [detailRes, pbcRes, wpRes, findingRes, signoffRes, procedureRes, readinessRes, templatesRes] = await Promise.all([
        assessmentsAPI.getEngagementById(engagementId),
        assessmentsAPI.getEngagementPbc(engagementId, { limit: 200, offset: 0 }),
        assessmentsAPI.getEngagementWorkpapers(engagementId, { limit: 200, offset: 0 }),
        assessmentsAPI.getEngagementFindings(engagementId, { limit: 200, offset: 0 }),
        assessmentsAPI.getEngagementSignoffs(engagementId),
        assessmentsAPI.getEngagementProcedures(engagementId, { limit: 300, offset: 0 }),
        assessmentsAPI.getEngagementSignoffReadiness(engagementId),
        assessmentsAPI.getAuditTemplates({ include_inactive: false })
      ]);

      const detailPayload = detailRes.data?.data || {};
      const nextEngagement = detailPayload.engagement || detailPayload;
      setEngagement(nextEngagement);
      setSummary(detailPayload.summary || null);

      const pbcRows = asList(pbcRes.data?.data);
      const wpRows = asList(wpRes.data?.data);
      const findingRows = asList(findingRes.data?.data);
      const signoffRows = asList(signoffRes.data?.data);
      const procedureRows = asList(procedureRes.data?.data, 'procedures');
      const templateRows = asList(templatesRes.data?.data);

      setPbc(pbcRows);
      setWorkpapers(wpRows);
      setFindings(findingRows);
      setSignoffs(signoffRows);
      setProcedures(procedureRows);
      setTemplates(templateRows);
      setSignoffReadiness(readinessRes.data?.data || null);
      setSelectedProcedureIds((prev) => prev.filter((id) => procedureRows.some((row: any) => row.id === id)));

      setSelectedPbcId((prev) => (pbcRows.some((x: any) => x.id === prev) ? prev : (pbcRows[0]?.id || null)));
      setSelectedWorkpaperId((prev) => (wpRows.some((x: any) => x.id === prev) ? prev : (wpRows[0]?.id || null)));
      setSelectedFindingId((prev) => (findingRows.some((x: any) => x.id === prev) ? prev : (findingRows[0]?.id || null)));
    } catch (loadError: any) {
      setError(loadError.response?.data?.error || 'Failed to load selected engagement');
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function createEngagement() {
    if (!canWrite || !newEngagementName.trim()) return;
    try {
      setSaving(true);
      setError('');
      const response = await assessmentsAPI.createEngagement({
        name: newEngagementName.trim(),
        engagement_type: newEngagementType as any,
        scope: newEngagementScope || undefined,
        framework_codes: parseCsv(newEngagementFrameworkCodes),
        period_start: newEngagementPeriodStart || undefined,
        period_end: newEngagementPeriodEnd || undefined
      });
      const createdId = response.data?.data?.id;
      setNewEngagementName('');
      setNewEngagementScope('');
      setNewEngagementPeriodStart('');
      setNewEngagementPeriodEnd('');
      const rows = await refreshEngagements();
      if (createdId) {
        setSelectedEngagementId(createdId);
      } else if (rows[0]?.id) {
        setSelectedEngagementId(rows[0].id);
      }
      showToast('Engagement created');
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || 'Failed to create engagement');
    } finally {
      setSaving(false);
    }
  }

  async function updateEngagementStatus() {
    if (!canWrite || !selectedEngagementId) return;
    await runSave(async () => {
      await assessmentsAPI.updateEngagement(selectedEngagementId, { status: engagementStatusDraft as any });
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('Engagement updated');
    }, 'Failed to update engagement');
  }

  async function createPbc() {
    if (!canWrite || !selectedEngagementId || !newPbcTitle.trim() || !newPbcDetails.trim()) return;
    await runSave(async () => {
      await assessmentsAPI.createEngagementPbc(selectedEngagementId, {
        title: newPbcTitle.trim(),
        request_details: newPbcDetails.trim(),
        priority: newPbcPriority as any,
        due_date: newPbcDueDate || null
      });
      setNewPbcTitle('');
      setNewPbcDetails('');
      setNewPbcDueDate('');
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('PBC created');
    }, 'Failed to create PBC');
  }

  async function createWorkpaper() {
    if (!canWrite || !selectedEngagementId || !newWorkpaperTitle.trim()) return;
    await runSave(async () => {
      await assessmentsAPI.createEngagementWorkpaper(selectedEngagementId, {
        title: newWorkpaperTitle.trim(),
        objective: newWorkpaperObjective || null,
        procedure_performed: newWorkpaperProcedure || null,
        conclusion: newWorkpaperConclusion || null,
        status: 'draft'
      });
      setNewWorkpaperTitle('');
      setNewWorkpaperObjective('');
      setNewWorkpaperProcedure('');
      setNewWorkpaperConclusion('');
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('Workpaper created');
    }, 'Failed to create workpaper');
  }

  async function createFinding() {
    if (!canWrite || !selectedEngagementId || !newFindingTitle.trim() || !newFindingDescription.trim()) return;
    await runSave(async () => {
      await assessmentsAPI.createEngagementFinding(selectedEngagementId, {
        title: newFindingTitle.trim(),
        description: newFindingDescription.trim(),
        severity: newFindingSeverity as any,
        recommendation: newFindingRecommendation || null,
        due_date: newFindingDueDate || null
      });
      setNewFindingTitle('');
      setNewFindingDescription('');
      setNewFindingRecommendation('');
      setNewFindingDueDate('');
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('Finding created');
    }, 'Failed to create finding');
  }

  function toggleProcedureSelection(procedureId: string, checked: boolean) {
    setSelectedProcedureIds((prev) => {
      if (checked) {
        return prev.includes(procedureId) ? prev : [...prev, procedureId];
      }
      return prev.filter((id) => id !== procedureId);
    });
  }

  function toggleProcedureFamily(family: string) {
    setExpandedProcedureFamilies((prev) => ({
      ...prev,
      [family]: !prev[family]
    }));
  }

  function toggleProcedureControl(family: string, controlId: string) {
    const key = `${family}::${controlId}`;
    setExpandedProcedureControls((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  }

  async function autoCreatePbcFromProcedures() {
    if (!canWrite || !selectedEngagementId || selectedProcedureIds.length === 0) return;
    await runSave(async () => {
      const response = await assessmentsAPI.autoCreateEngagementPbc(selectedEngagementId, {
        procedure_ids: selectedProcedureIds,
        due_date: newPbcDueDate || null,
        priority: newPbcPriority as any,
        request_context: autoPbcContext || null
      });
      const createdCount = response.data?.data?.summary?.created ?? 0;
      const skippedCount = response.data?.data?.summary?.skipped ?? 0;
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast(`PBC automation complete (${createdCount} created, ${skippedCount} skipped)`);
    }, 'Failed to auto-create PBC from procedures');
  }

  async function generateAiWorkpaperFromProcedure() {
    if (!canWrite || !selectedEngagementId || !primarySelectedProcedureId) return;
    await runSave(async () => {
      await assessmentsAPI.generateEngagementWorkpaperDraftAi(selectedEngagementId, {
        assessment_procedure_id: primarySelectedProcedureId,
        objective: newWorkpaperObjective || primarySelectedProcedure?.title || undefined,
        procedure_performed: newWorkpaperProcedure || undefined,
        test_outcome: newWorkpaperConclusion || undefined,
        persist_draft: true
      });
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('AI workpaper draft generated');
    }, 'Failed to generate AI workpaper draft');
  }

  async function generateAiFindingFromProcedure() {
    if (!canWrite || !selectedEngagementId || !primarySelectedProcedureId) return;
    await runSave(async () => {
      await assessmentsAPI.generateEngagementFindingDraftAi(selectedEngagementId, {
        assessment_procedure_id: primarySelectedProcedureId,
        issue_summary: newFindingDescription || primarySelectedProcedure?.description || primarySelectedProcedure?.title || undefined,
        evidence_summary: selectedPbc?.response_notes || undefined,
        severity_hint: newFindingSeverity as any,
        recommendation_scope: newFindingRecommendation || undefined,
        persist_draft: true
      });
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('AI finding draft generated');
    }, 'Failed to generate AI finding draft');
  }

  async function downloadValidationPackagePdf() {
    if (!selectedEngagementId) return;
    await runSave(async () => {
      const response = await assessmentsAPI.downloadEngagementValidationPackagePdf(selectedEngagementId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const fileName = `${String(engagement?.name || 'validation-package').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-validation-package.pdf`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Validation package PDF downloaded');
    }, 'Failed to download validation package PDF');
  }

  async function createTemplateFromText() {
    if (!canWrite || !templateName.trim() || !templateContent.trim()) return;
    await runSave(async () => {
      await assessmentsAPI.createAuditTemplate({
        artifact_type: templateArtifactType as any,
        template_name: templateName.trim(),
        template_content: templateContent.trim(),
        set_default: templateSetDefault
      });
      setTemplateName('');
      setTemplateContent('');
      if (selectedEngagementId) {
        await loadWorkspace(selectedEngagementId);
      }
      showToast('Template saved');
    }, 'Failed to save template');
  }

  async function uploadTemplateFile() {
    if (!canWrite || !templateUploadFile) return;
    await runSave(async () => {
      const formData = new FormData();
      formData.append('file', templateUploadFile);
      formData.append('artifact_type', templateArtifactType);
      if (templateName.trim()) formData.append('template_name', templateName.trim());
      formData.append('set_default', String(templateSetDefault));
      await assessmentsAPI.uploadAuditTemplate(formData);
      setTemplateUploadFile(null);
      if (selectedEngagementId) {
        await loadWorkspace(selectedEngagementId);
      }
      showToast('Template uploaded');
    }, 'Failed to upload template');
  }

  async function createSignoff() {
    if (!canWrite || !selectedEngagementId) return;
    if (newSignoffType === 'auditor_firm_recommendation' && !newSignoffComments.trim()) {
      setError('Final recommendation sign-off requires comments');
      return;
    }
    await runSave(async () => {
      await assessmentsAPI.createEngagementSignoff(selectedEngagementId, {
        signoff_type: newSignoffType as any,
        status: newSignoffStatus as any,
        comments: newSignoffComments || null
      });
      setNewSignoffComments('');
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast('Sign-off created');
    }, 'Failed to create sign-off');
  }

  async function updateArtifactStatus(kind: 'pbc' | 'workpaper' | 'finding') {
    if (!canWrite || !selectedEngagementId) return;
    await runSave(async () => {
      if (kind === 'pbc' && selectedPbc) {
        await assessmentsAPI.updateEngagementPbc(selectedEngagementId, selectedPbc.id, { status: pbcStatusDraft as any });
      }
      if (kind === 'workpaper' && selectedWorkpaper) {
        await assessmentsAPI.updateEngagementWorkpaper(selectedEngagementId, selectedWorkpaper.id, { status: workpaperStatusDraft as any });
      }
      if (kind === 'finding' && selectedFinding) {
        await assessmentsAPI.updateEngagementFinding(selectedEngagementId, selectedFinding.id, { status: findingStatusDraft as any });
      }
      await loadWorkspace(selectedEngagementId);
      await refreshEngagements();
      showToast(`${labelize(kind)} updated`);
    }, `Failed to update ${kind}`);
  }

  // ---------- AI Insights Functions ----------
  async function runAiRiskAssessment() {
    try {
      setAiLoading('risk');
      const fwCode = engagement?.framework_codes?.[0] || undefined;
      const response = await aiAPI.auditReadiness({ framework: fwCode });
      setAiRiskAssessment(response.data?.data || response.data);
      showToast('AI risk assessment complete');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to run AI risk assessment');
    } finally {
      setAiLoading(null);
    }
  }

  async function runAiExecutiveSummary() {
    try {
      setAiLoading('executive');
      const response = await aiAPI.executiveReport();
      setAiExecutiveSummary(response.data?.data || response.data);
      showToast('AI executive summary generated');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate AI executive summary');
    } finally {
      setAiLoading(null);
    }
  }

  async function runAiComplianceForecast() {
    try {
      setAiLoading('forecast');
      const response = await aiAPI.complianceForecast();
      setAiComplianceForecast(response.data?.data || response.data);
      showToast('AI compliance forecast generated');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate compliance forecast');
    } finally {
      setAiLoading(null);
    }
  }

  async function runAiGapAnalysis() {
    try {
      setAiLoading('gap');
      const response = await aiAPI.gapAnalysis();
      setAiGapAnalysis(response.data?.data || response.data);
      showToast('AI gap analysis complete');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to run AI gap analysis');
    } finally {
      setAiLoading(null);
    }
  }

  async function runAuditPrepSwarm() {
    try {
      setSwarmRunning(true);
      setSwarmResult(null);
      const response = await aiAPI.executeSwarm({ swarmType: 'audit_prep' });
      const data = response.data?.data || response.data;
      setSwarmResult(data);
      const msg = data.failureCount > 0
        ? `Audit prep swarm complete — ${data.successCount}/${data.agentCount} agents succeeded`
        : 'Audit preparation swarm complete — all agents finished';
      showToast(msg);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to run audit prep swarm');
    } finally {
      setSwarmRunning(false);
    }
  }

  // ---------- Client Portal Functions ----------
  async function loadWorkspaceLinks() {
    try {
      setLinksLoading(true);
      const response = await assessmentsAPI.getAuditorWorkspaceLinks();
      setWorkspaceLinks(asList(response.data?.data || response.data));
    } catch {
      setWorkspaceLinks([]);
    } finally {
      setLinksLoading(false);
    }
  }

  async function createWorkspaceLink() {
    if (!newLinkName.trim()) return;
    await runSave(async () => {
      await assessmentsAPI.createAuditorWorkspaceLink({
        name: newLinkName.trim(),
        engagement_id: selectedEngagementId || undefined,
        days_valid: Number(newLinkDays) || 30
      });
      setNewLinkName('');
      setNewLinkDays('30');
      await loadWorkspaceLinks();
      showToast('Client portal link created');
    }, 'Failed to create portal link');
  }

  async function toggleLinkActive(linkId: string, active: boolean) {
    await runSave(async () => {
      await assessmentsAPI.updateAuditorWorkspaceLink(linkId, { active });
      await loadWorkspaceLinks();
      showToast(active ? 'Link activated' : 'Link deactivated');
    }, 'Failed to update link');
  }

  function copyLinkUrl(token: string) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/auditor-workspace/shared/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(token);
      setTimeout(() => setLinkCopied(null), 2000);
    });
  }

  async function runSave(action: () => Promise<void>, fallbackMessage: string) {
    try {
      setSaving(true);
      setError('');
      await action();
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || fallbackMessage);
    } finally {
      setSaving(false);
    }
  }

  if (!canViewWorkspace) {
    return (
      <DashboardLayout>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
          Auditor Workspace is only available to auditor roles.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {toast && <div className="fixed top-6 right-6 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow">{toast}</div>}

        {/* Premium Header */}
        <div className="bg-gradient-to-r from-gray-900 via-purple-900 to-indigo-900 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">Auditor Workspace</h1>
                <span className="bg-purple-500/30 border border-purple-400/50 text-purple-200 text-xs font-semibold px-3 py-1 rounded-full">⭐ Premium</span>
              </div>
              <p className="text-purple-200 text-sm max-w-2xl">
                Procedure-driven engagements with AI-assisted PBC/workpaper/finding drafting, sign-off checklisting, analytics dashboard, and validation package export.
              </p>
            </div>
            {engagement && (
              <div className="flex gap-3 flex-wrap">
                <button onClick={downloadValidationPackagePdf} disabled={saving} className="px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-sm hover:bg-white/20 disabled:opacity-50 transition-colors">
                  📄 Export PDF
                </button>
              </div>
            )}
          </div>
          {engagement && summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
              <HeaderMetric label="Open PBC" value={String(summary?.open_pbc_count ?? 0)} color={Number(summary?.open_pbc_count ?? 0) > 0 ? 'text-amber-300' : 'text-green-300'} />
              <HeaderMetric label="Finalized WP" value={String(summary?.finalized_workpaper_count ?? 0)} color="text-blue-300" />
              <HeaderMetric label="Open Findings" value={String(summary?.open_finding_count ?? 0)} color={Number(summary?.open_finding_count ?? 0) > 0 ? 'text-red-300' : 'text-green-300'} />
              <HeaderMetric label="Sign-offs" value={String(summary?.signoff_count ?? 0)} color="text-purple-300" />
              <HeaderMetric label="Readiness" value={signoffReadiness?.readiness?.ready_for_validation_package ? '✅ Ready' : '⏳ Pending'} color={signoffReadiness?.readiness?.ready_for_validation_package ? 'text-green-300' : 'text-amber-300'} />
            </div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

        {canWrite && (
          <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Create Engagement</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={newEngagementName} onChange={(e) => setNewEngagementName(e.target.value)} placeholder="Engagement name *" className="px-3 py-2 border border-gray-300 rounded-lg" />
              <select value={newEngagementType} onChange={(e) => setNewEngagementType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                <option value="internal_audit">Internal Audit</option>
                <option value="external_audit">External Audit</option>
                <option value="readiness">Readiness</option>
                <option value="assessment">Assessment</option>
              </select>
              <input value={newEngagementScope} onChange={(e) => setNewEngagementScope(e.target.value)} placeholder="Scope" className="px-3 py-2 border border-gray-300 rounded-lg" />
              <input value={newEngagementFrameworkCodes} onChange={(e) => setNewEngagementFrameworkCodes(e.target.value)} placeholder="Framework codes (comma-separated)" className="px-3 py-2 border border-gray-300 rounded-lg" />
              <input type="date" value={newEngagementPeriodStart} onChange={(e) => setNewEngagementPeriodStart(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
              <input type="date" value={newEngagementPeriodEnd} onChange={(e) => setNewEngagementPeriodEnd(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex justify-end">
              <button onClick={createEngagement} disabled={saving || !newEngagementName.trim()} className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                Add Engagement
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <aside className="xl:col-span-4 bg-white rounded-lg shadow-md p-4 h-fit">
            <div className="space-y-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search engagements" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="all">All statuses</option>
                {engagementStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
              </select>
            </div>
            <div className="mt-4 space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-sm text-gray-500 py-8 text-center">Loading engagements...</div>
              ) : filteredEngagements.length === 0 ? (
                <div className="text-sm text-gray-500 py-8 text-center">No engagements found.</div>
              ) : (
                filteredEngagements.map((row) => (
                  <button key={row.id} onClick={() => setSelectedEngagementId(row.id)} className={`w-full text-left border rounded-lg px-3 py-3 ${selectedEngagementId === row.id ? 'bg-purple-50 border-purple-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{row.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${row.status === 'completed' ? 'bg-green-100 text-green-700' : row.status === 'fieldwork' ? 'bg-blue-100 text-blue-700' : row.status === 'reporting' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{labelize(row.status)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{labelize(row.engagement_type)}</div>
                    <div className="text-xs text-gray-500 mt-1">PBC {row.pbc_count ?? 0} · WP {row.workpaper_count ?? 0} · Findings {row.finding_count ?? 0}</div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-purple-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((row.status === 'completed' || row.status === 'archived') ? 100 : row.status === 'reporting' ? 75 : row.status === 'fieldwork' ? 50 : 25))}%` }}
                      />
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="xl:col-span-8 space-y-4">
            {workspaceLoading ? (
              <div className="bg-white rounded-lg shadow-md p-10 text-center text-gray-500">Loading engagement workspace...</div>
            ) : !engagement ? (
              <div className="bg-white rounded-lg shadow-md p-10 text-center text-gray-500">Select an engagement.</div>
            ) : (
              <>
                <div className="bg-white rounded-lg shadow-md p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">{engagement.name}</h2>
                      <p className="text-sm text-gray-600 mt-1">{engagement.scope || 'No scope provided.'}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${engagement.status === 'completed' ? 'bg-green-100 text-green-700' : engagement.status === 'fieldwork' ? 'bg-blue-100 text-blue-700' : engagement.status === 'reporting' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>{labelize(engagement.status)}</span>
                  </div>
                  {/* Engagement progress tracker */}
                  <div className="mt-4 flex items-center gap-1">
                    {engagementStatuses.filter(s => s !== 'archived').map((stage, idx) => {
                      const stageIdx = engagementStatuses.indexOf(engagement.status);
                      const thisIdx = engagementStatuses.indexOf(stage);
                      const isComplete = thisIdx < stageIdx || engagement.status === 'archived';
                      const isCurrent = stage === engagement.status;
                      return (
                        <div key={stage} className="flex-1 flex items-center gap-1">
                          <div className={`h-2 flex-1 rounded-full ${isComplete ? 'bg-green-500' : isCurrent ? 'bg-purple-500' : 'bg-gray-200'}`} />
                          {idx < engagementStatuses.filter(s => s !== 'archived').length - 1 && <div className="w-1" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-1">
                    {engagementStatuses.filter(s => s !== 'archived').map(s => <span key={s}>{labelize(s)}</span>)}
                  </div>
                  {canWrite && (
                    <div className="mt-4 flex gap-2">
                      <select value={engagementStatusDraft} onChange={(e) => setEngagementStatusDraft(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        {engagementStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                      </select>
                      <button onClick={updateEngagementStatus} disabled={saving || engagementStatusDraft === engagement.status} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Update Status</button>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg shadow-md p-2">
                  <div className="flex flex-wrap gap-2">
                    {(['summary', 'procedures', 'pbc', 'workpapers', 'findings', 'signoffs', 'analytics', 'ai_insights', 'client_portal'] as WorkspaceTab[]).map((tab) => {
                      const tabLabels: Record<WorkspaceTab, string> = {
                        summary: '📊 Summary',
                        procedures: '🔍 Procedures & AI',
                        pbc: '📥 PBC Requests',
                        workpapers: '📝 Workpapers',
                        findings: '⚠️ Findings',
                        signoffs: '✅ Sign-offs',
                        analytics: '📈 Analytics',
                        ai_insights: '🤖 AI Insights',
                        client_portal: '🔗 Client Portal',
                      };
                      return (
                        <button key={tab} onClick={() => setSelectedTab(tab)} className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedTab === tab ? 'bg-purple-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                          {tabLabels[tab]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedTab === 'summary' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow-md p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Info label="Type" value={labelize(engagement.engagement_type)} />
                      <Info label="Status" value={labelize(engagement.status)} />
                      <Info label="Period Start" value={formatDate(engagement.period_start)} />
                      <Info label="Period End" value={formatDate(engagement.period_end)} />
                      <Info label="Created" value={formatDateTime(engagement.created_at)} />
                      <Info label="Updated" value={formatDateTime(engagement.updated_at)} />
                      <Info label="Framework Scope" value={Array.isArray(engagement.framework_codes) && engagement.framework_codes.length > 0 ? engagement.framework_codes.map((code: string) => String(code).toUpperCase()).join(', ') : 'Organization defaults'} />
                      <Info label="Template Library" value={`${templates.length} active template${templates.length === 1 ? '' : 's'}`} />
                    </div>

                    {/* Evidence Completeness & Finding Risk Distribution */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <h3 className="text-sm font-bold text-gray-900">📥 Evidence Completeness</h3>
                        <div className="space-y-2">
                          {(() => {
                            const total = pbc.length || 1;
                            const accepted = pbc.filter((r: any) => r.status === 'accepted' || r.status === 'closed').length;
                            const submitted = pbc.filter((r: any) => r.status === 'submitted').length;
                            const open = pbc.filter((r: any) => r.status === 'open' || r.status === 'in_progress' || r.status === 'rejected').length;
                            return (
                              <>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600">PBC Completion</span>
                                  <span className="font-semibold">{Math.round((accepted / total) * 100)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3 flex overflow-hidden">
                                  <div className="bg-green-500 h-3 transition-all" style={{ width: `${(accepted / total) * 100}%` }} />
                                  <div className="bg-yellow-400 h-3 transition-all" style={{ width: `${(submitted / total) * 100}%` }} />
                                  <div className="bg-gray-300 h-3 transition-all" style={{ width: `${(open / total) * 100}%` }} />
                                </div>
                                <div className="flex gap-4 text-xs text-gray-600">
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Accepted ({accepted})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Submitted ({submitted})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Open ({open})</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <h3 className="text-sm font-bold text-gray-900">⚠️ Finding Risk Distribution</h3>
                        <div className="space-y-2">
                          {(() => {
                            const critical = findings.filter((f: any) => f.severity === 'critical').length;
                            const high = findings.filter((f: any) => f.severity === 'high').length;
                            const medium = findings.filter((f: any) => f.severity === 'medium').length;
                            const low = findings.filter((f: any) => f.severity === 'low').length;
                            const total = findings.length || 1;
                            return (
                              <>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600">{findings.length} total finding{findings.length !== 1 ? 's' : ''}</span>
                                  <span className={`font-semibold ${critical > 0 ? 'text-red-600' : high > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                    {critical > 0 ? '🔴 Critical attention needed' : high > 0 ? '🟠 Monitor closely' : '🟢 Under control'}
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3 flex overflow-hidden">
                                  <div className="bg-red-500 h-3 transition-all" style={{ width: `${(critical / total) * 100}%` }} />
                                  <div className="bg-orange-500 h-3 transition-all" style={{ width: `${(high / total) * 100}%` }} />
                                  <div className="bg-yellow-400 h-3 transition-all" style={{ width: `${(medium / total) * 100}%` }} />
                                  <div className="bg-blue-400 h-3 transition-all" style={{ width: `${(low / total) * 100}%` }} />
                                </div>
                                <div className="flex gap-3 text-xs text-gray-600 flex-wrap">
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Critical ({critical})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> High ({high})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Medium ({medium})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Low ({low})</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Engagement Timeline */}
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                      <h3 className="text-sm font-bold text-gray-900">📅 Engagement Timeline</h3>
                      <div className="relative">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                        <div className="space-y-4 pl-10">
                          <TimelineItem label="Engagement Created" date={formatDateTime(engagement.created_at)} icon="🟣" active />
                          {engagement.period_start && <TimelineItem label="Audit Period Start" date={formatDate(engagement.period_start)} icon="🟢" active={new Date(engagement.period_start) <= new Date()} />}
                          <TimelineItem label="Fieldwork" date={engagement.status === 'fieldwork' ? 'In progress' : engagement.status === 'reporting' || engagement.status === 'completed' ? 'Completed' : 'Upcoming'} icon="🔍" active={['fieldwork', 'reporting', 'completed', 'archived'].includes(engagement.status)} />
                          <TimelineItem label="Reporting" date={engagement.status === 'reporting' ? 'In progress' : engagement.status === 'completed' ? 'Completed' : 'Upcoming'} icon="📋" active={['reporting', 'completed', 'archived'].includes(engagement.status)} />
                          {engagement.period_end && <TimelineItem label="Audit Period End" date={formatDate(engagement.period_end)} icon="🔴" active={new Date(engagement.period_end) <= new Date()} />}
                          <TimelineItem label="Final Sign-off & Close" date={engagement.status === 'completed' || engagement.status === 'archived' ? 'Completed' : 'Pending'} icon="✅" active={['completed', 'archived'].includes(engagement.status)} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTab === 'procedures' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-bold text-gray-900">Assessment Procedures in Scope</h3>
                        <div className="text-xs text-gray-600">
                          Selected {selectedProcedureIds.length} of {procedures.length}
                        </div>
                      </div>
                      {procedureFamilies.length === 0 ? (
                        <div className="border rounded-lg p-8 text-center text-gray-500">
                          No assessment procedures found in engagement scope.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {procedureFamilies.map((family) => {
                            const familyOpen = Boolean(expandedProcedureFamilies[family.family]);
                            return (
                              <div key={family.family} className="border border-gray-200 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => toggleProcedureFamily(family.family)}
                                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
                                >
                                  <div>
                                    <div className="text-sm font-semibold text-gray-900">Control Family {family.family}</div>
                                    <div className="text-xs text-gray-600">
                                      {family.controls.length} controls · {family.totalItems} procedures
                                    </div>
                                  </div>
                                  <span className="text-sm text-gray-700">{familyOpen ? 'Hide' : 'Show'}</span>
                                </button>

                                {familyOpen && (
                                  <div className="p-3 space-y-3">
                                    {family.controls.map((control) => {
                                      const controlKey = `${family.family}::${control.controlId}`;
                                      const controlOpen = Boolean(expandedProcedureControls[controlKey]);
                                      const normalizedControl = normalizeControlRef(control.controlId);
                                      const relatedPbcRows = pbcByControlKey.grouped.get(normalizedControl) || [];
                                      const relatedPbcIdSet = new Set(relatedPbcRows.map((row: any) => String(row.id)));
                                      const relatedFindingRows = (findingsByControlKey.get(normalizedControl) || []).filter((findingRow: any) => {
                                        if (sameControlRef(findingRow.control_ref, control.controlId)) return true;
                                        return Boolean(findingRow.related_pbc_request_id && relatedPbcIdSet.has(String(findingRow.related_pbc_request_id)));
                                      });

                                      return (
                                        <div key={controlKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                          <button
                                            type="button"
                                            onClick={() => toggleProcedureControl(family.family, control.controlId)}
                                            className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50 text-left"
                                          >
                                            <div>
                                              <div className="text-sm font-semibold text-gray-900">{control.controlId}</div>
                                              <div className="text-xs text-gray-600">
                                                {control.items.length} procedures · PBC {relatedPbcRows.length} · Findings {relatedFindingRows.length}
                                              </div>
                                            </div>
                                            <span className="text-xs text-gray-700">{controlOpen ? 'Collapse' : 'Expand'}</span>
                                          </button>

                                          {controlOpen && (
                                            <div className="border-t border-gray-200 p-3 space-y-3">
                                              <div className="border rounded-lg overflow-hidden">
                                                <table className="min-w-full text-sm">
                                                  <thead className="bg-gray-50">
                                                    <tr>
                                                      <th className="px-3 py-2 text-left w-10">#</th>
                                                      <th className="px-3 py-2 text-left">Procedure</th>
                                                      <th className="px-3 py-2 text-left">Type</th>
                                                      <th className="px-3 py-2 text-left">Status</th>
                                                      <th className="px-3 py-2 text-left">Linked</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {control.items.map((row: any) => {
                                                      const checked = selectedProcedureIds.includes(row.id);
                                                      return (
                                                        <tr key={row.id} className={`border-t border-gray-200 ${checked ? 'bg-purple-50' : ''}`}>
                                                          <td className="px-3 py-2">
                                                            <input
                                                              type="checkbox"
                                                              checked={checked}
                                                              onChange={(e) => toggleProcedureSelection(row.id, e.target.checked)}
                                                              className="h-4 w-4"
                                                            />
                                                          </td>
                                                          <td className="px-3 py-2">
                                                            <div className="font-medium text-gray-900">{row.procedure_id || row.id}</div>
                                                            <div className="text-xs text-gray-600">{row.title}</div>
                                                          </td>
                                                          <td className="px-3 py-2">{labelize(row.procedure_type || 'unknown')}</td>
                                                          <td className="px-3 py-2">{labelize(row.result_status || 'not_assessed')}</td>
                                                          <td className="px-3 py-2 text-xs text-gray-600">PBC {row.linked_pbc_count || 0} · WP {row.linked_workpaper_count || 0}</td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              </div>

                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                                                  <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-semibold text-gray-900">Related PBC Requests</h4>
                                                    <button
                                                      type="button"
                                                      onClick={() => setSelectedTab('pbc')}
                                                      className="text-xs text-purple-700 hover:text-purple-800"
                                                    >
                                                      Open full list
                                                    </button>
                                                  </div>
                                                  {relatedPbcRows.length === 0 ? (
                                                    <p className="text-xs text-gray-500">No related PBC requests for this control.</p>
                                                  ) : (
                                                    relatedPbcRows.slice(0, 6).map((row: any) => (
                                                      <button
                                                        type="button"
                                                        key={row.id}
                                                        onClick={() => {
                                                          setSelectedPbcId(row.id);
                                                          setSelectedTab('pbc');
                                                        }}
                                                        className="w-full text-left px-2 py-2 border border-gray-200 rounded hover:bg-gray-50"
                                                      >
                                                        <div className="text-xs font-medium text-gray-900">{row.title}</div>
                                                        <div className="text-[11px] text-gray-600">
                                                          {labelize(row.status || 'open')} · Due {formatDate(row.due_date)}
                                                        </div>
                                                      </button>
                                                    ))
                                                  )}
                                                </div>

                                                <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                                                  <div className="flex items-center justify-between">
                                                    <h4 className="text-sm font-semibold text-gray-900">Related Findings</h4>
                                                    <button
                                                      type="button"
                                                      onClick={() => setSelectedTab('findings')}
                                                      className="text-xs text-purple-700 hover:text-purple-800"
                                                    >
                                                      Open full list
                                                    </button>
                                                  </div>
                                                  {relatedFindingRows.length === 0 ? (
                                                    <p className="text-xs text-gray-500">No related findings for this control.</p>
                                                  ) : (
                                                    relatedFindingRows.slice(0, 6).map((row: any) => (
                                                      <button
                                                        type="button"
                                                        key={row.id}
                                                        onClick={() => {
                                                          setSelectedFindingId(row.id);
                                                          setSelectedTab('findings');
                                                        }}
                                                        className="w-full text-left px-2 py-2 border border-gray-200 rounded hover:bg-gray-50"
                                                      >
                                                        <div className="text-xs font-medium text-gray-900">{row.title}</div>
                                                        <div className="text-[11px] text-gray-600">
                                                          {labelize(row.severity || 'medium')} · {labelize(row.status || 'open')}
                                                        </div>
                                                      </button>
                                                    ))
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {canWrite && (
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Procedure Automation</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <select value={newPbcPriority} onChange={(e) => setNewPbcPriority(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                            <option value="low">Low Priority</option>
                            <option value="medium">Medium Priority</option>
                            <option value="high">High Priority</option>
                            <option value="critical">Critical Priority</option>
                          </select>
                          <input type="date" value={newPbcDueDate} onChange={(e) => setNewPbcDueDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
                        </div>
                        <textarea
                          value={autoPbcContext}
                          onChange={(e) => setAutoPbcContext(e.target.value)}
                          rows={3}
                          placeholder="Optional shared context for auto-generated PBC requests"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={autoCreatePbcFromProcedures}
                            disabled={saving || selectedProcedureIds.length === 0}
                            className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                          >
                            Auto-Create PBC from Selected
                          </button>
                          <button
                            onClick={generateAiWorkpaperFromProcedure}
                            disabled={saving || !primarySelectedProcedureId}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
                          >
                            AI Draft Workpaper (1st Selected)
                          </button>
                          <button
                            onClick={generateAiFindingFromProcedure}
                            disabled={saving || !primarySelectedProcedureId}
                            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
                          >
                            AI Draft Finding (1st Selected)
                          </button>
                        </div>
                      </div>
                    )}

                    {canWrite && (
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Auditor Company Templates</h3>
                        <p className="text-sm text-gray-600">Upload your firm-standard templates for PBC, workpapers, findings, sign-offs, and final report output. Defaults are used by automation and AI drafting, and are scoped to your auditor profile only.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <select value={templateArtifactType} onChange={(e) => setTemplateArtifactType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                            {templateArtifactTypes.map((type) => (
                              <option key={type} value={type}>{labelize(type)}</option>
                            ))}
                          </select>
                          <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2" />
                        </div>
                        <textarea value={templateContent} onChange={(e) => setTemplateContent(e.target.value)} rows={4} placeholder="Template content (supports placeholders like {{control_id}}, {{procedure_id}}, {{objective}})" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={templateSetDefault} onChange={(e) => setTemplateSetDefault(e.target.checked)} />
                          Set as default for this artifact type
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={createTemplateFromText} disabled={saving || !templateName.trim() || !templateContent.trim()} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                            Save Text Template
                          </button>
                          <input
                            type="file"
                            accept=".txt,.md,.docx,.pdf,.csv,.json,.xml,.log"
                            onChange={(e) => setTemplateUploadFile(e.target.files?.[0] || null)}
                            className="text-sm"
                          />
                          <button onClick={uploadTemplateFile} disabled={saving || !templateUploadFile} className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black disabled:opacity-50">
                            Upload File Template
                          </button>
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Template</th>
                                <th className="px-3 py-2 text-left">Default</th>
                                <th className="px-3 py-2 text-left">Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {templates.length === 0 ? (
                                <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={4}>No templates uploaded yet.</td></tr>
                              ) : (
                                templates.map((row) => (
                                  <tr key={row.id} className="border-t border-gray-200">
                                    <td className="px-3 py-2">{labelize(row.artifact_type || 'unknown')}</td>
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-gray-900">{row.template_name}</div>
                                      <div className="text-xs text-gray-600">{row.source_filename || 'inline text template'}</div>
                                    </td>
                                    <td className="px-3 py-2">{row.is_default ? 'Yes' : 'No'}</td>
                                    <td className="px-3 py-2">{formatDateTime(row.updated_at)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedTab === 'pbc' && (
                  <ArtifactPanel
                    title="PBC Requests"
                    rows={pbc}
                    selectedId={selectedPbcId}
                    onSelect={setSelectedPbcId}
                    columns={[
                      { label: 'Title', value: (row: any) => row.title },
                      { label: 'Priority', value: (row: any) => labelize(row.priority) },
                      { label: 'Status', value: (row: any) => labelize(row.status) },
                      { label: 'Due', value: (row: any) => formatDate(row.due_date) }
                    ]}
                    emptyMessage="No PBC requests yet."
                    detail={
                      <div className="space-y-4">
                        {canWrite && (
                          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-gray-900">Create PBC Request</h4>
                            <input value={newPbcTitle} onChange={(e) => setNewPbcTitle(e.target.value)} placeholder="Title *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <textarea value={newPbcDetails} onChange={(e) => setNewPbcDetails(e.target.value)} rows={3} placeholder="Request details *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <select value={newPbcPriority} onChange={(e) => setNewPbcPriority(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                              </select>
                              <input type="date" value={newPbcDueDate} onChange={(e) => setNewPbcDueDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <div className="flex justify-end">
                              <button onClick={createPbc} disabled={saving || !newPbcTitle.trim() || !newPbcDetails.trim()} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                                Add PBC
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedPbc && (
                          <div className="space-y-2">
                            <Info label="Request Details" value={selectedPbc.request_details || '—'} />
                            <Info label="Response Notes" value={selectedPbc.response_notes || '—'} />
                            {canWrite && (
                              <div className="flex gap-2">
                                <select value={pbcStatusDraft} onChange={(e) => setPbcStatusDraft(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                  {pbcStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                                </select>
                                <button onClick={() => updateArtifactStatus('pbc')} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50" disabled={saving}>Update</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    }
                  />
                )}

                {selectedTab === 'workpapers' && (
                  <ArtifactPanel
                    title="Workpapers"
                    rows={workpapers}
                    selectedId={selectedWorkpaperId}
                    onSelect={setSelectedWorkpaperId}
                    columns={[
                      { label: 'Title', value: (row: any) => row.title },
                      { label: 'Status', value: (row: any) => labelize(row.status) },
                      { label: 'Prepared By', value: (row: any) => row.prepared_by_name || '—' },
                      { label: 'Updated', value: (row: any) => formatDateTime(row.updated_at) }
                    ]}
                    emptyMessage="No workpapers yet."
                    detail={
                      <div className="space-y-4">
                        {canWrite && (
                          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-gray-900">Create Workpaper</h4>
                            <input value={newWorkpaperTitle} onChange={(e) => setNewWorkpaperTitle(e.target.value)} placeholder="Title *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <input value={newWorkpaperObjective} onChange={(e) => setNewWorkpaperObjective(e.target.value)} placeholder="Objective" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <textarea value={newWorkpaperProcedure} onChange={(e) => setNewWorkpaperProcedure(e.target.value)} rows={3} placeholder="Procedure performed" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <textarea value={newWorkpaperConclusion} onChange={(e) => setNewWorkpaperConclusion(e.target.value)} rows={2} placeholder="Conclusion" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <div className="flex justify-end">
                              <button onClick={createWorkpaper} disabled={saving || !newWorkpaperTitle.trim()} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                                Add Workpaper
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedWorkpaper && (
                          <div className="space-y-2">
                            <Info label="Objective" value={selectedWorkpaper.objective || '—'} />
                            <Info label="Procedure Performed" value={selectedWorkpaper.procedure_performed || '—'} />
                            <Info label="Conclusion" value={selectedWorkpaper.conclusion || '—'} />
                            <Info label="Reviewer Notes" value={selectedWorkpaper.reviewer_notes || '—'} />
                            {canWrite && (
                              <div className="flex gap-2">
                                <select value={workpaperStatusDraft} onChange={(e) => setWorkpaperStatusDraft(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                  {workpaperStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                                </select>
                                <button onClick={() => updateArtifactStatus('workpaper')} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50" disabled={saving}>Update</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    }
                  />
                )}

                {selectedTab === 'findings' && (
                  <ArtifactPanel
                    title="Findings"
                    rows={findings}
                    selectedId={selectedFindingId}
                    onSelect={setSelectedFindingId}
                    columns={[
                      { label: 'Title', value: (row: any) => row.title },
                      { label: 'Severity', value: (row: any) => labelize(row.severity) },
                      { label: 'Status', value: (row: any) => labelize(row.status) },
                      { label: 'Due', value: (row: any) => formatDate(row.due_date) }
                    ]}
                    emptyMessage="No findings yet."
                    detail={
                      <div className="space-y-4">
                        {canWrite && (
                          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-gray-900">Create Finding</h4>
                            <input value={newFindingTitle} onChange={(e) => setNewFindingTitle(e.target.value)} placeholder="Title *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <textarea value={newFindingDescription} onChange={(e) => setNewFindingDescription(e.target.value)} rows={3} placeholder="Description *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <select value={newFindingSeverity} onChange={(e) => setNewFindingSeverity(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                              </select>
                              <input type="date" value={newFindingDueDate} onChange={(e) => setNewFindingDueDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg" />
                            </div>
                            <textarea value={newFindingRecommendation} onChange={(e) => setNewFindingRecommendation(e.target.value)} rows={2} placeholder="Recommendation" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                            <div className="flex justify-end">
                              <button onClick={createFinding} disabled={saving || !newFindingTitle.trim() || !newFindingDescription.trim()} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                                Add Finding
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedFinding && (
                          <div className="space-y-2">
                            <Info label="Description" value={selectedFinding.description || '—'} />
                            <Info label="Recommendation" value={selectedFinding.recommendation || '—'} />
                            <Info label="Management Response" value={selectedFinding.management_response || '—'} />
                            {canWrite && (
                              <div className="flex gap-2">
                                <select value={findingStatusDraft} onChange={(e) => setFindingStatusDraft(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                  {findingStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}
                                </select>
                                <button onClick={() => updateArtifactStatus('finding')} className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50" disabled={saving}>Update</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    }
                  />
                )}

                {selectedTab === 'signoffs' && (
                  <div className="bg-white rounded-lg shadow-md p-5 space-y-4">
                    {signoffReadiness?.checklist && (
                      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-900">Validation Checklist</h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${signoffReadiness?.readiness?.ready_for_validation_package ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {signoffReadiness?.readiness?.ready_for_validation_package ? 'Ready for Customer Validation' : 'Pending Approvals or Open Findings'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {asList(signoffReadiness.checklist).map((item: any) => (
                            <div key={item.key} className="border border-gray-200 rounded px-3 py-2 text-sm">
                              <div className="font-medium text-gray-900">{item.label}</div>
                              <div className={item.approved ? 'text-green-700' : 'text-amber-700'}>
                                {item.approved ? 'Approved' : 'Pending'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {canWrite && (
                      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-gray-900">Record Sign-off</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <select value={newSignoffType} onChange={(e) => setNewSignoffType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                            {signoffTypes.map((type) => (
                              <option key={type} value={type}>{labelize(type)}</option>
                            ))}
                          </select>
                          <select value={newSignoffStatus} onChange={(e) => setNewSignoffStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                        <textarea value={newSignoffComments} onChange={(e) => setNewSignoffComments(e.target.value)} rows={2} placeholder={newSignoffType === 'auditor_firm_recommendation' ? 'Final recommendation comments (required)' : 'Comments'} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                        <div className="flex justify-between gap-2">
                          <button onClick={downloadValidationPackagePdf} disabled={saving} className="px-3 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-black disabled:opacity-50">
                            Download Validation PDF
                          </button>
                          <button onClick={createSignoff} disabled={saving} className="px-3 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50">
                            Add Sign-off
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">Sign-offs</h3>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Type</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-left">Signed By</th>
                            <th className="px-3 py-2 text-left">Signed At</th>
                            <th className="px-3 py-2 text-left">Comments</th>
                          </tr>
                        </thead>
                        <tbody>
                          {signoffs.length === 0 ? (
                            <tr><td className="px-3 py-8 text-center text-gray-500" colSpan={5}>No sign-offs yet.</td></tr>
                          ) : (
                            signoffs.map((row) => (
                              <tr key={row.id} className="border-t border-gray-200">
                                <td className="px-3 py-2">{labelize(row.signoff_type)}</td>
                                <td className="px-3 py-2">{labelize(row.status)}</td>
                                <td className="px-3 py-2">{row.signed_by_name || '—'}</td>
                                <td className="px-3 py-2">{formatDateTime(row.signed_at)}</td>
                                <td className="px-3 py-2">{row.comments || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedTab === 'analytics' && (
                  <div className="space-y-4">
                    {/* Audit Health Score */}
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg shadow-md p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-900">🏆 Audit Health Score</h3>
                        {(() => {
                          const pbcComplete = pbc.length > 0 ? pbc.filter((r: any) => r.status === 'accepted' || r.status === 'closed').length / pbc.length : 0;
                          const wpFinalized = workpapers.length > 0 ? workpapers.filter((r: any) => r.status === 'finalized').length / workpapers.length : 0;
                          const findingsResolved = findings.length > 0 ? findings.filter((r: any) => r.status === 'closed' || r.status === 'verified').length / findings.length : 1;
                          const signoffCoverage = signoffs.length >= 2 ? 1 : signoffs.length / 2;
                          const score = Math.round(((pbcComplete * 0.3) + (wpFinalized * 0.3) + (findingsResolved * 0.25) + (signoffCoverage * 0.15)) * 100);
                          const color = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-600';
                          const bg = score >= 80 ? 'bg-green-100' : score >= 50 ? 'bg-amber-100' : 'bg-red-100';
                          return (
                            <div className={`${bg} px-4 py-2 rounded-full`}>
                              <span className={`text-2xl font-bold ${color}`}>{score}</span>
                              <span className="text-xs text-gray-600 ml-1">/ 100</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <ScoreCard label="PBC Completion" value={pbc.length > 0 ? Math.round((pbc.filter((r: any) => r.status === 'accepted' || r.status === 'closed').length / pbc.length) * 100) : 0} weight="30%" />
                        <ScoreCard label="Workpaper Finalization" value={workpapers.length > 0 ? Math.round((workpapers.filter((r: any) => r.status === 'finalized').length / workpapers.length) * 100) : 0} weight="30%" />
                        <ScoreCard label="Findings Resolved" value={findings.length > 0 ? Math.round((findings.filter((r: any) => r.status === 'closed' || r.status === 'verified').length / findings.length) * 100) : 100} weight="25%" />
                        <ScoreCard label="Sign-off Coverage" value={Math.min(100, Math.round((signoffs.length / 2) * 100))} weight="15%" />
                      </div>
                    </div>

                    {/* Detailed Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* PBC Status Breakdown */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <h4 className="text-sm font-bold text-gray-900">📥 PBC Request Status</h4>
                        {pbc.length === 0 ? (
                          <p className="text-xs text-gray-500 py-4 text-center">No PBC requests created yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {pbcStatuses.map(status => {
                              const count = pbc.filter((r: any) => r.status === status).length;
                              if (count === 0) return null;
                              const pct = Math.round((count / pbc.length) * 100);
                              const barColor = status === 'accepted' || status === 'closed' ? 'bg-green-500' : status === 'submitted' ? 'bg-blue-500' : status === 'rejected' ? 'bg-red-400' : 'bg-gray-400';
                              return (
                                <div key={status}>
                                  <div className="flex items-center justify-between text-xs mb-0.5">
                                    <span className="text-gray-700">{labelize(status)}</span>
                                    <span className="font-semibold text-gray-900">{count} ({pct}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Workpaper Status Breakdown */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <h4 className="text-sm font-bold text-gray-900">📝 Workpaper Pipeline</h4>
                        {workpapers.length === 0 ? (
                          <p className="text-xs text-gray-500 py-4 text-center">No workpapers created yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {workpaperStatuses.map(status => {
                              const count = workpapers.filter((r: any) => r.status === status).length;
                              if (count === 0) return null;
                              const pct = Math.round((count / workpapers.length) * 100);
                              const barColor = status === 'finalized' ? 'bg-green-500' : status === 'in_review' ? 'bg-blue-500' : 'bg-gray-400';
                              return (
                                <div key={status}>
                                  <div className="flex items-center justify-between text-xs mb-0.5">
                                    <span className="text-gray-700">{labelize(status)}</span>
                                    <span className="font-semibold text-gray-900">{count} ({pct}%)</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Findings Severity Matrix */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <h4 className="text-sm font-bold text-gray-900">⚠️ Findings by Severity</h4>
                        {findings.length === 0 ? (
                          <p className="text-xs text-gray-500 py-4 text-center">No findings recorded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {['critical', 'high', 'medium', 'low'].map(sev => {
                              const sevFindings = findings.filter((f: any) => f.severity === sev);
                              const openCount = sevFindings.filter((f: any) => f.status === 'open' || f.status === 'accepted' || f.status === 'remediating').length;
                              const closedCount = sevFindings.filter((f: any) => f.status === 'closed' || f.status === 'verified').length;
                              if (sevFindings.length === 0) return null;
                              const dotColor = sev === 'critical' ? 'bg-red-500' : sev === 'high' ? 'bg-orange-500' : sev === 'medium' ? 'bg-yellow-400' : 'bg-blue-400';
                              return (
                                <div key={sev} className="flex items-center justify-between text-xs border border-gray-200 rounded-lg px-3 py-2">
                                  <span className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} /> {labelize(sev)}</span>
                                  <div className="flex gap-2">
                                    <span className="text-red-600 font-semibold">{openCount} open</span>
                                    <span className="text-green-600 font-semibold">{closedCount} closed</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Procedures Coverage */}
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                      <h4 className="text-sm font-bold text-gray-900">🔍 Procedure Assessment Coverage</h4>
                      {procedures.length === 0 ? (
                        <p className="text-xs text-gray-500 py-4 text-center">No procedures in scope.</p>
                      ) : (
                        <div className="space-y-2">
                          {(() => {
                            const assessed = procedures.filter((p: any) => p.result_status && p.result_status !== 'not_assessed').length;
                            const satisfied = procedures.filter((p: any) => p.result_status === 'satisfied').length;
                            const ots = procedures.filter((p: any) => p.result_status === 'other_than_satisfied').length;
                            const na = procedures.filter((p: any) => p.result_status === 'not_applicable').length;
                            const notAssessed = procedures.length - assessed;
                            return (
                              <>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600">{assessed} of {procedures.length} procedures assessed ({Math.round((assessed / procedures.length) * 100)}%)</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3 flex overflow-hidden">
                                  <div className="bg-green-500 h-3" style={{ width: `${(satisfied / procedures.length) * 100}%` }} />
                                  <div className="bg-red-400 h-3" style={{ width: `${(ots / procedures.length) * 100}%` }} />
                                  <div className="bg-gray-400 h-3" style={{ width: `${(na / procedures.length) * 100}%` }} />
                                  <div className="bg-gray-200 h-3" style={{ width: `${(notAssessed / procedures.length) * 100}%` }} />
                                </div>
                                <div className="flex gap-3 text-xs text-gray-600 flex-wrap">
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Satisfied ({satisfied})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Other Than Satisfied ({ots})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> N/A ({na})</span>
                                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 border border-gray-300" /> Not Assessed ({notAssessed})</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Overdue Items */}
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                      <h4 className="text-sm font-bold text-gray-900">🔴 Overdue & At-Risk Items</h4>
                      {(() => {
                        const now = new Date();
                        const overduePbc = pbc.filter((r: any) => r.due_date && new Date(r.due_date) < now && r.status !== 'accepted' && r.status !== 'closed');
                        const overdueFindings = findings.filter((r: any) => r.due_date && new Date(r.due_date) < now && r.status !== 'closed' && r.status !== 'verified');
                        const total = overduePbc.length + overdueFindings.length;
                        if (total === 0) {
                          return <p className="text-xs text-green-600 py-3 text-center font-medium">✅ No overdue items — all deadlines are on track.</p>;
                        }
                        return (
                          <div className="space-y-2">
                            {overduePbc.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-xs">
                                <div>
                                  <span className="font-semibold text-red-800">PBC:</span> <span className="text-gray-900">{r.title}</span>
                                </div>
                                <span className="text-red-600 font-medium">Due {formatDate(r.due_date)}</span>
                              </div>
                            ))}
                            {overdueFindings.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-xs">
                                <div>
                                  <span className="font-semibold text-red-800">Finding:</span> <span className="text-gray-900">{r.title}</span>
                                </div>
                                <span className="text-red-600 font-medium">Due {formatDate(r.due_date)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* AI Insights Tab */}
                {selectedTab === 'ai_insights' && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg shadow-md p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">🤖 AI-Powered Audit Intelligence</h3>
                          <p className="text-sm text-gray-600 mt-1">Leverage AI to generate risk assessments, executive summaries, compliance forecasts, and gap analyses for this engagement.</p>
                        </div>
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full">AI-Powered</span>
                      </div>
                    </div>

                    {/* Parallel Audit Prep Swarm */}
                    <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 border border-violet-200 rounded-lg shadow-md p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">🐝 Parallel Audit Preparation</h4>
                          <p className="text-xs text-gray-500">Run audit readiness, gap analysis, and crosswalk optimization concurrently across AI agent swarm — results in seconds instead of minutes.</p>
                        </div>
                        <button onClick={runAuditPrepSwarm} disabled={swarmRunning || aiLoading !== null} className="px-4 py-2 text-xs bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 font-medium">
                          {swarmRunning ? '⏳ Running 3 agents…' : '🐝 Run Audit Prep Swarm'}
                        </button>
                      </div>
                      {swarmResult && (
                        <div className="bg-white border border-violet-200 rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>⏱ {(swarmResult.totalDurationMs / 1000).toFixed(1)}s total</span>
                            <span className="text-green-600">✅ {swarmResult.successCount} passed</span>
                            {swarmResult.failureCount > 0 && <span className="text-red-600">❌ {swarmResult.failureCount} failed</span>}
                            {swarmResult.ragContextUsed && <span className="text-purple-600">📚 RAG enriched</span>}
                          </div>
                          {swarmResult.agents?.map((agent: any) => (
                            <div key={agent.agentId} className={`border rounded-lg p-3 ${agent.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{agent.status === 'success' ? '✅' : '❌'} {agent.label}</span>
                                <span className="text-xs text-gray-500">{(agent.durationMs / 1000).toFixed(1)}s{agent.provider ? ` · ${agent.provider}` : ''}</span>
                              </div>
                              {agent.status === 'success' && agent.result && (
                                <pre className="text-xs bg-white/70 rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto border mt-1">
                                  {typeof agent.result === 'string' ? agent.result : JSON.stringify(agent.result, null, 2)}
                                </pre>
                              )}
                              {agent.status === 'error' && <p className="text-xs text-red-700 mt-1">{agent.error}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* AI Audit Risk Assessment */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-gray-900">🎯 Audit Readiness Assessment</h4>
                          <button onClick={runAiRiskAssessment} disabled={aiLoading !== null} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                            {aiLoading === 'risk' ? '⏳ Analyzing...' : 'Run Assessment'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">AI analyzes your control implementations, evidence, and gaps to assess audit readiness across your framework scope.</p>
                        {aiRiskAssessment ? (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-2">
                            <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto">{typeof aiRiskAssessment === 'string' ? aiRiskAssessment : aiRiskAssessment.analysis || aiRiskAssessment.content || JSON.stringify(aiRiskAssessment, null, 2)}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 py-3 text-center italic">Click &ldquo;Run Assessment&rdquo; to generate an AI audit readiness assessment.</div>
                        )}
                      </div>

                      {/* AI Executive Summary */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-gray-900">📋 Executive Summary</h4>
                          <button onClick={runAiExecutiveSummary} disabled={aiLoading !== null} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                            {aiLoading === 'executive' ? '⏳ Generating...' : 'Generate Report'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">AI generates a board-ready executive compliance report summarizing your organization&apos;s compliance posture, risks, and recommendations.</p>
                        {aiExecutiveSummary ? (
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
                            <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto">{typeof aiExecutiveSummary === 'string' ? aiExecutiveSummary : aiExecutiveSummary.analysis || aiExecutiveSummary.content || JSON.stringify(aiExecutiveSummary, null, 2)}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 py-3 text-center italic">Click &ldquo;Generate Report&rdquo; to create an AI executive summary.</div>
                        )}
                      </div>

                      {/* AI Gap Analysis */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-gray-900">🔍 Gap Analysis</h4>
                          <button onClick={runAiGapAnalysis} disabled={aiLoading !== null} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                            {aiLoading === 'gap' ? '⏳ Analyzing...' : 'Analyze Gaps'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">AI identifies compliance gaps across your frameworks, controls, and implementations with prioritized remediation guidance.</p>
                        {aiGapAnalysis ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                            <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto">{typeof aiGapAnalysis === 'string' ? aiGapAnalysis : aiGapAnalysis.analysis || aiGapAnalysis.content || JSON.stringify(aiGapAnalysis, null, 2)}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 py-3 text-center italic">Click &ldquo;Analyze Gaps&rdquo; to run an AI gap analysis.</div>
                        )}
                      </div>

                      {/* AI Compliance Forecast */}
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-gray-900">📈 Compliance Forecast</h4>
                          <button onClick={runAiComplianceForecast} disabled={aiLoading !== null} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                            {aiLoading === 'forecast' ? '⏳ Forecasting...' : 'Run Forecast'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500">AI projects your compliance trajectory, upcoming risks, and estimated timelines to full compliance across your framework scope.</p>
                        {aiComplianceForecast ? (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                            <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto">{typeof aiComplianceForecast === 'string' ? aiComplianceForecast : aiComplianceForecast.analysis || aiComplianceForecast.content || JSON.stringify(aiComplianceForecast, null, 2)}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 py-3 text-center italic">Click &ldquo;Run Forecast&rdquo; to generate a compliance forecast.</div>
                        )}
                      </div>
                    </div>

                    {/* AI Engagement Quick Actions */}
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                      <h4 className="text-sm font-bold text-gray-900">⚡ AI Quick Actions for this Engagement</h4>
                      <p className="text-xs text-gray-500">These AI actions are scoped to the selected engagement&apos;s procedures and controls.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-2">
                          <div className="text-sm font-semibold text-indigo-800">📥 Auto-Draft PBC</div>
                          <p className="text-xs text-gray-600">AI generates PBC requests from in-scope procedures with appropriate priority levels and due dates.</p>
                          <button onClick={autoCreatePbcFromProcedures} disabled={saving || procedures.length === 0} className="w-full px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
                            {saving ? 'Processing...' : `Generate from ${procedures.length} procedures`}
                          </button>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
                          <div className="text-sm font-semibold text-purple-800">📝 AI Workpaper Draft</div>
                          <p className="text-xs text-gray-600">Select a procedure in the Procedures tab, then AI drafts a workpaper with objective, testing approach, and conclusion.</p>
                          <button onClick={generateAiWorkpaperFromProcedure} disabled={saving || !primarySelectedProcedureId} className="w-full px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50">
                            {primarySelectedProcedureId ? 'Draft Workpaper from Selected' : 'Select a procedure first'}
                          </button>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                          <div className="text-sm font-semibold text-amber-800">⚠️ AI Finding Draft</div>
                          <p className="text-xs text-gray-600">Select a procedure in the Procedures tab, then AI drafts a finding with severity assessment and remediation recommendation.</p>
                          <button onClick={generateAiFindingFromProcedure} disabled={saving || !primarySelectedProcedureId} className="w-full px-3 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
                            {primarySelectedProcedureId ? 'Draft Finding from Selected' : 'Select a procedure first'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Client Portal Tab */}
                {selectedTab === 'client_portal' && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg shadow-md p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">🔗 Client Portal &amp; Org Linkage</h3>
                          <p className="text-sm text-gray-600 mt-1">Share audit progress with the client organization. Generate secure read-only links so stakeholders can track engagement status, PBC requests, and findings.</p>
                        </div>
                        <button onClick={loadWorkspaceLinks} disabled={linksLoading} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
                          {linksLoading ? '⏳ Loading...' : '🔄 Refresh Links'}
                        </button>
                      </div>
                    </div>

                    {/* Create New Link */}
                    {canWrite && (
                      <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                        <h4 className="text-sm font-bold text-gray-900">➕ Create Client Portal Link</h4>
                        <p className="text-xs text-gray-500">Generate a secure, time-limited, read-only link for the client org to view engagement progress. Links are scoped to the currently selected engagement.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            value={newLinkName}
                            onChange={(e) => setNewLinkName(e.target.value)}
                            placeholder="Link name (e.g., Q1 2026 SOC 2 Review) *"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-600 whitespace-nowrap">Expires in</label>
                            <select value={newLinkDays} onChange={(e) => setNewLinkDays(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1">
                              <option value="7">7 days</option>
                              <option value="14">14 days</option>
                              <option value="30">30 days</option>
                              <option value="60">60 days</option>
                              <option value="90">90 days</option>
                              <option value="180">180 days</option>
                              <option value="365">365 days</option>
                            </select>
                          </div>
                          <button onClick={createWorkspaceLink} disabled={saving || !newLinkName.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">
                            🔗 Generate Link
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Active Links */}
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-3">
                      <h4 className="text-sm font-bold text-gray-900">🔗 Active Client Portal Links</h4>
                      {workspaceLinks.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-gray-500">No portal links created yet.</p>
                          <p className="text-xs text-gray-400 mt-1">Create a link above to share engagement progress with client stakeholders.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {workspaceLinks.map((wsLink: any) => (
                            <div key={wsLink.id} className={`border rounded-lg px-4 py-3 ${wsLink.active ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200 bg-gray-50'}`}>
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-900">{wsLink.name}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${wsLink.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                                      {wsLink.active ? '● Active' : '○ Inactive'}
                                    </span>
                                    {wsLink.read_only && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Read-only</span>}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Expires {formatDate(wsLink.expires_at)} · Created {formatDate(wsLink.created_at)}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => copyLinkUrl(wsLink.token)} className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                                    {linkCopied === wsLink.token ? '✅ Copied!' : '📋 Copy Link'}
                                  </button>
                                  {canWrite && (
                                    <button onClick={() => toggleLinkActive(wsLink.id, !wsLink.active)} className={`px-3 py-1.5 text-xs rounded-md ${wsLink.active ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                                      {wsLink.active ? 'Deactivate' : 'Reactivate'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Client-Visible Progress Preview */}
                    <div className="bg-white rounded-lg shadow-md p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-900">👁️ Client-Visible Progress Preview</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">What the org sees</span>
                      </div>
                      <p className="text-xs text-gray-500">This is a preview of the information visible to the client organization through the portal link.</p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                          <div className="text-xs text-gray-500">Engagement Status</div>
                          <div className="text-lg font-bold text-emerald-700 mt-1">{labelize(engagement?.status || 'planning')}</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-xs text-gray-500">PBC Requests</div>
                          <div className="text-lg font-bold text-blue-700 mt-1">{pbc.filter((r: any) => r.status === 'accepted' || r.status === 'closed').length} / {pbc.length}</div>
                          <div className="text-[10px] text-gray-400">accepted</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="text-xs text-gray-500">Open Findings</div>
                          <div className="text-lg font-bold text-amber-700 mt-1">{findings.filter((f: any) => f.status === 'open' || f.status === 'accepted' || f.status === 'remediating').length}</div>
                          <div className="text-[10px] text-gray-400">requiring attention</div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <div className="text-xs text-gray-500">Readiness</div>
                          <div className="text-lg font-bold text-purple-700 mt-1">{signoffReadiness?.readiness?.ready_for_validation_package ? '✅ Ready' : '⏳ Pending'}</div>
                        </div>
                      </div>

                      {/* Client-visible PBC status */}
                      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                        <h5 className="text-xs font-bold text-gray-700">📥 PBC Request Progress (Client View)</h5>
                        {pbc.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-2">No PBC requests to display.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {pbc.slice(0, 10).map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between text-xs border border-gray-100 rounded px-3 py-1.5">
                                <span className="text-gray-800 truncate max-w-xs">{r.title}</span>
                                <div className="flex items-center gap-2">
                                  {r.due_date && <span className="text-gray-400">{formatDate(r.due_date)}</span>}
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    r.status === 'accepted' || r.status === 'closed' ? 'bg-green-100 text-green-700' :
                                    r.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                    r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>{labelize(r.status)}</span>
                                </div>
                              </div>
                            ))}
                            {pbc.length > 10 && <p className="text-xs text-gray-400 text-center">and {pbc.length - 10} more...</p>}
                          </div>
                        )}
                      </div>

                      {/* Client-visible Findings summary */}
                      <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                        <h5 className="text-xs font-bold text-gray-700">⚠️ Findings Summary (Client View)</h5>
                        {findings.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-2">No findings to display.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {findings.slice(0, 8).map((f: any) => (
                              <div key={f.id} className="flex items-center justify-between text-xs border border-gray-100 rounded px-3 py-1.5">
                                <span className="text-gray-800 truncate max-w-xs">{f.title}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${f.severity === 'critical' ? 'bg-red-500' : f.severity === 'high' ? 'bg-orange-500' : f.severity === 'medium' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
                                  <span className="text-gray-500">{labelize(f.severity)}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    f.status === 'closed' || f.status === 'verified' ? 'bg-green-100 text-green-700' :
                                    f.status === 'remediating' ? 'bg-blue-100 text-blue-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>{labelize(f.status)}</span>
                                </div>
                              </div>
                            ))}
                            {findings.length > 8 && <p className="text-xs text-gray-400 text-center">and {findings.length - 8} more...</p>}
                          </div>
                        )}
                      </div>

                      {/* Engagement Timeline (client visible) */}
                      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                        <h5 className="text-xs font-bold text-gray-700">📅 Engagement Milestones (Client View)</h5>
                        <div className="flex items-center gap-1">
                          {engagementStatuses.filter(s => s !== 'archived').map((stage, idx) => {
                            const stageIdx = engagementStatuses.indexOf(engagement?.status || 'planning');
                            const thisIdx = engagementStatuses.indexOf(stage);
                            const isComplete = thisIdx < stageIdx;
                            const isCurrent = stage === engagement?.status;
                            return (
                              <div key={stage} className="flex-1 flex items-center gap-1">
                                <div className={`h-2.5 flex-1 rounded-full ${isComplete ? 'bg-emerald-500' : isCurrent ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                                {idx < engagementStatuses.filter(s => s !== 'archived').length - 1 && <div className="w-1" />}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-500 px-1">
                          {engagementStatuses.filter(s => s !== 'archived').map(s => <span key={s}>{labelize(s)}</span>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function HeaderMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/10 border border-white/10 rounded-lg p-3">
      <div className="text-xs text-purple-200">{label}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function TimelineItem({ label, date, icon, active }: { label: string; date: string; icon: string; active: boolean }) {
  return (
    <div className="relative flex items-center gap-3">
      <div className={`absolute -left-8 w-5 h-5 rounded-full flex items-center justify-center text-xs ${active ? 'bg-purple-100' : 'bg-gray-100'}`}>
        {icon}
      </div>
      <div>
        <div className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</div>
        <div className={`text-xs ${active ? 'text-gray-600' : 'text-gray-400'}`}>{date}</div>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color = value >= 80 ? 'text-green-600' : value >= 50 ? 'text-amber-600' : 'text-red-600';
  const bg = value >= 80 ? 'bg-green-50' : value >= 50 ? 'bg-amber-50' : 'bg-red-50';
  return (
    <div className={`${bg} border border-gray-200 rounded-lg p-3`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${color} mt-1`}>{value}%</div>
      <div className="text-[10px] text-gray-400">Weight: {weight}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function ArtifactPanel({
  title,
  rows,
  selectedId,
  onSelect,
  columns,
  emptyMessage,
  actionLabel,
  action,
  detail
}: {
  title: string;
  rows: any[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  columns: Array<{ label: string; value: (row: any) => string }>;
  emptyMessage: string;
  actionLabel?: string;
  action?: () => void;
  detail?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        {actionLabel && action && (
          <button onClick={action} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700">
            {actionLabel}
          </button>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th key={column.label} className="px-3 py-2 text-left">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500">{emptyMessage}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} onClick={() => onSelect(row.id)} className={`border-t border-gray-200 cursor-pointer ${selectedId === row.id ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                  {columns.map((column) => (
                    <td key={column.label} className="px-3 py-2">{column.value(row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {detail}
    </div>
  );
}
