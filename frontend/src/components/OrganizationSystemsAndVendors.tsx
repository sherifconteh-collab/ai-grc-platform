'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState, useCallback } from 'react';
import { organizationAPI } from '@/lib/api';

type CiaLevel = 'low' | 'moderate' | 'high';
type DeploymentModel = 'on_prem' | 'single_cloud' | 'multi_cloud' | 'hybrid' | 'saas_only';
type CotsProductType = 'cots' | 'saas' | 'managed_service' | 'platform' | 'other';
type CotsDeploymentModel =
  | 'on_prem'
  | 'single_cloud'
  | 'multi_cloud'
  | 'hybrid'
  | 'saas_only'
  | 'managed_service'
  | 'other';
type CotsDataAccessLevel = 'none' | 'metadata' | 'limited' | 'full';
type CotsLifecycleStatus = 'planned' | 'active' | 'deprecated' | 'retired';
type CotsAuthorizationStatus =
  | 'none'
  | 'fedramp_ready'
  | 'fedramp_in_process'
  | 'fedramp_authorized'
  | 'agency_ato'
  | 'dod_il_authorized'
  | 'other';
type CotsAuthorizationImpactLevel = 'li_saas' | 'low' | 'moderate' | 'high';
type Criticality = 'low' | 'medium' | 'high' | 'critical';
type ContractType = 'msa' | 'sow' | 'license' | 'dpa' | 'baa' | 'sla' | 'other';
type ContractStatus = 'draft' | 'active' | 'renewal_pending' | 'expired' | 'terminated';

interface OrganizationSystem {
  id: string;
  system_name: string;
  system_code: string | null;
  system_description: string | null;
  authorization_boundary_override: string | null;
  confidentiality_impact: CiaLevel | null;
  integrity_impact: CiaLevel | null;
  availability_impact: CiaLevel | null;
  environment_types: string[];
  deployment_model: DeploymentModel | null;
  cloud_providers: string[];
  data_sensitivity_types: string[];
  is_primary: boolean;
  is_active: boolean;
}

interface CotsProduct {
  id: string;
  system_id: string | null;
  system_name: string | null;
  product_name: string;
  vendor_name: string;
  product_version: string | null;
  product_type: string | null;
  deployment_model: string | null;
  data_access_level: string | null;
  lifecycle_status: string;
  criticality: string | null;
  support_end_date: string | null;
  authorization_status: string | null;
  authorization_impact_level: string | null;
  external_authorization_id: string | null;
  notes: string | null;
}

interface VendorContract {
  id: string;
  system_id: string | null;
  system_name: string | null;
  cots_product_id: string | null;
  product_name: string | null;
  contract_name: string;
  vendor_name: string;
  contract_number: string | null;
  contract_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  notice_period_days: number | null;
  security_requirements: string | null;
  data_processing_terms: string | null;
  sla_summary: string | null;
  notes: string | null;
}

interface SystemFormState {
  system_name: string;
  system_code: string;
  system_description: string;
  authorization_boundary_override: string;
  confidentiality_impact: '' | CiaLevel;
  integrity_impact: '' | CiaLevel;
  availability_impact: '' | CiaLevel;
  deployment_model: '' | DeploymentModel;
  environment_types_csv: string;
  cloud_providers_csv: string;
  data_sensitivity_types_csv: string;
  is_primary: boolean;
  is_active: boolean;
}

interface CotsFormState {
  system_id: string;
  product_name: string;
  vendor_name: string;
  product_version: string;
  product_type: string;
  deployment_model: string;
  data_access_level: string;
  lifecycle_status: string;
  criticality: string;
  support_end_date: string;
  authorization_status: string;
  authorization_impact_level: string;
  external_authorization_id: string;
  notes: string;
}

interface ContractFormState {
  system_id: string;
  cots_product_id: string;
  contract_name: string;
  vendor_name: string;
  contract_number: string;
  contract_type: string;
  status: string;
  start_date: string;
  end_date: string;
  renewal_date: string;
  notice_period_days: string;
  security_requirements: string;
  data_processing_terms: string;
  sla_summary: string;
  notes: string;
}

const DEFAULT_SYSTEM_FORM: SystemFormState = {
  system_name: '',
  system_code: '',
  system_description: '',
  authorization_boundary_override: '',
  confidentiality_impact: '',
  integrity_impact: '',
  availability_impact: '',
  deployment_model: '',
  environment_types_csv: '',
  cloud_providers_csv: '',
  data_sensitivity_types_csv: '',
  is_primary: false,
  is_active: true
};

const DEFAULT_COTS_FORM: CotsFormState = {
  system_id: '',
  product_name: '',
  vendor_name: '',
  product_version: '',
  product_type: '',
  deployment_model: '',
  data_access_level: '',
  lifecycle_status: 'active',
  criticality: '',
  support_end_date: '',
  authorization_status: '',
  authorization_impact_level: '',
  external_authorization_id: '',
  notes: ''
};

const DEFAULT_CONTRACT_FORM: ContractFormState = {
  system_id: '',
  cots_product_id: '',
  contract_name: '',
  vendor_name: '',
  contract_number: '',
  contract_type: '',
  status: 'active',
  start_date: '',
  end_date: '',
  renewal_date: '',
  notice_period_days: '',
  security_requirements: '',
  data_processing_terms: '',
  sla_summary: '',
  notes: ''
};

const COTS_PRODUCT_TYPES: readonly CotsProductType[] = ['cots', 'saas', 'managed_service', 'platform', 'other'] as const;
const COTS_DEPLOYMENT_MODELS: readonly CotsDeploymentModel[] = [
  'on_prem',
  'single_cloud',
  'multi_cloud',
  'hybrid',
  'saas_only',
  'managed_service',
  'other'
] as const;
const COTS_DATA_ACCESS_LEVELS: readonly CotsDataAccessLevel[] = ['none', 'metadata', 'limited', 'full'] as const;
const COTS_LIFECYCLE_STATUSES: readonly CotsLifecycleStatus[] = ['planned', 'active', 'deprecated', 'retired'] as const;
const COTS_AUTHORIZATION_STATUSES: readonly CotsAuthorizationStatus[] = [
  'none',
  'fedramp_ready',
  'fedramp_in_process',
  'fedramp_authorized',
  'agency_ato',
  'dod_il_authorized',
  'other'
] as const;
const COTS_AUTHORIZATION_IMPACT_LEVELS: readonly CotsAuthorizationImpactLevel[] = [
  'li_saas',
  'low',
  'moderate',
  'high'
] as const;
const CRITICALITY_LEVELS: readonly Criticality[] = ['low', 'medium', 'high', 'critical'] as const;
const CONTRACT_TYPES: readonly ContractType[] = ['msa', 'sow', 'license', 'dpa', 'baa', 'sla', 'other'] as const;
const CONTRACT_STATUSES: readonly ContractStatus[] = ['draft', 'active', 'renewal_pending', 'expired', 'terminated'] as const;

function csvToArray(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function formatDate(value: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return String(value).slice(0, 10);
}

function joinCsv(values: string[] | null | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

function optionLabelMapFromSystems(systems: OrganizationSystem[]): Record<string, string> {
  return Object.fromEntries(systems.map((system) => [system.id, system.system_name]));
}

function toEnumValue<T extends string>(value: string, allowed: readonly T[]): T | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : null;
}

const AUTHORIZATION_STATUS_LABELS: Record<string, string> = {
  fedramp_ready: 'FedRAMP Ready',
  fedramp_in_process: 'FedRAMP In Process',
  fedramp_authorized: 'FedRAMP Authorized',
  agency_ato: 'Agency ATO',
  dod_il_authorized: 'DoD IL Authorized',
  other: 'Other Authorization'
};

const AUTHORIZATION_IMPACT_LABELS: Record<string, string> = {
  li_saas: 'LI-SaaS',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High'
};

function formatAuthorizationBadge(
  authorizationStatus: string | null,
  authorizationImpactLevel: string | null
): string | null {
  if (!authorizationStatus || authorizationStatus === 'none') return null;
  const statusLabel = AUTHORIZATION_STATUS_LABELS[authorizationStatus] || authorizationStatus;
  const impactLabel = authorizationImpactLevel ? AUTHORIZATION_IMPACT_LABELS[authorizationImpactLevel] : null;
  return impactLabel ? `${statusLabel} (${impactLabel})` : statusLabel;
}

export default function OrganizationSystemsAndVendors({
  canReadOrganization
}: {
  canReadOrganization: boolean;
}) {
  const [systems, setSystems] = useState<OrganizationSystem[]>([]);
  const [products, setProducts] = useState<CotsProduct[]>([]);
  const [contracts, setContracts] = useState<VendorContract[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [systemForm, setSystemForm] = useState<SystemFormState>(DEFAULT_SYSTEM_FORM);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [systemSaving, setSystemSaving] = useState(false);

  const [cotsForm, setCotsForm] = useState<CotsFormState>(DEFAULT_COTS_FORM);
  const [editingCotsId, setEditingCotsId] = useState<string | null>(null);
  const [cotsSaving, setCotsSaving] = useState(false);

  const [contractForm, setContractForm] = useState<ContractFormState>(DEFAULT_CONTRACT_FORM);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractSaving, setContractSaving] = useState(false);

  const productOptions = useMemo(
    () => products.map((product) => ({ id: product.id, label: `${product.product_name} (${product.vendor_name})` })),
    [products]
  );

  const loadData = useCallback(async () => {
    if (!canReadOrganization) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const [systemsResponse, productsResponse, contractsResponse] = await Promise.all([
        organizationAPI.getSystems({ include_inactive: true }),
        organizationAPI.getCotsProducts(),
        organizationAPI.getContracts()
      ]);
      setSystems(Array.isArray(systemsResponse.data?.data) ? systemsResponse.data.data : []);
      setProducts(Array.isArray(productsResponse.data?.data) ? productsResponse.data.data : []);
      setContracts(Array.isArray(contractsResponse.data?.data) ? contractsResponse.data.data : []);
    } catch (loadError: any) {
      setError(loadError.response?.data?.error || 'Failed to load system and vendor scope data');
    } finally {
      setLoading(false);
    }
  }, [canReadOrganization]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetSystemForm = () => {
    setEditingSystemId(null);
    setSystemForm(DEFAULT_SYSTEM_FORM);
  };

  const resetCotsForm = () => {
    setEditingCotsId(null);
    setCotsForm(DEFAULT_COTS_FORM);
  };

  const resetContractForm = () => {
    setEditingContractId(null);
    setContractForm(DEFAULT_CONTRACT_FORM);
  };

  const startEditSystem = (system: OrganizationSystem) => {
    setEditingSystemId(system.id);
    setSystemForm({
      system_name: system.system_name || '',
      system_code: system.system_code || '',
      system_description: system.system_description || '',
      authorization_boundary_override: system.authorization_boundary_override || '',
      confidentiality_impact: system.confidentiality_impact || '',
      integrity_impact: system.integrity_impact || '',
      availability_impact: system.availability_impact || '',
      deployment_model: system.deployment_model || '',
      environment_types_csv: joinCsv(system.environment_types),
      cloud_providers_csv: joinCsv(system.cloud_providers),
      data_sensitivity_types_csv: joinCsv(system.data_sensitivity_types),
      is_primary: Boolean(system.is_primary),
      is_active: Boolean(system.is_active)
    });
  };

  const startEditCots = (product: CotsProduct) => {
    setEditingCotsId(product.id);
    setCotsForm({
      system_id: product.system_id || '',
      product_name: product.product_name || '',
      vendor_name: product.vendor_name || '',
      product_version: product.product_version || '',
      product_type: product.product_type || '',
      deployment_model: product.deployment_model || '',
      data_access_level: product.data_access_level || '',
      lifecycle_status: product.lifecycle_status || 'active',
      criticality: product.criticality || '',
      support_end_date: formatDate(product.support_end_date),
      authorization_status: product.authorization_status || '',
      authorization_impact_level: product.authorization_impact_level || '',
      external_authorization_id: product.external_authorization_id || '',
      notes: product.notes || ''
    });
  };

  const startEditContract = (contract: VendorContract) => {
    setEditingContractId(contract.id);
    setContractForm({
      system_id: contract.system_id || '',
      cots_product_id: contract.cots_product_id || '',
      contract_name: contract.contract_name || '',
      vendor_name: contract.vendor_name || '',
      contract_number: contract.contract_number || '',
      contract_type: contract.contract_type || '',
      status: contract.status || 'active',
      start_date: formatDate(contract.start_date),
      end_date: formatDate(contract.end_date),
      renewal_date: formatDate(contract.renewal_date),
      notice_period_days:
        contract.notice_period_days === null || contract.notice_period_days === undefined
          ? ''
          : String(contract.notice_period_days),
      security_requirements: contract.security_requirements || '',
      data_processing_terms: contract.data_processing_terms || '',
      sla_summary: contract.sla_summary || '',
      notes: contract.notes || ''
    });
  };

  const handleSystemSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!systemForm.system_name.trim()) {
      setError('System name is required.');
      return;
    }

    try {
      setSystemSaving(true);
      setError('');
      setSuccess('');
      const payload = {
        system_name: systemForm.system_name.trim(),
        system_code: systemForm.system_code.trim() || null,
        system_description: systemForm.system_description.trim() || null,
        authorization_boundary_override: systemForm.authorization_boundary_override.trim() || null,
        confidentiality_impact: systemForm.confidentiality_impact || null,
        integrity_impact: systemForm.integrity_impact || null,
        availability_impact: systemForm.availability_impact || null,
        deployment_model: systemForm.deployment_model || null,
        environment_types: csvToArray(systemForm.environment_types_csv),
        cloud_providers: csvToArray(systemForm.cloud_providers_csv),
        data_sensitivity_types: csvToArray(systemForm.data_sensitivity_types_csv),
        is_primary: systemForm.is_primary,
        is_active: systemForm.is_active
      };

      if (editingSystemId) {
        await organizationAPI.updateSystem(editingSystemId, payload);
        setSuccess('System updated.');
      } else {
        await organizationAPI.createSystem(payload);
        setSuccess('System added.');
      }
      resetSystemForm();
      await loadData();
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || 'Failed to save system');
    } finally {
      setSystemSaving(false);
    }
  };

  const handleSystemDelete = async (systemId: string) => {
    try {
      setError('');
      setSuccess('');
      await organizationAPI.deleteSystem(systemId);
      setSuccess('System removed.');
      if (editingSystemId === systemId) resetSystemForm();
      await loadData();
    } catch (deleteError: any) {
      setError(deleteError.response?.data?.error || 'Failed to remove system');
    }
  };

  const handleCotsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cotsForm.product_name.trim() || !cotsForm.vendor_name.trim()) {
      setError('COTS product name and vendor are required.');
      return;
    }

    try {
      setCotsSaving(true);
      setError('');
      setSuccess('');
      const productType = toEnumValue(cotsForm.product_type, COTS_PRODUCT_TYPES);
      const deploymentModel = toEnumValue(cotsForm.deployment_model, COTS_DEPLOYMENT_MODELS);
      const dataAccessLevel = toEnumValue(cotsForm.data_access_level, COTS_DATA_ACCESS_LEVELS);
      const lifecycleStatus = toEnumValue(cotsForm.lifecycle_status, COTS_LIFECYCLE_STATUSES) || 'active';
      const criticality = toEnumValue(cotsForm.criticality, CRITICALITY_LEVELS);
      const authorizationStatus = toEnumValue(cotsForm.authorization_status, COTS_AUTHORIZATION_STATUSES);
      const authorizationImpactLevel = toEnumValue(
        cotsForm.authorization_impact_level,
        COTS_AUTHORIZATION_IMPACT_LEVELS
      );
      const payload = {
        system_id: cotsForm.system_id || null,
        product_name: cotsForm.product_name.trim(),
        vendor_name: cotsForm.vendor_name.trim(),
        product_version: cotsForm.product_version.trim() || null,
        product_type: productType,
        deployment_model: deploymentModel,
        data_access_level: dataAccessLevel,
        lifecycle_status: lifecycleStatus,
        criticality,
        support_end_date: cotsForm.support_end_date || null,
        authorization_status: authorizationStatus,
        authorization_impact_level: authorizationImpactLevel,
        external_authorization_id: cotsForm.external_authorization_id.trim() || null,
        notes: cotsForm.notes.trim() || null
      };

      if (editingCotsId) {
        await organizationAPI.updateCotsProduct(editingCotsId, payload);
        setSuccess('COTS product updated.');
      } else {
        await organizationAPI.createCotsProduct(payload);
        setSuccess('COTS product added.');
      }
      resetCotsForm();
      await loadData();
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || 'Failed to save COTS product');
    } finally {
      setCotsSaving(false);
    }
  };

  const handleCotsDelete = async (productId: string) => {
    try {
      setError('');
      setSuccess('');
      await organizationAPI.deleteCotsProduct(productId);
      setSuccess('COTS product removed.');
      if (editingCotsId === productId) resetCotsForm();
      await loadData();
    } catch (deleteError: any) {
      setError(deleteError.response?.data?.error || 'Failed to remove COTS product');
    }
  };

  const handleContractSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contractForm.contract_name.trim() || !contractForm.vendor_name.trim()) {
      setError('Contract name and vendor are required.');
      return;
    }

    try {
      setContractSaving(true);
      setError('');
      setSuccess('');
      const contractType = toEnumValue(contractForm.contract_type, CONTRACT_TYPES);
      const status = toEnumValue(contractForm.status, CONTRACT_STATUSES) || 'active';
      const noticePeriodValue = contractForm.notice_period_days.trim()
        ? Number.parseInt(contractForm.notice_period_days, 10)
        : null;
      const payload = {
        system_id: contractForm.system_id || null,
        cots_product_id: contractForm.cots_product_id || null,
        contract_name: contractForm.contract_name.trim(),
        vendor_name: contractForm.vendor_name.trim(),
        contract_number: contractForm.contract_number.trim() || null,
        contract_type: contractType,
        status,
        start_date: contractForm.start_date || null,
        end_date: contractForm.end_date || null,
        renewal_date: contractForm.renewal_date || null,
        notice_period_days:
          noticePeriodValue !== null && Number.isFinite(noticePeriodValue)
            ? noticePeriodValue
            : null,
        security_requirements: contractForm.security_requirements.trim() || null,
        data_processing_terms: contractForm.data_processing_terms.trim() || null,
        sla_summary: contractForm.sla_summary.trim() || null,
        notes: contractForm.notes.trim() || null
      };

      if (editingContractId) {
        await organizationAPI.updateContract(editingContractId, payload);
        setSuccess('Contract updated.');
      } else {
        await organizationAPI.createContract(payload);
        setSuccess('Contract added.');
      }
      resetContractForm();
      await loadData();
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || 'Failed to save contract');
    } finally {
      setContractSaving(false);
    }
  };

  const handleContractDelete = async (contractId: string) => {
    try {
      setError('');
      setSuccess('');
      await organizationAPI.deleteContract(contractId);
      setSuccess('Contract removed.');
      if (editingContractId === contractId) resetContractForm();
      await loadData();
    } catch (deleteError: any) {
      setError(deleteError.response?.data?.error || 'Failed to remove contract');
    }
  };

  if (loading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="animate-pulse h-24 rounded bg-gray-100" />
      </section>
    );
  }

  const systemOptionMap = { '': 'Org-wide', ...optionLabelMapFromSystems(systems) };
  const productOptionMap = {
    '': 'None',
    ...Object.fromEntries(productOptions.map((product) => [product.id, product.label]))
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">System-Specific Requirements</h2>
        <p className="text-sm text-gray-600">
          Use org baseline above, then add per-system overlays when a specific boundary or requirement differs.
        </p>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
          {success}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Systems</h3>
        <SimpleTable
          columns={['System', 'Primary', 'Deployment', 'CIA', 'Actions']}
          rows={systems.map((system) => ({
            key: system.id,
            cells: [
              `${system.system_name}${system.system_code ? ` (${system.system_code})` : ''}`,
              system.is_primary ? 'Yes' : 'No',
              system.deployment_model || '-',
              `${(system.confidentiality_impact || '-').toUpperCase()}/${(system.integrity_impact || '-').toUpperCase()}/${(system.availability_impact || '-').toUpperCase()}`,
              <ActionButtons
                key={`system-actions-${system.id}`}
                onEdit={() => startEditSystem(system)}
                onDelete={() => handleSystemDelete(system.id)}
              />
            ]
          }))}
          emptyText="No systems added yet."
        />

        <form onSubmit={handleSystemSave} className="space-y-3 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">{editingSystemId ? 'Edit System' : 'Add System'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput
              label="System Name *"
              value={systemForm.system_name}
              onChange={(value) => setSystemForm((current) => ({ ...current, system_name: value }))}
            />
            <LabeledInput
              label="System Code"
              value={systemForm.system_code}
              onChange={(value) => setSystemForm((current) => ({ ...current, system_code: value }))}
            />
            <LabeledSelect
              label="Deployment"
              value={systemForm.deployment_model}
              onChange={(value) => setSystemForm((current) => ({ ...current, deployment_model: value as SystemFormState['deployment_model'] }))}
              options={['', 'on_prem', 'single_cloud', 'multi_cloud', 'hybrid', 'saas_only']}
            />
            <LabeledInput
              label="Environment Types (CSV)"
              value={systemForm.environment_types_csv}
              onChange={(value) => setSystemForm((current) => ({ ...current, environment_types_csv: value }))}
              placeholder="production, staging, cloud"
            />
            <LabeledSelect
              label="Confidentiality"
              value={systemForm.confidentiality_impact}
              onChange={(value) => setSystemForm((current) => ({ ...current, confidentiality_impact: value as SystemFormState['confidentiality_impact'] }))}
              options={['', 'low', 'moderate', 'high']}
            />
            <LabeledSelect
              label="Integrity"
              value={systemForm.integrity_impact}
              onChange={(value) => setSystemForm((current) => ({ ...current, integrity_impact: value as SystemFormState['integrity_impact'] }))}
              options={['', 'low', 'moderate', 'high']}
            />
            <LabeledSelect
              label="Availability"
              value={systemForm.availability_impact}
              onChange={(value) => setSystemForm((current) => ({ ...current, availability_impact: value as SystemFormState['availability_impact'] }))}
              options={['', 'low', 'moderate', 'high']}
            />
            <LabeledInput
              label="Cloud Providers (CSV)"
              value={systemForm.cloud_providers_csv}
              onChange={(value) => setSystemForm((current) => ({ ...current, cloud_providers_csv: value }))}
              placeholder="aws, azure, gcp"
            />
          </div>
          <LabeledTextArea
            label="Boundary Override"
            value={systemForm.authorization_boundary_override}
            onChange={(value) => setSystemForm((current) => ({ ...current, authorization_boundary_override: value }))}
            rows={2}
          />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={systemForm.is_primary}
                onChange={(event) => setSystemForm((current) => ({ ...current, is_primary: event.target.checked }))}
              />
              Primary system
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={systemForm.is_active}
                onChange={(event) => setSystemForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active
            </label>
          </div>
          <FormButtons
            saving={systemSaving}
            saveLabel={editingSystemId ? 'Update System' : 'Add System'}
            onCancel={editingSystemId ? resetSystemForm : null}
          />
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">COTS Products</h3>
        <SimpleTable
          columns={['Product', 'Vendor', 'System', 'Status', 'Actions']}
          rows={products.map((product) => {
            const authorizationBadge = formatAuthorizationBadge(
              product.authorization_status,
              product.authorization_impact_level
            );
            return {
              key: product.id,
              cells: [
                <span key={`product-name-${product.id}`} className="flex flex-wrap items-center gap-2">
                  {product.product_name}
                  {authorizationBadge && (
                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {authorizationBadge}
                    </span>
                  )}
                </span>,
                product.vendor_name,
                product.system_name || 'Org-wide',
                product.lifecycle_status,
                <ActionButtons
                  key={`product-actions-${product.id}`}
                  onEdit={() => startEditCots(product)}
                  onDelete={() => handleCotsDelete(product.id)}
                />
              ]
            };
          })}
          emptyText="No COTS products tracked yet."
        />

        <form onSubmit={handleCotsSave} className="space-y-3 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">{editingCotsId ? 'Edit COTS Product' : 'Add COTS Product'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput
              label="Product Name *"
              value={cotsForm.product_name}
              onChange={(value) => setCotsForm((current) => ({ ...current, product_name: value }))}
            />
            <LabeledInput
              label="Vendor Name *"
              value={cotsForm.vendor_name}
              onChange={(value) => setCotsForm((current) => ({ ...current, vendor_name: value }))}
            />
            <LabeledSelect
              label="System"
              value={cotsForm.system_id}
              onChange={(value) => setCotsForm((current) => ({ ...current, system_id: value }))}
              options={['', ...systems.map((system) => system.id)]}
              optionLabelMap={systemOptionMap}
            />
            <LabeledSelect
              label="Lifecycle Status"
              value={cotsForm.lifecycle_status}
              onChange={(value) => setCotsForm((current) => ({ ...current, lifecycle_status: value }))}
              options={['planned', 'active', 'deprecated', 'retired']}
            />
            <LabeledSelect
              label="Criticality"
              value={cotsForm.criticality}
              onChange={(value) => setCotsForm((current) => ({ ...current, criticality: value }))}
              options={['', 'low', 'medium', 'high', 'critical']}
            />
            <LabeledInput
              type="date"
              label="Support End Date"
              value={cotsForm.support_end_date}
              onChange={(value) => setCotsForm((current) => ({ ...current, support_end_date: value }))}
            />
            <LabeledSelect
              label="Authorization Status"
              value={cotsForm.authorization_status}
              onChange={(value) => setCotsForm((current) => ({ ...current, authorization_status: value }))}
              options={['', ...COTS_AUTHORIZATION_STATUSES]}
              optionLabelMap={{ '': 'Not set', ...AUTHORIZATION_STATUS_LABELS, none: 'None' }}
            />
            <LabeledSelect
              label="Authorization Impact Level"
              value={cotsForm.authorization_impact_level}
              onChange={(value) => setCotsForm((current) => ({ ...current, authorization_impact_level: value }))}
              options={['', ...COTS_AUTHORIZATION_IMPACT_LEVELS]}
              optionLabelMap={{ '': 'Not set', ...AUTHORIZATION_IMPACT_LABELS }}
            />
            <LabeledInput
              label="External Authorization ID"
              value={cotsForm.external_authorization_id}
              onChange={(value) => setCotsForm((current) => ({ ...current, external_authorization_id: value }))}
              placeholder="e.g. FedRAMP package ID"
            />
          </div>
          <LabeledTextArea
            label="Notes"
            value={cotsForm.notes}
            onChange={(value) => setCotsForm((current) => ({ ...current, notes: value }))}
            rows={2}
          />
          <FormButtons
            saving={cotsSaving}
            saveLabel={editingCotsId ? 'Update Product' : 'Add Product'}
            onCancel={editingCotsId ? resetCotsForm : null}
          />
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Contracts</h3>
        <SimpleTable
          columns={['Contract', 'Vendor', 'System', 'Product', 'Status', 'Actions']}
          rows={contracts.map((contract) => ({
            key: contract.id,
            cells: [
              `${contract.contract_name}${contract.contract_number ? ` (${contract.contract_number})` : ''}`,
              contract.vendor_name,
              contract.system_name || 'Org-wide',
              contract.product_name || '-',
              contract.status,
              <ActionButtons
                key={`contract-actions-${contract.id}`}
                onEdit={() => startEditContract(contract)}
                onDelete={() => handleContractDelete(contract.id)}
              />
            ]
          }))}
          emptyText="No contracts tracked yet."
        />

        <form onSubmit={handleContractSave} className="space-y-3 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">{editingContractId ? 'Edit Contract' : 'Add Contract'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput
              label="Contract Name *"
              value={contractForm.contract_name}
              onChange={(value) => setContractForm((current) => ({ ...current, contract_name: value }))}
            />
            <LabeledInput
              label="Vendor Name *"
              value={contractForm.vendor_name}
              onChange={(value) => setContractForm((current) => ({ ...current, vendor_name: value }))}
            />
            <LabeledSelect
              label="System"
              value={contractForm.system_id}
              onChange={(value) => setContractForm((current) => ({ ...current, system_id: value }))}
              options={['', ...systems.map((system) => system.id)]}
              optionLabelMap={systemOptionMap}
            />
            <LabeledSelect
              label="Linked Product"
              value={contractForm.cots_product_id}
              onChange={(value) => setContractForm((current) => ({ ...current, cots_product_id: value }))}
              options={['', ...productOptions.map((product) => product.id)]}
              optionLabelMap={productOptionMap}
            />
            <LabeledSelect
              label="Status"
              value={contractForm.status}
              onChange={(value) => setContractForm((current) => ({ ...current, status: value }))}
              options={['draft', 'active', 'renewal_pending', 'expired', 'terminated']}
            />
            <LabeledInput
              label="Contract Number"
              value={contractForm.contract_number}
              onChange={(value) => setContractForm((current) => ({ ...current, contract_number: value }))}
            />
            <LabeledInput
              type="date"
              label="Start Date"
              value={contractForm.start_date}
              onChange={(value) => setContractForm((current) => ({ ...current, start_date: value }))}
            />
            <LabeledInput
              type="date"
              label="End Date"
              value={contractForm.end_date}
              onChange={(value) => setContractForm((current) => ({ ...current, end_date: value }))}
            />
            <LabeledInput
              type="date"
              label="Renewal Date"
              value={contractForm.renewal_date}
              onChange={(value) => setContractForm((current) => ({ ...current, renewal_date: value }))}
            />
            <LabeledInput
              label="Notice Period Days"
              value={contractForm.notice_period_days}
              onChange={(value) => setContractForm((current) => ({ ...current, notice_period_days: value }))}
            />
          </div>
          <LabeledTextArea
            label="Security Requirements"
            value={contractForm.security_requirements}
            onChange={(value) => setContractForm((current) => ({ ...current, security_requirements: value }))}
            rows={2}
          />
          <LabeledTextArea
            label="Notes"
            value={contractForm.notes}
            onChange={(value) => setContractForm((current) => ({ ...current, notes: value }))}
            rows={2}
          />
          <FormButtons
            saving={contractSaving}
            saveLabel={editingContractId ? 'Update Contract' : 'Add Contract'}
            onCancel={editingContractId ? resetContractForm : null}
          />
        </form>
      </section>
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
  emptyText
}: {
  columns: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-gray-500">{emptyText}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-t border-gray-100">
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${index}`} className="px-3 py-2">{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ActionButtons({
  onEdit,
  onDelete
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-x-2">
      <button type="button" className="text-blue-700 hover:underline" onClick={onEdit}>Edit</button>
      <button type="button" className="text-red-700 hover:underline" onClick={onDelete}>Delete</button>
    </div>
  );
}

function FormButtons({
  saving,
  saveLabel,
  onCancel
}: {
  saving: boolean;
  saveLabel: string;
  onCancel: (() => void) | null;
}) {
  return (
    <div className="flex gap-2">
      <button type="submit" disabled={saving} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60">
        {saving ? 'Saving...' : saveLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  optionLabelMap
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  optionLabelMap?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabelMap?.[option] || (option || 'Select')}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabeledTextArea({
  label,
  value,
  onChange,
  rows
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  );
}
