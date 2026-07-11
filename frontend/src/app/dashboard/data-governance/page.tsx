// @tier: enterprise
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { dataGovernanceAPI, dataSovereigntyAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface RetentionPolicy {
  id: string;
  policy_name: string;
  data_category: string;
  retention_period_days: number;
  auto_delete_enabled: boolean;
  legal_basis?: string;
  created_at: string;
  updated_at: string;
}

interface LegalHold {
  id: string;
  hold_name: string;
  hold_reason: string;
  data_scope: string;
  custodian_name?: string;
  start_date: string;
  end_date?: string;
  status: 'active' | 'released';
  created_at: string;
}

type GovernanceTab = 'retention' | 'sovereignty';

interface SovereigntyConfig {
  primary_data_region: string | null;
  data_residency_requirements: Record<string, unknown> | null;
  cross_border_transfer_allowed: boolean | null;
  approved_transfer_regions: string[] | null;
  data_localization_policy: string | null;
  sovereignty_attestation_date: string | null;
}

interface RegulatoryJurisdiction {
  id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type?: string;
  has_ai_regulations?: boolean;
  has_data_residency?: boolean;
  primary_ai_law?: string;
  primary_privacy_law?: string;
  recommended_frameworks?: string[];
}

interface OrganizationJurisdiction {
  id: string;
  jurisdiction_id: string;
  jurisdiction_name: string;
  jurisdiction_type?: string;
  has_ai_regulations?: boolean;
  has_data_residency?: boolean;
  primary_ai_law?: string;
  primary_privacy_law?: string;
  presence_type: string;
  operational_since?: string | null;
  compliance_required: boolean;
  compliance_status?: string | null;
  applicable_frameworks?: string[];
  notes?: string | null;
  last_assessment_date?: string | null;
  next_assessment_date?: string | null;
}

interface RegulatoryChange {
  id: string;
  jurisdiction_id: string;
  jurisdiction_name: string;
  jurisdiction_code: string;
  change_title: string;
  change_type: string;
  change_source?: string | null;
  announced_date?: string | null;
  effective_date?: string | null;
  compliance_deadline?: string | null;
  impact_level: string;
  affected_frameworks?: string[];
  affected_controls?: string[];
  summary: string;
  full_details?: string | null;
  source_url?: string | null;
  requires_action: boolean;
  status?: string | null;
}

interface RecommendedFrameworksResult {
  jurisdiction_code: string;
  jurisdiction_name: string;
  recommended_frameworks: {
    id: string;
    code: string;
    name: string;
    version?: string;
    description?: string;
    category?: string;
    tier_required?: string;
  }[];
}

interface ComplianceGapRow {
  id: string;
  jurisdiction_name: string;
  jurisdiction_code: string;
  primary_ai_law?: string;
  primary_privacy_law?: string;
  presence_type: string;
  compliance_status?: string;
  compliance_required: boolean;
  last_assessment_date?: string | null;
  next_assessment_date?: string | null;
  applicable_frameworks?: string[];
  pending_regulatory_changes: number;
  critical_changes: number;
}

const PRESENCE_TYPES = ['headquarters', 'office', 'data_center', 'customers', 'vendors'] as const;
const CHANGE_TYPES = ['new_law', 'amendment', 'repeal', 'guidance', 'enforcement_action'] as const;
const IMPACT_LEVELS = ['critical', 'high', 'medium', 'low', 'unknown'] as const;
const CHANGE_STATUSES = ['monitoring', 'assessing', 'implementing', 'compliant'] as const;

function impactBadgeClass(level: string): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function SovereigntyConfigSection({ canWrite }: { canWrite: boolean }) {
  const { showToast, toast, toastType } = useToast();
  const [config, setConfig] = useState<SovereigntyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    primary_data_region: '',
    cross_border_transfer_allowed: false,
    approved_transfer_regions: '',
    data_localization_policy: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await dataSovereigntyAPI.getConfig();
        const data: SovereigntyConfig | undefined = response.data?.data;
        if (cancelled) return;
        if (data) {
          setConfig(data);
          setForm({
            primary_data_region: data.primary_data_region || '',
            cross_border_transfer_allowed: Boolean(data.cross_border_transfer_allowed),
            approved_transfer_regions: Array.isArray(data.approved_transfer_regions)
              ? data.approved_transfer_regions.join(', ')
              : '',
            data_localization_policy: data.data_localization_policy || '',
          });
        }
      } catch {
        if (!cancelled) setError('Failed to load data sovereignty configuration.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        primary_data_region: form.primary_data_region.trim() || null,
        cross_border_transfer_allowed: form.cross_border_transfer_allowed,
        approved_transfer_regions: form.approved_transfer_regions
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
        data_localization_policy: form.data_localization_policy.trim() || null,
      };
      const response = await dataSovereigntyAPI.updateConfig(payload);
      setConfig(response.data?.data || null);
      showToast('Data sovereignty configuration saved.');
    } catch {
      showToast('Failed to save data sovereignty configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-40 rounded-lg bg-gray-100" />;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-600">
      {toast && (
        <div role="status" aria-live="polite" className={`mb-4 px-4 py-2 rounded-lg text-white text-sm ${toastType === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast}
        </div>
      )}
      <h3 className="text-lg font-bold text-gray-900">Sovereignty Configuration</h3>
      <p className="text-sm text-gray-600 mt-1">
        Declares where your organization&apos;s data primarily resides and the rules for cross-border transfer.
      </p>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="sov-region" className="block text-sm font-medium text-gray-700 mb-1">
            Primary Data Region
          </label>
          <input
            id="sov-region"
            type="text"
            disabled={!canWrite}
            value={form.primary_data_region}
            onChange={(e) => setForm({ ...form, primary_data_region: e.target.value })}
            placeholder="e.g., us-east, eu-west"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label htmlFor="sov-regions" className="block text-sm font-medium text-gray-700 mb-1">
            Approved Transfer Regions (comma-separated)
          </label>
          <input
            id="sov-regions"
            type="text"
            disabled={!canWrite}
            value={form.approved_transfer_regions}
            onChange={(e) => setForm({ ...form, approved_transfer_regions: e.target.value })}
            placeholder="eu-west, us-east"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="sov-policy" className="block text-sm font-medium text-gray-700 mb-1">
            Data Localization Policy
          </label>
          <textarea
            id="sov-policy"
            disabled={!canWrite}
            value={form.data_localization_policy}
            onChange={(e) => setForm({ ...form, data_localization_policy: e.target.value })}
            rows={3}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2">
            <input
              id="sov-cross-border"
              type="checkbox"
              disabled={!canWrite}
              checked={form.cross_border_transfer_allowed}
              onChange={(e) => setForm({ ...form, cross_border_transfer_allowed: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Cross-border data transfer allowed</span>
          </label>
        </div>
      </div>

      {config?.sovereignty_attestation_date && (
        <p className="mt-3 text-xs text-gray-500">
          Last attested {new Date(config.sovereignty_attestation_date).toLocaleString()}
        </p>
      )}

      {canWrite && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      )}
    </div>
  );
}

function JurisdictionsSection({ canWrite }: { canWrite: boolean }) {
  const { showToast, toast, toastType } = useToast();
  const [referenceJurisdictions, setReferenceJurisdictions] = useState<RegulatoryJurisdiction[]>([]);
  const [orgJurisdictions, setOrgJurisdictions] = useState<OrganizationJurisdiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lookupCode, setLookupCode] = useState('');
  const [lookupResult, setLookupResult] = useState<RecommendedFrameworksResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [addForm, setAddForm] = useState({
    jurisdiction_id: '',
    presence_type: 'office' as (typeof PRESENCE_TYPES)[number],
    operational_since: '',
    compliance_required: false,
    notes: '',
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [refRes, orgRes] = await Promise.all([
        dataSovereigntyAPI.getJurisdictions(),
        dataSovereigntyAPI.getOrgJurisdictions(),
      ]);
      setReferenceJurisdictions(Array.isArray(refRes.data?.data) ? refRes.data.data : []);
      setOrgJurisdictions(Array.isArray(orgRes.data?.data) ? orgRes.data.data : []);
    } catch {
      setError('Failed to load jurisdiction data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAll();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    if (!addForm.jurisdiction_id) {
      showToast('Select a jurisdiction first.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await dataSovereigntyAPI.addOrgJurisdiction({
        jurisdiction_id: addForm.jurisdiction_id,
        presence_type: addForm.presence_type,
        operational_since: addForm.operational_since || null,
        compliance_required: addForm.compliance_required,
        applicable_frameworks: [],
        notes: addForm.notes || null,
      });
      setShowAddForm(false);
      setAddForm({
        jurisdiction_id: '',
        presence_type: 'office',
        operational_since: '',
        compliance_required: false,
        notes: '',
      });
      await loadAll();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showToast(error.response?.data?.error || 'Failed to add jurisdiction.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await dataSovereigntyAPI.removeOrgJurisdiction(id);
      await loadAll();
    } catch {
      showToast('Failed to remove jurisdiction.', 'error');
    }
  };

  const handleLookup = async () => {
    if (!lookupCode.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const response = await dataSovereigntyAPI.getJurisdictionFrameworks(lookupCode.trim());
      setLookupResult(response.data?.data || null);
    } catch {
      setLookupError('Failed to fetch recommended frameworks for that jurisdiction code.');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div role="status" aria-live="polite" className={`px-4 py-2 rounded-lg text-white text-sm ${toastType === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Organization Jurisdictions</h3>
            <p className="text-sm text-gray-600 mt-1">Where your organization operates, and its compliance status per jurisdiction.</p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {showAddForm ? 'Cancel' : '+ Add Jurisdiction'}
            </button>
          )}
        </div>

        {showAddForm && canWrite && (
          <div className="mt-4 border border-gray-200 rounded-lg p-4 space-y-3">
            <div>
              <label htmlFor="org-jur-select" className="block text-sm font-medium text-gray-700 mb-1">
                Jurisdiction
              </label>
              <select
                id="org-jur-select"
                value={addForm.jurisdiction_id}
                onChange={(e) => setAddForm({ ...addForm, jurisdiction_id: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select a jurisdiction…</option>
                {referenceJurisdictions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jurisdiction_name} ({j.jurisdiction_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="org-jur-presence" className="block text-sm font-medium text-gray-700 mb-1">
                  Presence Type
                </label>
                <select
                  id="org-jur-presence"
                  value={addForm.presence_type}
                  onChange={(e) =>
                    setAddForm({ ...addForm, presence_type: e.target.value as (typeof PRESENCE_TYPES)[number] })
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {PRESENCE_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="org-jur-since" className="block text-sm font-medium text-gray-700 mb-1">
                  Operational Since
                </label>
                <input
                  id="org-jur-since"
                  type="date"
                  value={addForm.operational_since}
                  onChange={(e) => setAddForm({ ...addForm, operational_since: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addForm.compliance_required}
                  onChange={(e) => setAddForm({ ...addForm, compliance_required: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Compliance required in this jurisdiction</span>
              </label>
            </div>
            <div>
              <label htmlFor="org-jur-notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="org-jur-notes"
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                rows={2}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={submitting}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Jurisdiction'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-4 animate-pulse h-24 rounded bg-gray-100" />
        ) : orgJurisdictions.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No data available. Add a jurisdiction to start tracking compliance presence.</p>
        ) : (
          <ul role="list" className="mt-4 divide-y divide-gray-100">
            {orgJurisdictions.map((oj) => (
              <li role="listitem" key={oj.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {oj.jurisdiction_name}
                    {oj.compliance_required && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full" aria-label="Compliance required">
                        compliance required
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {oj.presence_type.replace('_', ' ')}
                    {oj.primary_ai_law ? ` · ${oj.primary_ai_law}` : ''}
                    {oj.compliance_status ? ` · status: ${oj.compliance_status}` : ''}
                  </p>
                </div>
                {canWrite && (
                  <button
                    onClick={() => handleRemove(oj.id)}
                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900">Jurisdiction Reference</h3>
        <p className="text-sm text-gray-600 mt-1">All jurisdictions tracked by the platform (informational).</p>
        {loading ? (
          <div className="mt-4 animate-pulse h-24 rounded bg-gray-100" />
        ) : referenceJurisdictions.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No data available.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-2">Jurisdiction</th>
                  <th className="px-4 py-2">Primary AI Law</th>
                  <th className="px-4 py-2">Primary Privacy Law</th>
                  <th className="px-4 py-2">AI Regs</th>
                  <th className="px-4 py-2">Data Residency</th>
                </tr>
              </thead>
              <tbody>
                {referenceJurisdictions.map((j) => (
                  <tr key={j.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {j.jurisdiction_name} ({j.jurisdiction_code})
                    </td>
                    <td className="px-4 py-2 text-gray-600">{j.primary_ai_law || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{j.primary_privacy_law || '—'}</td>
                    <td className="px-4 py-2">{j.has_ai_regulations ? '✓' : '—'}</td>
                    <td className="px-4 py-2">{j.has_data_residency ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900">Recommended Frameworks Lookup</h3>
        <p className="text-sm text-gray-600 mt-1">Enter a jurisdiction code to see recommended compliance frameworks.</p>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="jur-code-lookup" className="sr-only">
            Jurisdiction code
          </label>
          <input
            id="jur-code-lookup"
            type="text"
            value={lookupCode}
            onChange={(e) => setLookupCode(e.target.value)}
            placeholder="e.g., EU, US-CA"
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading}
            className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {lookupLoading ? 'Looking up...' : 'Lookup'}
          </button>
        </div>
        {lookupError && <p className="mt-2 text-sm text-red-600">{lookupError}</p>}
        {lookupResult && (
          <div className="mt-3">
            <p className="text-sm font-medium text-gray-900">{lookupResult.jurisdiction_name}</p>
            {lookupResult.recommended_frameworks.length === 0 ? (
              <p className="text-sm text-gray-500 mt-1">No recommended frameworks for this jurisdiction.</p>
            ) : (
              <ul role="list" className="mt-2 space-y-1">
                {lookupResult.recommended_frameworks.map((fw) => (
                  <li role="listitem" key={fw.id} className="text-sm text-gray-700">
                    {fw.name} {fw.version ? `(${fw.version})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RegulatoryChangesSection({ canManage }: { canManage: boolean }) {
  const { showToast, toast, toastType } = useToast();
  const [changes, setChanges] = useState<RegulatoryChange[]>([]);
  const [orgJurisdictions, setOrgJurisdictions] = useState<OrganizationJurisdiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    jurisdiction_id: '',
    change_title: '',
    change_type: 'guidance' as (typeof CHANGE_TYPES)[number],
    impact_level: 'medium' as (typeof IMPACT_LEVELS)[number],
    summary: '',
    effective_date: '',
    requires_action: false,
  });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [changesRes, orgJurRes] = await Promise.all([
        dataSovereigntyAPI.getRegulatoryChanges(),
        dataSovereigntyAPI.getOrgJurisdictions(),
      ]);
      setChanges(Array.isArray(changesRes.data?.data) ? changesRes.data.data : []);
      setOrgJurisdictions(Array.isArray(orgJurRes.data?.data) ? orgJurRes.data.data : []);
    } catch {
      setError('Failed to load regulatory changes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadAll();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!form.jurisdiction_id || !form.change_title.trim() || !form.summary.trim()) {
      showToast('Jurisdiction, title, and summary are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await dataSovereigntyAPI.createRegulatoryChange({
        jurisdiction_id: form.jurisdiction_id,
        change_title: form.change_title.trim(),
        change_type: form.change_type,
        impact_level: form.impact_level,
        summary: form.summary.trim(),
        effective_date: form.effective_date || null,
        requires_action: form.requires_action,
      });
      setShowForm(false);
      setForm({
        jurisdiction_id: '',
        change_title: '',
        change_type: 'guidance',
        impact_level: 'medium',
        summary: '',
        effective_date: '',
        requires_action: false,
      });
      await loadAll();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showToast(error.response?.data?.error || 'Failed to create regulatory change.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await dataSovereigntyAPI.updateRegulatoryChangeStatus(id, { status });
      await loadAll();
    } catch {
      showToast('Failed to update regulatory change status.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div role="status" aria-live="polite" className={`px-4 py-2 rounded-lg text-white text-sm ${toastType === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-600">
          Track regulatory changes affecting jurisdictions where your organization operates.
        </p>
        {canManage && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {showForm ? 'Cancel' : '+ Log Regulatory Change'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
      )}

      {showForm && canManage && (
        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          <div>
            <label htmlFor="rc-jur" className="block text-sm font-medium text-gray-700 mb-1">
              Jurisdiction
            </label>
            <select
              id="rc-jur"
              value={form.jurisdiction_id}
              onChange={(e) => setForm({ ...form, jurisdiction_id: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select a jurisdiction…</option>
              {orgJurisdictions.map((oj) => (
                <option key={oj.jurisdiction_id} value={oj.jurisdiction_id}>
                  {oj.jurisdiction_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rc-title" className="block text-sm font-medium text-gray-700 mb-1">
              Change Title
            </label>
            <input
              id="rc-title"
              type="text"
              value={form.change_title}
              onChange={(e) => setForm({ ...form, change_title: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rc-type" className="block text-sm font-medium text-gray-700 mb-1">
                Change Type
              </label>
              <select
                id="rc-type"
                value={form.change_type}
                onChange={(e) => setForm({ ...form, change_type: e.target.value as (typeof CHANGE_TYPES)[number] })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {CHANGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rc-impact" className="block text-sm font-medium text-gray-700 mb-1">
                Impact Level
              </label>
              <select
                id="rc-impact"
                value={form.impact_level}
                onChange={(e) => setForm({ ...form, impact_level: e.target.value as (typeof IMPACT_LEVELS)[number] })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {IMPACT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rc-effective" className="block text-sm font-medium text-gray-700 mb-1">
                Effective Date
              </label>
              <input
                id="rc-effective"
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="rc-summary" className="block text-sm font-medium text-gray-700 mb-1">
              Summary
            </label>
            <textarea
              id="rc-summary"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requires_action}
              onChange={(e) => setForm({ ...form, requires_action: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Requires action</span>
          </label>
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Log Change'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse h-32 rounded-lg bg-gray-100" />
      ) : changes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-500">
          No data available. Regulatory changes appear here once your organization tracks jurisdictions with updates.
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {changes.map((change) => (
            <li role="listitem" key={change.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{change.change_title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {change.jurisdiction_name} · {change.change_type.replace('_', ' ')}
                    {change.effective_date ? ` · effective ${new Date(change.effective_date).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${impactBadgeClass(change.impact_level)}`}
                  aria-label={`Impact level: ${change.impact_level}`}
                >
                  {change.impact_level}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-2">{change.summary}</p>
              {canManage && (
                <div className="mt-3 flex items-center gap-2">
                  <label htmlFor={`rc-status-${change.id}`} className="text-xs text-gray-500">
                    Status:
                  </label>
                  <select
                    id={`rc-status-${change.id}`}
                    value={change.status || ''}
                    disabled={updatingId === change.id}
                    onChange={(e) => handleStatusUpdate(change.id, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    <option value="" disabled>
                      Set status…
                    </option>
                    {CHANGE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GapAnalysisSection() {
  const [rows, setRows] = useState<ComplianceGapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const response = await dataSovereigntyAPI.getComplianceGapAnalysis();
        const data = Array.isArray(response.data?.data) ? response.data.data : [];
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setError('Failed to load compliance gap analysis.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-lg bg-gray-100" />;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900">Compliance Gap Analysis</h3>
      <p className="text-sm text-gray-600 mt-1">
        Per-jurisdiction compliance posture, weighted by pending and critical regulatory changes.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No data available. Add organization jurisdictions to generate a gap analysis.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="px-4 py-2">Jurisdiction</th>
                <th className="px-4 py-2">Presence</th>
                <th className="px-4 py-2">Compliance Status</th>
                <th className="px-4 py-2">Pending Changes</th>
                <th className="px-4 py-2">Critical Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {row.jurisdiction_name}
                    {row.compliance_required && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full" aria-label="Compliance required">
                        required
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{row.presence_type.replace('_', ' ')}</td>
                  <td className="px-4 py-2 text-gray-600">{row.compliance_status || 'not assessed'}</td>
                  <td className="px-4 py-2 text-gray-600">{row.pending_regulatory_changes}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${row.critical_changes > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}
                      aria-label={`${row.critical_changes} critical regulatory changes`}
                    >
                      {row.critical_changes}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type SovereigntySubTab = 'config' | 'jurisdictions' | 'changes' | 'gaps';

function DataSovereigntyPanel() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'organizations.write');
  const canManage = hasPermission(user, 'frameworks.manage');
  const [subTab, setSubTab] = useState<SovereigntySubTab>('config');

  const subTabs: { key: SovereigntySubTab; label: string }[] = [
    { key: 'config', label: 'Config' },
    { key: 'jurisdictions', label: 'Jurisdictions' },
    { key: 'changes', label: 'Regulatory Changes' },
    { key: 'gaps', label: 'Gap Analysis' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Track where your organization&apos;s data resides, which jurisdictions apply, and how regulatory changes
        affect your compliance posture.
      </p>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {subTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                subTab === tab.key
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {subTab === 'config' && <SovereigntyConfigSection canWrite={canWrite} />}
      {subTab === 'jurisdictions' && <JurisdictionsSection canWrite={canWrite} />}
      {subTab === 'changes' && <RegulatoryChangesSection canManage={canManage} />}
      {subTab === 'gaps' && <GapAnalysisSection />}
    </div>
  );
}

export default function DataGovernancePage() {
  const [activeTab, setActiveTab] = useState<GovernanceTab>('retention');
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [legalHolds, setLegalHolds] = useState<LegalHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast, toastType, showToast } = useToast();
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showLegalHoldModal, setShowLegalHoldModal] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    policy_name: '',
    data_category: '',
    retention_period_days: 365,
    auto_delete_enabled: false,
    legal_basis: ''
  });
  const [newLegalHold, setNewLegalHold] = useState({
    hold_name: '',
    hold_reason: '',
    data_scope: '',
    custodian_name: '',
    start_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [policiesRes, holdsRes] = await Promise.all([
        dataGovernanceAPI.getPolicies(),
        dataGovernanceAPI.getLegalHolds()
      ]);

      setPolicies(policiesRes.data?.data || []);
      setLegalHolds(holdsRes.data?.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data governance information');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dataGovernanceAPI.createPolicy(newPolicy);
      setShowPolicyModal(false);
      setNewPolicy({
        policy_name: '',
        data_category: '',
        retention_period_days: 365,
        auto_delete_enabled: false,
        legal_basis: ''
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create policy', 'error');
    }
  };

  const handleCreateLegalHold = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dataGovernanceAPI.createLegalHold(newLegalHold);
      setShowLegalHoldModal(false);
      setNewLegalHold({
        hold_name: '',
        hold_reason: '',
        data_scope: '',
        custodian_name: '',
        start_date: new Date().toISOString().split('T')[0]
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to create legal hold', 'error');
    }
  };

  const handleReleaseLegalHold = async (holdId: string) => {
    if (!confirm('Are you sure you want to release this legal hold?')) return;
    try {
      await dataGovernanceAPI.releaseLegalHold(holdId);
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to release legal hold', 'error');
    }
  };

  const handleToggleAutoDelete = async (policyId: string, currentValue: boolean) => {
    try {
      await dataGovernanceAPI.updatePolicy(policyId, {
        auto_delete_enabled: !currentValue
      });
      await loadData();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update policy', 'error');
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Data Governance</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage data retention policies, legal holds, and data sovereignty
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            🔄 Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/tprm"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <span className="text-xl">🔗</span>
            <div>
              <div className="text-sm font-medium text-blue-800">Third-Party Risk</div>
              <div className="text-xs text-blue-600">DPA, BAA, and data processor agreements</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            <span className="text-xl">🛡️</span>
            <div>
              <div className="text-sm font-medium text-purple-800">AI Insights</div>
              <div className="text-xs text-purple-600">Data provenance and training data controls</div>
            </div>
          </Link>
          <Link href="/dashboard/regulatory-news"
            className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <span className="text-xl">📰</span>
            <div>
              <div className="text-sm font-medium text-green-800">Regulatory News</div>
              <div className="text-xs text-green-600">GDPR, CCPA, and data law updates</div>
            </div>
          </Link>
        </div>

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('retention')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'retention'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Retention &amp; Legal Holds
            </button>
            <button
              onClick={() => setActiveTab('sovereignty')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sovereignty'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Data Sovereignty
            </button>
          </nav>
        </div>

        {activeTab === 'sovereignty' && <DataSovereigntyPanel />}

        {activeTab === 'retention' && (
        <>
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading data governance information...</p>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Retention Policies</p>
                    <p className="text-2xl font-bold mt-1 text-purple-600">
                      {policies.length}
                    </p>
                  </div>
                  <div className="text-3xl">📋</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {policies.filter(p => p.auto_delete_enabled).length} with auto-delete
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Legal Holds</p>
                    <p className="text-2xl font-bold mt-1 text-yellow-600">
                      {legalHolds.filter(h => h.status === 'active').length}
                    </p>
                  </div>
                  <div className="text-3xl">⚖️</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {legalHolds.filter(h => h.status === 'released').length} released
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Compliance Status</p>
                    <p className="text-2xl font-bold mt-1 text-green-600">
                      ✓ Active
                    </p>
                  </div>
                  <div className="text-3xl">🛡️</div>
                </div>
                <p className="text-xs text-gray-500 mt-2">GDPR, HIPAA compliant</p>
              </div>
            </div>

            {/* Retention Policies Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Data Retention Policies</h3>
                <button
                  onClick={() => setShowPolicyModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  + Add Policy
                </button>
              </div>

              {policies.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No retention policies configured. Create one to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Policy Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Retention Period</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Legal Basis</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Auto-Delete</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {policies.map(policy => (
                        <tr key={policy.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {policy.policy_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {policy.data_category}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {policy.retention_period_days} days
                            <span className="text-xs text-gray-500 ml-1">
                              ({Math.floor(policy.retention_period_days / 365)} years)
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {policy.legal_basis || 'Not specified'}
                          </td>
                          <td className="px-4 py-3">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={policy.auto_delete_enabled}
                                onChange={() => handleToggleAutoDelete(policy.id, policy.auto_delete_enabled)}
                                className="rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">
                                {policy.auto_delete_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(policy.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Legal Holds Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Legal Holds</h3>
                <button
                  onClick={() => setShowLegalHoldModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  + Add Legal Hold
                </button>
              </div>

              {legalHolds.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No legal holds in place
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Hold Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data Scope</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Start Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {legalHolds.map(hold => (
                        <tr key={hold.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {hold.hold_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {hold.hold_reason}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {hold.data_scope}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(hold.start_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              hold.status === 'active' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {hold.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {hold.status === 'active' && (
                              <button
                                onClick={() => handleReleaseLegalHold(hold.id)}
                                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                Release Hold
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        </>
        )}

        {/* Policy Modal */}
        {showPolicyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create Retention Policy</h3>
              <form onSubmit={handleCreatePolicy} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Policy Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPolicy.policy_name}
                    onChange={(e) => setNewPolicy({ ...newPolicy, policy_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPolicy.data_category}
                    onChange={(e) => setNewPolicy({ ...newPolicy, data_category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., User Data, Audit Logs, Backups"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retention Period (days) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newPolicy.retention_period_days}
                    onChange={(e) => setNewPolicy({ ...newPolicy, retention_period_days: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Legal Basis
                  </label>
                  <input
                    type="text"
                    value={newPolicy.legal_basis}
                    onChange={(e) => setNewPolicy({ ...newPolicy, legal_basis: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., GDPR Art. 6(1)(b), HIPAA 164.316"
                  />
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newPolicy.auto_delete_enabled}
                      onChange={(e) => setNewPolicy({ ...newPolicy, auto_delete_enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable auto-delete</span>
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Create Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPolicyModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Legal Hold Modal */}
        {showLegalHoldModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create Legal Hold</h3>
              <form onSubmit={handleCreateLegalHold} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hold Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLegalHold.hold_name}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, hold_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason *
                  </label>
                  <textarea
                    required
                    value={newLegalHold.hold_reason}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, hold_reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Scope *
                  </label>
                  <input
                    type="text"
                    required
                    value={newLegalHold.data_scope}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, data_scope: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., All user communications 2024-present"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custodian Name
                  </label>
                  <input
                    type="text"
                    value={newLegalHold.custodian_name}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, custodian_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newLegalHold.start_date}
                    onChange={(e) => setNewLegalHold({ ...newLegalHold, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    Create Hold
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLegalHoldModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
