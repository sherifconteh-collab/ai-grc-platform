// @tier: pro

// ---------------------------------------------------------------------------
// CMDB Shared Types
// ---------------------------------------------------------------------------

export interface HardwareAsset {
  id: string;
  name: string;
  asset_id?: string;
  asset_type?: string;           // server | laptop | switch | router | firewall | storage
  vendor?: string;
  model?: string;
  location?: string;             // e.g. "HQ Data Center Rack 5" or "us-east-1"
  ip_address?: string;
  hostname?: string;
  status?: string;               // active | inactive | decommissioned | planned
  criticality?: string;          // critical | high | medium | low
  owner?: string;
  owner_user_id?: string;
  department?: string;
  contains_pii?: boolean;
  acquisition_date?: string;
  last_patched?: string;
  purchase_cost?: number;
  annual_cost?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SoftwareAsset {
  id: string;
  name: string;
  asset_id?: string;
  software_type?: string;        // application | database | os | library | saas | middleware
  vendor?: string;
  version?: string;
  license_type?: string;         // perpetual | subscription | open_source | custom
  license_expiry?: string;
  environment?: string;
  status?: string;               // active | inactive | deprecated | end_of_life
  criticality?: string;
  owner?: string;
  owner_user_id?: string;
  department?: string;
  contains_pii?: boolean;
  url?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AIAgent {
  id: string;
  name: string;
  agent_type?: string;           // language_model | classification | recommendation | autonomous_agent
  model_name?: string;
  model_version?: string;
  provider?: string;             // openai | anthropic | self-hosted | google | meta
  deployment_type?: string;      // api | embedded | standalone
  purpose?: string;
  status?: string;               // active | inactive | retired | in_review
  criticality?: string;
  owner?: string;
  owner_user_id?: string;
  department?: string;
  human_oversight_required?: boolean;
  bias_testing_completed?: boolean;
  bias_testing_date?: string;
  eu_ai_act_risk_level?: string; // prohibited | high_risk | limited_risk | minimal_risk
  monitoring_enabled?: boolean;
  contains_pii?: boolean;
  // Relationship arrays
  environments?: string[];
  service_accounts?: string[];
  password_vaults?: string[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceAccount {
  id: string;
  account_name: string;
  account_type?: string;         // api_key | oauth_token | service_principal | iam_role | database_user
  system_name?: string;
  service_name?: string;
  username?: string;
  purpose?: string;
  status?: string;               // active | inactive | disabled | expired
  owner?: string;
  owner_user_id?: string;
  privileged_account?: boolean;
  permissions_level?: string;    // read | write | admin | custom
  permissions_description?: string;
  credential_storage?: string;   // aws_secrets_manager | azure_key_vault | hashicorp_vault | manual
  vault_id?: string;
  vault_name?: string;
  credential_path?: string;
  password_rotation_enabled?: boolean;
  rotation_frequency_days?: number;
  last_rotation_date?: string;
  next_rotation_date?: string;
  last_review_date?: string;
  next_review_date?: string;
  last_used_date?: string;
  expiration_date?: string;
  mfa_enabled?: boolean;
  activity_monitored?: boolean;
  // Relationships
  environments?: string[];
  password_vaults?: string[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Environment {
  id: string;
  name: string;
  code?: string;                 // prod | staging | dev | test | dr | sandbox
  description?: string;
  criticality?: string;          // critical | high | medium | low
  contains_production_data?: boolean;
  contains_pii?: boolean;
  contains_sensitive_data?: boolean;
  requires_approval?: boolean;
  requires_mfa?: boolean;
  owner?: string;
  owner_user_id?: string;
  status?: string;               // active | inactive | deprecated
  created_at?: string;
  updated_at?: string;
}

export interface PasswordVault {
  id: string;
  name: string;
  vault_type?: string;           // aws_secrets_manager | azure_key_vault | hashicorp_vault | cyberark | 1password | bitwarden
  description?: string;
  vault_url?: string;
  region?: string;
  status?: string;               // active | inactive | deprecated
  owner?: string;
  owner_user_id?: string;
  requires_mfa?: boolean;
  requires_approval?: boolean;
  audit_logs_enabled?: boolean;
  // Relationships
  environments?: string[];
  service_accounts?: string[];
  notes?: string;
  created_at?: string;
  updated_at?: string;
}
