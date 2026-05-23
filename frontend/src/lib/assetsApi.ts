// @tier: pro
import api from './api';

export interface Asset {
  id: string;
  organization_id: string;
  category_id: string;
  category_name?: string;
  category_code?: string;
  name: string;
  asset_tag?: string;
  serial_number?: string;
  model?: string;
  manufacturer?: string;
  owner_id?: string;
  owner_name?: string;
  custodian_id?: string;
  custodian_name?: string;
  business_owner_id?: string;
  location?: string;
  environment_id?: string;
  environment_name?: string;
  status: string;
  acquisition_date?: string;
  deployment_date?: string;
  end_of_life_date?: string;
  security_classification?: string;
  criticality?: string;
  ip_address?: string;
  hostname?: string;
  fqdn?: string;
  mac_address?: string;
  version?: string;
  license_key?: string;
  license_expiry?: string;
  cloud_provider?: string;
  cloud_region?: string;
  ai_model_type?: string;
  ai_risk_level?: string;
  ai_training_data_source?: string;
  ai_bias_testing_completed?: boolean;
  ai_human_oversight_required?: boolean;
  notes?: string;
  metadata?: any;
  vuln_critical?: number;
  vuln_high?: number;
  vuln_medium?: number;
  vuln_low?: number;
  vuln_total_open?: number;
  created_at: string;
  updated_at: string;
}

export interface AssetCategory {
  id: string;
  name: string;
  code: string;
  description?: string;
  tier_required: string;
}

export interface Environment {
  id: string;
  name: string;
  code: string;
  environment_type?: string;
  security_level?: string;
  asset_count?: number;
}

export interface ServiceAccount {
  id: string;
  account_name: string;
  account_type: string;
  status: string;
  owner_name?: string;
  vault_name?: string;
  next_rotation_date?: string;
  next_review_date?: string;
}

export const assetsAPI = {
  // Assets
  getAll: (params?: { category?: string; status?: string; environment_id?: string; search?: string }) =>
    api.get('/assets', { params }),

  getById: (id: string) =>
    api.get(`/assets/${id}`),

  getStats: () =>
    api.get('/assets/stats'),

  getCategories: () =>
    api.get('/assets/categories'),

  create: (data: Partial<Asset>) =>
    api.post('/assets', data),

  update: (id: string, data: Partial<Asset>) =>
    api.put(`/assets/${id}`, data),

  delete: (id: string) =>
    api.delete(`/assets/${id}`),

  // Environments
  getEnvironments: () =>
    api.get('/environments'),

  getEnvironmentById: (id: string) =>
    api.get(`/environments/${id}`),

  createEnvironment: (data: any) =>
    api.post('/environments', data),

  updateEnvironment: (id: string, data: any) =>
    api.put(`/environments/${id}`, data),

  deleteEnvironment: (id: string) =>
    api.delete(`/environments/${id}`),

  // Service Accounts
  getServiceAccounts: (params?: { status?: string; vault_id?: string }) =>
    api.get('/service-accounts', { params }),

  getExpiringAccounts: (days?: number) =>
    api.get('/service-accounts/expiring', { params: { days } }),

  getServiceAccountById: (id: string) =>
    api.get(`/service-accounts/${id}`),

  createServiceAccount: (data: any) =>
    api.post('/service-accounts', data),

  updateServiceAccount: (id: string, data: any) =>
    api.put(`/service-accounts/${id}`, data),

  rotateServiceAccount: (id: string) =>
    api.post(`/service-accounts/${id}/rotate`),

  reviewServiceAccount: (id: string, data: any) =>
    api.post(`/service-accounts/${id}/review`, data),

  deleteServiceAccount: (id: string) =>
    api.delete(`/service-accounts/${id}`),
};
