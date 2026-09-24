// @tier: community
'use client';

import { useEffect, useEffectEvent, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import api, { aiAPI, aiDecisionsAPI, auditAPI, billingAPI, dynamicConfigAPI, integrationsAPI, licenseAPI, notificationsAPI, opsAPI, passkeyAPI, platformAdminAPI, rolesAPI, settingsAPI, siemAPI, ssoAPI, totpAPI, trustCenterAPI, usersAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission, isPlatformAdmin } from '@/lib/access';
import { APP_POSITIONING_SHORT } from '@/lib/branding';

interface Permission {
  id: string;
  name: string;
  description: string;
}

interface PermissionGroup {
  [resource: string]: Permission[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  permission_count: number;
  user_count: number;
  permissions: string[];
}

interface TeamUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: 'admin' | 'auditor' | 'user';
  is_active: boolean;
  created_at: string;
}

interface LLMSettings {
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
  hasGeminiKey: boolean;
  hasGrokKey: boolean;
  hasGroqKey: boolean;
  hasOllamaUrl: boolean;
  defaultProvider: string;
  defaultModel: string | null;
  applyAllFrameworkGuardrails: boolean;
  settings: Record<string, any>;
}

interface SplunkSettings {
  configured: boolean;
  base_url: string | null;
  default_index: string | null;
  token_masked: string | null;
}

interface TrustCenterConfig {
  id: string;
  organization_id: string;
  enabled: boolean;
  display_name: string | null;
  description: string | null;
  contact_email: string | null;
  show_frameworks: boolean;
  show_compliance_scores: boolean;
  show_authorizations: boolean;
  public_token: string;
  published_at: string | null;
}

interface ContentPack {
  id: string;
  framework_code: string;
  pack_name: string;
  pack_version: string | null;
  license_reference: string;
  source_vendor: string | null;
  imported_at: string;
  imported_by_name: string | null;
  control_overrides: string;
  procedure_overrides: string;
  is_active: boolean;
}

interface ContentPackDraft {
  id: string;
  framework_code: string;
  pack_name: string;
  pack_version: string | null;
  source_vendor: string | null;
  license_reference: string | null;
  report_file_name: string;
  review_required: boolean;
  review_status: 'not_required' | 'pending' | 'approved' | 'rejected';
  attestation_confirmed: boolean;
  parse_summary?: {
    ai_assisted?: boolean;
    ai_error?: string | null;
    warnings?: string[];
    ai_summary?: {
      matched_controls?: number;
      unmatched_controls?: number;
      matched_procedures?: number;
      unmatched_procedures?: number;
    };
  };
  draft_control_count?: number;
  draft_procedure_count?: number;
  imported_pack_id?: string | null;
  imported_at?: string | null;
  created_at: string;
}

interface PlatformOverviewSummary {
  total_users: number;
  active_users: number;
  active_users_7d: number;
  events_24h: number;
  failures_24h: number;
  open_vulnerabilities: number;
  active_poam_items: number;
  open_issue_count: number;
}

interface PlatformJobStatus {
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

interface PlatformWebhookStatus {
  pending: number;
  delivered: number;
  failed: number;
}

interface PlatformTopEvent {
  event_type: string;
  count: number;
}

interface PlatformRecentFailure {
  id: string;
  event_type: string;
  resource_type: string | null;
  failure_reason: string | null;
  details: Record<string, any> | null;
  created_at: string;
  actor_name: string;
}

interface PlatformOverview {
  summary: PlatformOverviewSummary;
  jobs: PlatformJobStatus;
  webhooks: PlatformWebhookStatus;
  top_events_7d: PlatformTopEvent[];
  recent_failures: PlatformRecentFailure[];
}

type SettingsTab =
  | 'roles'
  | 'llm'
  | 'ai_activity'
  | 'automation'
  | 'notifications'
  | 'integrations'
  | 'content'
  | 'audit'
  | 'platform'
  | 'security'
  | 'account';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROVIDER_MODEL_OPTIONS: Record<string, string[]> = {
  claude: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-fable-5'],
  openai: ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.3-codex'],
  gemini: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'],
  grok: ['grok-4.5', 'grok-4.3', 'grok-4.1-fast'],
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound', 'groq/compound-mini', 'meta-llama/llama-4-scout-17b-16e-instruct'],
  // NOTE: The full Ollama model list is sourced from /api/v1/ai/status at runtime.
  // This array is intentionally kept as a minimal local fallback only.
  ollama: ['llama3.2']
};

// ---------------------------------------------------------------------------
// Recommended Role Templates — pre-configured permission sets for common GRC
// roles so admins can provision them in one click instead of manually selecting
// permissions from scratch.
// ---------------------------------------------------------------------------
const RECOMMENDED_ROLES = [
  {
    name: 'Security Analyst',
    description: 'Monitors controls, reviews evidence, and assesses implementation status. Cannot modify settings or manage users.',
    icon: '🔒',
    permissions: [
      'dashboard.read', 'frameworks.read', 'organizations.read',
      'controls.read', 'controls.write',
      'implementations.read', 'implementations.write',
      'evidence.read', 'evidence.write',
      'assets.read', 'environments.read', 'service_accounts.read',
      'assessments.read', 'assessments.write',
      'reports.read', 'notifications.read', 'notifications.write', 'ai.use',
    ],
  },
  {
    name: 'Compliance Manager',
    description: 'Full compliance oversight — manages frameworks, controls, evidence, and assessments. No user or settings management.',
    icon: '📋',
    permissions: [
      'dashboard.read', 'frameworks.read', 'frameworks.manage', 'organizations.read',
      'controls.read', 'controls.write',
      'implementations.read', 'implementations.write',
      'evidence.read', 'evidence.write',
      'assets.read', 'assets.write',
      'environments.read', 'environments.write',
      'service_accounts.read', 'service_accounts.write',
      'assessments.read', 'assessments.write',
      'reports.read', 'notifications.read', 'notifications.write', 'ai.use',
    ],
  },
  {
    name: 'Evidence Collector',
    description: 'Uploads and manages evidence artifacts. Limited to evidence and related read access.',
    icon: '📎',
    permissions: [
      'dashboard.read', 'frameworks.read', 'organizations.read',
      'controls.read', 'implementations.read',
      'evidence.read', 'evidence.write',
      'assets.read', 'notifications.read', 'ai.use',
    ],
  },
  {
    name: 'Risk Assessor',
    description: 'Conducts risk assessments, reviews controls, and documents findings. Read access across CMDB resources.',
    icon: '⚖️',
    permissions: [
      'dashboard.read', 'frameworks.read', 'organizations.read',
      'controls.read',
      'implementations.read', 'implementations.write',
      'evidence.read',
      'assets.read', 'environments.read', 'service_accounts.read',
      'assessments.read', 'assessments.write',
      'reports.read', 'notifications.read', 'notifications.write', 'ai.use',
    ],
  },
  {
    name: 'Read-Only Reviewer',
    description: 'View-only access across all compliance data. Cannot modify any records.',
    icon: '👁️',
    permissions: [
      'dashboard.read', 'frameworks.read', 'organizations.read',
      'controls.read', 'implementations.read',
      'evidence.read', 'assets.read', 'environments.read',
      'service_accounts.read', 'assessments.read',
      'reports.read', 'notifications.read',
    ],
  },
  {
    name: 'SOC Operator',
    description: 'Security operations — manages assets, environments, and service accounts. Reviews audit trails.',
    icon: '🛡️',
    permissions: [
      'dashboard.read', 'frameworks.read', 'organizations.read',
      'controls.read',
      'implementations.read',
      'evidence.read',
      'assets.read', 'assets.write',
      'environments.read', 'environments.write',
      'service_accounts.read', 'service_accounts.write',
      'audit.read',
      'reports.read', 'notifications.read', 'notifications.write', 'ai.use',
    ],
  },
];

function SettingsPageInner() {
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const canManageRoles = hasPermission(user, 'roles.manage');
  const canReadUsers = hasPermission(user, 'users.read') || hasPermission(user, 'users.manage');
  const canManageUsers = hasPermission(user, 'users.manage');
  const canManageSettings = hasPermission(user, 'settings.manage');
  const canAccessPlatformAdmin = canManageSettings && isPlatformAdmin(user);
  const canUseSplunk = canManageSettings;
  const canUseSiem = canManageSettings;
  const canUseIntegrations = canUseSplunk || canUseSiem;
  const canUsePasskeys = true;
  const canUseSso = canManageSettings;
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const defaultTab: SettingsTab = canManageRoles ? 'roles' : canManageSettings ? 'llm' : 'security';
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionGroup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Account management state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Upgrade billing cycle toggle

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePrimaryRole, setInvitePrimaryRole] = useState<'admin' | 'auditor' | 'user'>('user');
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);
  const [viewRole, setViewRole] = useState<Role | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [userRoleSelections, setUserRoleSelections] = useState<Record<string, string[]>>({});
  const [creatingUser, setCreatingUser] = useState(false);
  const [savingUserRoles, setSavingUserRoles] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [creatingAuditorSubroles, setCreatingAuditorSubroles] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPrimaryRole, setNewUserPrimaryRole] = useState<'admin' | 'auditor' | 'user'>('user');

  // LLM state
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>(PROVIDER_MODEL_OPTIONS);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [grokKey, setGrokKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [defaultProvider, setDefaultProvider] = useState('claude');
  const [defaultModel, setDefaultModel] = useState('');
  const [useCustomDefaultModel, setUseCustomDefaultModel] = useState(false);
  const [applyAllFrameworkGuardrails, setApplyAllFrameworkGuardrails] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // Crosswalk config
  const [crosswalkThreshold, setCrosswalkThreshold] = useState(90);
  const [crosswalkThresholdSaving, setCrosswalkThresholdSaving] = useState(false);
  const [crosswalkThresholdMsg, setCrosswalkThresholdMsg] = useState('');

  // Trust Center config
  const [trustCenterConfig, setTrustCenterConfig] = useState<TrustCenterConfig | null>(null);
  const [trustCenterLoading, setTrustCenterLoading] = useState(false);
  const [trustCenterSaving, setTrustCenterSaving] = useState(false);
  const [trustCenterMsg, setTrustCenterMsg] = useState('');
  const [trustCenterRegenerating, setTrustCenterRegenerating] = useState(false);
  const [trustCenterCopied, setTrustCenterCopied] = useState(false);
  const [tcEnabled, setTcEnabled] = useState(false);
  const [tcDisplayName, setTcDisplayName] = useState('');
  const [tcDescription, setTcDescription] = useState('');
  const [tcContactEmail, setTcContactEmail] = useState('');
  const [tcShowFrameworks, setTcShowFrameworks] = useState(false);
  const [tcShowComplianceScores, setTcShowComplianceScores] = useState(false);
  const [tcShowAuthorizations, setTcShowAuthorizations] = useState(false);

  // Splunk integration state
  const [splunkSettings, setSplunkSettings] = useState<SplunkSettings | null>(null);
  const [splunkBaseUrl, setSplunkBaseUrl] = useState('');
  const [splunkApiToken, setSplunkApiToken] = useState('');
  const [splunkDefaultIndex, setSplunkDefaultIndex] = useState('');
  const [splunkTesting, setSplunkTesting] = useState(false);
  const [splunkSaving, setSplunkSaving] = useState(false);
  const [contentPacks, setContentPacks] = useState<ContentPack[]>([]);
  const [contentPackDrafts, setContentPackDrafts] = useState<ContentPackDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraftJson, setSelectedDraftJson] = useState('');
  const [selectedDraftReviewRequired, setSelectedDraftReviewRequired] = useState(false);
  const [draftLoadingId, setDraftLoadingId] = useState<string | null>(null);
  const [draftUploading, setDraftUploading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftActionId, setDraftActionId] = useState<string | null>(null);
  const [draftReportFile, setDraftReportFile] = useState<File | null>(null);
  const [draftFrameworkCode, setDraftFrameworkCode] = useState('');
  const [draftPackName, setDraftPackName] = useState('');
  const [draftPackVersion, setDraftPackVersion] = useState('');
  const [draftSourceVendor, setDraftSourceVendor] = useState('');
  const [draftLicenseReference, setDraftLicenseReference] = useState('');
  const [draftReviewRequired, setDraftReviewRequired] = useState(true);
  const [draftAiAssist, setDraftAiAssist] = useState(true);
  const [draftProvider, setDraftProvider] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [contentPackJson, setContentPackJson] = useState('');
  const [contentPackImporting, setContentPackImporting] = useState(false);
  const [contentPackTemplateLoading, setContentPackTemplateLoading] = useState(false);

  // AI Activity log state
  const [aiActivityRows, setAiActivityRows] = useState<any[]>([]);
  const [aiActivityLoading, setAiActivityLoading] = useState(false);
  const [aiActivityPage, setAiActivityPage] = useState(1);
  const [aiActivityTotal, setAiActivityTotal] = useState(0);
  const AI_ACTIVITY_LIMIT = 50;

  // Notifications preferences tab state
  const [notifPrefs, setNotifPrefs] = useState<{ type: string; in_app: boolean; email: boolean }[]>([]);
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false);
  const [notifEmailConfigured, setNotifEmailConfigured] = useState(false);
  const [notifSavingType, setNotifSavingType] = useState<string | null>(null);

  const loadNotifPrefs = async () => {
    setNotifPrefsLoading(true);
    try {
      const [prefsRes, emailRes] = await Promise.all([
        notificationsAPI.getPreferences(),
        notificationsAPI.getEmailStatus(),
      ]);
      setNotifPrefs(prefsRes.data?.data || []);
      setNotifEmailConfigured(emailRes.data?.data?.configured ?? false);
    } catch {
      // silently fail
    } finally {
      setNotifPrefsLoading(false);
    }
  };

  const handleNotifPrefChange = async (type: string, field: 'in_app' | 'email', value: boolean) => {
    setNotifSavingType(type);
    const existing = notifPrefs.find(p => p.type === type) || { type, in_app: true, email: false };
    const updated = { ...existing, [field]: value };
    setNotifPrefs(prev => prev.map(p => p.type === type ? updated : p));
    try {
      await notificationsAPI.updatePreference(updated);
    } catch {
      // revert on error
      setNotifPrefs(prev => prev.map(p => p.type === type ? existing : p));
    } finally {
      setNotifSavingType(null);
    }
  };

  // AI Decisions tab state
  const [aiDecisions, setAiDecisions] = useState<any[]>([]);
  const [aiDecisionsLoading, setAiDecisionsLoading] = useState(false);
  const [aiDecisionsPage, setAiDecisionsPage] = useState(1);
  const [aiDecisionsTotal, setAiDecisionsTotal] = useState(0);
  const [aiDecisionsFilterReviewed, setAiDecisionsFilterReviewed] = useState('');
  const [aiDecisionsFilterFeature, setAiDecisionsFilterFeature] = useState('');
  const [aiDecisionsFilterRisk, setAiDecisionsFilterRisk] = useState('');
  const [aiDecisionsSelected, setAiDecisionsSelected] = useState<any | null>(null);
  const [aiDecisionsOutcome, setAiDecisionsOutcome] = useState('');
  const [aiDecisionsNotes, setAiDecisionsNotes] = useState('');
  const [aiDecisionsBiasNotes, setAiDecisionsBiasNotes] = useState('');
  const [aiDecisionsSaving, setAiDecisionsSaving] = useState(false);
  const AI_DECISIONS_LIMIT = 50;

  const loadAiDecisions = async (page = 1) => {
    if (!canManageSettings) return;
    setAiDecisionsLoading(true);
    try {
      const res = await aiDecisionsAPI.list({
        page,
        limit: AI_DECISIONS_LIMIT,
        reviewed: aiDecisionsFilterReviewed || undefined,
        feature: aiDecisionsFilterFeature || undefined,
        risk_level: aiDecisionsFilterRisk || undefined,
      });
      const data = res.data?.data || {};
      setAiDecisions(data.decisions || []);
      setAiDecisionsTotal(data.total || 0);
      setAiDecisionsPage(page);
    } catch {
      // silently fail
    } finally {
      setAiDecisionsLoading(false);
    }
  };

  const handleAiDecisionReview = async () => {
    if (!aiDecisionsSelected || !aiDecisionsOutcome) return;
    setAiDecisionsSaving(true);
    try {
      await aiDecisionsAPI.review(aiDecisionsSelected.id, { outcome: aiDecisionsOutcome, notes: aiDecisionsNotes });
      setAiDecisions(prev => prev.map(d => d.id === aiDecisionsSelected.id
        ? { ...d, human_reviewed: true, review_outcome: aiDecisionsOutcome }
        : d));
      setAiDecisionsSelected(null);
      showToast('Review saved');
    } catch {
      showToast('Failed to save review');
    } finally {
      setAiDecisionsSaving(false);
    }
  };

  const handleAiDecisionBiasReview = async () => {
    if (!aiDecisionsSelected) return;
    setAiDecisionsSaving(true);
    try {
      await aiDecisionsAPI.biasReview(aiDecisionsSelected.id, { notes: aiDecisionsBiasNotes });
      setAiDecisions(prev => prev.map(d => d.id === aiDecisionsSelected.id
        ? { ...d, bias_reviewed: true }
        : d));
      setAiDecisionsSelected(null);
      showToast('Bias review saved');
    } catch {
      showToast('Failed to save bias review');
    } finally {
      setAiDecisionsSaving(false);
    }
  };

  // Audit Logs tab state
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const AUDIT_LIMIT = 50;

  const [auditError, setAuditError] = useState('');
  const auditQueryKey = searchParams?.toString() || '';
  const auditFilters = {
    eventType: searchParams?.get('eventType')?.trim() || '',
    resourceType: searchParams?.get('resourceType')?.trim() || '',
    resourceId: searchParams?.get('resourceId')?.trim() || '',
    findingKey: searchParams?.get('findingKey')?.trim() || '',
    vulnerabilityId: searchParams?.get('vulnerabilityId')?.trim() || '',
    source: searchParams?.get('source')?.trim() || '',
    startDate: searchParams?.get('startDate')?.trim() || '',
    endDate: searchParams?.get('endDate')?.trim() || '',
  };
  const auditFilterChips: Array<{ label: string; value: string }> = [];
  if (auditFilters.eventType) auditFilterChips.push({ label: 'Event', value: auditFilters.eventType });
  if (auditFilters.resourceType) auditFilterChips.push({ label: 'Resource', value: auditFilters.resourceType });
  if (auditFilters.resourceId) auditFilterChips.push({ label: 'Resource ID', value: auditFilters.resourceId });
  if (auditFilters.findingKey) auditFilterChips.push({ label: 'Finding Key', value: auditFilters.findingKey });
  if (auditFilters.vulnerabilityId) auditFilterChips.push({ label: 'Vulnerability', value: auditFilters.vulnerabilityId });
  if (auditFilters.source) auditFilterChips.push({ label: 'Source', value: auditFilters.source });
  if (auditFilters.startDate) auditFilterChips.push({ label: 'From', value: auditFilters.startDate });
  if (auditFilters.endDate) auditFilterChips.push({ label: 'To', value: auditFilters.endDate });
  const hasAuditFilters = auditFilterChips.length > 0;

  const loadAuditLogs = async (page = 1) => {
    if (!canManageSettings) return;
    try {
      setAuditLoading(true);
      setAuditError('');
      const offset = (page - 1) * AUDIT_LIMIT;
      const res = await auditAPI.getLogs({
        limit: AUDIT_LIMIT,
        offset,
        ...(auditFilters.eventType ? { eventType: auditFilters.eventType } : {}),
        ...(auditFilters.resourceType ? { resourceType: auditFilters.resourceType } : {}),
        ...(auditFilters.resourceId ? { resourceId: auditFilters.resourceId } : {}),
        ...(auditFilters.findingKey ? { findingKey: auditFilters.findingKey } : {}),
        ...(auditFilters.vulnerabilityId ? { vulnerabilityId: auditFilters.vulnerabilityId } : {}),
        ...(auditFilters.source ? { source: auditFilters.source } : {}),
        ...(auditFilters.startDate ? { startDate: auditFilters.startDate } : {}),
        ...(auditFilters.endDate ? { endDate: auditFilters.endDate } : {}),
      });
      setAuditRows(res.data?.data?.logs || res.data?.logs || res.data?.data || []);
      setAuditTotal(res.data?.pagination?.total || res.data?.data?.total || 0);
      setAuditPage(page);
    } catch (err: any) {
      setAuditError(err.response?.data?.error || 'Failed to load audit logs');
    } finally {
      setAuditLoading(false);
    }
  };

  // Platform Admin tab state
  const [platformActionLoading, setPlatformActionLoading] = useState('');
  const [platformActionMsg, setPlatformActionMsg] = useState('');
  const [platformOverview, setPlatformOverview] = useState<PlatformOverview | null>(null);
  const [platformOverviewLoading, setPlatformOverviewLoading] = useState(false);
  const [platformOverviewError, setPlatformOverviewError] = useState('');
  const [bootstrapEmail, setBootstrapEmail] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [bootstrapFirstName, setBootstrapFirstName] = useState('Platform');
  const [bootstrapLastName, setBootstrapLastName] = useState('Admin');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapMsg, setBootstrapMsg] = useState('');
  const [platformLlmSettings, setPlatformLlmSettings] = useState<LLMSettings | null>(null);
  const [platformLlmLoading, setPlatformLlmLoading] = useState(false);
  const [platformLlmSaving, setPlatformLlmSaving] = useState(false);
  const [platformAnthropicKey, setPlatformAnthropicKey] = useState('');
  const [platformOpenaiKey, setPlatformOpenaiKey] = useState('');
  const [platformGeminiKey, setPlatformGeminiKey] = useState('');
  const [platformGrokKey, setPlatformGrokKey] = useState('');
  const [platformGroqKey, setPlatformGroqKey] = useState('');
  const [platformOllamaUrl, setPlatformOllamaUrl] = useState('');
  const [platformDefaultProvider, setPlatformDefaultProvider] = useState('claude');
  const [platformDefaultModel, setPlatformDefaultModel] = useState('');
  const [platformUseCustomModel, setPlatformUseCustomModel] = useState(false);
  // Update check state
  const [updateCheckData, setUpdateCheckData] = useState<{
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    updateRequired: boolean;
    minVersionRequired: string | null;
    releaseUrl: string;
    releaseName: string | null;
    releaseExcerpt: string | null;
    publishedAt: string | null;
    checkedAt: string;
    source: string;
  } | null>(null);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState('');
  // SMTP config state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSource, setSmtpSource] = useState('none');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState('');
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Security (Passkeys) tab state
  const [passkeys, setPasskeys] = useState<{ id: string; name: string; device_type: string | null; backed_up: boolean; created_at: string; last_used_at: string | null }[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyRegistering, setPasskeyRegistering] = useState(false);
  const [passkeyNewName, setPasskeyNewName] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState('');

  // Security (TOTP) tab state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpStatusLoaded, setTotpStatusLoaded] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ otpauth_uri: string; secret: string } | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpShowDisable, setTotpShowDisable] = useState(false);
  const [totpDisablePassword, setTotpDisablePassword] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const [totpError, setTotpError] = useState('');

  const loadTotpStatus = async () => {
    try {
      const res = await totpAPI.getStatus();
      setTotpError('');
      setTotpEnabled(res.data?.data?.totp_enabled || false);
      setTotpStatusLoaded(true);
    } catch (err: any) {
      setTotpEnabled(false);
      setTotpError(err?.response?.data?.error || '');
      setTotpStatusLoaded(true);
    }
  };

  const handleTotpSetup = async () => {
    setTotpError('');
    setTotpMsg('');
    setTotpLoading(true);
    try {
      const res = await totpAPI.setup();
      setTotpSetupData(res.data?.data || null);
      setTotpVerifyCode('');
    } catch (err: any) {
      setTotpError(err?.response?.data?.error || 'Failed to start TOTP setup.');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTotpVerify = async () => {
    setTotpError('');
    setTotpLoading(true);
    try {
      const res = await totpAPI.verify({ code: totpVerifyCode });
      setTotpEnabled(true);
      setTotpSetupData(null);
      setTotpVerifyCode('');
      setTotpBackupCodes(res.data?.data?.backup_codes || []);
      setTotpMsg('Two-factor authentication enabled successfully.');
    } catch (err: any) {
      setTotpError(err?.response?.data?.error || 'Verification failed. Check your code and try again.');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTotpDisable = async () => {
    setTotpError('');
    setTotpLoading(true);
    try {
      await totpAPI.disable({ password: totpDisablePassword });
      setTotpEnabled(false);
      setTotpShowDisable(false);
      setTotpDisablePassword('');
      setTotpBackupCodes([]);
      setTotpMsg('Two-factor authentication has been disabled.');
    } catch (err: any) {
      setTotpError(err?.response?.data?.error || 'Failed to disable TOTP. Check your password.');
    } finally {
      setTotpLoading(false);
    }
  };

  const loadPasskeys = async () => {
    if (!canUsePasskeys) {
      setPasskeys([]);
      return;
    }
    try {
      setPasskeyLoading(true);
      const res = await passkeyAPI.list();
      setPasskeys(res.data?.data || []);
    } catch {
      // silently fail
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyError('');
    setPasskeySuccess('');
    setPasskeyRegistering(true);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const optRes = await passkeyAPI.getRegistrationOptions();
      const options = optRes.data?.data;
      const attResp = await startRegistration({ optionsJSON: options });
      await passkeyAPI.verifyRegistration({ response: attResp, name: passkeyNewName || 'Passkey' });
      setPasskeySuccess('Passkey registered successfully.');
      setPasskeyNewName('');
      await loadPasskeys();
    } catch (err: any) {
      setPasskeyError(err?.response?.data?.error || err?.message || 'Registration failed.');
    } finally {
      setPasskeyRegistering(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    try {
      await passkeyAPI.delete(id);
      setPasskeys(prev => prev.filter(pk => pk.id !== id));
    } catch (err: any) {
      setPasskeyError(err?.response?.data?.error || 'Failed to delete passkey.');
    }
  };

  // SSO config state
  const [ssoConfig, setSsoConfig] = useState<any>(null);
  const [ssoSaving, setSsoSaving] = useState(false);
  const [ssoMsg, setSsoMsg] = useState('');
  const [socialLogins, setSocialLogins] = useState<{ id: string; provider: string; email: string | null }[]>([]);

  const loadSsoConfig = async () => {
    if (!canUseSso) {
      setSsoConfig(null);
      return;
    }
    try {
      const res = await ssoAPI.getConfig();
      setSsoConfig(res.data?.data || null);
    } catch { /* not configured */ }
  };

  const loadSocialLogins = async () => {
    try {
      const res = await ssoAPI.getSocialLogins();
      setSocialLogins(res.data?.data || []);
    } catch { /* silently fail */ }
  };

  const handleSsoSave = async () => {
    if (!ssoConfig) return;
    setSsoSaving(true);
    setSsoMsg('');
    try {
      await ssoAPI.saveConfig(ssoConfig);
      setSsoMsg('SSO configuration saved.');
    } catch (err: any) {
      setSsoMsg(err?.response?.data?.error || 'Failed to save SSO config.');
    } finally {
      setSsoSaving(false);
    }
  };

  const handleUnlinkSocial = async (provider: string) => {
    try {
      await ssoAPI.unlinkSocial(provider);
      setSocialLogins(prev => prev.filter(s => s.provider !== provider));
    } catch { /* silently fail */ }
  };

  // SIEM state
  const [siemConfigs, setSiemConfigs] = useState<any[]>([]);
  const [siemLoading, setSiemLoading] = useState(false);
  const [siemMsg, setSiemMsg] = useState('');
  const [showSiemForm, setShowSiemForm] = useState(false);
  const [siemFormData, setSiemFormData] = useState<any>({ provider: 'webhook', name: '', enabled: true });
  const [siemTestingId, setSiemTestingId] = useState<string | null>(null);

  const loadSiemConfigs = async () => {
    if (!canUseSiem) {
      setSiemConfigs([]);
      return;
    }
    try {
      setSiemLoading(true);
      const res = await siemAPI.list();
      setSiemConfigs(res.data?.data || []);
    } catch { /* silently fail */ } finally { setSiemLoading(false); }
  };

  const handleSiemCreate = async () => {
    setSiemMsg('');
    try {
      await siemAPI.create(siemFormData);
      setSiemMsg('SIEM integration added.');
      setShowSiemForm(false);
      setSiemFormData({ provider: 'webhook', name: '', enabled: true });
      await loadSiemConfigs();
    } catch (err: any) { setSiemMsg(err?.response?.data?.error || 'Failed to save.'); }
  };

  const handleSiemDelete = async (id: string) => {
    try {
      await siemAPI.delete(id);
      setSiemConfigs(prev => prev.filter(s => s.id !== id));
    } catch (err: any) { setSiemMsg(err?.response?.data?.error || 'Failed to delete.'); }
  };

  const handleSiemTest = async (id: string) => {
    setSiemTestingId(id);
    setSiemMsg('');
    try {
      await siemAPI.test(id);
      setSiemMsg('Test event sent successfully.');
    } catch (err: any) { setSiemMsg(err?.response?.data?.error || 'Test failed.'); } finally { setSiemTestingId(null); }
  };

  const loadPlatformOverview = async () => {
    if (!canAccessPlatformAdmin) return;
    try {
      setPlatformOverviewLoading(true);
      setPlatformOverviewError('');
      const res = await opsAPI.getOverview();
      setPlatformOverview(res.data?.data || null);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to load operations overview';
      setPlatformOverviewError(errorMsg);
      console.error('Platform overview error:', err);
    } finally {
      setPlatformOverviewLoading(false);
    }
  };

  const loadPlatformLlmDefaults = async () => {
    if (!canAccessPlatformAdmin) return;
    try {
      setPlatformLlmLoading(true);
      const res = await platformAdminAPI.getLlmDefaults();
      const data = res.data?.data;
      setPlatformLlmSettings(data || null);
      const loadedProvider = data?.defaultProvider || 'claude';
      const loadedModel = data?.defaultModel || '';
      setPlatformDefaultProvider(loadedProvider);
      setPlatformDefaultModel(loadedModel);
      setPlatformUseCustomModel(Boolean(
        loadedModel && !(providerModels[loadedProvider] || []).includes(loadedModel)
      ));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load platform LLM defaults');
    } finally {
      setPlatformLlmLoading(false);
    }
  };

  const savePlatformLlmDefaults = async () => {
    if (!canAccessPlatformAdmin) return;
    try {
      setPlatformLlmSaving(true);
      await platformAdminAPI.updateLlmDefaults({
        default_provider: platformDefaultProvider,
        default_model: platformDefaultModel || '',
        anthropic_api_key: platformAnthropicKey || undefined,
        openai_api_key: platformOpenaiKey || undefined,
        gemini_api_key: platformGeminiKey || undefined,
        xai_api_key: platformGrokKey || undefined,
        groq_api_key: platformGroqKey || undefined,
        ollama_base_url: platformOllamaUrl || undefined
      });
      showToast('Platform LLM defaults saved');
      setPlatformAnthropicKey('');
      setPlatformOpenaiKey('');
      setPlatformGeminiKey('');
      setPlatformGrokKey('');
      setPlatformGroqKey('');
      setPlatformOllamaUrl('');
      await loadPlatformLlmDefaults();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save platform LLM defaults');
    } finally {
      setPlatformLlmSaving(false);
    }
  };

  const loadSmtpConfig = async () => {
    if (!canManageSettings) return;
    try {
      const res = await settingsAPI.getSmtpConfig();
      const d = res.data?.data || {};
      setSmtpHost(d.smtp_host || '');
      setSmtpPort(d.smtp_port || '587');
      setSmtpUser(d.smtp_user || '');
      setSmtpPass(d.smtp_pass || '');
      setSmtpFromEmail(d.smtp_from_email || '');
      setSmtpConfigured(Boolean(d.configured));
      setSmtpSource(d.source || 'none');
    } catch { /* ignore */ }
  };

  const loadUpdateCheck = async () => {
    if (!canAccessPlatformAdmin) return;
    setUpdateCheckLoading(true);
    setUpdateCheckError('');
    try {
      const res = await licenseAPI.checkUpdates();
      setUpdateCheckData(res.data?.data || null);
    } catch (err: any) {
      setUpdateCheckError(err.response?.data?.error || 'Failed to check for updates');
    } finally {
      setUpdateCheckLoading(false);
    }
  };

  const saveSmtpConfig = async () => {
    setSmtpSaving(true);
    setSmtpMsg('');
    try {
      await settingsAPI.updateSmtpConfig({
        smtp_host: smtpHost || null,
        smtp_port: smtpPort || null,
        smtp_user: smtpUser || null,
        smtp_pass: smtpPass || null,
        smtp_from_email: smtpFromEmail || null,
      });
      setSmtpMsg('SMTP settings saved.');
      await loadSmtpConfig();
    } catch (err: any) {
      setSmtpMsg(err.response?.data?.error || 'Failed to save SMTP settings');
    } finally {
      setSmtpSaving(false);
    }
  };

  const testSmtpConfig = async () => {
    if (!smtpTestEmail) return;
    setSmtpTesting(true);
    setSmtpMsg('');
    try {
      const res = await settingsAPI.testSmtp(smtpTestEmail);
      setSmtpMsg(res.data?.message || 'Test email sent!');
    } catch (err: any) {
      setSmtpMsg(err.response?.data?.error || 'SMTP test failed');
    } finally {
      setSmtpTesting(false);
    }
  };

  const handlePlatformAction = async (action: 'process_jobs' | 'run_retention' | 'process_webhooks') => {
    setPlatformActionLoading(action);
    setPlatformActionMsg('');
    try {
      if (action === 'process_jobs') await opsAPI.processJobs({ limit: 25 });
      if (action === 'run_retention') await opsAPI.runRetention();
      if (action === 'process_webhooks') await opsAPI.processWebhooks({ limit: 50 });
      setPlatformActionMsg('Done.');
      // Reload overview after action completes
      await loadPlatformOverview();
    } catch (err: any) {
      setPlatformActionMsg(err.response?.data?.error || 'Operation failed.');
    } finally {
      setPlatformActionLoading('');
    }
  };

  const handleBootstrapPlatformAdmin = async () => {
    const email = bootstrapEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      setBootstrapMsg('Enter a valid email.');
      return;
    }
    if (bootstrapPassword.length < 15) {
      setBootstrapMsg('Password must be at least 15 characters.');
      return;
    }

    try {
      setBootstrapLoading(true);
      setBootstrapMsg('');
      const res = await api.post('/platform-admin/bootstrap-account', {
        email,
        password: bootstrapPassword,
        first_name: bootstrapFirstName.trim() || 'Platform',
        last_name: bootstrapLastName.trim() || 'Admin'
      });
      const status = res.data?.data?.status || 'updated';
      setBootstrapMsg(`Platform admin account ${status}: ${res.data?.data?.email || email}`);
      setBootstrapPassword('');
    } catch (err: any) {
      setBootstrapMsg(err.response?.data?.error || 'Failed to bootstrap platform admin account');
    } finally {
      setBootstrapLoading(false);
    }
  };

  const [aiActivityError, setAiActivityError] = useState('');

  const loadAiActivity = async (page = 1) => {
    if (!canManageSettings) return;
    try {
      setAiActivityLoading(true);
      setAiActivityError('');
      const res = await api.get(`/ai/usage-report?page=${page}&limit=${AI_ACTIVITY_LIMIT}`);
      setAiActivityRows(res.data?.data || []);
      setAiActivityTotal(res.data.pagination?.total || 0);
      setAiActivityPage(page);
    } catch (err: any) {
      setAiActivityError(err.response?.data?.error || 'Failed to load AI activity logs');
    } finally {
      setAiActivityLoading(false);
    }
  };

  const syncInitialSettingsState = useEffectEvent(() => {
    const tabParam = searchParams?.get('tab');
    const validTabs: SettingsTab[] = ['security', 'notifications'];
    if (canManageRoles) validTabs.unshift('roles');
    if (canManageSettings) validTabs.unshift('llm', 'ai_activity', 'automation', 'content', 'audit', 'account');
    if (canUseIntegrations) validTabs.push('integrations');
    if (canAccessPlatformAdmin) validTabs.push('platform');

    if (tabParam && validTabs.includes(tabParam as SettingsTab)) {
      setActiveTab(tabParam as SettingsTab);
    } else {
      setActiveTab(defaultTab);
    }
    if (canManageRoles) {
      loadRoles();
    } else {
      setLoading(false);
    }

    if (canManageSettings) {
      loadLLMSettings();
      loadContentPacks();
      loadContentPackDrafts();
      if (canUseSplunk) {
        loadSplunkSettings();
      } else {
        setSplunkSettings(null);
      }
    } else {
      setLlmLoading(false);
    }
  });


  const syncActiveTabData = useEffectEvent(() => {
    if (activeTab === 'ai_activity' && canManageSettings && aiActivityRows.length === 0) {
      loadAiActivity(1);
      loadAiDecisions(1);
    }
    if (activeTab === 'security' && canUsePasskeys && passkeys.length === 0) {
      loadPasskeys();
    }
    if (activeTab === 'security') {
      loadSocialLogins();
      if (canUseSso) {
        loadSsoConfig();
      }
    }
    if (activeTab === 'security' && !totpStatusLoaded) {
      loadTotpStatus();
    }
    if (activeTab === 'integrations' && canUseSiem && siemConfigs.length === 0) {
      loadSiemConfigs();
    }
    if (activeTab === 'integrations' && canManageSettings && !trustCenterConfig && !trustCenterLoading) {
      loadTrustCenterConfig();
    }
    if (activeTab === 'notifications' && notifPrefs.length === 0) {
      loadNotifPrefs();
    }
    if (activeTab === 'notifications' && canManageSettings && !smtpConfigured && smtpHost === '') {
      loadSmtpConfig();
    }
    if (activeTab === 'roles' && canManageUsers && pendingInvites.length === 0) {
      loadInvites();
    }
    if (activeTab === 'platform' && canAccessPlatformAdmin) {
      if (!platformOverview && !platformOverviewLoading) {
        loadPlatformOverview();
      }
      if (!platformLlmSettings && !platformLlmLoading) {
        loadPlatformLlmDefaults();
      }
      if (!updateCheckData && !updateCheckLoading) {
        loadUpdateCheck();
      }
    }
  });

  useEffect(() => {
    syncInitialSettingsState();
  }, [defaultTab, canManageRoles, canManageSettings, canUseSplunk, canUseIntegrations, canAccessPlatformAdmin, searchParams]);

  // Load data when tabs are first opened
  useEffect(() => {
    syncActiveTabData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'audit' && canManageSettings) {
      loadAuditLogs(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canManageSettings, auditQueryKey]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ===== ACCOUNT MANAGEMENT =====
  const handleCancelAccount = async () => {
    if (!canManageSettings || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await settingsAPI.cancelAccount({ reason: cancelReason.trim(), confirm: true });
      showToast('Account cancelled. Downgraded to Free tier.');
      setCancelModalOpen(false);
      setCancelReason('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cancel account');
    } finally {
      setCancelling(false);
    }
  };

  const handleExportData = async () => {
    if (!canManageSettings) return;
    setExporting(true);
    try {
      const response = await settingsAPI.exportAccountData();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `controlweave-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Data export downloaded');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // ===== INVITES =====
  const loadInvites = async () => {
    if (!canManageUsers) return;
    try {
      const res = await usersAPI.getInvites();
      setPendingInvites((res as any).data?.data || []);
    } catch {
      // Non-critical — silently fail
    }
  };

  const sendInvite = async () => {
    if (!canManageUsers || !inviteEmail.trim()) return;
    setSendingInvite(true);
    try {
      const res = await usersAPI.invite({
        email: inviteEmail.trim(),
        primary_role: invitePrimaryRole,
        role_ids: inviteRoleIds.length > 0 ? inviteRoleIds : undefined,
      });
      const data = (res as any).data?.data;
      const inviteUrl = `${window.location.origin}${data?.invite_url || ''}`;
      setLastInviteUrl(inviteUrl);
      setInviteEmail('');
      setInviteRoleIds([]);
      showToast('Invite sent');
      loadInvites();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      await usersAPI.revokeInvite(inviteId);
      showToast('Invite revoked');
      loadInvites();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke invite');
    }
  };

  // ===== ROLES =====
  const loadTeamUsers = async () => {
    if (!canReadUsers) {
      setTeamUsers([]);
      setUserRoleSelections({});
      return;
    }

    const usersRes = await usersAPI.getOrgUsers();
    const users: TeamUser[] = usersRes.data?.data || [];
    setTeamUsers(users);

    const roleEntries = await Promise.all(
      users.map(async (teamUser) => {
        try {
          const userRolesRes = await rolesAPI.getUserRoles(teamUser.id);
          const roleIds = Array.isArray(userRolesRes.data?.data)
            ? userRolesRes.data?.data?.map((role: Role) => role.id)
            : [];
          return [teamUser.id, roleIds] as const;
        } catch (error) {
          return [teamUser.id, []] as const;
        }
      })
    );

    const selectionMap: Record<string, string[]> = {};
    for (const [userId, roleIds] of roleEntries) {
      selectionMap[userId] = roleIds;
    }
    setUserRoleSelections(selectionMap);
  };

  const loadRoles = async () => {
    if (!canManageRoles) {
      setLoading(false);
      return;
    }
    try {
      const [rolesRes, permsRes] = await Promise.all([
        rolesAPI.getAll(),
        rolesAPI.getAllPermissions()
      ]);
      setRoles(rolesRes.data?.data || []);
      setAllPermissions(permsRes.data?.data);
      await loadTeamUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load roles and team users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!canManageRoles) return;
    if (!newRoleName.trim()) return;
    try {
      await rolesAPI.create({ name: newRoleName.trim(), description: newRoleDesc.trim(), permissions: newRolePerms });
      showToast(`Role "${newRoleName}" created`);
      setCreateModalOpen(false);
      setNewRoleName(''); setNewRoleDesc(''); setNewRolePerms([]);
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create role');
    }
  };

  const handleEdit = async () => {
    if (!canManageRoles) return;
    if (!editRole) return;
    try {
      await rolesAPI.update(editRole.id, { name: editRole.name, description: editRole.description, permissions: editPerms });
      showToast('Role updated');
      setEditRole(null);
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageRoles) return;
    try {
      await rolesAPI.remove(id);
      showToast('Role deleted');
      setDeleteRoleId(null);
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete role');
      setDeleteRoleId(null);
    }
  };

  const provisionRecommendedRole = async (template: typeof RECOMMENDED_ROLES[number]) => {
    if (!canManageRoles) return;
    try {
      await rolesAPI.create({
        name: template.name,
        description: template.description,
        permissions: template.permissions,
      });
      showToast(`Role "${template.name}" created`);
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create role');
    }
  };

  const createUser = async () => {
    if (!canManageUsers) {
      setError('You need users.manage permission to create team members');
      return;
    }
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      setError('Name, email, and password are required to create a user');
      return;
    }

    try {
      setCreatingUser(true);
      await usersAPI.create({
        full_name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        password: newUserPassword,
        primary_role: newUserPrimaryRole,
        auto_generate_auditor_subroles: true
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPrimaryRole('user');
      showToast('Team member created');
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const saveUserRoles = async (userId: string) => {
    const selectedRoleIds = userRoleSelections[userId] || [];
    if (selectedRoleIds.length === 0) {
      setError('Select at least one role for the user');
      return;
    }

    try {
      setSavingUserRoles(userId);
      await rolesAPI.assignRole({
        userId,
        roleIds: selectedRoleIds
      });
      showToast('User roles updated');
      await loadTeamUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user roles');
    } finally {
      setSavingUserRoles(null);
    }
  };

  const toggleUserActive = async (teamUser: TeamUser) => {
    if (!canManageUsers) {
      setError('You need users.manage permission to activate or deactivate users');
      return;
    }
    try {
      setUpdatingUser(teamUser.id);
      await usersAPI.update(teamUser.id, {
        is_active: !teamUser.is_active
      });
      showToast(teamUser.is_active ? 'User deactivated' : 'User activated');
      await loadTeamUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user status');
    } finally {
      setUpdatingUser(null);
    }
  };

  const bootstrapAuditorSubroles = async () => {
    try {
      setCreatingAuditorSubroles(true);
      await rolesAPI.bootstrapAuditorSubroles();
      showToast('Auditor sub-roles are ready');
      await loadRoles();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate auditor sub-roles');
    } finally {
      setCreatingAuditorSubroles(false);
    }
  };

  const togglePerm = (perms: string[], setPerms: (p: string[]) => void, perm: string) => {
    setPerms(perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm]);
  };

  const cloneRole = (role: Role) => {
    setNewRoleName(`${role.name} (copy)`);
    setNewRoleDesc(role.description || '');
    setNewRolePerms([...(role.permissions || [])]);
    setViewRole(null);
    setCreateModalOpen(true);
  };

  // ===== LLM Settings =====
  const loadLLMSettings = async () => {
    if (!canManageSettings) {
      setLlmLoading(false);
      return;
    }
    // Fetch provider model lists from the backend (single source of truth),
    // merging over the local fallback so the dropdowns stay populated even
    // when the status call fails.
    let mergedModels: Record<string, string[]> = { ...PROVIDER_MODEL_OPTIONS };
    try {
      const statusRes = await aiAPI.getStatus();
      const apiProviders: Record<string, { models?: string[] }> = statusRes.data?.data?.providers || {};
      for (const [provider, info] of Object.entries(apiProviders)) {
        if (Array.isArray(info.models) && info.models.length > 0) {
          mergedModels[provider] = info.models;
        }
      }
      setProviderModels(mergedModels);
    } catch {
      // keep local fallback
    }
    try {
      setLlmLoading(true);
      const res = await settingsAPI.getLLMConfig();
      const llmData = res.data?.data;
      setLlmSettings(llmData);
      const loadedProvider = llmData?.defaultProvider || 'claude';
      const loadedModel = llmData?.defaultModel || '';
      setDefaultProvider(loadedProvider);
      setDefaultModel(loadedModel);
      setUseCustomDefaultModel(Boolean(
        loadedModel && !(mergedModels[loadedProvider] || []).includes(loadedModel)
      ));
      setApplyAllFrameworkGuardrails(Boolean(llmData?.applyAllFrameworkGuardrails));
    } catch (err: any) {
      // OK if settings don't exist yet
    } finally {
      setLlmLoading(false);
    }
    // Also load crosswalk threshold
    try {
      const cfgRes = await dynamicConfigAPI.get('crosswalk', 'inheritance_min_similarity');
      const val = cfgRes.data?.data?.value;
      if (typeof val === 'number' && val >= 50 && val <= 100) {
        setCrosswalkThreshold(val);
      }
    } catch {
      // keep default 90
    }
  };

  const saveCrosswalkThreshold = async () => {
    if (!canManageSettings) return;
    setCrosswalkThresholdSaving(true);
    setCrosswalkThresholdMsg('');
    try {
      await dynamicConfigAPI.set('crosswalk', 'inheritance_min_similarity', crosswalkThreshold);
      setCrosswalkThresholdMsg('Saved!');
    } catch {
      setCrosswalkThresholdMsg('Failed to save.');
    } finally {
      setCrosswalkThresholdSaving(false);
      setTimeout(() => setCrosswalkThresholdMsg(''), 3000);
    }
  };

  const saveLLMSettings = async () => {
    if (!canManageSettings) return;
    try {
      const data: any = { default_provider: defaultProvider, apply_all_framework_guardrails: applyAllFrameworkGuardrails };
      if (defaultModel) data.default_model = defaultModel;
      if (anthropicKey) data.anthropic_api_key = anthropicKey;
      if (openaiKey) data.openai_api_key = openaiKey;
      if (geminiKey) data.gemini_api_key = geminiKey;
      if (grokKey) data.xai_api_key = grokKey;
      if (groqKey) data.groq_api_key = groqKey;
      if (ollamaUrl) data.ollama_base_url = ollamaUrl;
      await settingsAPI.updateLLMConfig(data);
      showToast('LLM settings saved');
      setAnthropicKey('');
      setOpenaiKey('');
      setGeminiKey('');
      setGrokKey('');
      setGroqKey('');
      setOllamaUrl('');
      loadLLMSettings();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save LLM settings');
    }
  };

  const testKey = async (provider: string, key: string) => {
    if (!canManageSettings) return;
    const hasExisting =
      (provider === 'claude' && llmSettings?.hasAnthropicKey) ||
      (provider === 'openai' && llmSettings?.hasOpenAIKey) ||
      (provider === 'gemini' && llmSettings?.hasGeminiKey) ||
      (provider === 'grok' && llmSettings?.hasGrokKey) ||
      (provider === 'groq' && llmSettings?.hasGroqKey) ||
      (provider === 'ollama' && llmSettings?.hasOllamaUrl);

    if (!key && !hasExisting) {
      setError('Enter an API key first');
      return;
    }
    setTestingProvider(provider);
    try {
      if (!key) {
        showToast('Key already configured - save new key to test it');
        return;
      }
      await settingsAPI.testLLMKey({ provider, apiKey: key });
      showToast(`${provider} key verified!`);
    } catch (err: any) {
      setError(err.response?.data?.details || err.response?.data?.error || 'Key validation failed');
    } finally {
      setTestingProvider(null);
    }
  };

  const removeKey = async (provider: string) => {
    if (!canManageSettings) return;
    try {
      await settingsAPI.removeLLMKey(provider);
      showToast(`${provider} key removed`);
      loadLLMSettings();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove key');
    }
  };

  const loadContentPacks = async () => {
    if (!canManageSettings) return;
    try {
      const res = await settingsAPI.getContentPacks();
      setContentPacks(res.data?.data || []);
    } catch (err: any) {
      // Ignore for older deployments lacking migration.
    }
  };

  const loadContentPackDrafts = async () => {
    if (!canManageSettings) return;
    try {
      const res = await settingsAPI.getContentPackDrafts();
      const drafts: ContentPackDraft[] = res.data?.data || [];
      setContentPackDrafts(drafts);
      if (selectedDraftId && !drafts.find((draft) => draft.id === selectedDraftId)) {
        setSelectedDraftId(null);
        setSelectedDraftJson('');
      }
    } catch (err: any) {
      // Ignore for older deployments lacking migration.
    }
  };

  const loadDraftDetail = async (draftId: string) => {
    if (!canManageSettings) return;
    setDraftLoadingId(draftId);
    try {
      const res = await settingsAPI.getContentPackDraft(draftId);
      const draft = res.data?.data;
      setSelectedDraftId(draftId);
      setSelectedDraftReviewRequired(Boolean(draft?.review_required));
      setSelectedDraftJson(JSON.stringify(draft?.draft_pack || {}, null, 2));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load draft details');
    } finally {
      setDraftLoadingId(null);
    }
  };

  const uploadContentPackDraft = async () => {
    if (!canManageSettings) return;
    if (!draftReportFile) {
      setError('Select a report file to upload.');
      return;
    }
    if (!draftFrameworkCode.trim()) {
      setError('Framework code is required (example: iso_27001).');
      return;
    }

    setDraftUploading(true);
    try {
      const formData = new FormData();
      formData.append('report', draftReportFile);
      formData.append('framework_code', draftFrameworkCode.trim());
      if (draftPackName.trim()) formData.append('pack_name', draftPackName.trim());
      if (draftPackVersion.trim()) formData.append('pack_version', draftPackVersion.trim());
      if (draftSourceVendor.trim()) formData.append('source_vendor', draftSourceVendor.trim());
      if (draftLicenseReference.trim()) formData.append('license_reference', draftLicenseReference.trim());
      formData.append('review_required', String(draftReviewRequired));
      formData.append('ai_assist', String(draftAiAssist));
      if (draftProvider.trim()) formData.append('provider', draftProvider.trim());
      if (draftModel.trim()) formData.append('model', draftModel.trim());

      const res = await settingsAPI.uploadContentPackDraft(formData);
      showToast('Draft created from report upload');
      await loadContentPackDrafts();
      const draftId = res.data?.data?.id;
      if (draftId) {
        await loadDraftDetail(draftId);
      }
      setDraftReportFile(null);
      setDraftPackName('');
      setDraftPackVersion('');
      setDraftSourceVendor('');
      setDraftLicenseReference('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload and draft content pack');
    } finally {
      setDraftUploading(false);
    }
  };

  const saveSelectedDraft = async () => {
    if (!canManageSettings || !selectedDraftId) return;
    setDraftSaving(true);
    try {
      const parsedPack = JSON.parse(selectedDraftJson);
      await settingsAPI.updateContentPackDraft(selectedDraftId, {
        pack: parsedPack,
        review_required: selectedDraftReviewRequired
      });
      showToast('Draft updated');
      await loadContentPackDrafts();
      await loadDraftDetail(selectedDraftId);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError('Draft JSON is invalid.');
      } else {
        setError(err.response?.data?.error || 'Failed to save draft');
      }
    } finally {
      setDraftSaving(false);
    }
  };

  const attestDraft = async (draftId: string) => {
    if (!canManageSettings) return;
    setDraftActionId(draftId);
    try {
      await settingsAPI.attestContentPackDraft(draftId, { confirm: true });
      showToast('Licensing attestation recorded');
      await loadContentPackDrafts();
      if (selectedDraftId === draftId) {
        await loadDraftDetail(draftId);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to attest draft');
    } finally {
      setDraftActionId(null);
    }
  };

  const reviewDraft = async (draftId: string, action: 'approve' | 'reject') => {
    if (!canManageSettings) return;
    setDraftActionId(draftId);
    try {
      await settingsAPI.reviewContentPackDraft(draftId, { action });
      showToast(action === 'approve' ? 'Draft approved' : 'Draft rejected');
      await loadContentPackDrafts();
      if (selectedDraftId === draftId) {
        await loadDraftDetail(draftId);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update review status');
    } finally {
      setDraftActionId(null);
    }
  };

  const importDraft = async (draftId: string) => {
    if (!canManageSettings) return;
    setDraftActionId(draftId);
    try {
      const res = await settingsAPI.importContentPackDraft(draftId);
      const summary = res.data?.data?.import?.summary;
      showToast(
        summary
          ? `Draft imported (${summary.controls_applied} control overrides, ${summary.procedures_applied} procedure overrides)`
          : 'Draft imported'
      );
      await Promise.all([loadContentPackDrafts(), loadContentPacks()]);
      if (selectedDraftId === draftId) {
        await loadDraftDetail(draftId);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to import draft');
    } finally {
      setDraftActionId(null);
    }
  };

  const importContentPack = async () => {
    if (!canManageSettings) return;
    if (!contentPackJson.trim()) {
      setError('Paste a content pack JSON payload first.');
      return;
    }
    setContentPackImporting(true);
    try {
      const parsed = JSON.parse(contentPackJson);
      const payload = parsed?.pack ? parsed : { pack: parsed };
      const res = await settingsAPI.importContentPack(payload);
      const summary = res.data?.data?.summary;
      showToast(
        summary
          ? `Pack imported (${summary.controls_applied} control overrides, ${summary.procedures_applied} procedure overrides)`
          : 'Content pack imported'
      );
      setContentPackJson('');
      await loadContentPacks();
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format for content pack.');
      } else {
        setError(err.response?.data?.error || 'Failed to import content pack');
      }
    } finally {
      setContentPackImporting(false);
    }
  };

  const loadContentPackTemplate = async () => {
    if (!canManageSettings) return;
    setContentPackTemplateLoading(true);
    try {
      const res = await settingsAPI.getContentPackTemplate();
      setContentPackJson(JSON.stringify({ pack: res.data?.data || {} }, null, 2));
      showToast('Content pack template loaded');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load content pack template');
    } finally {
      setContentPackTemplateLoading(false);
    }
  };

  const removeContentPack = async (id: string) => {
    if (!canManageSettings) return;
    try {
      await settingsAPI.deleteContentPack(id);
      showToast('Content pack removed');
      await loadContentPacks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove content pack');
    }
  };

  const loadSplunkSettings = async () => {
    if (!canUseSplunk) {
      setSplunkSettings(null);
      return;
    }
    try {
      const res = await integrationsAPI.getSplunkConfig();
      const data = res.data?.data;
      setSplunkSettings(data);
      setSplunkBaseUrl(data?.base_url || '');
      setSplunkDefaultIndex(data?.default_index || '');
    } catch (err: any) {
      // Silent fallback in case endpoint is unavailable in older deployments.
    }
  };

  const saveSplunkSettings = async () => {
    if (!canUseSplunk) return;
    try {
      setSplunkSaving(true);
      const payload: { base_url?: string | null; api_token?: string | null; default_index?: string | null } = {
        base_url: splunkBaseUrl || null,
        default_index: splunkDefaultIndex || null
      };
      if (splunkApiToken) payload.api_token = splunkApiToken;

      await integrationsAPI.updateSplunkConfig(payload);
      setSplunkApiToken('');
      showToast('Splunk settings saved');
      await loadSplunkSettings();
    } catch (err: any) {
      setError(err.response?.data?.details || err.response?.data?.error || 'Failed to save Splunk settings');
    } finally {
      setSplunkSaving(false);
    }
  };

  const testSplunkSettings = async () => {
    if (!canUseSplunk) return;
    try {
      setSplunkTesting(true);
      await integrationsAPI.testSplunkConfig({
        base_url: splunkBaseUrl || undefined,
        api_token: splunkApiToken || undefined,
        default_index: splunkDefaultIndex || undefined
      });
      showToast('Splunk connection verified');
    } catch (err: any) {
      setError(err.response?.data?.details || err.response?.data?.error || 'Splunk connection test failed');
    } finally {
      setSplunkTesting(false);
    }
  };

  const removeSplunkSettings = async () => {
    if (!canUseSplunk) return;
    try {
      await integrationsAPI.removeSplunkConfig();
      setSplunkApiToken('');
      setSplunkBaseUrl('');
      setSplunkDefaultIndex('');
      showToast('Splunk settings removed');
      await loadSplunkSettings();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove Splunk settings');
    }
  };

  const applyTrustCenterConfig = (data: TrustCenterConfig) => {
    setTrustCenterConfig(data);
    setTcEnabled(Boolean(data.enabled));
    setTcDisplayName(data.display_name || '');
    setTcDescription(data.description || '');
    setTcContactEmail(data.contact_email || '');
    setTcShowFrameworks(Boolean(data.show_frameworks));
    setTcShowComplianceScores(Boolean(data.show_compliance_scores));
    setTcShowAuthorizations(Boolean(data.show_authorizations));
  };

  const loadTrustCenterConfig = async () => {
    try {
      setTrustCenterLoading(true);
      const res = await trustCenterAPI.getConfig();
      const data = res.data?.data;
      if (data) applyTrustCenterConfig(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load Trust Center configuration');
    } finally {
      setTrustCenterLoading(false);
    }
  };

  const saveTrustCenterConfig = async () => {
    if (!canManageSettings) return;
    setTrustCenterSaving(true);
    setTrustCenterMsg('');
    try {
      const res = await trustCenterAPI.updateConfig({
        enabled: tcEnabled,
        display_name: tcDisplayName || null,
        description: tcDescription || null,
        contact_email: tcContactEmail || null,
        show_frameworks: tcShowFrameworks,
        show_compliance_scores: tcShowComplianceScores,
        show_authorizations: tcShowAuthorizations
      });
      const data = res.data?.data;
      if (data) applyTrustCenterConfig(data);
      setTrustCenterMsg('Saved!');
    } catch (err: any) {
      setTrustCenterMsg(err.response?.data?.error || 'Failed to save.');
    } finally {
      setTrustCenterSaving(false);
      setTimeout(() => setTrustCenterMsg(''), 3000);
    }
  };

  const regenerateTrustCenterToken = async () => {
    if (!canManageSettings) return;
    if (!confirm('Regenerating the token will invalidate the current public Trust Center URL. Continue?')) return;
    setTrustCenterRegenerating(true);
    try {
      await trustCenterAPI.regenerateToken();
      await loadTrustCenterConfig();
      showToast('Trust Center token regenerated');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to regenerate Trust Center token');
    } finally {
      setTrustCenterRegenerating(false);
    }
  };

  const copyTrustCenterUrl = async () => {
    if (!trustCenterConfig) return;
    const url = `${window.location.origin}/trust/${trustCenterConfig.public_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setTrustCenterCopied(true);
      setTimeout(() => setTrustCenterCopied(false), 2000);
    } catch {
      // Clipboard access denied — silently ignore.
    }
  };

  const PermissionCheckboxes = ({ selected, onToggle }: { selected: string[]; onToggle: (perm: string) => void }) => (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
      {Object.entries(allPermissions).map(([resource, perms]) => (
        <div key={resource}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{resource}</p>
          <div className="grid grid-cols-2 gap-1">
            {perms.map((p) => (
              <label key={p.name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(p.name)} onChange={() => onToggle(p.name)} className="rounded" />
                <span className="text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (!canManageRoles && !canManageSettings) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-2">{APP_POSITIONING_SHORT}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
            You do not currently have access to organization settings. Ask an administrator to grant
            <code className="mx-1">roles.manage</code>
            or
            <code className="mx-1">settings.manage</code>
            permissions.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div className="fixed top-6 right-6 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50">{toast}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
            <button onClick={() => setError('')} className="float-right text-red-500 hover:text-red-700">x</button>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">{APP_POSITIONING_SHORT}</p>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-900">
          Framework selection and organization boundary details are managed in{' '}
          <a href="/dashboard/organization" className="font-semibold underline hover:text-indigo-700">
            Organization Profile
          </a>
          .
        </div>

        {/* Open Source Notice */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex flex-wrap items-center gap-2 justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Open Source</h2>
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
              All features unlocked
            </span>
          </div>
          <p className="text-sm text-gray-600">
            ControlWeaver is open source (AGPL v3). All features are available to all authenticated users — no subscription required.
          </p>

        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {canManageRoles && (
              <button
                onClick={() => setActiveTab('roles')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'roles' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Roles & Permissions
              </button>
            )}
            {canManageSettings && (
              <button
                onClick={() => setActiveTab('llm')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'llm' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                LLM Configuration
              </button>
            )}
            {canManageSettings && (
              <button
                onClick={() => setActiveTab('ai_activity')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'ai_activity' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                AI Activity & Decisions
              </button>
            )}
            {canManageSettings && (
              <button
                onClick={() => setActiveTab('automation')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'automation' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Automation
              </button>
            )}
            {canUseIntegrations && (
              <button
                onClick={() => setActiveTab('integrations')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'integrations' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Integrations
              </button>
            )}
            {canManageSettings && (
              <button
                onClick={() => setActiveTab('content')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'content' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Content Packs
              </button>
            )}
            {canManageSettings && (
              <button
                onClick={() => setActiveTab('audit')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'audit' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Audit Logs
              </button>
            )}
            {canAccessPlatformAdmin && (
              <button
                onClick={() => setActiveTab('platform')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'platform' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Platform Ops
              </button>
            )}
            <button
              onClick={() => setActiveTab('security')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'security' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Security
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'notifications' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Notifications
            </button>
            {canManageSettings && (
              <button
                onClick={() => setActiveTab('account')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'account' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Account
              </button>
            )}
          </nav>
        </div>

        {/* ===== LLM TAB ===== */}
        {activeTab === 'llm' && canManageSettings && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">LLM API Keys (BYOK)</h2>
              <p className="text-sm text-gray-500 mb-2">Bring your own API keys to power AI features. Keys are stored encrypted. <strong className="text-green-700">Any tier with a BYOK key gets unlimited AI calls.</strong></p>
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
                <span className="mt-0.5 shrink-0">ℹ️</span>
                <span>
                  <strong>Org-wide key:</strong> Any API key you add here becomes your organization&apos;s primary key for that provider.
                  AI features require an organization key for the selected provider. All AI usage is logged and attributed per user.
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-5 text-xs">
                <span className="bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded">✅ Gemini — Free tier (aistudio.google.com)</span>
                <span className="bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded">✅ Groq — Free tier (console.groq.com)</span>
                <span className="bg-green-50 border border-green-200 text-green-700 px-2 py-1 rounded">✅ Ollama — Self-hosted, always free</span>
                <span className="bg-gray-50 border border-gray-200 text-gray-500 px-2 py-1 rounded">💳 Claude, OpenAI, xAI Grok — Paid API only</span>
              </div>

              {/* Anthropic */}
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🟣</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">Anthropic (Claude)</h3>
                      <p className="text-xs text-gray-500">claude-sonnet-4-5, claude-haiku-4-5</p>
                    </div>
                  </div>
                  {llmSettings?.hasAnthropicKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                      <span className="text-xs text-gray-400">{llmSettings.settings?.anthropic_api_key?.masked}</span>
                      <button onClick={() => removeKey('claude')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => testKey('claude', anthropicKey)}
                    disabled={!anthropicKey || testingProvider === 'claude'}
                    className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                  >
                    {testingProvider === 'claude' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* OpenAI */}
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🟢</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">OpenAI</h3>
                      <p className="text-xs text-gray-500">GPT-4o, GPT-4o-mini</p>
                    </div>
                  </div>
                  {llmSettings?.hasOpenAIKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                      <span className="text-xs text-gray-400">{llmSettings.settings?.openai_api_key?.masked}</span>
                      <button onClick={() => removeKey('openai')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => testKey('openai', openaiKey)}
                    disabled={!openaiKey || testingProvider === 'openai'}
                    className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                  >
                    {testingProvider === 'openai' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Gemini */}
              <div className="border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🔵</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">Google Gemini</h3>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free Tier Available</span>
                      </div>
                      <p className="text-xs text-gray-500">gemini-3.5-flash, gemini-3.1-pro-preview · Get a free key at aistudio.google.com</p>
                    </div>
                  </div>
                  {llmSettings?.hasGeminiKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                      <span className="text-xs text-gray-400">{llmSettings.settings?.gemini_api_key?.masked}</span>
                      <button onClick={() => removeKey('gemini')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => testKey('gemini', geminiKey)}
                    disabled={!geminiKey || testingProvider === 'gemini'}
                    className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                  >
                    {testingProvider === 'gemini' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Grok */}
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚫</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">xAI Grok</h3>
                      <p className="text-xs text-gray-500">grok-4.1-fast, grok-4.5</p>
                    </div>
                  </div>
                  {llmSettings?.hasGrokKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                      <span className="text-xs text-gray-400">{llmSettings.settings?.xai_api_key?.masked}</span>
                      <button onClick={() => removeKey('grok')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={grokKey}
                    onChange={(e) => setGrokKey(e.target.value)}
                    placeholder="xai-..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => testKey('grok', grokKey)}
                    disabled={!grokKey || testingProvider === 'grok'}
                    className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                  >
                    {testingProvider === 'grok' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Groq (Free Tier) */}
              <div className="border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">Groq</h3>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Free Tier Available</span>
                      </div>
                      <p className="text-xs text-gray-500">openai/gpt-oss-120b, openai/gpt-oss-20b · Get a free key at console.groq.com</p>
                    </div>
                  </div>
                  {llmSettings?.hasGroqKey ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                      <span className="text-xs text-gray-400">{llmSettings.settings?.groq_api_key?.masked}</span>
                      <button onClick={() => removeKey('groq')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    placeholder="gsk_..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => testKey('groq', groqKey)}
                    disabled={!groqKey || testingProvider === 'groq'}
                    className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                  >
                    {testingProvider === 'groq' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Ollama (Self-Hosted) */}
              <div className="border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏠</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">Ollama</h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Self-Hosted / Free</span>
                      </div>
                      <p className="text-xs text-gray-500">llama3.2, mistral, phi3, qwen2.5 · Quantized (q4_K_M) models reduce RAM usage · Run locally with: ollama serve</p>
                    </div>
                  </div>
                  {llmSettings?.hasOllamaUrl ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                      <span className="text-xs text-gray-400">{llmSettings.settings?.ollama_base_url?.value}</span>
                      <button onClick={() => removeKey('ollama')} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => testKey('ollama', ollamaUrl)}
                    disabled={!ollamaUrl || testingProvider === 'ollama'}
                    className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                  >
                    {testingProvider === 'ollama' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Default Provider + Model */}
              <div className="border border-gray-200 rounded-lg p-4 mb-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Default Provider</label>
                  <select
                    value={defaultProvider}
                    onChange={(e) => {
                      const nextProvider = e.target.value;
                      setDefaultProvider(nextProvider);
                      if (!useCustomDefaultModel) {
                        const validModels = providerModels[nextProvider] || [];
                        if (defaultModel && !validModels.includes(defaultModel)) {
                          setDefaultModel('');
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="grok">xAI Grok</option>
                    <option value="groq">Groq (Free Tier)</option>
                    <option value="ollama">Ollama (Self-Hosted)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Model <span className="text-gray-400 font-normal">(optional)</span></label>
                  {!useCustomDefaultModel ? (
                    <select
                      value={defaultModel}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === '__custom__') {
                          setUseCustomDefaultModel(true);
                          setDefaultModel('');
                          return;
                        }
                        setDefaultModel(next);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Provider default</option>
                      {(providerModels[defaultProvider] || []).map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                      <option value="__custom__">Custom model...</option>
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={defaultModel}
                        onChange={(e) => setDefaultModel(e.target.value)}
                        placeholder="Enter custom model name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomDefaultModel(false);
                          setDefaultModel('');
                        }}
                        className="text-xs text-purple-700 hover:text-purple-900"
                      >
                        Use provider model list instead
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Leave blank to use the provider default. Override per request where needed.</p>
                </div>
                <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded p-2">
                  🔄 <span className="font-medium">Seamless provider handoff:</span> When you switch providers, your organization&apos;s
                  full context — industry, frameworks, compliance posture, CIA baseline, assets, and vulnerabilities — is
                  automatically injected into every AI call. No reconfiguration needed.
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Apply compliance framework guardrails to all AI responses</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      AI framework guardrails (EU AI Act, NIST AI RMF, ISO 42001/42005, State AI Governance) are always active when those frameworks are enabled.
                      Enable this to also apply general compliance frameworks (NIST 800-53, ISO 27001, GDPR, HIPAA, SOC 2, etc.) as behavioral constraints on every AI response.
                    </p>
                  </div>
                  <button
                    onClick={() => setApplyAllFrameworkGuardrails(!applyAllFrameworkGuardrails)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 flex-shrink-0 ${applyAllFrameworkGuardrails ? 'bg-purple-600' : 'bg-gray-300'}`}
                    role="switch"
                    aria-checked={applyAllFrameworkGuardrails}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${applyAllFrameworkGuardrails ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <button
                onClick={saveLLMSettings}
                className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition-colors font-medium"
              >
                Save LLM Settings
              </button>

            </div>
          </div>
        )}

        {/* ===== AI ACTIVITY TAB ===== */}
        {activeTab === 'ai_activity' && canManageSettings && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">AI Activity Log</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Every AI call made by any user in your organization — who triggered it, which feature, provider, key type, and outcome.
                  </p>
                </div>
                <button
                  onClick={() => loadAiActivity(1)}
                  disabled={aiActivityLoading}
                  className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  {aiActivityLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {aiActivityError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{aiActivityError}</div>
              )}
              {aiActivityLoading && aiActivityRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading AI activity...</div>
              ) : aiActivityRows.length === 0 && !aiActivityError ? (
                <div className="py-8 text-center text-sm text-gray-400">No AI activity recorded yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                          <th className="pb-2 pr-3">Date / Time</th>
                          <th className="pb-2 pr-3">User</th>
                          <th className="pb-2 pr-3">Feature</th>
                          <th className="pb-2 pr-3">Provider</th>
                          <th className="pb-2 pr-3">Key</th>
                          <th className="pb-2 pr-3">Tokens In / Out</th>
                          <th className="pb-2 pr-3">Duration</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {aiActivityRows.map((row: any) => (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                              {new Date(row.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-3 text-gray-800 max-w-[160px] truncate" title={row.user_email}>
                              {row.user_name || row.user_email || '—'}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="font-mono text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                {row.feature}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-gray-700 capitalize">{row.provider || '—'}</td>
                            <td className="py-2 pr-3">
                              {row.byok_used ? (
                                <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Org key</span>
                              ) : (
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Platform</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-gray-600 text-xs">
                              {row.tokens_input != null ? `${row.tokens_input} / ${row.tokens_output ?? '?'}` : '—'}
                            </td>
                            <td className="py-2 pr-3 text-gray-600 text-xs">
                              {row.duration_ms != null ? `${row.duration_ms}ms` : '—'}
                            </td>
                            <td className="py-2">
                              {row.success ? (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">OK</span>
                              ) : (
                                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded" title={row.error_message || ''}>
                                  Failed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {aiActivityTotal > AI_ACTIVITY_LIMIT && (
                    <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                      <span>{aiActivityTotal} total records</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadAiActivity(aiActivityPage - 1)}
                          disabled={aiActivityPage <= 1 || aiActivityLoading}
                          className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <span className="px-3 py-1">Page {aiActivityPage}</span>
                        <button
                          onClick={() => loadAiActivity(aiActivityPage + 1)}
                          disabled={aiActivityPage * AI_ACTIVITY_LIMIT >= aiActivityTotal || aiActivityLoading}
                          className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ===== AI DECISIONS SECTION (merged into AI Activity tab) ===== */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">AI Decision Log</h2>
                  <p className="text-sm text-gray-500 mt-1">Every AI decision recorded for traceability, human review, and EU AI Act compliance.</p>
                </div>
                <button
                  onClick={() => loadAiDecisions(1)}
                  disabled={aiDecisionsLoading}
                  className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  {aiDecisionsLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4">
                <select
                  value={aiDecisionsFilterReviewed}
                  onChange={e => { setAiDecisionsFilterReviewed(e.target.value); }}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All reviews</option>
                  <option value="false">Unreviewed</option>
                  <option value="true">Reviewed</option>
                </select>
                <select
                  value={aiDecisionsFilterRisk}
                  onChange={e => { setAiDecisionsFilterRisk(e.target.value); }}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All risk levels</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="text"
                  placeholder="Filter by feature..."
                  value={aiDecisionsFilterFeature}
                  onChange={e => setAiDecisionsFilterFeature(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={() => loadAiDecisions(1)}
                  className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded-md hover:bg-purple-700"
                >
                  Apply
                </button>
              </div>

              {aiDecisionsLoading && aiDecisions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading decisions...</div>
              ) : aiDecisions.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No AI decisions recorded yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                          <th className="pb-2 pr-3">Date</th>
                          <th className="pb-2 pr-3">Feature</th>
                          <th className="pb-2 pr-3">Risk</th>
                          <th className="pb-2 pr-3">Framework</th>
                          <th className="pb-2 pr-3">Reviewed</th>
                          <th className="pb-2 pr-3">Bias</th>
                          <th className="pb-2 pr-3">Input Hash</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {aiDecisions.map((row: any) => (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="py-2 pr-3 text-gray-600 whitespace-nowrap text-xs">
                              {new Date(row.processing_timestamp || row.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="font-mono text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                {row.feature || '—'}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                row.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                                row.risk_level === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {row.risk_level || 'low'}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-xs text-gray-600">{row.regulatory_framework || '—'}</td>
                            <td className="py-2 pr-3">
                              {row.human_reviewed ? (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                  {row.review_outcome || 'Reviewed'}
                                </span>
                              ) : (
                                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Pending</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              {Array.isArray(row.bias_flags) && row.bias_flags.length > 0 ? (
                                row.bias_reviewed ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Cleared</span>
                                ) : (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                    {row.bias_flags.length} flag{row.bias_flags.length !== 1 ? 's' : ''}
                                  </span>
                                )
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-xs text-gray-400">
                              {row.input_hash ? row.input_hash.slice(0, 12) + '…' : '—'}
                            </td>
                            <td className="py-2">
                              <button
                                onClick={() => {
                                  setAiDecisionsSelected(row);
                                  setAiDecisionsOutcome(row.review_outcome || '');
                                  setAiDecisionsNotes(row.review_notes || '');
                                  setAiDecisionsBiasNotes(row.fairness_notes || '');
                                }}
                                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {aiDecisionsTotal > AI_DECISIONS_LIMIT && (
                    <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                      <span>{aiDecisionsTotal} total records</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadAiDecisions(aiDecisionsPage - 1)}
                          disabled={aiDecisionsPage <= 1 || aiDecisionsLoading}
                          className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <span className="px-3 py-1">Page {aiDecisionsPage}</span>
                        <button
                          onClick={() => loadAiDecisions(aiDecisionsPage + 1)}
                          disabled={aiDecisionsPage * AI_DECISIONS_LIMIT >= aiDecisionsTotal || aiDecisionsLoading}
                          className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== AUTOMATION TAB ===== */}
        {activeTab === 'automation' && canManageSettings && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Auto-Crosswalk Configuration</h2>
                  <p className="text-sm text-gray-500">
                    Control how implementation work propagates across related frameworks. This is workflow automation, not an AI provider setting.
                  </p>
                </div>
                <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium h-fit">
                  Compliance workflow
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 mb-6">
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">What It Does</h3>
                  <p className="text-sm text-blue-800">
                    When a control is marked Implemented, ControlWeave can auto-satisfy mapped controls in your other active frameworks if the similarity score clears the threshold below.
                  </p>
                </div>
                <div className="border border-gray-200 bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Where You See It</h3>
                  <p className="text-sm text-gray-600">
                    Crosswalked outcomes appear in your controls workflow and dashboard metrics after implementation changes are saved.
                  </p>
                  <Link href="/dashboard/controls" className="inline-flex mt-3 text-sm font-medium text-purple-600 hover:text-purple-700">
                    Open Controls →
                  </Link>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <label htmlFor="crosswalk-threshold" className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Similarity Threshold: <span className="text-purple-700 font-bold" aria-live="polite">{crosswalkThreshold}%</span>
                    </label>
                    <input
                      id="crosswalk-threshold"
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={crosswalkThreshold}
                      onChange={e => setCrosswalkThreshold(Number(e.target.value))}
                      aria-label={`Crosswalk similarity threshold: ${crosswalkThreshold}%`}
                      className="w-full accent-purple-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>50% (broader matching)</span>
                      <span>100% (exact only)</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Default is 90%. Higher values create fewer, stricter matches. Lower values broaden inheritance across related controls.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={saveCrosswalkThreshold}
                      disabled={crosswalkThresholdSaving}
                      className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {crosswalkThresholdSaving ? 'Saving…' : 'Save Threshold'}
                    </button>
                    {crosswalkThresholdMsg && (
                      <span className={`text-xs font-medium ${crosswalkThresholdMsg === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>{crosswalkThresholdMsg}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== INTEGRATIONS TAB ===== */}
        {activeTab === 'integrations' && canUseIntegrations && (
          <div className="space-y-6">
            {canUseSplunk && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Splunk Evidence Connector</h2>
                    <p className="text-sm text-gray-500">
                      Connect Splunk to pull search results directly into your evidence library. Use this when you want ControlWeave to import audit or security evidence from Splunk, not just forward audit events out to a SIEM.
                    </p>
                  </div>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">Pro+</span>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">Connection</h3>
                      <p className="text-xs text-gray-500">Uses Splunk management API (`/services/...`) with bearer token</p>
                    </div>
                    {splunkSettings?.configured ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Configured</span>
                        {splunkSettings?.token_masked && (
                          <span className="text-xs text-gray-400">{splunkSettings.token_masked}</span>
                        )}
                        <button onClick={removeSplunkSettings} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      </div>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Splunk Base URL</label>
                      <input
                        type="text"
                        value={splunkBaseUrl}
                        onChange={(e) => setSplunkBaseUrl(e.target.value)}
                        placeholder="https://your-splunk-host:8089"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">API Token</label>
                      <input
                        type="password"
                        value={splunkApiToken}
                        onChange={(e) => setSplunkApiToken(e.target.value)}
                        placeholder="Splunk bearer token"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Default Index (optional)</label>
                      <input
                        type="text"
                        value={splunkDefaultIndex}
                        onChange={(e) => setSplunkDefaultIndex(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={testSplunkSettings}
                        disabled={splunkTesting || (!splunkBaseUrl && !splunkSettings?.base_url)}
                        className="px-4 py-2 text-sm border border-purple-600 text-purple-600 rounded-md hover:bg-purple-50 disabled:opacity-50"
                      >
                        {splunkTesting ? 'Testing...' : 'Test Connection'}
                      </button>
                      <button
                        onClick={saveSplunkSettings}
                        disabled={splunkSaving}
                        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        {splunkSaving ? 'Saving...' : 'Save Splunk Settings'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!canUseSiem && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
                SIEM forwarding requires the <strong>Enterprise</strong> plan. Splunk evidence import remains available above on Professional and higher.
              </div>
            )}
            {canUseSiem && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">SIEM Integrations</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Forward compliance events to Splunk, Elastic, a generic webhook, or syslog.
                    Multiple targets are supported.
                  </p>
                </div>
                <button
                  onClick={() => { setShowSiemForm(true); setSiemFormData({ provider: 'webhook', name: '', enabled: true }); }}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  + Add Integration
                </button>
              </div>

              {siemMsg && (
                <div className={`mb-4 px-4 py-2 rounded-lg text-sm border ${
                  siemMsg.includes('success') || siemMsg.includes('added') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                }`}>{siemMsg}</div>
              )}

              {/* Add form */}
              {showSiemForm && (
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                      <input type="text" value={siemFormData.name} onChange={e => setSiemFormData((p: any) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Elastic Production" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Provider</label>
                      <select value={siemFormData.provider} onChange={e => setSiemFormData((p: any) => ({ ...p, provider: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
                        <option value="webhook">Generic Webhook</option>
                        <option value="splunk">Splunk HEC</option>
                        <option value="elastic">Elastic</option>
                        <option value="syslog">Syslog</option>
                      </select>
                    </div>
                  </div>
                  {siemFormData.provider !== 'syslog' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {siemFormData.provider === 'splunk' ? 'Splunk HEC URL' : siemFormData.provider === 'elastic' ? 'Elastic Endpoint URL' : 'Webhook URL'}
                      </label>
                      <input type="url" value={siemFormData.endpoint_url || ''} onChange={e => setSiemFormData((p: any) => ({ ...p, endpoint_url: e.target.value }))}
                        placeholder={siemFormData.provider === 'splunk' ? 'https://splunk:8088/services/collector' : siemFormData.provider === 'elastic' ? 'https://es:9200' : 'https://your-webhook.example.com'}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
                    </div>
                  )}
                  {siemFormData.provider === 'syslog' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Host</label>
                        <input type="text" value={siemFormData.syslog_host || ''} onChange={e => setSiemFormData((p: any) => ({ ...p, syslog_host: e.target.value }))}
                          placeholder="syslog.example.com" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
                        <input type="number" value={siemFormData.syslog_port || 514} onChange={e => setSiemFormData((p: any) => ({ ...p, syslog_port: Number(e.target.value) }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" /></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Protocol</label>
                        <select value={siemFormData.syslog_protocol || 'udp'} onChange={e => setSiemFormData((p: any) => ({ ...p, syslog_protocol: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
                          <option value="udp">UDP</option><option value="tcp">TCP</option><option value="tls">TLS</option>
                        </select></div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {siemFormData.provider === 'splunk' ? 'Splunk HEC Token' : siemFormData.provider === 'elastic' ? 'Elastic API Key' : 'Bearer Token (optional)'}
                    </label>
                    <input type="password" value={siemFormData.api_key || ''} onChange={e => setSiemFormData((p: any) => ({ ...p, api_key: e.target.value }))}
                      placeholder="••••••••" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSiemCreate}
                      disabled={
                        !String(siemFormData.name || '').trim()
                        || (
                          siemFormData.provider === 'syslog'
                            ? !String(siemFormData.syslog_host || '').trim()
                            : !String(siemFormData.endpoint_url || '').trim()
                        )
                      }
                      className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50">
                      Save Integration
                    </button>
                    <button onClick={() => setShowSiemForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {siemLoading ? (
                <div className="py-6 text-center text-sm text-gray-400">Loading...</div>
              ) : siemConfigs.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">No SIEM integrations configured yet.</div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                  {siemConfigs.map(cfg => (
                    <div key={cfg.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{cfg.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {cfg.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 capitalize">{cfg.provider}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {cfg.endpoint_url || cfg.syslog_host || '—'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSiemTest(cfg.id)} disabled={siemTestingId === cfg.id}
                          className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 border border-purple-200 rounded-md hover:bg-purple-50 disabled:opacity-50">
                          {siemTestingId === cfg.id ? 'Testing...' : 'Test'}
                        </button>
                        <button onClick={() => handleSiemDelete(cfg.id)}
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded-md hover:bg-red-50">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <strong>Splunk:</strong> Use HEC (HTTP Event Collector) with your token.<br/>
                <strong>Elastic:</strong> Point to your Elasticsearch endpoint with an API key.<br/>
                <strong>Webhook:</strong> Any HTTPS endpoint that accepts POST JSON — works with Datadog, Sumo Logic, Microsoft Sentinel, Chronicle, and more.<br/>
                <strong>Syslog:</strong> UDP/TCP/TLS syslog receiver (e.g. rsyslog, syslog-ng, Graylog).
              </div>
            </div>
            )}

            {canManageSettings && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-1">Trust Center</h2>
                    <p className="text-sm text-gray-500">
                      Publish a read-only, token-gated page showing your compliance posture to customers and prospects.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      checked={tcEnabled}
                      onChange={(e) => setTcEnabled(e.target.checked)}
                      className="h-4 w-4"
                      aria-label="Enable Trust Center"
                    />
                    <span className="text-sm text-gray-700">Enabled</span>
                  </label>
                </div>

                {trustCenterLoading ? (
                  <div className="py-6 text-center text-sm text-gray-400">Loading...</div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="tc-display-name" className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                      <input
                        id="tc-display-name"
                        type="text"
                        value={tcDisplayName}
                        onChange={(e) => setTcDisplayName(e.target.value)}
                        placeholder="Your organization name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="tc-description" className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <textarea
                        id="tc-description"
                        value={tcDescription}
                        onChange={(e) => setTcDescription(e.target.value)}
                        rows={3}
                        placeholder="A short description of your compliance program"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="tc-contact-email" className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
                      <input
                        id="tc-contact-email"
                        type="email"
                        value={tcContactEmail}
                        onChange={(e) => setTcContactEmail(e.target.value)}
                        placeholder="security@yourcompany.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">What to show</h3>
                      <label htmlFor="tc-show-frameworks" className="flex items-center gap-2">
                        <input
                          id="tc-show-frameworks"
                          type="checkbox"
                          checked={tcShowFrameworks}
                          onChange={(e) => setTcShowFrameworks(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-gray-700">Framework names</span>
                      </label>
                      <label htmlFor="tc-show-scores" className="flex items-center gap-2">
                        <input
                          id="tc-show-scores"
                          type="checkbox"
                          checked={tcShowComplianceScores}
                          onChange={(e) => setTcShowComplianceScores(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-gray-700">Compliance scores</span>
                      </label>
                      <label htmlFor="tc-show-authorizations" className="flex items-center gap-2">
                        <input
                          id="tc-show-authorizations"
                          type="checkbox"
                          checked={tcShowAuthorizations}
                          onChange={(e) => setTcShowAuthorizations(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-gray-700">Active authorizations count</span>
                      </label>
                    </div>

                    {trustCenterConfig && (
                      <div>
                        <label htmlFor="tc-public-url" className="block text-xs font-medium text-gray-600 mb-1">Public URL</label>
                        <div className="flex gap-2">
                          <input
                            id="tc-public-url"
                            type="text"
                            readOnly
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trust/${trustCenterConfig.public_token}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-600"
                          />
                          <button
                            onClick={copyTrustCenterUrl}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 shrink-0"
                          >
                            {trustCenterCopied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={saveTrustCenterConfig}
                        disabled={trustCenterSaving}
                        className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        {trustCenterSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={regenerateTrustCenterToken}
                        disabled={trustCenterRegenerating}
                        className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                      >
                        {trustCenterRegenerating ? 'Regenerating...' : 'Regenerate Token'}
                      </button>
                      {trustCenterMsg && (
                        <span className={`text-xs font-medium ${trustCenterMsg === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>{trustCenterMsg}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
              Need SSO instead of log forwarding? Use the <strong>Security</strong> tab for organization sign-in settings.
            </div>
          </div>
        )}

        {/* ===== CONTENT PACKS TAB ===== */}
        {activeTab === 'content' && canManageSettings && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Content Packs</h2>
                  <p className="text-sm text-gray-600">
                    Use content packs when your team has purchased or received licensed control text, assessment procedures, or implementation guidance and you want that material to appear inside ControlWeave for your organization only.
                  </p>
                </div>
                <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium h-fit">
                  Tenant-specific overrides
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-green-900 mb-2">Use It When</h3>
                  <p className="text-sm text-green-800">
                    You want official or licensed framework wording to replace the baseline control descriptions or assessment procedures your team sees in the app.
                  </p>
                </div>
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">What Changes</h3>
                  <p className="text-sm text-blue-800">
                    Imported packs create organization-scoped overrides. Your users see the licensed text in controls and procedures, while the global baseline stays untouched for every other tenant.
                  </p>
                </div>
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-amber-900 mb-2">Do Not Use It For</h3>
                  <p className="text-sm text-amber-800">
                    Evidence uploads, policies, screenshots, or ad hoc notes. Those belong in Evidence, controls, or assessments, not in Content Packs.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 text-xs">
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                  {contentPackDrafts.length} draft{contentPackDrafts.length === 1 ? '' : 's'}
                </span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                  {contentPacks.length} imported pack{contentPacks.length === 1 ? '' : 's'}
                </span>
              </div>

              <p className="text-sm text-gray-500 mt-4">
                Workflow: upload report → AI-assisted draft → review/edit → attest licensing rights → optional approval → import as org-specific overrides.
                {' '}
                <a href="https://github.com/sherifconteh-collab/ControlWeaver-Pro/blob/main/controlweave/docs/CONTENT_PACKS.md" target="_blank" rel="noopener noreferrer" className="font-medium text-purple-600 hover:text-purple-700">
                  Read the full guide →
                </a>
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Manage Content Packs</h2>
              <p className="text-sm text-gray-500 mb-4">
                Upload a licensed report, generate a draft pack, review the JSON, attest licensing rights, and import it into your organization.
              </p>

              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">1. Upload Report and Draft Pack</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Report File</label>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt,.csv,.json,.md,.xml,.log"
                      onChange={(e) => setDraftReportFile(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Framework Code</label>
                    <input
                      type="text"
                      value={draftFrameworkCode}
                      onChange={(e) => setDraftFrameworkCode(e.target.value)}
                      placeholder="iso_27001"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pack Name (optional)</label>
                    <input
                      type="text"
                      value={draftPackName}
                      onChange={(e) => setDraftPackName(e.target.value)}
                      placeholder="ISO Licensed Pack"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pack Version (optional)</label>
                    <input
                      type="text"
                      value={draftPackVersion}
                      onChange={(e) => setDraftPackVersion(e.target.value)}
                      placeholder="2026-Q1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Source Vendor (optional)</label>
                    <input
                      type="text"
                      value={draftSourceVendor}
                      onChange={(e) => setDraftSourceVendor(e.target.value)}
                      placeholder="Customer Vendor"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">License Reference</label>
                    <input
                      type="text"
                      value={draftLicenseReference}
                      onChange={(e) => setDraftLicenseReference(e.target.value)}
                      placeholder="Contract-123"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">AI Provider (optional)</label>
                    <select
                      value={draftProvider}
                      onChange={(e) => setDraftProvider(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Use org default</option>
                      <option value="claude">Claude</option>
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                      <option value="grok">Grok</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">AI Model (optional)</label>
                    <input
                      type="text"
                      value={draftModel}
                      onChange={(e) => setDraftModel(e.target.value)}
                      placeholder="Leave blank for default"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={draftAiAssist}
                      onChange={(e) => setDraftAiAssist(e.target.checked)}
                      className="rounded"
                    />
                    AI-assisted draft
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={draftReviewRequired}
                      onChange={(e) => setDraftReviewRequired(e.target.checked)}
                      className="rounded"
                    />
                    Require review approval before import
                  </label>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={uploadContentPackDraft}
                    disabled={draftUploading}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    {draftUploading ? 'Uploading...' : 'Upload and Draft'}
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">2. Draft Queue</h3>
                </div>
                {contentPackDrafts.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">No draft packs created yet.</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {contentPackDrafts.map((draft) => (
                      <div key={draft.id} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{draft.pack_name || 'Untitled Draft'}</span>
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{draft.framework_code}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              draft.attestation_confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {draft.attestation_confirmed ? 'attested' : 'not attested'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              draft.review_status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : draft.review_status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : draft.review_status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-600'
                            }`}>
                              review: {draft.review_status}
                            </span>
                            {draft.imported_pack_id && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">imported</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            File: {draft.report_file_name} | Draft entries: {draft.draft_control_count || 0} controls, {draft.draft_procedure_count || 0} procedures
                          </p>
                          {!!draft.parse_summary?.warnings?.length && (
                            <p className="text-xs text-amber-700 mt-1">Warnings: {draft.parse_summary.warnings[0]}</p>
                          )}
                          {draft.parse_summary?.ai_error && (
                            <p className="text-xs text-red-700 mt-1">AI draft issue: {draft.parse_summary.ai_error}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                          <button
                            onClick={() => loadDraftDetail(draft.id)}
                            disabled={draftLoadingId === draft.id}
                            className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                          >
                            {draftLoadingId === draft.id ? 'Loading...' : 'Open'}
                          </button>
                          {!draft.attestation_confirmed && !draft.imported_pack_id && (
                            <button
                              onClick={() => attestDraft(draft.id)}
                              disabled={draftActionId === draft.id}
                              className="text-xs border border-green-600 text-green-700 px-2 py-1 rounded hover:bg-green-50 disabled:opacity-50"
                            >
                              Attest
                            </button>
                          )}
                          {draft.review_required && !draft.imported_pack_id && (
                            <>
                              <button
                                onClick={() => reviewDraft(draft.id, 'approve')}
                                disabled={draftActionId === draft.id}
                                className="text-xs border border-blue-600 text-blue-700 px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => reviewDraft(draft.id, 'reject')}
                                disabled={draftActionId === draft.id}
                                className="text-xs border border-red-600 text-red-700 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {!draft.imported_pack_id && (
                            <button
                              onClick={() => importDraft(draft.id)}
                              disabled={draftActionId === draft.id}
                              className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
                            >
                              Import
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedDraftId && (
                <div className="border border-gray-200 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">3. Review/Edit Selected Draft</h3>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 mb-3">
                    <input
                      type="checkbox"
                      checked={selectedDraftReviewRequired}
                      onChange={(e) => setSelectedDraftReviewRequired(e.target.checked)}
                      className="rounded"
                    />
                    Require approval before import
                  </label>
                  <textarea
                    value={selectedDraftJson}
                    onChange={(e) => setSelectedDraftJson(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={saveSelectedDraft}
                      disabled={draftSaving}
                      className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                      {draftSaving ? 'Saving...' : 'Save Draft'}
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Fallback: Direct JSON Import</h3>
                  <button
                    onClick={loadContentPackTemplate}
                    disabled={contentPackTemplateLoading}
                    className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    {contentPackTemplateLoading ? 'Loading template...' : 'Load JSON Template'}
                  </button>
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pack JSON</label>
                <textarea
                  value={contentPackJson}
                  onChange={(e) => setContentPackJson(e.target.value)}
                  rows={8}
                  placeholder='{"pack":{"pack_name":"ISO Licensed Pack","framework_code":"iso_27001","license_reference":"Contract-123","controls":[{"control_id":"A.5.12","description":"..."}]}}'
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Use this only if you already have a valid structured pack JSON and do not need the report-upload drafting flow above.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={importContentPack}
                    disabled={contentPackImporting}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    {contentPackImporting ? 'Importing...' : 'Import Content Pack'}
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">4. Imported Packs</h3>
                </div>
                {contentPacks.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No licensed content packs imported yet.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {contentPacks.map((pack) => (
                      <div key={pack.id} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{pack.pack_name}</span>
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{pack.framework_code}</span>
                            {pack.pack_version && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{pack.pack_version}</span>
                            )}
                            {!pack.is_active && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">inactive</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            License: {pack.license_reference}
                            {pack.source_vendor ? ` | Vendor: ${pack.source_vendor}` : ''}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Overrides: {pack.control_overrides} controls, {pack.procedure_overrides} procedures
                          </p>
                        </div>
                        {pack.is_active && (
                          <button
                            onClick={() => removeContentPack(pack.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== AUDIT LOGS TAB ===== */}
        {activeTab === 'audit' && canManageSettings && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Audit Logs</h2>
                  <p className="text-sm text-gray-500 mt-1">Full event trail for your organization — user actions, configuration changes, and AI activity.</p>
                </div>
                <button onClick={() => loadAuditLogs(1)} disabled={auditLoading}
                  className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                  {auditLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              {auditError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{auditError}</div>
              )}
              {hasAuditFilters && (
                <div className="bg-purple-50 border border-purple-200 text-purple-900 px-4 py-3 rounded-lg mb-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Filtered from a related workflow</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {auditFilterChips.map((chip) => (
                          <span key={`${chip.label}:${chip.value}`} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-purple-800 border border-purple-200">
                            <span className="font-semibold">{chip.label}:</span>
                            <span>{chip.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <Link href="/dashboard/settings?tab=audit" className="font-medium underline hover:text-purple-700">
                      Clear filters
                    </Link>
                  </div>
                </div>
              )}
              {auditLoading && auditRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : auditRows.length === 0 && !auditError ? (
                <div className="py-8 text-center text-sm text-gray-400">No audit events yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                        <th className="pb-2 pr-4">Time</th>
                        <th className="pb-2 pr-4">Event</th>
                        <th className="pb-2 pr-4">Resource</th>
                        <th className="pb-2 pr-4">Actor</th>
                        <th className="pb-2 pr-4">IP</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditRows.map((row: any) => (
                        <tr key={row.id} className="hover:bg-gray-50 text-xs">
                          <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                          <td className="py-2 pr-4 font-mono text-purple-700">{row.event_type}</td>
                          <td className="py-2 pr-4 text-gray-700">{row.resource_type || '—'}</td>
                          <td className="py-2 pr-4 text-gray-800">{row.user_name || row.email || '—'}</td>
                          <td className="py-2 pr-4 text-gray-500">{row.ip_address || '—'}</td>
                          <td className="py-2">
                            {row.success === false ? (
                              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Failed</span>
                            ) : (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditTotal > AUDIT_LIMIT && (
                    <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                      <span>{auditTotal} total</span>
                      <div className="flex gap-2">
                        <button onClick={() => loadAuditLogs(auditPage - 1)} disabled={auditPage <= 1 || auditLoading}
                          className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40">Previous</button>
                        <span className="px-3 py-1">Page {auditPage}</span>
                        <button onClick={() => loadAuditLogs(auditPage + 1)} disabled={auditPage * AUDIT_LIMIT >= auditTotal || auditLoading}
                          className="px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PLATFORM OPS TAB ===== */}
        {activeTab === 'platform' && canAccessPlatformAdmin && (
          <div className="space-y-6">
            {/* Update Check Card */}
            <div className={`rounded-lg p-4 border ${
              updateCheckData?.updateRequired
                ? 'bg-red-50 border-red-300'
                : updateCheckData?.updateAvailable
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-white border-gray-200 shadow-sm'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    {updateCheckData?.updateRequired
                      ? '🔴 Update Required'
                      : updateCheckData?.updateAvailable
                        ? '🟡 Update Available'
                        : '✅ Platform Version'}
                  </h2>
                  {updateCheckLoading && (
                    <p className="text-sm text-gray-500 mt-1">Checking GitHub for the latest release…</p>
                  )}
                  {updateCheckError && !updateCheckLoading && (
                    <p className="text-sm text-red-600 mt-1">{updateCheckError}</p>
                  )}
                  {updateCheckData && !updateCheckLoading && (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-gray-700">
                        Installed: <span className="font-mono font-semibold">v{updateCheckData.currentVersion}</span>
                        {updateCheckData.latestVersion && (
                          <>
                            {' '}→ Latest: <span className="font-mono font-semibold">v{updateCheckData.latestVersion}</span>
                          </>
                        )}
                      </p>
                      {updateCheckData.updateRequired && updateCheckData.minVersionRequired && (
                        <p className="text-red-700 font-medium">
                          Your license requires at least v{updateCheckData.minVersionRequired}. Please update to continue receiving support.
                        </p>
                      )}
                      {updateCheckData.updateAvailable && !updateCheckData.updateRequired && (
                        <p className="text-amber-800">
                          {updateCheckData.releaseName ? `"${updateCheckData.releaseName}" is available.` : 'A new release is available.'}
                        </p>
                      )}
                      {!updateCheckData.updateAvailable && (
                        <p className="text-green-700">You are running the latest version.</p>
                      )}
                      {updateCheckData.publishedAt && (
                        <p className="text-gray-500 text-xs">
                          Published: {new Date(updateCheckData.publishedAt).toLocaleString()}
                          {' · '}Checked: {new Date(updateCheckData.checkedAt).toLocaleString()}
                        </p>
                      )}
                      {updateCheckData.source === 'unavailable' && (
                        <p className="text-gray-500 text-xs">GitHub was unreachable — version data may be stale.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {updateCheckData &&
                    (updateCheckData.updateAvailable || updateCheckData.updateRequired) &&
                    updateCheckData.releaseUrl && (
                    <a
                      href={updateCheckData.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-xs font-semibold px-3 py-1.5 rounded-md text-white ${
                        updateCheckData.updateRequired ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                    >
                      View Release →
                    </a>
                    )}
                  <button
                    type="button"
                    onClick={() => { setUpdateCheckData(null); loadUpdateCheck(); }}
                    disabled={updateCheckLoading}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    {updateCheckLoading ? 'Checking…' : 'Re-check'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h2 className="text-lg font-bold text-amber-900">Platform Operations & Fallbacks</h2>
              <p className="text-sm text-amber-800 mt-1">
                Use this tab for fallback AI keys, email delivery, queue operations, and break-glass
                admin actions. Use the dedicated platform pages for overview reporting, feature flags,
                organization management, and provider health.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Link href="/dashboard/platform" className="px-3 py-1.5 rounded-md bg-white text-amber-900 border border-amber-200 hover:bg-amber-100">
                  Platform Overview
                </Link>
                <Link href="/dashboard/platform/settings" className="px-3 py-1.5 rounded-md bg-white text-amber-900 border border-amber-200 hover:bg-amber-100">
                  Feature Flags
                </Link>
                <Link href="/dashboard/platform/organizations" className="px-3 py-1.5 rounded-md bg-white text-amber-900 border border-amber-200 hover:bg-amber-100">
                  All Organizations
                </Link>
                <Link href="/dashboard/platform/llm-status" className="px-3 py-1.5 rounded-md bg-white text-amber-900 border border-amber-200 hover:bg-amber-100">
                  LLM Status
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Platform LLM Settings (Management Only)</h2>
              <p className="text-sm text-gray-500 mb-4">
                These settings are retained for platform administration and visibility only.
                Customer AI requests now require organization-configured keys and do not use platform fallback.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 mb-4">
                Platform owners can manage hosted-provider settings here, but end-user AI traffic is resolved from organization settings only.
              </div>

              {platformLlmLoading ? (
                <div className="text-sm text-gray-400 py-4">Loading platform LLM defaults...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Claude (Anthropic) API Key</label>
                      <input
                        type="password"
                        value={platformAnthropicKey}
                        onChange={(e) => setPlatformAnthropicKey(e.target.value)}
                        placeholder={platformLlmSettings?.settings?.anthropic_api_key?.masked || 'sk-ant-api03-...'}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">OpenAI API Key</label>
                      <input
                        type="password"
                        value={platformOpenaiKey}
                        onChange={(e) => setPlatformOpenaiKey(e.target.value)}
                        placeholder={platformLlmSettings?.settings?.openai_api_key?.masked || 'sk-proj-...'}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Gemini API Key</label>
                      <input
                        type="password"
                        value={platformGeminiKey}
                        onChange={(e) => setPlatformGeminiKey(e.target.value)}
                        placeholder={platformLlmSettings?.settings?.gemini_api_key?.masked || 'AIza...'}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">xAI Grok API Key</label>
                      <input
                        type="password"
                        value={platformGrokKey}
                        onChange={(e) => setPlatformGrokKey(e.target.value)}
                        placeholder={platformLlmSettings?.settings?.xai_api_key?.masked || 'xai-...'}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Groq API Key</label>
                      <input
                        type="password"
                        value={platformGroqKey}
                        onChange={(e) => setPlatformGroqKey(e.target.value)}
                        placeholder={platformLlmSettings?.settings?.groq_api_key?.masked || 'gsk_...'}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Ollama Base URL</label>
                      <input
                        type="text"
                        value={platformOllamaUrl}
                        onChange={(e) => setPlatformOllamaUrl(e.target.value)}
                        placeholder={platformLlmSettings?.settings?.ollama_base_url?.masked || 'http://localhost:11434/v1'}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Platform Default Provider</label>
                      <select
                        value={platformDefaultProvider}
                        onChange={(e) => {
                          const nextProvider = e.target.value;
                          setPlatformDefaultProvider(nextProvider);
                          if (!platformUseCustomModel) {
                            const validModels = providerModels[nextProvider] || [];
                            if (platformDefaultModel && !validModels.includes(platformDefaultModel)) {
                              setPlatformDefaultModel('');
                            }
                          }
                        }}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="claude">Claude (Anthropic)</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="grok">xAI Grok</option>
                        <option value="groq">Groq</option>
                        <option value="ollama">Ollama</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Platform Default Model (optional)</label>
                      {!platformUseCustomModel ? (
                        <select
                          value={platformDefaultModel}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next === '__custom__') {
                              setPlatformUseCustomModel(true);
                              setPlatformDefaultModel('');
                              return;
                            }
                            setPlatformDefaultModel(next);
                          }}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Provider default</option>
                          {(providerModels[platformDefaultProvider] || []).map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                          <option value="__custom__">Custom model...</option>
                        </select>
                      ) : (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={platformDefaultModel}
                            onChange={(e) => setPlatformDefaultModel(e.target.value)}
                            placeholder="Enter custom model name"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPlatformUseCustomModel(false);
                              setPlatformDefaultModel('');
                            }}
                            className="text-xs text-purple-700 hover:text-purple-900"
                          >
                            Use provider model list instead
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={savePlatformLlmDefaults}
                      disabled={platformLlmSaving}
                      className="text-sm px-4 py-2 bg-purple-700 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                    >
                      {platformLlmSaving ? 'Saving...' : 'Save Platform LLM Settings'}
                    </button>
                    <button
                      onClick={loadPlatformLlmDefaults}
                      disabled={platformLlmLoading}
                      className="text-sm px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Operations Overview */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Operations Overview</h2>
                  <p className="text-sm text-gray-500">Platform health and usage statistics</p>
                </div>
                <button
                  onClick={() => loadPlatformOverview()}
                  disabled={platformOverviewLoading}
                  className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  {platformOverviewLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {platformOverviewLoading && !platformOverview ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading overview...</div>
              ) : platformOverviewError ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-red-600 mb-2">{platformOverviewError}</p>
                  <button
                    onClick={() => loadPlatformOverview()}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : !platformOverview ? (
                <div className="py-8 text-center text-sm text-gray-400">Unable to load overview data.</div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1">Total Users</div>
                      <div className="text-2xl font-bold text-gray-900">{platformOverview.summary?.total_users || 0}</div>
                      <div className="text-xs text-gray-600 mt-1">{platformOverview.summary?.active_users || 0} active</div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1">Events (24h)</div>
                      <div className="text-2xl font-bold text-gray-900">{platformOverview.summary?.events_24h || 0}</div>
                      <div className="text-xs text-gray-600 mt-1">{platformOverview.summary?.active_users_7d || 0} users (7d)</div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1">Open Issues</div>
                      <div className="text-2xl font-bold text-red-600">{platformOverview.summary?.open_issue_count || 0}</div>
                      <div className="text-xs text-gray-600 mt-1">{platformOverview.summary?.failures_24h || 0} failures (24h)</div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1">Vulnerabilities</div>
                      <div className="text-2xl font-bold text-orange-600">{platformOverview.summary?.open_vulnerabilities || 0}</div>
                      <div className="text-xs text-gray-600 mt-1">{platformOverview.summary?.active_poam_items || 0} POA&M items</div>
                    </div>
                  </div>

                  {/* Queue Health */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Job Queue Status</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Queued:</span>
                          <span className="font-medium text-yellow-600">{platformOverview.jobs?.queued || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Running:</span>
                          <span className="font-medium text-blue-600">{platformOverview.jobs?.running || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Completed:</span>
                          <span className="font-medium text-green-600">{platformOverview.jobs?.completed || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Failed:</span>
                          <span className="font-medium text-red-600">{platformOverview.jobs?.failed || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Webhook Deliveries</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pending:</span>
                          <span className="font-medium text-yellow-600">{platformOverview.webhooks?.pending || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Delivered:</span>
                          <span className="font-medium text-green-600">{platformOverview.webhooks?.delivered || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Failed:</span>
                          <span className="font-medium text-red-600">{platformOverview.webhooks?.failed || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Events */}
                  {platformOverview.top_events_7d && platformOverview.top_events_7d.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Top Events (Last 7 Days)</div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        {platformOverview.top_events_7d.slice(0, 6).map((evt: PlatformTopEvent) => (
                          <div key={evt.event_type} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2">
                            <span className="text-gray-700 truncate mr-2">{evt.event_type}</span>
                            <span className="font-medium text-gray-900">{evt.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Failures */}
                  {platformOverview.recent_failures && platformOverview.recent_failures.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Recent Failures</div>
                      <div className="space-y-2">
                        {platformOverview.recent_failures.slice(0, 5).map((fail: PlatformRecentFailure) => (
                          <div key={fail.id} className="text-sm border-l-2 border-red-400 pl-3 py-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{fail.event_type}</span>
                              <span className="text-xs text-gray-500">{new Date(fail.created_at).toLocaleString()}</span>
                            </div>
                            {fail.failure_reason && (
                              <div className="text-xs text-gray-600 mt-1">{fail.failure_reason}</div>
                            )}
                            <div className="text-xs text-gray-500">Actor: {fail.actor_name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Administrative Actions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Administrative Actions</h2>
              <p className="text-sm text-gray-500 mb-6">Manual operations for system maintenance</p>
              <div className="space-y-3 max-w-sm">
                {[
                  { key: 'process_jobs', label: 'Process Jobs', desc: 'Run up to 25 queued background jobs' },
                  { key: 'process_webhooks', label: 'Flush Webhooks', desc: 'Deliver up to 50 pending webhooks' },
                  { key: 'run_retention', label: 'Run Retention', desc: 'Execute data retention policy' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{label}</div>
                      <div className="text-xs text-gray-500">{desc}</div>
                    </div>
                    <button
                      onClick={() => handlePlatformAction(key as any)}
                      disabled={platformActionLoading !== ''}
                      className="text-sm px-4 py-1.5 bg-gray-900 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                    >
                      {platformActionLoading === key ? 'Running...' : 'Run'}
                    </button>
                  </div>
                ))}
                {platformActionMsg && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{platformActionMsg}</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Bootstrap Platform Admin Credentials</h2>
              <p className="text-sm text-gray-500 mb-4">
                Create or update a platform-admin login account from the UI. Use a strong password.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="admin@yourcompany.com"
                  value={bootstrapEmail}
                  onChange={(e) => setBootstrapEmail(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  placeholder="Password (min 12 chars)"
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  autoComplete="new-password"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="First name"
                  value={bootstrapFirstName}
                  onChange={(e) => setBootstrapFirstName(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={bootstrapLastName}
                  onChange={(e) => setBootstrapLastName(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleBootstrapPlatformAdmin}
                  disabled={bootstrapLoading}
                  className="text-sm px-4 py-2 bg-purple-700 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                >
                  {bootstrapLoading ? 'Saving...' : 'Create / Update Platform Admin'}
                </button>
                {bootstrapMsg && (
                  <p className="text-sm text-gray-700">{bootstrapMsg}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== SECURITY TAB (TOTP + Passkeys + SSO) ===== */}
        {activeTab === 'security' && (
          <div className="space-y-6">

            {/* ── Two-Factor Authentication (TOTP) ── */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-500 mb-4">
                Add an extra layer of security to your email + password sign-in using an authenticator app (Google Authenticator, Authy, 1Password, etc.). Available on all plans. Sign-ins via passkey or SSO may bypass the TOTP challenge.
              </p>

              {totpMsg && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{totpMsg}</div>
              )}
              {totpError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{totpError}</div>
              )}

              {!totpStatusLoaded ? (
                <div className="text-sm text-gray-400">Loading...</div>
              ) : totpEnabled ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ Enabled
                    </span>
                    <span className="text-sm text-gray-600">Your account is protected with two-factor authentication.</span>
                  </div>

                  {/* Show backup codes if just enabled */}
                  {totpBackupCodes.length > 0 && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-semibold text-amber-900 mb-2">⚠️ Save these backup codes now</p>
                      <p className="text-xs text-amber-700 mb-3">Each code can only be used once. Store them securely — you won&apos;t see them again.</p>
                      <div className="grid grid-cols-2 gap-1 font-mono text-sm mb-3">
                        {totpBackupCodes.map((code, i) => (
                          <span key={i} className="bg-white border border-amber-300 rounded px-2 py-1 text-center">{code}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => setTotpBackupCodes([])}
                        className="text-xs text-amber-700 underline"
                      >
                        I&apos;ve saved these codes
                      </button>
                    </div>
                  )}

                  {!totpShowDisable ? (
                    <button
                      onClick={() => { setTotpShowDisable(true); setTotpError(''); setTotpMsg(''); }}
                      className="text-sm px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                    >
                      Disable Two-Factor Authentication
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <input
                        type="password"
                        value={totpDisablePassword}
                        onChange={e => setTotpDisablePassword(e.target.value)}
                        placeholder="Enter your password to confirm"
                        className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                      <button
                        onClick={handleTotpDisable}
                        disabled={totpLoading || !totpDisablePassword}
                        className="text-sm px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                      >
                        {totpLoading ? 'Disabling...' : 'Confirm Disable'}
                      </button>
                      <button
                        onClick={() => { setTotpShowDisable(false); setTotpDisablePassword(''); setTotpError(''); }}
                        className="text-sm px-3 py-2 text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              ) : totpSetupData ? (
                /* ── Setup step 2: verify code ── */
                <div className="space-y-4 max-w-md">
                  <p className="text-sm text-gray-700 font-medium">Step 1 — Add to your authenticator app</p>
                  <p className="text-sm text-gray-600">
                    Open your authenticator app and add a new account by entering the key below manually, or tap the link to open it directly.
                  </p>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Manual key (copy into your authenticator app):</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-sm text-gray-900 break-all">{totpSetupData.secret}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(totpSetupData.secret)}
                        className="shrink-0 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                        title="Copy key"
                      >
                        Copy
                      </button>
                    </div>
                    <a
                      href={totpSetupData.otpauth_uri}
                      className="mt-2 inline-block text-xs text-purple-600 hover:text-purple-800 underline"
                    >
                      Open in authenticator app ↗
                    </a>
                  </div>

                  <p className="text-sm text-gray-700 font-medium">Step 2 — Enter the 6-digit code to confirm setup</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={totpVerifyCode}
                      onChange={e => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-32 px-3 py-2 text-center font-mono text-lg border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={handleTotpVerify}
                      disabled={totpLoading || totpVerifyCode.length !== 6}
                      className="text-sm px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                      {totpLoading ? 'Verifying...' : 'Verify & Enable'}
                    </button>
                    <button
                      onClick={() => { setTotpSetupData(null); setTotpVerifyCode(''); setTotpError(''); }}
                      className="text-sm px-3 py-2 text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Setup step 1: initiate ── */
                <button
                  onClick={handleTotpSetup}
                  disabled={totpLoading}
                  className="text-sm px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {totpLoading ? 'Starting setup...' : 'Set Up Two-Factor Authentication'}
                </button>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Passkeys</h2>
              <p className="text-sm text-gray-500 mb-6">
                Passkeys let you sign in without a password using biometrics or a hardware security key.
                Each passkey is tied to this device and account.
              </p>
              {!canUsePasskeys && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
                  Passkeys require the <strong>Enterprise</strong> plan or higher.{' '}
                  <a href="/dashboard/settings" className="underline">Review your plan options</a> to enable this feature.
                </div>
              )}

              {passkeyError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{passkeyError}</div>
              )}
              {passkeySuccess && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{passkeySuccess}</div>
              )}

              {/* Register new passkey */}
              {canUsePasskeys && (
              <div className="flex items-center gap-3 mb-6">
                <input
                  type="text"
                  placeholder="Passkey name (e.g. MacBook Touch ID)"
                  value={passkeyNewName}
                  onChange={e => setPasskeyNewName(e.target.value)}
                  className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={handleRegisterPasskey}
                  disabled={passkeyRegistering}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {passkeyRegistering ? 'Registering...' : '+ Add Passkey'}
                </button>
              </div>
              )}

              {/* Passkey list */}
              {passkeyLoading ? (
                <div className="text-sm text-gray-400 py-4">Loading passkeys...</div>
              ) : passkeys.length === 0 ? (
                <div className="text-sm text-gray-400 py-4">No passkeys registered yet.</div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                  {passkeys.map(pk => (
                    <div key={pk.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{pk.name}</div>
                        <div className="text-xs text-gray-500">
                          {pk.device_type === 'multiDevice' ? 'Multi-device (backed up)' : 'Single-device'}
                          {' · '}Added {new Date(pk.created_at).toLocaleDateString()}
                          {pk.last_used_at && ` · Last used ${new Date(pk.last_used_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePasskey(pk.id)}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded-md hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Linked Social Accounts */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Linked Accounts</h2>
              <p className="text-sm text-gray-500 mb-4">
                Social and OAuth accounts linked to your profile for sign-in.
              </p>
              {socialLogins.length === 0 ? (
                <p className="text-sm text-gray-400">No linked accounts.</p>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                  {socialLogins.map(sl => (
                    <div key={sl.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900 capitalize">{sl.provider}</div>
                        {sl.email && <div className="text-xs text-gray-500">{sl.email}</div>}
                      </div>
                      <button
                        onClick={() => handleUnlinkSocial(sl.provider)}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded-md hover:bg-red-50"
                      >
                        Unlink
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SSO config (pro+ admins only) */}
            {canManageSettings && !canUseSso && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
                Single sign-on (OIDC) requires the <strong>Professional</strong> plan or higher.
              </div>
            )}
            {canUseSso && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Single Sign-On (OIDC)</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Configure OIDC single sign-on for your organization. Works with Okta, Azure AD,
                  Auth0, Keycloak, PingIdentity, OneLogin, and any OIDC-compliant IdP.
                </p>

                {ssoMsg && (
                  <div className={`mb-4 px-4 py-2 rounded-lg text-sm border ${
                    ssoMsg.includes('saved') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                  }`}>{ssoMsg}</div>
                )}

                <div className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={ssoConfig?.display_name || ''}
                      onChange={e => setSsoConfig((p: any) => ({ ...p, display_name: e.target.value }))}
                      placeholder="Acme Corp SSO"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">OIDC Discovery URL</label>
                    <input
                      type="url"
                      value={ssoConfig?.discovery_url || ''}
                      onChange={e => setSsoConfig((p: any) => ({ ...p, discovery_url: e.target.value, provider_type: 'oidc' }))}
                      placeholder="https://your-idp.example.com/.well-known/openid-configuration"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Okta: https://yourorg.okta.com/.well-known/openid-configuration<br/>
                      Azure: https://login.microsoftonline.com/TENANT_ID/v2.0/.well-known/openid-configuration
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                    <input
                      type="text"
                      value={ssoConfig?.client_id || ''}
                      onChange={e => setSsoConfig((p: any) => ({ ...p, client_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Secret <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>
                    </label>
                    <input
                      type="password"
                      value={ssoConfig?.client_secret_input || ''}
                      onChange={e => setSsoConfig((p: any) => ({ ...p, client_secret_input: e.target.value, client_secret: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ssoConfig?.enabled !== false}
                        onChange={e => setSsoConfig((p: any) => ({ ...p, enabled: e.target.checked }))}
                        className="rounded border-gray-300 text-purple-600"
                      />
                      Enabled
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ssoConfig?.auto_provision !== false}
                        onChange={e => setSsoConfig((p: any) => ({ ...p, auto_provision: e.target.checked }))}
                        className="rounded border-gray-300 text-purple-600"
                      />
                      Auto-provision new users
                    </label>
                  </div>
                  <button
                    onClick={handleSsoSave}
                    disabled={ssoSaving || !ssoConfig?.discovery_url}
                    className="px-6 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    {ssoSaving ? 'Saving...' : 'Save SSO Config'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== ROLES TAB ===== */}
        {activeTab === 'roles' && canManageRoles && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                One organization can hold many users. Admins can create team members and assign role stacks.
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={bootstrapAuditorSubroles}
                  disabled={creatingAuditorSubroles}
                  className="border border-purple-600 text-purple-700 px-4 py-2 rounded-md hover:bg-purple-50 transition-colors disabled:opacity-50"
                >
                  {creatingAuditorSubroles ? 'Generating...' : 'Generate Auditor Sub-Roles'}
                </button>
                <button
                  onClick={() => { setNewRoleName(''); setNewRoleDesc(''); setNewRolePerms([]); setCreateModalOpen(true); }}
                  className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 transition-colors"
                >
                  + Create Role
                </button>
              </div>
            </div>

            {/* RBAC Info Callout */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-1">🔑 How Roles &amp; Access Work</h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li><strong>Admin</strong> — grants unrestricted access to every feature. Any user assigned the <em>admin</em> primary role automatically bypasses individual permission checks and has full rights across the organization.</li>
                <li><strong>User / Auditor</strong> — system roles with a predefined permission set suitable for most team members. You can view and clone these, but cannot modify them.</li>
                <li><strong>Custom Roles</strong> — create org-specific roles with exactly the permissions you need. Multiple custom roles can be stacked on a single user for granular, least-privilege access control.</li>
              </ul>
            </div>

            {/* Recommended Roles */}
            {!loading && canManageRoles && (() => {
              const existingRoleNames = new Set(roles.map((r) => r.name.toLowerCase()));
              return (
              <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Recommended Roles</h3>
                <p className="text-xs text-gray-500 mb-3">Pre-configured role templates for common GRC functions. Click to provision instantly.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {RECOMMENDED_ROLES.map((template) => {
                    const alreadyExists = existingRoleNames.has(template.name.toLowerCase());
                    return (
                      <div key={template.name} className={`border rounded-lg p-3 ${alreadyExists ? 'border-gray-200 bg-gray-50' : 'border-purple-200 bg-purple-50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{template.icon} {template.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>
                            <p className="text-xs text-gray-400 mt-1">{template.permissions.length} permissions</p>
                          </div>
                          <button
                            onClick={() => provisionRecommendedRole(template)}
                            disabled={alreadyExists}
                            className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap ${
                              alreadyExists
                                ? 'bg-gray-200 text-gray-500 cursor-default'
                                : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}
                          >
                            {alreadyExists ? '✓ Created' : '+ Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })()}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-purple-600">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Permissions</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Users</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {roles.map((role) => (
                        <tr key={role.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{role.name}</span>
                              {role.is_system_role && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">System</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{role.description}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{role.permission_count || 0}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{role.user_count || 0}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {role.is_system_role ? (
                                <button onClick={() => setViewRole(role)} className="text-xs text-purple-600 hover:text-purple-800 font-medium">View Permissions</button>
                              ) : (
                                <button onClick={() => { setEditRole(role); setEditPerms(role.permissions || []); }} className="text-xs text-purple-600 hover:text-purple-800 font-medium">Edit</button>
                              )}
                              <button onClick={() => cloneRole(role)} className="text-xs text-gray-500 hover:text-gray-800 font-medium">Clone</button>
                              {!role.is_system_role && (
                                <button onClick={() => setDeleteRoleId(role.id)} className="text-xs text-red-600 hover:text-red-800 font-medium">Delete</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900">Team Provisioning</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Invite users with pre-configured roles, or create them directly. Invited users receive a link and only need to fill in their name and password.
                  </p>
                  {!canReadUsers && (
                    <p className="text-xs text-amber-700 mt-2">
                      Grant users.read or users.manage to view team members in this workspace.
                    </p>
                  )}
                  {!canManageUsers && (
                    <p className="text-xs text-amber-700 mt-1">
                      Grant users.manage to create, activate, or deactivate team members.
                    </p>
                  )}

                  {/* Invite User */}
                  <div className="mt-4 border border-purple-200 bg-purple-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-purple-900 mb-2">📨 Invite Team Member</h4>
                    <p className="text-xs text-purple-700 mb-3">
                      Pre-select a role and custom roles. The invited user will receive a link and only needs to enter their name and password.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Email address"
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      />
                      <select
                        value={invitePrimaryRole}
                        onChange={(e) => setInvitePrimaryRole(e.target.value as 'admin' | 'auditor' | 'user')}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="user">User</option>
                        <option value="auditor">Auditor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <select
                        multiple
                        value={inviteRoleIds}
                        onChange={(e) => setInviteRoleIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 min-h-[38px]"
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={sendInvite}
                        disabled={sendingInvite || !canManageUsers || !inviteEmail.trim()}
                        className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700 disabled:opacity-50"
                      >
                        {sendingInvite ? 'Sending...' : 'Send Invite'}
                      </button>
                    </div>
                    {lastInviteUrl && (
                      <div className="mt-3 bg-white border border-purple-200 rounded-md p-3">
                        <p className="text-xs font-medium text-purple-900 mb-1">Invite link (share with the user):</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 break-all">{lastInviteUrl}</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(lastInviteUrl); showToast('Link copied'); }}
                            className="text-xs px-3 py-1 border border-purple-300 text-purple-700 rounded hover:bg-purple-100 whitespace-nowrap"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pending Invites */}
                  {pendingInvites.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Pending Invites</h4>
                      <div className="space-y-2">
                        {pendingInvites.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm">
                            <div>
                              <span className="font-medium text-gray-900">{inv.email}</span>
                              <span className="text-gray-500 ml-2">({inv.primary_role})</span>
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                inv.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                inv.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                              }`}>{inv.status}</span>
                            </div>
                            {inv.status === 'pending' && (
                              <button
                                onClick={() => revokeInvite(inv.id)}
                                className="text-xs text-red-600 hover:text-red-800"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Direct create (legacy) */}
                  <details className="mt-4">
                    <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                      Or create a user directly with a temporary password
                    </summary>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
                      <input
                        type="text"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Full name"
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="Email"
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Temporary password"
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                      />
                      <select
                        value={newUserPrimaryRole}
                        onChange={(e) => setNewUserPrimaryRole(e.target.value as 'admin' | 'auditor' | 'user')}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="user">User</option>
                        <option value="auditor">Auditor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={createUser}
                        disabled={creatingUser || !canManageUsers}
                        className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        {creatingUser ? 'Creating...' : 'Add Team Member'}
                      </button>
                    </div>
                  </details>

                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Primary</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Assigned Roles</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {teamUsers.map((teamUser) => (
                          <tr key={teamUser.id}>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-gray-900">{teamUser.full_name || teamUser.email}</p>
                              <p className="text-xs text-gray-500">{teamUser.email}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{teamUser.role}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded ${
                                teamUser.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {teamUser.is_active ? 'active' : 'inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                multiple
                                value={userRoleSelections[teamUser.id] || []}
                                onChange={(event) => {
                                  const selectedIds = Array.from(event.target.selectedOptions).map((option) => option.value);
                                  setUserRoleSelections((prev) => ({
                                    ...prev,
                                    [teamUser.id]: selectedIds
                                  }));
                                }}
                                className="w-full min-w-[220px] px-2 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
                              >
                                {roles.map((role) => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => saveUserRoles(teamUser.id)}
                                  disabled={savingUserRoles === teamUser.id}
                                  className="text-xs border border-purple-600 text-purple-700 px-3 py-1 rounded hover:bg-purple-50 disabled:opacity-50"
                                >
                                  {savingUserRoles === teamUser.id ? 'Saving...' : 'Save Roles'}
                                </button>
                                <button
                                  onClick={() => toggleUserActive(teamUser)}
                                  disabled={updatingUser === teamUser.id || !canManageUsers}
                                  className="text-xs border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {updatingUser === teamUser.id ? 'Updating...' : (teamUser.is_active ? 'Deactivate' : 'Activate')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {teamUsers.length === 0 && (
                      <p className="text-sm text-gray-500 py-4">No users in this organization yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Create Role Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setCreateModalOpen(false)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10">
              <div className="p-6 border-b"><h3 className="text-lg font-bold text-gray-900">Create New Role</h3></div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                  <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Security Analyst" className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} placeholder="Describe what this role can do..." className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <PermissionCheckboxes selected={newRolePerms} onToggle={(p) => togglePerm(newRolePerms, setNewRolePerms, p)} />
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setCreateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleCreate} disabled={!newRoleName.trim()} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50">Create Role</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Role Modal */}
        {editRole && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setEditRole(null)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10">
              <div className="p-6 border-b"><h3 className="text-lg font-bold text-gray-900">Edit Role: {editRole.name}</h3></div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                  <input type="text" value={editRole.name} onChange={(e) => setEditRole({ ...editRole, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input type="text" value={editRole.description} onChange={(e) => setEditRole({ ...editRole, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                  <PermissionCheckboxes selected={editPerms} onToggle={(p) => togglePerm(editPerms, setEditPerms, p)} />
                </div>
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => setEditRole(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={handleEdit} disabled={!editRole.name.trim()} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* View System Role Permissions Modal */}
        {viewRole && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setViewRole(null)}></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10">
              <div className="p-6 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{viewRole.name}</h3>
                  {viewRole.description && <p className="text-sm text-gray-500 mt-0.5">{viewRole.description}</p>}
                </div>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">System Role</span>
              </div>
              <div className="p-6">
                {viewRole.name === 'admin' ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-amber-800">⚡ Full Access Role</p>
                    <p className="text-sm text-amber-700 mt-1">
                      The <strong>admin</strong> role grants unrestricted access to every feature and resource in your organization.
                      Users assigned this role automatically bypass individual permission checks and have full rights.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                    {Object.entries(
                      (viewRole.permissions || []).reduce<Record<string, string[]>>((acc, perm) => {
                        const resource = perm.split('.')[0];
                        if (!acc[resource]) acc[resource] = [];
                        acc[resource].push(perm);
                        return acc;
                      }, {})
                    ).map(([resource, perms]) => (
                      <div key={resource}>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{resource}</p>
                        <div className="flex flex-wrap gap-1">
                          {perms.map((perm) => (
                            <span key={perm} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{perm}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-6 border-t flex justify-between">
                <button onClick={() => cloneRole(viewRole)} className="border border-purple-600 text-purple-700 px-4 py-2 rounded-md hover:bg-purple-50 text-sm">
                  Clone as Custom Role
                </button>
                <button onClick={() => setViewRole(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteRoleId && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={() => setDeleteRoleId(null)}></div>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 z-10">
              <h3 className="text-lg font-bold text-gray-900">Delete Role?</h3>
              <p className="text-gray-600 mt-2">This role will be permanently deleted.</p>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setDeleteRoleId(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={() => handleDelete(deleteRoleId)} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
        {/* ===== NOTIFICATIONS TAB ===== */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            {/* SMTP Configuration — visible to org admins */}
            {canManageSettings && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-gray-900">Email (SMTP) Configuration</h2>
                  {smtpConfigured ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      ✓ Configured {smtpSource === 'environment' ? '(env vars)' : '(database)'}
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not configured</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Configure SMTP to enable email notifications and questionnaire delivery. Works with any SMTP provider:
                  SendGrid, AWS SES, Mailgun, Gmail, Postmark, etc.
                  {smtpSource === 'environment' && (
                    <span className="block mt-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                      ⚠️ SMTP is currently configured via environment variables. Saving here overrides the environment configuration for your organization.
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      placeholder="smtp.sendgrid.net"
                      value={smtpHost}
                      onChange={e => setSmtpHost(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Port</label>
                    <input
                      type="number"
                      placeholder="587"
                      value={smtpPort}
                      onChange={e => setSmtpPort(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">587 (TLS) · 465 (SSL) · 25 (plain)</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Username</label>
                    <input
                      type="text"
                      placeholder="apikey or username"
                      value={smtpUser}
                      onChange={e => setSmtpUser(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Password</label>
                    <input
                      type="password"
                      placeholder={smtpConfigured && smtpSource === 'database' ? 'Leave blank to keep existing' : 'Password or API key'}
                      value={smtpPass}
                      onChange={e => setSmtpPass(e.target.value)}
                      autoComplete="new-password"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">From Email Address</label>
                    <input
                      type="text"
                      placeholder="ControlWeave <noreply@yourcompany.com>"
                      value={smtpFromEmail}
                      onChange={e => setSmtpFromEmail(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={saveSmtpConfig}
                    disabled={smtpSaving}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm disabled:opacity-50"
                  >
                    {smtpSaving ? 'Saving…' : 'Save SMTP Settings'}
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      placeholder="test@example.com"
                      value={smtpTestEmail}
                      onChange={e => setSmtpTestEmail(e.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm w-52"
                    />
                    <button
                      onClick={testSmtpConfig}
                      disabled={smtpTesting || !smtpTestEmail}
                      className="px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm disabled:opacity-50"
                    >
                      {smtpTesting ? 'Sending…' : 'Send Test Email'}
                    </button>
                  </div>
                </div>
                {smtpMsg && (
                  <p className={`mt-2 text-sm ${smtpMsg.includes('saved') || smtpMsg.includes('sent') ? 'text-green-700' : 'text-red-600'}`}>
                    {smtpMsg}
                  </p>
                )}
              </div>
            )}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Notification Preferences</h2>
                  <p className="text-sm text-gray-500 mt-1">Control which notifications you receive in-app and by email.</p>
                </div>
                {notifEmailConfigured ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Email configured</span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Email not configured</span>
                )}
              </div>

              {notifPrefsLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading preferences...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-500 font-medium">
                        <th className="pb-2 pr-4">Notification Type</th>
                        <th className="pb-2 pr-4 text-center">In-App</th>
                        {notifEmailConfigured && <th className="pb-2 text-center">Email</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[
                        { type: 'control_due', label: 'Control Due', desc: 'Reminders when controls are approaching their review date' },
                        { type: 'assessment_needed', label: 'Assessment Needed', desc: 'Alerts when assessments require attention' },
                        { type: 'status_change', label: 'Status Change', desc: 'Notifications when a control status changes to verified' },
                        { type: 'system', label: 'System', desc: 'POA&M items and other system-generated notifications' },
                        { type: 'crosswalk', label: 'Crosswalk', desc: 'Framework crosswalk recommendations and updates' },
                      ].map(({ type, label, desc }) => {
                        const pref = notifPrefs.find(p => p.type === type) || { type, in_app: true, email: false };
                        const saving = notifSavingType === type;
                        return (
                          <tr key={type} className="hover:bg-gray-50">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-gray-800">{label}</div>
                              <div className="text-xs text-gray-500">{desc}</div>
                            </td>
                            <td className="py-3 pr-4 text-center">
                              <input
                                type="checkbox"
                                checked={pref.in_app}
                                disabled={saving}
                                onChange={e => handleNotifPrefChange(type, 'in_app', e.target.checked)}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                              />
                            </td>
                            {notifEmailConfigured && (
                              <td className="py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={pref.email}
                                  disabled={saving}
                                  onChange={e => handleNotifPrefChange(type, 'email', e.target.checked)}
                                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!notifEmailConfigured && (
                <div className="mt-4 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                  <span className="shrink-0 mt-0.5">ℹ️</span>
                  <span>Email notifications are disabled.{canManageSettings ? ' Configure your SMTP settings above to enable email delivery.' : ' Contact your organization admin to configure SMTP.'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Decision Review Side Panel */}
        {aiDecisionsSelected && (
          <div className="fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black opacity-40" onClick={() => setAiDecisionsSelected(null)} />
            <div className="relative ml-auto bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl p-6 flex flex-col gap-5 z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Decision Review</h3>
                <button onClick={() => setAiDecisionsSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex gap-4">
                  <span className="text-gray-500 w-24 shrink-0">Feature</span>
                  <span className="font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded">{aiDecisionsSelected.feature}</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-gray-500 w-24 shrink-0">Risk level</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    aiDecisionsSelected.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                    aiDecisionsSelected.risk_level === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{aiDecisionsSelected.risk_level || 'low'}</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-gray-500 w-24 shrink-0">Framework</span>
                  <span className="text-gray-800">{aiDecisionsSelected.regulatory_framework || '—'}</span>
                </div>
                <div className="flex gap-4">
                  <span className="text-gray-500 w-24 shrink-0">Date</span>
                  <span className="text-gray-800">{new Date(aiDecisionsSelected.processing_timestamp || aiDecisionsSelected.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Input summary */}
              {aiDecisionsSelected.input_data && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">Input</h4>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded-md p-3 overflow-auto max-h-32 whitespace-pre-wrap">
                    {typeof aiDecisionsSelected.input_data === 'string'
                      ? aiDecisionsSelected.input_data.slice(0, 500)
                      : JSON.stringify(aiDecisionsSelected.input_data, null, 2).slice(0, 500)}
                    {(typeof aiDecisionsSelected.input_data === 'string'
                      ? aiDecisionsSelected.input_data.length
                      : JSON.stringify(aiDecisionsSelected.input_data).length) > 500 ? '…' : ''}
                  </pre>
                </div>
              )}

              {/* Bias flags */}
              {Array.isArray(aiDecisionsSelected.bias_flags) && aiDecisionsSelected.bias_flags.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Bias Flags</h4>
                  <ul className="space-y-1">
                    {aiDecisionsSelected.bias_flags.map((flag: any, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <span className="text-amber-600 font-semibold shrink-0">{flag.type || 'FLAG'}</span>
                        <span className="text-amber-800">{flag.description || JSON.stringify(flag)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <hr className="border-gray-200" />

              {/* Human review section */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Human Review</h4>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Outcome</label>
                  <select
                    value={aiDecisionsOutcome}
                    onChange={e => setAiDecisionsOutcome(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select outcome…</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="needs_revision">Needs Revision</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Notes</label>
                  <textarea
                    value={aiDecisionsNotes}
                    onChange={e => setAiDecisionsNotes(e.target.value)}
                    rows={3}
                    placeholder="Optional reviewer notes..."
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={handleAiDecisionReview}
                  disabled={aiDecisionsSaving || !aiDecisionsOutcome}
                  className="w-full py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {aiDecisionsSaving ? 'Saving…' : 'Save Review'}
                </button>
              </div>

              {/* Bias review section */}
              {Array.isArray(aiDecisionsSelected.bias_flags) && aiDecisionsSelected.bias_flags.length > 0 && !aiDecisionsSelected.bias_reviewed && (
                <div className="space-y-3 border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-semibold text-gray-700">Bias Review</h4>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fairness Notes</label>
                    <textarea
                      value={aiDecisionsBiasNotes}
                      onChange={e => setAiDecisionsBiasNotes(e.target.value)}
                      rows={3}
                      placeholder="Explain bias flag assessment and mitigation steps..."
                      className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <button
                    onClick={handleAiDecisionBiasReview}
                    disabled={aiDecisionsSaving}
                    className="w-full py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 disabled:opacity-50"
                  >
                    {aiDecisionsSaving ? 'Saving…' : 'Mark Bias Reviewed'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ACCOUNT TAB ===== */}
        {activeTab === 'account' && canManageSettings && (
          <div className="space-y-6">
            {/* Data Export */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Export Your Data</h2>
              <p className="text-sm text-gray-500 mb-4">
                Download a complete JSON archive of your organization&apos;s data including profile, frameworks,
                controls, implementation status, assets, users, and audit logs.
              </p>
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {exporting ? 'Exporting…' : 'Download Data Export (JSON)'}
              </button>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-lg shadow-md p-6 border-2 border-red-200">
              <h2 className="text-lg font-bold text-red-700 mb-1">Danger Zone</h2>
              <p className="text-sm text-gray-600 mb-4">
                Cancelling your account will immediately downgrade your organization to the Free tier.
                Your data will be retained for 30 days. Payment processing will stop once Stripe integration is live.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-red-800 mb-2">What happens when you cancel:</p>
                <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                  <li>Your organization is downgraded to the Free tier immediately</li>
                  <li>Framework access is limited to 2 frameworks (Free tier limit)</li>
                  <li>AI features remain available with reduced usage limits</li>
                  <li>Your data is retained for 30 days — export it before cancelling</li>
                  <li>Payment will stop once Stripe billing integration is live</li>
                  <li>You can reactivate by upgrading your tier in Settings at any time</li>
                </ul>
              </div>
              <button
                onClick={() => setCancelModalOpen(true)}
                className="px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
              >
                Cancel Account
              </button>
            </div>
          </div>
        )}

        {/* Cancel Account Confirmation Modal */}
        {cancelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 mx-4">
              <h3 className="text-lg font-bold text-red-700 mb-2">Cancel Your Account</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will downgrade your organization to the Free tier. Your data will be retained
                for 30 days. We recommend exporting your data first.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Why are you cancelling? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please let us know why you're cancelling..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-red-500 mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setCancelModalOpen(false); setCancelReason(''); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Keep Account
                </button>
                <button
                  onClick={handleCancelAccount}
                  disabled={cancelling || !cancelReason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-12 text-center text-gray-500">Loading...</div></DashboardLayout>}>
      <SettingsPageInner />
    </Suspense>
  );
}
