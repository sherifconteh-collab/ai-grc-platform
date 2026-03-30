'use client';
// @tier: community
import axios from 'axios';
import { getApiBaseUrl } from './apiBase';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenStore';

export const API_BASE_URL = getApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 30_000, // 30s default timeout for non-AI requests
});

// Timeout values for AI endpoints (these can take longer due to LLM calls)
const AI_REQUEST_TIMEOUT = 180_000; // 3 minutes for individual AI analysis
const AI_SWARM_TIMEOUT = 300_000;   // 5 minutes for parallel swarm execution
const UPLOAD_TIMEOUT = 120_000;     // 2 minutes for file uploads/imports

// Request interceptor - add auth token from in-memory store (not localStorage)
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data.data;
        // Store the new access token in memory only, never in localStorage
        setAccessToken(accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear tokens and redirect to login
        clearAccessToken();
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  register: (data: {
    email: string;
    password: string;
    fullName: string;
    organizationName?: string;
    initialRole?: 'admin' | 'auditor' | 'user';
    frameworkCodes?: string[];
    informationTypes?: string[];
  }) => {
    const organizationName = String(data.organizationName || '').trim();
    const frameworkCodes = Array.isArray(data.frameworkCodes)
      ? data.frameworkCodes.map((entry) => String(entry || '').trim().toLowerCase()).filter((entry) => entry.length > 0)
      : [];
    const informationTypes = Array.isArray(data.informationTypes)
      ? data.informationTypes.map((entry) => String(entry || '').trim().toLowerCase()).filter((entry) => entry.length > 0)
      : [];
    return (
    api.post('/auth/register', {
      email: data.email,
      password: data.password,
      full_name: data.fullName,
      ...(organizationName ? { organization_name: organizationName } : {}),
      initial_role: data.initialRole || 'admin',
      ...(frameworkCodes.length > 0 ? { framework_codes: frameworkCodes } : {}),
      ...(informationTypes.length > 0 ? { information_types: informationTypes } : {}),
    })
  );
  },

  login: (data: { email: string; password: string; totp_code?: string }) =>
    api.post('/auth/login', data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { token: string; password: string }) =>
    api.post('/auth/reset-password', data),

  logout: (refreshToken?: string) =>
    api.post('/auth/logout', refreshToken ? { refreshToken } : undefined),

  getCurrentUser: () => api.get('/auth/me'),

  getMyOrganizations: () => api.get('/auth/my-organizations'),

  switchOrganization: (orgId: string, refreshToken?: string) =>
    api.post(`/auth/switch-organization/${orgId}`, refreshToken ? { refreshToken } : undefined),

  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),

  validateInvite: (token: string) =>
    api.get(`/auth/invite/${token}`),

  acceptInvite: (data: { token: string; full_name: string; password: string }) =>
    api.post('/auth/accept-invite', data),
};

// Framework APIs
export const frameworkAPI = {
  getAll: () => api.get('/frameworks'),

  getNistPublications: (params?: {
    search?: string;
    publication_family?: string;
    publication_type?: string;
    private_only?: boolean;
    federal_only?: boolean;
    include_mappings?: boolean;
  }) => api.get('/frameworks/nist-publications', { params }),

  getNistPublicationById: (id: string, params?: {
    include_mappings?: boolean;
  }) => api.get(`/frameworks/nist-publications/${id}`, { params }),

  getNistPublicationCoverage: (params?: {
    search?: string;
    publication_family?: string;
    publication_type?: string;
    private_only?: boolean;
    federal_only?: boolean;
  }) => api.get('/frameworks/nist-publications/coverage', { params }),

  searchNistControlCatalog: (params?: {
    search?: string;
    framework_code?: string;
    limit?: number;
  }) => api.get('/frameworks/nist-publications/catalog-controls', { params }),

  saveNistPublicationMappings: (
    publicationId: string,
    data: {
      mappings: Array<{
        framework_code: string;
        control_id: string;
        mapping_strength?: 'primary' | 'supporting' | 'informative';
        mapping_note?: string | null;
        sort_order?: number;
      }>;
      replace_existing?: boolean;
    }
  ) => api.put(`/frameworks/nist-publications/${publicationId}/mappings`, data),
};

// Dashboard APIs
export const dashboardAPI = {
  getOverview: (params?: { period?: string }) => api.get('/dashboard/overview', { params }),

  getStats: () => api.get('/dashboard/stats'),

  getPriorityActions: () => api.get('/dashboard/priority-actions'),

  getRecentActivity: (params?: { limit?: number; offset?: number; event_type?: string }) =>
    api.get('/dashboard/recent-activity', { params }),

  getComplianceTrend: (params: { period: string }) =>
    api.get('/dashboard/compliance-trend', { params }),

  getCrosswalkImpact: () => api.get('/dashboard/crosswalk-impact'),

  getCrosswalkedControls: () => api.get('/dashboard/crosswalked-controls'),

  getMaturityScore: () => api.get('/dashboard/maturity-score'),
};

// Organization APIs
export const organizationAPI = {
  getFrameworks: (orgId: string) => api.get(`/organizations/${orgId}/frameworks`),

  createNew: (data: { name: string }) =>
    api.post('/organizations/me/new', data),

  cloneFromTemplate: (data: { name: string }) =>
    api.post('/organizations/me/clone', data),

  addFrameworks: (orgId: string, data: { frameworkIds: string[] }) =>
    api.post(`/organizations/${orgId}/frameworks`, data),

  removeFramework: (orgId: string, frameworkId: string) =>
    api.delete(`/organizations/${orgId}/frameworks/${frameworkId}`),

  getControls: (orgId: string, params?: { frameworkId?: string; status?: string }) =>
    api.get(`/organizations/${orgId}/controls`, { params }),

  exportControlAnswers: (
    orgId: string,
    params?: { format?: 'xlsx' | 'csv'; frameworkId?: string; status?: string }
  ) => api.get(`/organizations/${orgId}/controls/export`, { params, responseType: 'blob' }),

  importControlAnswers: (
    orgId: string,
    formData: FormData,
    params?: { mode?: 'merge' | 'replace'; ai?: '0' | '1'; provider?: string; model?: string }
  ) => api.post(`/organizations/${orgId}/controls/import`, formData, {
    params,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT
  }),

  getMyProfile: () => api.get('/organizations/me/profile'),

  updateMyProfile: (data: {
    company_legal_name?: string | null;
    company_description?: string | null;
    industry?: string | null;
    website?: string | null;
    headquarters_location?: string | null;
    employee_count_range?: string | null;
    system_name?: string | null;
    system_description?: string | null;
    authorization_boundary?: string | null;
    operating_environment_summary?: string | null;
    confidentiality_impact?: 'low' | 'moderate' | 'high' | null;
    integrity_impact?: 'low' | 'moderate' | 'high' | null;
    availability_impact?: 'low' | 'moderate' | 'high' | null;
    impact_rationale?: string | null;
    environment_types?: string[];
    deployment_model?: 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only' | null;
    cloud_providers?: string[];
    data_sensitivity_types?: string[];
    rmf_stage?: 'prepare' | 'categorize' | 'select' | 'implement' | 'assess' | 'authorize' | 'monitor' | null;
    rmf_notes?: string | null;
    compliance_profile?: 'private' | 'federal' | 'hybrid' | null;
    nist_adoption_mode?: 'best_practice' | 'mandatory' | null;
    nist_notes?: string | null;
    onboarding_completed?: boolean;
  }) => api.put('/organizations/me/profile', data),

  getSystems: (params?: { include_inactive?: boolean }) =>
    api.get('/organizations/me/systems', { params }),

  createSystem: (data: {
    system_name: string;
    system_code?: string | null;
    system_description?: string | null;
    authorization_boundary_override?: string | null;
    operating_environment_summary_override?: string | null;
    confidentiality_impact?: 'low' | 'moderate' | 'high' | null;
    integrity_impact?: 'low' | 'moderate' | 'high' | null;
    availability_impact?: 'low' | 'moderate' | 'high' | null;
    impact_rationale?: string | null;
    environment_types?: string[];
    deployment_model?: 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only' | null;
    cloud_providers?: string[];
    data_sensitivity_types?: string[];
    is_primary?: boolean;
    is_active?: boolean;
  }) => api.post('/organizations/me/systems', data),

  updateSystem: (systemId: string, data: {
    system_name?: string;
    system_code?: string | null;
    system_description?: string | null;
    authorization_boundary_override?: string | null;
    operating_environment_summary_override?: string | null;
    confidentiality_impact?: 'low' | 'moderate' | 'high' | null;
    integrity_impact?: 'low' | 'moderate' | 'high' | null;
    availability_impact?: 'low' | 'moderate' | 'high' | null;
    impact_rationale?: string | null;
    environment_types?: string[];
    deployment_model?: 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only' | null;
    cloud_providers?: string[];
    data_sensitivity_types?: string[];
    is_primary?: boolean;
    is_active?: boolean;
  }) => api.put(`/organizations/me/systems/${systemId}`, data),

  deleteSystem: (systemId: string) =>
    api.delete(`/organizations/me/systems/${systemId}`),

  getCotsProducts: (params?: { system_id?: string; lifecycle_status?: string; search?: string }) =>
    api.get('/organizations/me/cots-products', { params }),

  createCotsProduct: (data: {
    system_id?: string | null;
    product_name: string;
    vendor_name: string;
    product_version?: string | null;
    product_type?: 'cots' | 'saas' | 'managed_service' | 'platform' | 'other' | null;
    deployment_model?: 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only' | 'managed_service' | 'other' | null;
    data_access_level?: 'none' | 'metadata' | 'limited' | 'full' | null;
    lifecycle_status?: 'planned' | 'active' | 'deprecated' | 'retired' | null;
    criticality?: 'low' | 'medium' | 'high' | 'critical' | null;
    support_end_date?: string | null;
    notes?: string | null;
  }) => api.post('/organizations/me/cots-products', data),

  updateCotsProduct: (productId: string, data: {
    system_id?: string | null;
    product_name?: string;
    vendor_name?: string;
    product_version?: string | null;
    product_type?: 'cots' | 'saas' | 'managed_service' | 'platform' | 'other' | null;
    deployment_model?: 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only' | 'managed_service' | 'other' | null;
    data_access_level?: 'none' | 'metadata' | 'limited' | 'full' | null;
    lifecycle_status?: 'planned' | 'active' | 'deprecated' | 'retired' | null;
    criticality?: 'low' | 'medium' | 'high' | 'critical' | null;
    support_end_date?: string | null;
    notes?: string | null;
  }) => api.put(`/organizations/me/cots-products/${productId}`, data),

  deleteCotsProduct: (productId: string) =>
    api.delete(`/organizations/me/cots-products/${productId}`),

  getContracts: (params?: { system_id?: string; status?: string; search?: string }) =>
    api.get('/organizations/me/contracts', { params }),

  createContract: (data: {
    system_id?: string | null;
    cots_product_id?: string | null;
    contract_name: string;
    vendor_name: string;
    contract_number?: string | null;
    contract_type?: 'msa' | 'sow' | 'license' | 'dpa' | 'baa' | 'sla' | 'other' | null;
    status?: 'draft' | 'active' | 'renewal_pending' | 'expired' | 'terminated' | null;
    start_date?: string | null;
    end_date?: string | null;
    renewal_date?: string | null;
    notice_period_days?: number | null;
    security_requirements?: string | null;
    data_processing_terms?: string | null;
    sla_summary?: string | null;
    notes?: string | null;
  }) => api.post('/organizations/me/contracts', data),

  updateContract: (contractId: string, data: {
    system_id?: string | null;
    cots_product_id?: string | null;
    contract_name?: string;
    vendor_name?: string;
    contract_number?: string | null;
    contract_type?: 'msa' | 'sow' | 'license' | 'dpa' | 'baa' | 'sla' | 'other' | null;
    status?: 'draft' | 'active' | 'renewal_pending' | 'expired' | 'terminated' | null;
    start_date?: string | null;
    end_date?: string | null;
    renewal_date?: string | null;
    notice_period_days?: number | null;
    security_requirements?: string | null;
    data_processing_terms?: string | null;
    sla_summary?: string | null;
    notes?: string | null;
  }) => api.put(`/organizations/me/contracts/${contractId}`, data),

  deleteContract: (contractId: string) =>
    api.delete(`/organizations/me/contracts/${contractId}`),
};

// Controls APIs
export const controlsAPI = {
  getControl: (controlId: string) => api.get(`/controls/${controlId}`),

  updateImplementation: (
    controlId: string,
    data: {
      status: string;
      implementationDetails?: string;
      evidenceUrl?: string;
      assignedTo?: string;
      notes?: string;
    }
  ) => api.put(`/controls/${controlId}/implementation`, data),

  getMappings: (controlId: string) => api.get(`/controls/${controlId}/mappings`),

  getHistory: (controlId: string) => api.get(`/controls/${controlId}/history`),

  // Trigger manual crosswalk inheritance to automatically satisfy similar controls
  // across other active frameworks (same logic as the auto-crosswalk on PUT /implementation)
  triggerInherit: (controlId: string, data?: { inheritedStatus?: string; minSimilarity?: number }) =>
    api.post(`/controls/${controlId}/inherit`, data || {}),
};

// Dynamic org configuration API (key/value config store, e.g. crosswalk threshold)
export const dynamicConfigAPI = {
  get: (domain: string, key: string) =>
    api.get(`/config/${encodeURIComponent(domain)}/${encodeURIComponent(key)}`),
  set: (domain: string, key: string, value: unknown) =>
    api.put(`/config/${encodeURIComponent(domain)}/${encodeURIComponent(key)}`, { value }),
  remove: (domain: string, key: string) =>
    api.delete(`/config/${encodeURIComponent(domain)}/${encodeURIComponent(key)}`),
};

// Audit APIs
export const auditAPI = {
  getLogs: (params: {
    userId?: string;
    eventType?: string;
    resourceType?: string;
    resourceId?: string;
    findingKey?: string;
    vulnerabilityId?: string;
    source?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => api.get('/audit/logs', { params }),

  getStats: (params: { startDate?: string; endDate?: string }) =>
    api.get('/audit/stats', { params }),

  getEventTypes: () => api.get('/audit/event-types'),

  getUserLogs: (userId: string) => api.get(`/audit/user/${userId}`),

  createLog: (data: {
    event_type: string;
    resource_type?: string;
    resource_id?: string;
    details?: Record<string, unknown>;
    outcome?: string;
    source_system?: string;
  }) => api.post('/audit/logs', data),

  getSplunkLive: (params?: {
    search?: string;
    earliestTime?: string;
    latestTime?: string;
    maxEvents?: number;
  }) => api.get('/audit/splunk/live', { params }),
};

// Vulnerabilities APIs
export const vulnerabilitiesAPI = {
  getAll: (params?: {
    source?: string | string[];
    standard?: string | string[];
    severity?: string | string[];
    status?: string | string[];
    assetId?: string;
    minCvss?: number;
    maxCvss?: number;
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get('/vulnerabilities', { params }),

  getSources: () => api.get('/vulnerabilities/sources'),

  getById: (id: string) => api.get(`/vulnerabilities/${id}`),

  analyzeVulnerability: (id: string) => api.post(`/vulnerabilities/${id}/analyze`),

  importScan: (formData: FormData) =>
    api.post('/vulnerabilities/import', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT }),

  getWorkflow: (id: string) => api.get(`/vulnerabilities/${id}/workflow`),

  updateWorkflowItem: (
    vulnerabilityId: string,
    workItemId: string,
    data: {
      actionType?: 'poam' | 'close_control_gap' | 'risk_acceptance' | 'false_positive_review';
      actionStatus?: 'open' | 'in_progress' | 'resolved' | 'accepted' | 'closed';
      controlEffect?: 'non_compliant' | 'partial' | 'compliant';
      responseSummary?: string;
      responseDetails?: string;
      dueDate?: string;
      ownerId?: string | null;
    }
  ) => api.patch(`/vulnerabilities/${vulnerabilityId}/workflow/${workItemId}`, data),
};

// SBOM APIs
export const sbomAPI = {
  getAssets: (params?: { search?: string; limit?: number }) =>
    api.get('/sbom/assets', { params }),

  getAll: (params?: { limit?: number; offset?: number }) =>
    api.get('/sbom', { params }),

  getById: (id: string) =>
    api.get(`/sbom/${id}`),

  upload: (formData: FormData) =>
    api.post('/sbom/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT }),
};

// Implementations APIs
export const implementationsAPI = {
  getAll: (params?: { frameworkId?: string; status?: string; assignedTo?: string; priority?: string; controlId?: string }) =>
    api.get('/implementations', { params }),

  ensureForControl: (controlId: string) =>
    api.post(`/implementations/by-control/${controlId}/ensure`),

  getById: (id: string) => api.get(`/implementations/${id}`),

  updateStatus: (id: string, data: { status: string; notes?: string }) =>
    api.patch(`/implementations/${id}/status`, data),

  assign: (id: string, data: { assignedTo?: string | null; dueDate?: string | null; notes?: string }) =>
    api.patch(`/implementations/${id}/assign`, data),

  review: (id: string, data: { notes?: string; stillApplicable?: boolean; evidenceUpdated?: boolean }) =>
    api.post(`/implementations/${id}/review`, data),

  updateTestResult: (id: string, data: { test_result: string; test_notes?: string }) =>
    api.patch(`/implementations/${id}/test-result`, data),

  getActivityFeed: (params?: { limit?: number; offset?: number }) =>
    api.get('/implementations/activity/feed', { params }),

  getDueControls: (params?: { days?: number }) =>
    api.get('/implementations/due/upcoming', { params }),
};

// Data Governance APIs
export const dataGovernanceAPI = {
  getPolicies: () => api.get('/data-governance/policies'),
  createPolicy: (data: {
    policy_name: string;
    data_category: string;
    retention_period_days: number;
    auto_delete_enabled: boolean;
    legal_basis?: string;
  }) => api.post('/data-governance/policies', data),
  updatePolicy: (policyId: string, data: {
    policy_name?: string;
    data_category?: string;
    retention_period_days?: number;
    auto_delete_enabled?: boolean;
    legal_basis?: string;
  }) => api.patch(`/data-governance/policies/${policyId}`, data),
  getLegalHolds: () => api.get('/data-governance/legal-holds'),
  createLegalHold: (data: {
    hold_name: string;
    hold_reason: string;
    data_scope: string;
    custodian_name?: string;
    start_date: string;
  }) => api.post('/data-governance/legal-holds', data),
  releaseLegalHold: (holdId: string) =>
    api.post(`/data-governance/legal-holds/${holdId}/release`),
  signEvidence: (evidenceId: string) =>
    api.post(`/data-governance/evidence/${evidenceId}/sign`),
  exportImmutableEvidence: (evidenceId: string) =>
    api.get(`/data-governance/evidence/${evidenceId}/immutable-export`),
};

// Evidence APIs
export const evidenceAPI = {
  getAll: (params?: { search?: string; tags?: string; limit?: number; offset?: number }) =>
    api.get('/evidence', { params }),

  upload: (formData: FormData) =>
    api.post('/evidence/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT }),

  bulkUpload: (formData: FormData) =>
    api.post('/evidence/bulk-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT }),

  getById: (id: string) => api.get(`/evidence/${id}`),

  download: (id: string) => api.get(`/evidence/${id}/download`, { responseType: 'blob' }),

  update: (id: string, data: { description?: string; tags?: string[]; pii_classification?: string; pii_types?: string[]; data_sensitivity?: string }) =>
    api.put(`/evidence/${id}`, data),

  remove: (id: string) => api.delete(`/evidence/${id}`),

  link: (id: string, data: { controlIds: string[]; notes?: string }) =>
    api.post(`/evidence/${id}/link`, data),

  unlink: (evidenceId: string, controlId: string) =>
    api.delete(`/evidence/${evidenceId}/unlink/${controlId}`),
};

// Roles APIs
export const rolesAPI = {
  getAll: () => api.get('/roles'),

  getById: (roleId: string) => api.get(`/roles/${roleId}`),

  create: (data: { name: string; description: string; permissions: string[] }) =>
    api.post('/roles', data),

  update: (roleId: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    api.put(`/roles/${roleId}`, data),

  remove: (roleId: string) => api.delete(`/roles/${roleId}`),

  getAllPermissions: () => api.get('/roles/permissions/all'),

  assignRole: (data: { userId: string; roleIds: string[] }) =>
    api.post('/roles/assign', data),

  getUserRoles: (userId: string) => api.get(`/roles/user/${userId}`),

  bootstrapAuditorSubroles: () => api.post('/roles/bootstrap-auditor-subroles'),
};

// Users APIs
export const usersAPI = {
  getOrgUsers: () => api.get('/users'),

  create: (data: {
    email: string;
    password: string;
    full_name: string;
    primary_role?: 'admin' | 'auditor' | 'user';
    role_ids?: string[];
    auto_generate_auditor_subroles?: boolean;
  }) => api.post('/users', data),

  update: (userId: string, data: {
    full_name?: string;
    primary_role?: 'admin' | 'auditor' | 'user';
    is_active?: boolean;
    role_ids?: string[];
    auto_generate_auditor_subroles?: boolean;
  }) => api.patch(`/users/${userId}`, data),

  invite: (data: {
    email: string;
    primary_role?: 'admin' | 'auditor' | 'user';
    role_ids?: string[];
  }) => api.post('/users/invite', data),

  getInvites: () => api.get('/users/invites'),

  revokeInvite: (inviteId: string) => api.delete(`/users/invites/${inviteId}`),
};


// ---------------------------------------------------------------------------
// CMDB -- Configuration Management Database
// Tracks: Hardware, Software, AI Agents, Service Accounts, Environments,
//         Password Vaults.  Every record carries an owner field.
// ---------------------------------------------------------------------------
function cmdbResource(routePath: string) {
  return {
    getAll:  (params?: Record<string, string>) => api.get(`/cmdb/${routePath}`, { params }),
    getById: (id: string)                      => api.get(`/cmdb/${routePath}/${id}`),
    create:  (data: Record<string, unknown>)   => api.post(`/cmdb/${routePath}`, data),
    update:  (id: string, data: Record<string, unknown>) => api.put(`/cmdb/${routePath}/${id}`, data),
    remove:  (id: string)                      => api.delete(`/cmdb/${routePath}/${id}`),
  };
}

export const cmdbAPI = {
  hardware:        cmdbResource("hardware"),
  software:        cmdbResource("software"),
  aiAgents:        cmdbResource("ai-agents"),
  serviceAccounts: cmdbResource("service-accounts"),
  environments:    cmdbResource("environments"),
  passwordVaults:  cmdbResource("password-vaults"),
  allAssets:       (search?: string) => api.get('/cmdb/assets', { params: search ? { search } : undefined }),
  relationships: {
    getByAsset: (assetId: string)                     => api.get('/cmdb/relationships', { params: { asset_id: assetId } }),
    getAll:     ()                                     => api.get('/cmdb/relationships/all'),
    create:     (data: Record<string, unknown>)        => api.post('/cmdb/relationships', data),
    remove:     (id: string)                           => api.delete(`/cmdb/relationships/${id}`),
  },
};

// AI Analysis APIs
export const aiAPI = {
  getStatus: () => api.get('/ai/status'),
  chat: (data: { messages: { role: string; content: string }[]; systemPrompt?: string; provider?: string; model?: string }) =>
    api.post('/ai/chat', data, { timeout: AI_REQUEST_TIMEOUT }),
  gapAnalysis: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/gap-analysis', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  crosswalkOptimizer: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/crosswalk-optimizer', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  complianceForecast: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/compliance-forecast', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  regulatoryMonitor: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/regulatory-monitor', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  remediationPlaybook: (controlId: string, data?: { provider?: string; model?: string }) =>
    api.post(`/ai/remediation/${controlId}`, data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  incidentResponse: (data: { incidentType?: string; provider?: string; model?: string }) =>
    api.post('/ai/incident-response', data, { timeout: AI_REQUEST_TIMEOUT }),
  executiveReport: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/executive-report', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  riskHeatmap: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/risk-heatmap', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  vendorRisk: (data: { vendorInfo: Record<string, unknown>; provider?: string; model?: string }) =>
    api.post('/ai/vendor-risk', data, { timeout: AI_REQUEST_TIMEOUT }),
  auditReadiness: (data?: { framework?: string; provider?: string; model?: string }) =>
    api.post('/ai/audit-readiness', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  auditPbcDraft: (data: {
    requestContext: string;
    controlId?: string;
    frameworkCode?: string;
    dueDate?: string;
    priority?: string;
    provider?: string;
    model?: string;
  }) => api.post('/ai/audit/pbc-draft', data, { timeout: AI_REQUEST_TIMEOUT }),
  auditWorkpaperDraft: (data: {
    objective: string;
    controlId?: string;
    procedurePerformed?: string;
    evidenceSummary?: string;
    testOutcome?: string;
    provider?: string;
    model?: string;
  }) => api.post('/ai/audit/workpaper-draft', data, { timeout: AI_REQUEST_TIMEOUT }),
  auditFindingDraft: (data: {
    issueSummary: string;
    controlId?: string;
    evidenceSummary?: string;
    severityHint?: string;
    recommendationScope?: string;
    provider?: string;
    model?: string;
  }) => api.post('/ai/audit/finding-draft', data, { timeout: AI_REQUEST_TIMEOUT }),
  assetControlMapping: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/asset-control-mapping', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  shadowIT: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/shadow-it', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  aiGovernance: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/ai-governance', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  complianceQuery: (data: { question: string; provider?: string; model?: string }) =>
    api.post('/ai/query', data, { timeout: AI_REQUEST_TIMEOUT }),
  trainingRecommendations: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/training-recommendations', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  evidenceSuggest: (controlId: string, data?: { provider?: string; model?: string }) =>
    api.post(`/ai/evidence-suggest/${controlId}`, data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  analyzeControl: (controlId: string, data?: { provider?: string; model?: string }) =>
    api.post(`/ai/analyze/control/${controlId}`, data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  testProcedures: (controlId: string, data?: { provider?: string; model?: string }) =>
    api.post(`/ai/test-procedures/${controlId}`, data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  analyzeAsset: (assetId: string, data?: { provider?: string; model?: string }) =>
    api.post(`/ai/analyze/asset/${assetId}`, data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  generatePolicy: (data: { policyType: string; provider?: string; model?: string }) =>
    api.post('/ai/generate-policy', data, { timeout: AI_REQUEST_TIMEOUT }),
  getUsageReport: () => api.get('/ai/usage-report'),
  getDecisions: () => api.get('/ai/decisions'),
  reviewDecision: (decisionId: string) =>
    api.patch(`/ai/decisions/${decisionId}/review`),
  flagBiasDecision: (decisionId: string) =>
    api.patch(`/ai/decisions/${decisionId}/bias-review`),
  securityPosture: (data?: { provider?: string; model?: string }) =>
    api.post('/ai/security-posture', data || {}, { timeout: AI_REQUEST_TIMEOUT }),
  tprmGenerateQuestionnaire: (data: { vendorInfo: Record<string, unknown>; provider?: string; model?: string }) =>
    api.post('/ai/tprm/generate-questionnaire', data, { timeout: AI_REQUEST_TIMEOUT }),
  tprmAnalyzeResponses: (data: { questionnaireId: string; provider?: string; model?: string }) =>
    api.post('/ai/tprm/analyze-responses', data, { timeout: AI_REQUEST_TIMEOUT }),
  tprmAnalyzeEvidence: (data: { questionnaireId: string; provider?: string; model?: string }) =>
    api.post('/ai/tprm/analyze-evidence', data, { timeout: AI_REQUEST_TIMEOUT }),
  // Multi-agent swarm orchestration
  getSwarmConfigs: () => api.get('/ai/swarm/configs'),
  executeSwarm: (data: { swarmType: string; provider?: string; model?: string }) =>
    api.post('/ai/swarm/execute', data, { timeout: AI_SWARM_TIMEOUT }),
  // Reasoning Memory (ReasoningBank)
  getReasoningMemoryStats: () => api.get('/ai/reasoning-memory/stats'),
  getReasoningMemoryEntries: (params?: { limit?: number; feature?: string }) =>
    api.get('/ai/reasoning-memory/entries', { params }),
  clearReasoningMemory: () => api.delete('/ai/reasoning-memory'),
  // Agent Booster
  getAgentBoosterStatus: () => api.get('/ai/agent-booster/status'),
};

// Assessment Procedures APIs (NIST 800-53A, ISO 27001, SOC 2, etc.)
export const assessmentsAPI = {
  getProcedures: (params?: {
    framework_code?: string;
    control_id?: string;
    procedure_type?: string;
    depth?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get('/assessments/procedures', { params }),

  getProceduresByControl: (controlId: string) =>
    api.get(`/assessments/procedures/by-control/${controlId}`),

  getProcedure: (id: string) =>
    api.get(`/assessments/procedures/${id}`),

  recordResult: (data: {
    procedure_id: string;
    status: string;
    finding?: string;
    evidence_collected?: string;
    risk_level?: string;
    remediation_required?: boolean;
    remediation_deadline?: string;
  }) => api.post('/assessments/results', data),

  getStats: () => api.get('/assessments/stats'),

  getFrameworks: () => api.get('/assessments/frameworks'),

  createPlan: (data: {
    name: string;
    description?: string;
    framework_id?: string;
    assessment_type?: string;
    depth?: string;
    start_date?: string;
    end_date?: string;
  }) => api.post('/assessments/plans', data),

  getPlans: () => api.get('/assessments/plans'),

  getEngagements: (params?: {
    status?: string;
    engagement_type?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => api.get('/assessments/engagements', { params }),

  createEngagement: (data: {
    name: string;
    engagement_type?: 'internal_audit' | 'external_audit' | 'readiness' | 'assessment';
    scope?: string;
    framework_codes?: string[];
    status?: 'planning' | 'fieldwork' | 'reporting' | 'completed' | 'archived';
    period_start?: string;
    period_end?: string;
    lead_auditor_id?: string | null;
    engagement_owner_id?: string | null;
  }) => api.post('/assessments/engagements', data),

  getEngagementById: (id: string) => api.get(`/assessments/engagements/${id}`),

  handoffEngagement: (id: string, data: {
    lead_auditor_id: string;
    engagement_owner_id?: string | null;
  }) => api.post(`/assessments/engagements/${id}/handoff`, data),

  updateEngagement: (id: string, data: {
    name?: string;
    engagement_type?: 'internal_audit' | 'external_audit' | 'readiness' | 'assessment';
    scope?: string;
    framework_codes?: string[];
    status?: 'planning' | 'fieldwork' | 'reporting' | 'completed' | 'archived';
    period_start?: string | null;
    period_end?: string | null;
    lead_auditor_id?: string | null;
    engagement_owner_id?: string | null;
  }) => api.patch(`/assessments/engagements/${id}`, data),

  getEngagementProcedures: (engagementId: string, params?: {
    search?: string;
    procedure_type?: string;
    depth?: string;
    result_status?: 'not_assessed' | 'satisfied' | 'other_than_satisfied' | 'not_applicable';
    limit?: number;
    offset?: number;
  }) => api.get(`/assessments/engagements/${engagementId}/procedures`, { params }),

  getEngagementPbc: (engagementId: string, params?: {
    status?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    limit?: number;
    offset?: number;
  }) => api.get(`/assessments/engagements/${engagementId}/pbc`, { params }),

  createEngagementPbc: (engagementId: string, data: {
    title: string;
    request_details: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'in_progress' | 'submitted' | 'accepted' | 'rejected' | 'closed';
    due_date?: string | null;
    assigned_to?: string | null;
    response_notes?: string | null;
    assessment_procedure_id?: string | null;
  }) => api.post(`/assessments/engagements/${engagementId}/pbc`, data),

  autoCreateEngagementPbc: (engagementId: string, data: {
    procedure_ids: string[];
    due_date?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'in_progress' | 'submitted' | 'accepted' | 'rejected' | 'closed';
    request_context?: string | null;
  }) => api.post(`/assessments/engagements/${engagementId}/pbc/auto-create`, data),

  generateEngagementPbcDraftAi: (engagementId: string, data: {
    assessment_procedure_id?: string | null;
    request_context?: string | null;
    due_date?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    provider?: string;
    model?: string;
    persist_draft?: boolean;
  }) => api.post(`/assessments/engagements/${engagementId}/pbc/ai-draft`, data),

  updateEngagementPbc: (engagementId: string, pbcId: string, data: {
    title?: string;
    request_details?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'in_progress' | 'submitted' | 'accepted' | 'rejected' | 'closed';
    due_date?: string | null;
    assigned_to?: string | null;
    response_notes?: string | null;
    assessment_procedure_id?: string | null;
  }) => api.patch(`/assessments/engagements/${engagementId}/pbc/${pbcId}`, data),

  getEngagementWorkpapers: (engagementId: string, params?: {
    status?: 'draft' | 'in_review' | 'finalized';
    limit?: number;
    offset?: number;
  }) => api.get(`/assessments/engagements/${engagementId}/workpapers`, { params }),

  createEngagementWorkpaper: (engagementId: string, data: {
    control_id?: string | null;
    assessment_procedure_id?: string | null;
    title: string;
    objective?: string | null;
    procedure_performed?: string | null;
    conclusion?: string | null;
    status?: 'draft' | 'in_review' | 'finalized';
    prepared_by?: string | null;
    reviewed_by?: string | null;
    reviewer_notes?: string | null;
  }) => api.post(`/assessments/engagements/${engagementId}/workpapers`, data),

  updateEngagementWorkpaper: (engagementId: string, workpaperId: string, data: {
    control_id?: string | null;
    assessment_procedure_id?: string | null;
    title?: string;
    objective?: string | null;
    procedure_performed?: string | null;
    conclusion?: string | null;
    status?: 'draft' | 'in_review' | 'finalized';
    prepared_by?: string | null;
    reviewed_by?: string | null;
    reviewer_notes?: string | null;
  }) => api.patch(`/assessments/engagements/${engagementId}/workpapers/${workpaperId}`, data),

  generateEngagementWorkpaperDraftAi: (engagementId: string, data: {
    assessment_procedure_id?: string | null;
    control_id?: string | null;
    objective?: string | null;
    procedure_performed?: string | null;
    evidence_summary?: string | null;
    test_outcome?: string | null;
    provider?: string;
    model?: string;
    persist_draft?: boolean;
  }) => api.post(`/assessments/engagements/${engagementId}/workpapers/ai-draft`, data),

  getEngagementFindings: (engagementId: string, params?: {
    status?: 'open' | 'accepted' | 'remediating' | 'verified' | 'closed';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    limit?: number;
    offset?: number;
  }) => api.get(`/assessments/engagements/${engagementId}/findings`, { params }),

  createEngagementFinding: (engagementId: string, data: {
    related_pbc_request_id?: string | null;
    related_workpaper_id?: string | null;
    control_id?: string | null;
    title: string;
    description: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'accepted' | 'remediating' | 'verified' | 'closed';
    recommendation?: string | null;
    management_response?: string | null;
    owner_user_id?: string | null;
    due_date?: string | null;
  }) => api.post(`/assessments/engagements/${engagementId}/findings`, data),

  updateEngagementFinding: (engagementId: string, findingId: string, data: {
    related_pbc_request_id?: string | null;
    related_workpaper_id?: string | null;
    control_id?: string | null;
    title?: string;
    description?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'accepted' | 'remediating' | 'verified' | 'closed';
    recommendation?: string | null;
    management_response?: string | null;
    owner_user_id?: string | null;
    due_date?: string | null;
  }) => api.patch(`/assessments/engagements/${engagementId}/findings/${findingId}`, data),

  generateEngagementFindingDraftAi: (engagementId: string, data: {
    assessment_procedure_id?: string | null;
    related_pbc_request_id?: string | null;
    related_workpaper_id?: string | null;
    issue_summary?: string | null;
    evidence_summary?: string | null;
    severity_hint?: 'low' | 'medium' | 'high' | 'critical' | null;
    recommendation_scope?: string | null;
    provider?: string;
    model?: string;
    persist_draft?: boolean;
  }) => api.post(`/assessments/engagements/${engagementId}/findings/ai-draft`, data),

  getEngagementSignoffs: (engagementId: string) => api.get(`/assessments/engagements/${engagementId}/signoffs`),

  getEngagementSignoffReadiness: (engagementId: string) =>
    api.get(`/assessments/engagements/${engagementId}/signoff-readiness`),

  createEngagementSignoff: (engagementId: string, data: {
    signoff_type:
      | 'auditor'
      | 'management'
      | 'executive'
      | 'customer_acknowledgment'
      | 'company_leadership'
      | 'auditor_firm_recommendation';
    status?: 'approved' | 'rejected';
    comments?: string | null;
    signed_by?: string | null;
  }) => api.post(`/assessments/engagements/${engagementId}/signoffs`, data),

  getEngagementValidationPackage: (engagementId: string) =>
    api.get(`/assessments/engagements/${engagementId}/validation-package`),

  downloadEngagementValidationPackagePdf: (engagementId: string) =>
    api.get(`/assessments/engagements/${engagementId}/validation-package/pdf`, { responseType: 'blob' }),

  getAuditTemplates: (params?: {
    artifact_type?: 'pbc' | 'workpaper' | 'finding' | 'signoff' | 'engagement_report';
    include_inactive?: boolean;
    include_content?: boolean;
  }) => api.get('/assessments/templates', { params }),

  createAuditTemplate: (data: {
    artifact_type: 'pbc' | 'workpaper' | 'finding' | 'signoff' | 'engagement_report';
    template_name: string;
    template_content: string;
    template_format?: string;
    set_default?: boolean;
  }) => api.post('/assessments/templates', data),

  uploadAuditTemplate: (formData: FormData) =>
    api.post('/assessments/templates/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT }),

  updateAuditTemplate: (templateId: string, data: {
    template_name?: string;
    template_content?: string;
    is_default?: boolean;
    is_active?: boolean;
  }) => api.patch(`/assessments/templates/${templateId}`, data),

  deleteAuditTemplate: (templateId: string) =>
    api.delete(`/assessments/templates/${templateId}`),

  // Auditor workspace link management (client portal)
  getAuditorWorkspaceLinks: () =>
    api.get('/auditor-workspace/links'),

  createAuditorWorkspaceLink: (data: {
    name: string;
    engagement_id?: string;
    days_valid?: number;
  }) => api.post('/auditor-workspace/links', data),

  updateAuditorWorkspaceLink: (linkId: string, data: {
    active?: boolean;
    expires_at?: string;
  }) => api.patch(`/auditor-workspace/links/${linkId}`, data),
};

// Organization Settings APIs (BYOK / LLM Config)
export const settingsAPI = {
  getLLMConfig: () => api.get('/settings/llm'),
  updateLLMConfig: (data: {
    anthropic_api_key?: string | null;
    openai_api_key?: string | null;
    gemini_api_key?: string | null;
    xai_api_key?: string | null;
    default_provider?: string;
    default_model?: string;
  }) => api.put('/settings/llm', data),
  testLLMKey: (data: { provider: string; apiKey: string }) =>
    api.post('/settings/llm/test', data),
  removeLLMKey: (provider: string) =>
    api.delete(`/settings/llm/${provider}`),
  getContentPacks: () => api.get('/settings/content-packs'),
  getContentPackDrafts: () => api.get('/settings/content-packs/drafts'),
  getContentPackDraft: (id: string) => api.get(`/settings/content-packs/drafts/${id}`),
  uploadContentPackDraft: (formData: FormData) =>
    api.post('/settings/content-packs/drafts/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT }),
  updateContentPackDraft: (id: string, data: { pack: Record<string, unknown>; review_required?: boolean }) =>
    api.put(`/settings/content-packs/drafts/${id}`, data),
  attestContentPackDraft: (id: string, data?: { confirm?: boolean; statement?: string }) =>
    api.post(`/settings/content-packs/drafts/${id}/attest`, { confirm: true, ...(data || {}) }),
  reviewContentPackDraft: (id: string, data: { action: 'approve' | 'reject'; notes?: string }) =>
    api.post(`/settings/content-packs/drafts/${id}/review`, data),
  importContentPackDraft: (id: string) =>
    api.post(`/settings/content-packs/drafts/${id}/import`, {}),
  getContentPackTemplate: () => api.get('/settings/content-packs/template'),
  importContentPack: (data: { pack: Record<string, unknown> }) =>
    api.post('/settings/content-packs/import', data),
  deleteContentPack: (id: string) =>
    api.delete(`/settings/content-packs/${id}`),
  cancelAccount: (data: { reason: string; confirm: boolean }) =>
    api.post('/settings/account/cancel', data),
  exportAccountData: () =>
    api.get('/settings/account/export', { responseType: 'blob' }),
  getSmtpConfig: () => api.get('/settings/smtp'),
  updateSmtpConfig: (data: {
    smtp_host?: string | null;
    smtp_port?: string | null;
    smtp_user?: string | null;
    smtp_pass?: string | null;
    smtp_from_email?: string | null;
  }) => api.put('/settings/smtp', data),
  testSmtp: (to_email: string) => api.post('/settings/smtp/test', { to_email }),
};

// Integrations APIs (Splunk evidence connector)
export const integrationsAPI = {
  getSplunkConfig: () => api.get('/integrations/splunk'),
  updateSplunkConfig: (data: { base_url?: string | null; api_token?: string | null; default_index?: string | null }) =>
    api.put('/integrations/splunk', data),
  removeSplunkConfig: () =>
    api.delete('/integrations/splunk'),
  testSplunkConfig: (data?: { base_url?: string; api_token?: string; default_index?: string }) =>
    api.post('/integrations/splunk/test', data || {}),
  importSplunkEvidence: (data: {
    search: string;
    earliest_time?: string;
    latest_time?: string;
    max_events?: number;
    title?: string;
    description?: string;
    tags?: string[] | string;
    control_ids?: string[];
    retention_until?: string;
  }) => api.post('/integrations/splunk/import-evidence', data),
};

// Auto Evidence Collection APIs
export const autoEvidenceAPI = {
  getSources: () => api.get('/auto-evidence/sources'),

  getRules: () => api.get('/auto-evidence/rules'),

  createRule: (data: {
    name: string;
    description?: string;
    source_type: 'splunk' | 'microsoft_sentinel' | 'aws_cloudtrail' | 'crowdstrike' | 'jira' | 'servicenow' | 'github' | 'connector'; // ip-hygiene:ignore
    source_config: Record<string, unknown>;
    schedule?: 'manual' | 'daily' | 'weekly' | 'monthly';
    control_ids?: string[];
    tags?: string[];
    enabled?: boolean;
  }) => api.post('/auto-evidence/rules', data),

  updateRule: (id: string, data: {
    name?: string;
    description?: string;
    source_type?: 'splunk' | 'microsoft_sentinel' | 'aws_cloudtrail' | 'crowdstrike' | 'jira' | 'servicenow' | 'github' | 'connector'; // ip-hygiene:ignore
    source_config?: Record<string, unknown>;
    schedule?: 'manual' | 'daily' | 'weekly' | 'monthly';
    control_ids?: string[];
    tags?: string[];
    enabled?: boolean;
  }) => api.patch(`/auto-evidence/rules/${id}`, data),

  deleteRule: (id: string) => api.delete(`/auto-evidence/rules/${id}`),

  runRule: (id: string) => api.post(`/auto-evidence/rules/${id}/run`),
};

// Pending Evidence APIs (AI-suggested evidence with approval workflow)
export const pendingEvidenceAPI = {
  scan: () => api.post('/pending-evidence/scan'),

  getAll: (status?: 'pending' | 'approved' | 'rejected') =>
    api.get('/pending-evidence', { params: { status: status || 'pending' } }),

  getStats: () => api.get('/pending-evidence/stats'),

  approve: (id: string, notes?: string) =>
    api.post(`/pending-evidence/${id}/approve`, { notes }),

  reject: (id: string, notes?: string) =>
    api.post(`/pending-evidence/${id}/reject`, { notes }),
};

// Reports APIs
export const reportsAPI = {
  getTypes: () => api.get('/reports/types'),

  downloadPDF: () =>
    api.get('/reports/compliance/pdf', { responseType: 'blob' }),

  downloadExcel: () =>
    api.get('/reports/compliance/excel', { responseType: 'blob' }),

  downloadSspPdf: () =>
    api.get('/reports/ssp/pdf', { responseType: 'blob' }),

  downloadSspJson: () =>
    api.get('/reports/ssp/json', { responseType: 'blob' }),
};

// Issue Reporting APIs
export const issueReportAPI = {
  submit: (data: {
    title: string;
    description: string;
    category?: 'bug' | 'feature_request' | 'usability' | 'documentation' | 'security' | 'performance' | 'other';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    page_url?: string;
    browser_info?: string;
    steps_to_reproduce?: string;
    expected_behavior?: string;
    actual_behavior?: string;
  }) => api.post('/issues/report', data),

  getMyReports: () => api.get('/issues/my-reports'),
};

// Notifications APIs
export const notificationsAPI = {
  getAll: (params?: { limit?: number; unread?: string; type?: string; page?: number }) =>
    api.get('/notifications', { params }),

  markRead: (id: string) =>
    api.patch(`/notifications/${id}/read`),

  markAllRead: () =>
    api.post('/notifications/read-all'),

  getPreferences: () =>
    api.get('/notifications/preferences'),

  updatePreference: (data: { type: string; in_app?: boolean; email?: boolean }) =>
    api.put('/notifications/preferences', data),

  getEmailStatus: () =>
    api.get('/notifications/email-status'),
};

// AI Decision log APIs (admin)
export const aiDecisionsAPI = {
  list: (params?: { page?: number; limit?: number; reviewed?: string; feature?: string; risk_level?: string }) =>
    api.get('/ai/decisions', { params }),

  review: (id: string, data: { outcome: string; notes?: string }) =>
    api.patch(`/ai/decisions/${id}/review`, data),

  biasReview: (id: string, data: { notes?: string }) =>
    api.patch(`/ai/decisions/${id}/bias-review`, data),
};

// Operations APIs (admin/operator workspace)
export const opsAPI = {
  getOverview: () => api.get('/ops/overview'),
  getJobs: (params?: { status?: string; limit?: number }) => api.get('/ops/jobs', { params }),
  enqueueJob: (data: { job_type: string; payload?: Record<string, unknown>; run_after?: string | null }) =>
    api.post('/ops/jobs', data),
  processJobs: (data?: { limit?: number }) => api.post('/ops/jobs/process', data || {}),
  runRetention: () => api.post('/ops/retention/run', {}),
  processWebhooks: (data?: { limit?: number }) => api.post('/ops/webhooks/process', data || {})
};

// POA&M APIs
export const poamAPI = {
  getList: (params?: { status?: string; priority?: string; controlId?: string; limit?: number; offset?: number }) =>
    api.get('/poam', { params }),
  getById: (id: string) => api.get(`/poam/${id}`),
  create: (data: Record<string, unknown>) => api.post('/poam', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/poam/${id}`, data),
};

// SSO APIs
export const ssoAPI = {
  getProviders: () => api.get('/sso/providers'),
  getConfig: () => api.get('/sso/config'),
  saveConfig: (data: Record<string, unknown>) => api.put('/sso/config', data),
  getSocialLogins: () => api.get('/sso/social-logins'),
  unlinkSocial: (provider: string) => api.delete(`/sso/social-logins/${provider}`),
  socialLoginUrl: (provider: string) =>
    `${API_BASE_URL}/sso/social/${provider}`,
  orgSsoUrl: (orgId: string) =>
    `${API_BASE_URL}/sso/login/org?org_id=${encodeURIComponent(orgId)}`,
};

// SIEM APIs
export const siemAPI = {
  list: () => api.get('/siem'),
  create: (data: Record<string, unknown>) => api.post('/siem', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/siem/${id}`, data),
  delete: (id: string) => api.delete(`/siem/${id}`),
  test: (id: string) => api.post(`/siem/${id}/test`),
};

// Platform admin APIs
export const platformAdminAPI = {
  getOverview: () => api.get('/platform-admin/overview'),
  getOrganizations: (params?: { page?: number; limit?: number; region?: string; has_llm_key?: boolean; llm_provider?: string }) => api.get('/platform-admin/organizations', { params }),
  getLlmDefaults: () => api.get('/platform-admin/llm-defaults'),
  updateLlmDefaults: (data: {
    anthropic_api_key?: string | null;
    openai_api_key?: string | null;
    gemini_api_key?: string | null;
    xai_api_key?: string | null;
    groq_api_key?: string | null;
    ollama_base_url?: string | null;
    default_provider?: string;
    default_model?: string;
  }) => api.put('/platform-admin/llm-defaults', data),
  // Feature flags
  getFeatureFlags: () => api.get('/platform-admin/settings/features'),
  updateFeatureFlags: (flags: Record<string, boolean>) => api.put('/platform-admin/settings/features', flags),
  getOrgFeatures: (orgId: string) => api.get(`/platform-admin/organizations/${orgId}/features`),
  updateOrgFeatures: (orgId: string, overrides: Record<string, unknown>) => api.put(`/platform-admin/organizations/${orgId}/features`, overrides),
  // Subscription management
  getOrgSubscription: (orgId: string) => api.get(`/platform-admin/organizations/${orgId}/subscription`),
  changeOrgTier: (orgId: string, data: { tier: string; prorate?: boolean }) => api.put(`/platform-admin/organizations/${orgId}/subscription/tier`, data),
  cancelOrgSubscription: (orgId: string, data: { immediately?: boolean; reason?: string }) => api.post(`/platform-admin/organizations/${orgId}/subscription/cancel`, data),
  compOrgSubscription: (orgId: string, data: { tier: string; months: number; reason?: string }) => api.post(`/platform-admin/organizations/${orgId}/subscription/comp`, data),
  reactivateOrgSubscription: (orgId: string) => api.post(`/platform-admin/organizations/${orgId}/subscription/reactivate`),
  // Trial management
  getOrgTrial: (orgId: string) => api.get(`/platform-admin/organizations/${orgId}/trial`),
  updateOrgTrial: (orgId: string, data: { action: string; days?: number; tier?: string }) => api.put(`/platform-admin/organizations/${orgId}/trial`, data),
  // SMTP configuration
  getSmtpConfig: () => api.get('/platform-admin/smtp'),
  updateSmtpConfig: (data: {
    smtp_host?: string | null;
    smtp_port?: string | null;
    smtp_user?: string | null;
    smtp_pass?: string | null;
    smtp_from_email?: string | null;
  }) => api.put('/platform-admin/smtp', data),
  testSmtp: (to_email: string) => api.post('/platform-admin/smtp/test', { to_email }),
  getLlmStatus: () => api.get('/platform-admin/llm/status'),
};

// Passkey APIs
export const passkeyAPI = {
  // Registration (authenticated user)
  getRegistrationOptions: () => api.get('/auth/passkey/register/options'),
  verifyRegistration: (data: { response: unknown; name?: string }) =>
    api.post('/auth/passkey/register/verify', data),

  // Authentication (public - no auth token needed)
  getAuthOptions: (email?: string) =>
    api.post('/auth/passkey/auth/options', { email }),
  verifyAuth: (data: { response: unknown; challengeId: string }) =>
    api.post('/auth/passkey/auth/verify', data),

  // Passkey management (authenticated)
  list: () => api.get('/auth/passkey/list'),
  delete: (id: string) => api.delete(`/auth/passkey/${id}`),
  rename: (id: string, name: string) => api.patch(`/auth/passkey/${id}/rename`, { name }),
};

// TOTP Two-Factor Authentication APIs (available to all tiers)
export const totpAPI = {
  getStatus: () => api.get('/auth/totp/status'),
  setup: () => api.post('/auth/totp/setup'),
  verify: (data: { code: string }) => api.post('/auth/totp/verify', data),
  disable: (data: { password: string }) => api.post('/auth/totp/disable', data),
  regenerateBackupCodes: (data: { password: string }) => api.post('/auth/totp/backup-codes', data),
};

// TPRM (Third-Party Risk Management) APIs
export const tprmAPI = {
  // Summary
  getSummary: () => api.get('/tprm/summary'),

  // Vendors
  getVendors: (params?: { risk_tier?: string; review_status?: string; search?: string }) =>
    api.get('/tprm/vendors', { params }),
  getVendor: (id: string) => api.get(`/tprm/vendors/${id}`),
  createVendor: (data: Record<string, unknown>) => api.post('/tprm/vendors', data),
  updateVendor: (id: string, data: Record<string, unknown>) => api.patch(`/tprm/vendors/${id}`, data),
  deleteVendor: (id: string) => api.delete(`/tprm/vendors/${id}`),
  storeVendorAIAssessment: (id: string, data: { ai_risk_score: number; ai_risk_summary: string }) =>
    api.post(`/tprm/vendors/${id}/store-ai-assessment`, data),

  // CMDB integration
  getCmdbAssets: (search?: string) => api.get('/tprm/cmdb-assets', { params: { search } }),
  getCmdbAssetVendors: (assetId: string) => api.get(`/tprm/cmdb-assets/${assetId}/vendors`),

  // Questionnaires
  getQuestionnaires: (params?: { vendor_id?: string; status?: string }) =>
    api.get('/tprm/questionnaires', { params }),
  getQuestionnaire: (id: string) => api.get(`/tprm/questionnaires/${id}`),
  createQuestionnaire: (data: Record<string, unknown>) => api.post('/tprm/questionnaires', data),
  updateQuestionnaire: (id: string, data: Record<string, unknown>) => api.patch(`/tprm/questionnaires/${id}`, data),
  deleteQuestionnaire: (id: string) => api.delete(`/tprm/questionnaires/${id}`),
  sendQuestionnaire: (id: string, data: { recipient_email: string; due_date?: string }) =>
    api.post(`/tprm/questionnaires/${id}/send`, data),
  remindQuestionnaire: (id: string) => api.post(`/tprm/questionnaires/${id}/remind`),

  // Evidence
  getEvidence: (questionnaireId: string) => api.get(`/tprm/questionnaires/${questionnaireId}/evidence`),
  deleteEvidence: (evidenceId: string) => api.delete(`/tprm/evidence/${evidenceId}`),
  storeEvidenceAIAnalysis: (evidenceId: string, data: { ai_analysis: string; ai_risk_flags?: unknown[] }) =>
    api.post(`/tprm/evidence/${evidenceId}/store-ai-analysis`, data),

  // Documents
  getDocuments: (params?: { vendor_id?: string; status?: string; document_type?: string }) =>
    api.get('/tprm/documents', { params }),
  createDocument: (data: Record<string, unknown>) => api.post('/tprm/documents', data),
  updateDocument: (id: string, data: Record<string, unknown>) => api.patch(`/tprm/documents/${id}`, data),
  deleteDocument: (id: string) => api.delete(`/tprm/documents/${id}`),
};

// TPRM Public (vendor-facing, token-based, no auth required)
export const tprmPublicAPI = {
  getQuestionnaire: (token: string) => api.get(`/tprm-public/respond/${token}`),
  submitResponses: (token: string, data: { responses: Record<string, unknown>; completed?: boolean; is_complete?: boolean }) =>
    api.patch(`/tprm-public/respond/${token}`, {
      responses: data.responses,
      completed: data.completed ?? data.is_complete,
    }),
  uploadEvidence: (token: string, formData: FormData) =>
    api.post(`/tprm-public/respond/${token}/evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT
    }),
  getEvidence: (token: string) => api.get(`/tprm-public/respond/${token}/evidence`),
};

// Billing API
export const billingAPI = {
  createCheckoutSession: (lookupKey: string, successUrl: string, cancelUrl: string) =>
    api.post('/billing/checkout', { lookupKey, successUrl, cancelUrl }),
  createPortalSession: (returnUrl?: string) =>
    api.post('/billing/portal', { returnUrl: returnUrl || window.location.href }),
  getSubscription: () =>
    api.get('/billing/subscription'),
  changePlan: (lookupKey: string) =>
    api.post('/billing/change-plan', { lookupKey }),
  cancelSubscription: (data: { confirm: boolean; reason?: string }) =>
    api.post('/billing/cancel', data),
  downgradeToFree: () =>
    api.post('/billing/downgrade-to-free'),
};

// License API (self-hosted / community edition)
export const licenseAPI = {
  getInfo: () => api.get('/license'),
  activate: (licenseKey: string) => api.post('/license/activate', { licenseKey }),
  checkUpdates: () => api.get('/license/update-check'),
};

// Help / Documentation API
export const helpAPI = {
  getIndex: () => api.get('/help'),
  getArticle: (slug: string) => api.get(`/help/${encodeURIComponent(slug)}`),
};

// Third-Party AI Governance API
export const aiGovernanceAPI = {
  // Summary
  getSummary: () => api.get('/ai-governance/summary'),

  // Vendor AI Assessments
  getVendors: (params?: { risk_level?: string; vendor_type?: string; business_criticality?: string; status?: string; search?: string }) =>
    api.get('/ai-governance/vendors', { params }),
  getVendor: (id: string) => api.get(`/ai-governance/vendors/${id}`),
  createVendor: (data: Record<string, unknown>) => api.post('/ai-governance/vendors', data),
  updateVendor: (id: string, data: Record<string, unknown>) => api.patch(`/ai-governance/vendors/${id}`, data),
  deleteVendor: (id: string) => api.delete(`/ai-governance/vendors/${id}`),

  // Incidents
  getIncidents: (params?: { vendor_assessment_id?: string; severity?: string; status?: string; incident_type?: string }) =>
    api.get('/ai-governance/incidents', { params }),
  createIncident: (data: Record<string, unknown>) => api.post('/ai-governance/incidents', data),
  updateIncident: (id: string, data: Record<string, unknown>) => api.patch(`/ai-governance/incidents/${id}`, data),

  // Supply Chain Components
  getSupplyChain: (params?: { source_vendor_id?: string; component_type?: string; risk_level?: string; approved_for_use?: string }) =>
    api.get('/ai-governance/supply-chain', { params }),
  createSupplyChainComponent: (data: Record<string, unknown>) => api.post('/ai-governance/supply-chain', data),
  updateSupplyChainComponent: (id: string, data: Record<string, unknown>) => api.patch(`/ai-governance/supply-chain/${id}`, data),
};

// Threat Intelligence API (Professional tier)
export const threatIntelAPI = {
  // Feeds
  getFeeds: () => api.get('/threat-intel/feeds'),
  getFeed: (id: string) => api.get(`/threat-intel/feeds/${id}`),
  createFeed: (data: Record<string, unknown>) => api.post('/threat-intel/feeds', data),
  updateFeed: (id: string, data: Record<string, unknown>) => api.patch(`/threat-intel/feeds/${id}`, data),
  deleteFeed: (id: string) => api.delete(`/threat-intel/feeds/${id}`),
  syncFeed: (id: string) => api.post(`/threat-intel/feeds/${id}/sync`),
  syncAll: () => api.post('/threat-intel/sync-all'),
  // Items
  getItems: (params?: { feed_id?: string; severity?: string; item_type?: string; exploit_available?: boolean; status?: string; limit?: number }) =>
    api.get('/threat-intel/items', { params }),
  getStats: () => api.get('/threat-intel/stats'),
};

// Vendor Security Scores API (Enterprise tier — SecurityScorecard/BitSight)
export const vendorSecurityAPI = {
  getScores: (params?: { vendor_name?: string; score_provider?: string; score_trend?: string; limit?: number }) =>
    api.get('/vendor-security/scores', { params }),
  getScore: (id: string) => api.get(`/vendor-security/scores/${id}`),
  createScore: (data: Record<string, unknown>) => api.post('/vendor-security/scores', data),
  refreshScore: (id: string) => api.post(`/vendor-security/scores/${id}/refresh`),
  deleteScore: (id: string) => api.delete(`/vendor-security/scores/${id}`),
  getTrends: (domain: string) => api.get(`/vendor-security/trends/${domain}`),
  setupMonitoring: (data: Record<string, unknown>) => api.post('/vendor-security/monitor', data),
};

// Regulatory News API (Community tier)
export const regulatoryNewsAPI = {
  getItems: (params?: { source?: string; is_read?: boolean; is_archived?: boolean; impact_level?: string; limit?: number }) =>
    api.get('/regulatory-news', { params }),
  getUnreadCount: () => api.get('/regulatory-news/unread-count'),
  getItem: (id: string) => api.get(`/regulatory-news/${id}`),
  updateItem: (id: string, data: { is_read?: boolean; is_archived?: boolean; is_bookmarked?: boolean }) =>
    api.patch(`/regulatory-news/${id}`, data),
  refresh: () => api.post('/regulatory-news/refresh'),
  markAllRead: () => api.post('/regulatory-news/mark-all-read'),
  getSources: () => api.get('/regulatory-news/sources/list'),
};

// Control Exceptions / Risk Acceptance API
export const exceptionsAPI = {
  getList: (params?: { control_id?: string; status?: string; exception_type?: string }) =>
    api.get('/exceptions', { params }),
  create: (data: Record<string, unknown>) => api.post('/exceptions', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/exceptions/${id}`, data),
  approve: (id: string, data?: { notes?: string }) => api.post(`/exceptions/${id}/approve`, data || {}),
  revoke: (id: string, data?: { notes?: string }) => api.post(`/exceptions/${id}/revoke`, data || {}),
};

// Data Sovereignty API
export const dataSovereigntyAPI = {
  getConfig: () => api.get('/data-sovereignty/config'),
  updateConfig: (data: Record<string, unknown>) => api.put('/data-sovereignty/config', data),
  getJurisdictions: () => api.get('/data-sovereignty/jurisdictions'),
  getJurisdictionFrameworks: (code: string) => api.get(`/data-sovereignty/jurisdictions/${code}/recommended-frameworks`),
  getOrgJurisdictions: () => api.get('/data-sovereignty/organization-jurisdictions'),
  addOrgJurisdiction: (data: Record<string, unknown>) => api.post('/data-sovereignty/organization-jurisdictions', data),
  updateOrgJurisdiction: (id: string, data: Record<string, unknown>) => api.put(`/data-sovereignty/organization-jurisdictions/${id}`, data),
  removeOrgJurisdiction: (id: string) => api.delete(`/data-sovereignty/organization-jurisdictions/${id}`),
  getRegulatoryChanges: () => api.get('/data-sovereignty/regulatory-changes'),
  createRegulatoryChange: (data: Record<string, unknown>) => api.post('/data-sovereignty/regulatory-changes', data),
  updateRegulatoryChangeStatus: (id: string, data: Record<string, unknown>) => api.put(`/data-sovereignty/regulatory-changes/${id}/status`, data),
  getAIProviderRegions: () => api.get('/data-sovereignty/ai-provider-regions'),
  getComplianceGapAnalysis: () => api.get('/data-sovereignty/compliance-gap-analysis'),
};

// Control Health API
export const controlHealthAPI = {
  getAll: (params?: { framework_id?: string; status?: string; control_id?: string }) =>
    api.get('/control-health', { params }),
  getByControl: (controlId: string) => api.get(`/control-health/${controlId}`),
};

// Integrations Hub API
export const integrationsHubAPI = {
  getTemplates: () => api.get('/integrations-hub/templates'),
  getConnectors: () => api.get('/integrations-hub/connectors'),
  createConnector: (data: Record<string, unknown>) => api.post('/integrations-hub/connectors', data),
  updateConnector: (id: string, data: Record<string, unknown>) => api.patch(`/integrations-hub/connectors/${id}`, data),
  deleteConnector: (id: string) => api.delete(`/integrations-hub/connectors/${id}`),
  runConnector: (id: string) => api.post(`/integrations-hub/connectors/${id}/run`),
  getConnectorRuns: (id: string) => api.get(`/integrations-hub/connectors/${id}/runs`),
};

// Dashboard Builder API
export const dashboardBuilderAPI = {
  getViews: () => api.get('/dashboard-builder/views'),
  createView: (data: Record<string, unknown>) => api.post('/dashboard-builder/views', data),
  updateView: (id: string, data: Record<string, unknown>) => api.patch(`/dashboard-builder/views/${id}`, data),
  deleteView: (id: string) => api.delete(`/dashboard-builder/views/${id}`),
  addWidget: (viewId: string, data: Record<string, unknown>) => api.post(`/dashboard-builder/views/${viewId}/widgets`, data),
  updateWidget: (widgetId: string, data: Record<string, unknown>) => api.patch(`/dashboard-builder/widgets/${widgetId}`, data),
  deleteWidget: (widgetId: string) => api.delete(`/dashboard-builder/widgets/${widgetId}`),
};

// Organization Contacts API
export const contactsAPI = {
  getList: () => api.get('/contacts'),
  create: (data: Record<string, unknown>) => api.post('/contacts', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/contacts/${id}`, data),
  remove: (id: string) => api.delete(`/contacts/${id}`),
};

// Phase 6 — Predictive Risk Scoring, Regulatory Impact Analysis, Smart Remediation
export const phase6API = {
  // Risk Scoring
  calculateRiskScore: () => api.post('/phase6/risk-score/calculate'),
  getLatestRiskScore: () => api.get('/phase6/risk-score/latest'),
  getRiskScoreHistory: () => api.get('/phase6/risk-score/history'),
  // Regulatory Impact
  analyzeRegulatoryImpact: (data: Record<string, unknown>) => api.post('/phase6/regulatory-impact/analyze', data),
  getRegulatoryImpactAssessments: () => api.get('/phase6/regulatory-impact/assessments'),
  reviewRegulatoryImpactAssessment: (id: string, data: Record<string, unknown>) =>
    api.put(`/phase6/regulatory-impact/assessments/${id}/review`, data),
  // Smart Remediation
  generateRemediationPlan: (data: Record<string, unknown>) => api.post('/phase6/remediation/generate', data),
  getRemediationPlans: () => api.get('/phase6/remediation/plans'),
  updateRemediationPlanStatus: (id: string, data: { status: string; notes?: string }) =>
    api.put(`/phase6/remediation/plans/${id}/status`, data),
  // Comprehensive Analysis
  runComprehensiveAnalysis: (data?: Record<string, unknown>) => api.post('/phase6/analyze/comprehensive', data || {}),
};

// AI Continuous Monitoring API (rules engine, anomaly events, baselines)
export const aiMonitoringAPI = {
  getDashboard: () => api.get('/ai/monitoring/dashboard'),
  // Rules
  getRules: () => api.get('/ai/monitoring/rules'),
  createRule: (data: Record<string, unknown>) => api.post('/ai/monitoring/rules', data),
  updateRule: (id: string, data: Record<string, unknown>) => api.put(`/ai/monitoring/rules/${id}`, data),
  deleteRule: (id: string) => api.delete(`/ai/monitoring/rules/${id}`),
  // Events
  getEvents: (params?: { rule_id?: string; severity?: string; status?: string; ai_agent_id?: string; limit?: number }) =>
    api.get('/ai/monitoring/events', { params }),
  reviewEvent: (id: string) => api.post(`/ai/monitoring/events/${id}/review`),
  resolveEvent: (id: string, data?: { resolution_notes?: string }) =>
    api.post(`/ai/monitoring/events/${id}/resolve`, data || {}),
  // Baselines & Continuous Monitoring
  getBaseline: (aiAgentId: string) => api.get(`/ai/monitoring/baselines/${aiAgentId}`),
  calculateBaseline: (aiAgentId: string) => api.post(`/ai/monitoring/baselines/${aiAgentId}/calculate`),
  enableContinuousMonitoring: (aibomId: string) => api.post(`/ai/monitoring/aiboms/${aibomId}/enable`),
  getCoverage: () => api.get('/ai/monitoring/coverage'),
};

// RAG Knowledge Base API (Professional tier)
export const ragAPI = {
  indexFile: (formData: FormData) => api.post('/rag/index', formData),
  indexText: (data: { text: string; source_name: string; source_type?: string; source_id?: string }) => api.post('/rag/index-text', data),
  search: (data: { query: string; top_k?: number; threshold?: number; source_type?: string }) => api.post('/rag/search', data),
  listDocuments: () => api.get('/rag/documents'),
  getStats: () => api.get('/rag/stats'),
  removeDocument: (sourceId: string, sourceType?: string) =>
    api.delete(`/rag/documents/${sourceId}`, {
      params: sourceType ? { source_type: sourceType } : undefined,
    }),
};

// RMF Lifecycle API (NIST SP 800-37)
export const rmfAPI = {
  getSummary: () => api.get('/rmf/summary'),
  getPackages: () => api.get('/rmf/packages'),
  getPackage: (id: string) => api.get(`/rmf/packages/${id}`),
  createPackage: (data: { system_name: string; system_description?: string; system_id?: string }) =>
    api.post('/rmf/packages', data),
  updatePackage: (id: string, data: Record<string, unknown>) => api.put(`/rmf/packages/${id}`, data),
  deletePackage: (id: string) => api.delete(`/rmf/packages/${id}`),
  transitionStep: (id: string, data: { to_step: string; action?: string; notes?: string; status?: string }) =>
    api.post(`/rmf/packages/${id}/transition`, data),
  getHistory: (id: string) => api.get(`/rmf/packages/${id}/history`),
  createAuthorization: (id: string, data: Record<string, unknown>) =>
    api.post(`/rmf/packages/${id}/authorization`, data),
};

// PLOT4ai Threat Library API (Community tier — AI Threat Modeling)
export const plot4aiAPI = {
  getThreats: (params?: { category?: number; aitype?: string; role?: string; phase?: string; search?: string }) =>
    api.get('/plot4ai/threats', { params }),
  getCategories: () => api.get('/plot4ai/categories'),
  getFilters: () => api.get('/plot4ai/filters'),
  getStats: () => api.get('/plot4ai/stats'),
};

// State AI Laws API — Colorado, Illinois, NYC, and other state AI regulations
export const stateAiLawsAPI = {
  getJurisdictions: () => api.get('/state-ai-laws/jurisdictions'),
  getControls: (params?: { jurisdiction?: string; control_type?: string; priority?: string; search?: string }) =>
    api.get('/state-ai-laws/controls', { params }),
  getControl: (controlId: string) => api.get(`/state-ai-laws/controls/${controlId}`),
  getSummary: () => api.get('/state-ai-laws/summary'),
};

export default api;
