// @tier: community
'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { accessGovernanceAPI, rolesAPI } from '@/lib/api';
import { hasPermission } from '@/lib/access';
import ImportAiTab from '@/components/accessGovernance/ImportAiTab';

type TabKey = 'entitlements' | 'sod' | 'campaigns' | 'simulator' | 'import';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type CampaignStatus = 'draft' | 'active' | 'completed' | 'cancelled';
type Decision = 'pending' | 'certified' | 'revoked';

interface EntitlementUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  primary_role: string;
  is_active: boolean;
  roles: string[];
  permissions: string[];
}

interface EntitlementReport {
  users: EntitlementUser[];
  permission_holder_counts: Record<string, number>;
  // flags and totals describe the whole organization, not just the current page
  flags: { wildcard_users: string[]; inactive_users_with_roles: string[] };
  totals: { users: number; active_users: number };
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

interface SodRule {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  conflicting_permissions: string[];
  severity: Severity;
  is_active: boolean;
  is_system_rule?: boolean;
}

interface SodViolation {
  user_id: string;
  email: string;
  rule_id: string;
  rule_name: string;
  severity: Severity;
  conflicting_permissions: string[];
}

interface SodViolationReport {
  violations: SodViolation[];
  wildcard_users: { user_id: string; email: string }[];
  rules_evaluated: number;
}

interface SimulationEntry {
  permission: string;
  resource: string;
  action: string;
  description: string | null;
  allowed: boolean;
}

interface SimulationResult {
  proposed_permissions: string[];
  results: SimulationEntry[];
  allowed_count: number;
  denied_count: number;
  sod_violations: SodRule[];
  wildcard: boolean;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  due_date: string | null;
  completed_at: string | null;
  evidence_id: string | null;
  created_at: string;
  item_count?: number;
  pending_count?: number;
}

interface CampaignItemSnapshot {
  roles?: string[];
  permissions?: string[];
  sod_violations?: string[];
  wildcard?: boolean;
}

interface CampaignItem {
  id: string;
  subject_user_id: string;
  subject_email: string;
  subject_first_name: string | null;
  subject_last_name: string | null;
  reviewer_email: string | null;
  entitlement_snapshot: CampaignItemSnapshot;
  decision: Decision;
  decided_at: string | null;
  notes: string | null;
}

interface CampaignDetail extends Campaign {
  items: CampaignItem[];
}

interface RoleOption {
  id: string;
  name: string;
  is_system_role: boolean;
}

const SEVERITY_BADGE: Record<Severity, string> = {
  low: 'bg-gray-200 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: 'bg-gray-200 text-gray-700',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const DECISION_BADGE: Record<Decision, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  certified: 'bg-green-100 text-green-800',
  revoked: 'bg-red-100 text-red-800',
};

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 ${
        active ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

function EntitlementsTab() {
  const [report, setReport] = useState<EntitlementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    accessGovernanceAPI.getEntitlements({ page })
      .then((response) => {
        if (!cancelled) setReport(response.data?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load entitlement report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  if (loading) return <p className="text-gray-500 py-8">Loading entitlement report...</p>;
  if (error) return <p className="text-red-600 py-8">{error}</p>;
  if (!report) return null;

  const wildcardSet = new Set(report.flags.wildcard_users);
  const inactiveSet = new Set(report.flags.inactive_users_with_roles);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Users</p>
          <p className="text-2xl font-semibold">{report.totals.users}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Active users</p>
          <p className="text-2xl font-semibold">{report.totals.active_users}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Full-access accounts</p>
          <p className="text-2xl font-semibold text-orange-600">{report.flags.wildcard_users.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Inactive with roles</p>
          <p className="text-2xl font-semibold text-red-600">{report.flags.inactive_users_with_roles.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Primary role</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.users.map((user) => (
              <tr key={user.id} className={user.is_active ? '' : 'bg-gray-50 text-gray-400'}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{user.email}</p>
                  <p className="text-xs text-gray-500">{[user.first_name, user.last_name].filter(Boolean).join(' ')}</p>
                </td>
                <td className="px-4 py-3">{user.primary_role}</td>
                <td className="px-4 py-3">{user.roles.join(', ') || '—'}</td>
                <td className="px-4 py-3">
                  {user.permissions.includes('*')
                    ? <span className="text-orange-600 font-medium">All permissions (*)</span>
                    : `${user.permissions.length} permission(s)`}
                </td>
                <td className="px-4 py-3 space-x-1">
                  {wildcardSet.has(user.id) && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">over-privileged</span>
                  )}
                  {inactiveSet.has(user.id) && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">inactive, roles retained</span>
                  )}
                  {!user.is_active && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-700">inactive</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.pagination.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Showing {report.users.length} of {report.pagination.total} users
            {' '}(page {report.pagination.page} of {report.pagination.total_pages})
          </p>
          <div className="space-x-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={report.pagination.page <= 1}
              className="px-3 py-1 border rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((current) => current + 1)}
              disabled={report.pagination.page >= report.pagination.total_pages}
              className="px-3 py-1 border rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SodTab({ canManage }: { canManage: boolean }) {
  const [rules, setRules] = useState<SodRule[]>([]);
  const [violations, setViolations] = useState<SodViolationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [rulesResponse, violationsResponse] = await Promise.all([
        accessGovernanceAPI.getSodRules(),
        accessGovernanceAPI.getSodViolations(),
      ]);
      setRules(Array.isArray(rulesResponse.data?.data) ? rulesResponse.data.data : []);
      setViolations(violationsResponse.data?.data ?? null);
    } catch {
      setError('Failed to load separation-of-duties data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRule = async (rule: SodRule) => {
    try {
      setBusyRuleId(rule.id);
      await accessGovernanceAPI.updateSodRule(rule.id, { isActive: !rule.is_active });
      await load();
    } catch (toggleError) {
      setError(apiErrorMessage(toggleError, 'Failed to update rule.'));
    } finally {
      setBusyRuleId(null);
    }
  };

  if (loading) return <p className="text-gray-500 py-8">Loading SoD rules and violations...</p>;
  if (error) return <p className="text-red-600 py-8">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-900 mb-3">
          Current violations ({violations?.violations.length ?? 0})
        </h3>
        {violations && violations.violations.length === 0 && (
          <p className="text-sm text-green-700">
            No separation-of-duties violations across {violations.rules_evaluated} active rule(s).
          </p>
        )}
        {violations && violations.violations.length > 0 && (
          <ul role="list" className="divide-y divide-gray-100">
            {violations.violations.map((violation) => (
              <li role="listitem" key={`${violation.user_id}-${violation.rule_id}`} className="py-2 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{violation.email}</p>
                  <p className="text-xs text-gray-500">
                    {violation.rule_name} — holds {violation.conflicting_permissions.join(' + ')}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_BADGE[violation.severity]}`}>
                  {violation.severity}
                </span>
              </li>
            ))}
          </ul>
        )}
        {violations && violations.wildcard_users.length > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            {violations.wildcard_users.length} full-access account(s) excluded from per-rule matching
            (flagged as over-privileged on the Entitlements tab):{' '}
            {violations.wildcard_users.map((entry) => entry.email).join(', ')}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Rule</th>
              <th className="px-4 py-3">Conflicting permissions</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{rule.name}</p>
                  {rule.description && <p className="text-xs text-gray-500">{rule.description}</p>}
                </td>
                <td className="px-4 py-3 text-xs">{rule.conflicting_permissions.join(' + ')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_BADGE[rule.severity]}`}>{rule.severity}</span>
                </td>
                <td className="px-4 py-3 text-xs">{rule.organization_id ? 'organization' : 'system'}</td>
                <td className="px-4 py-3 text-xs">{rule.is_active ? 'active' : 'disabled'}</td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    {rule.organization_id && (
                      <button
                        onClick={() => toggleRule(rule)}
                        disabled={busyRuleId === rule.id}
                        className="text-xs text-blue-600 hover:underline disabled:text-gray-400"
                      >
                        {rule.is_active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignsTab({ canManage }: { canManage: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await accessGovernanceAPI.getCampaigns();
      setCampaigns(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setError('Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const openCampaign = async (campaignId: string) => {
    try {
      setActionError('');
      const response = await accessGovernanceAPI.getCampaign(campaignId);
      setSelected(response.data?.data ?? null);
    } catch {
      setActionError('Failed to load campaign detail.');
    }
  };

  const runAction = async (action: () => Promise<unknown>, refreshDetailId?: string) => {
    try {
      setBusy(true);
      setActionError('');
      await action();
      await loadCampaigns();
      if (refreshDetailId) await openCampaign(refreshDetailId);
    } catch (runError) {
      setActionError(apiErrorMessage(runError, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };

  const createCampaign = () => runAction(async () => {
    await accessGovernanceAPI.createCampaign({
      name: formName,
      description: formDescription || undefined,
      dueDate: formDueDate || undefined,
    });
    setShowForm(false);
    setFormName('');
    setFormDescription('');
    setFormDueDate('');
  });

  if (loading) return <p className="text-gray-500 py-8">Loading campaigns...</p>;
  if (error) return <p className="text-red-600 py-8">{error}</p>;

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((value) => !value)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            {showForm ? 'Close' : 'New campaign'}
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <div>
            <label htmlFor="campaign-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input
              id="campaign-name"
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Q3 user access review"
            />
          </div>
          <div>
            <label htmlFor="campaign-description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              id="campaign-description"
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label htmlFor="campaign-due" className="block text-sm font-medium text-gray-700">Due date</label>
            <input
              id="campaign-due"
              type="date"
              value={formDueDate}
              onChange={(event) => setFormDueDate(event.target.value)}
              className="mt-1 border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={createCampaign}
            disabled={busy || !formName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300"
          >
            Create draft (snapshots all active users)
          </button>
        </div>
      )}

      {actionError && <p className="text-red-600 text-sm">{actionError}</p>}

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.length === 0 && (
              <tr><td className="px-4 py-6 text-gray-500" colSpan={5}>No campaigns yet.</td></tr>
            )}
            {campaigns.map((campaign) => {
              const total = campaign.item_count ?? 0;
              const pending = campaign.pending_count ?? 0;
              return (
                <tr key={campaign.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{campaign.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[campaign.status]}`}>{campaign.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{total - pending}/{total} decided</td>
                  <td className="px-4 py-3 text-xs">{campaign.due_date ? campaign.due_date.slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openCampaign(campaign.id)} className="text-xs text-blue-600 hover:underline">
                      {selected?.id === campaign.id ? 'Refresh' : 'Open'}
                    </button>
                    {canManage && campaign.status === 'draft' && (
                      <button
                        onClick={() => runAction(() => accessGovernanceAPI.activateCampaign(campaign.id), campaign.id)}
                        disabled={busy}
                        className="text-xs text-green-700 hover:underline disabled:text-gray-400"
                      >
                        Activate
                      </button>
                    )}
                    {canManage && campaign.status === 'active' && pending === 0 && total > 0 && (
                      <button
                        onClick={() => runAction(() => accessGovernanceAPI.completeCampaign(campaign.id), campaign.id)}
                        disabled={busy}
                        className="text-xs text-green-700 hover:underline disabled:text-gray-400"
                      >
                        Complete
                      </button>
                    )}
                    {canManage && (campaign.status === 'draft' || campaign.status === 'active') && (
                      <button
                        onClick={() => runAction(() => accessGovernanceAPI.cancelCampaign(campaign.id), campaign.id)}
                        disabled={busy}
                        className="text-xs text-red-600 hover:underline disabled:text-gray-400"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">{selected.name} — review items</h3>
            {selected.evidence_id && (
              <span className="text-xs text-green-700">Evidence record generated on completion</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Snapshot</th>
                  <th className="px-4 py-2">Decision</th>
                  <th className="px-4 py-2">Reviewer</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selected.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-900">{item.subject_email}</p>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {(item.entitlement_snapshot.roles ?? []).join(', ') || '—'}
                      {item.entitlement_snapshot.wildcard && (
                        <span className="ml-1 text-orange-600">(full access)</span>
                      )}
                      {(item.entitlement_snapshot.sod_violations ?? []).length > 0 && (
                        <p className="text-red-600">
                          SoD: {(item.entitlement_snapshot.sod_violations ?? []).join('; ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${DECISION_BADGE[item.decision]}`}>{item.decision}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">{item.reviewer_email ?? '—'}</td>
                    {canManage && (
                      <td className="px-4 py-2 text-right space-x-2">
                        {selected.status === 'active' && (
                          <>
                            <button
                              onClick={() => runAction(
                                () => accessGovernanceAPI.decideItem(selected.id, item.id, { decision: 'certified' }),
                                selected.id
                              )}
                              disabled={busy}
                              className="text-xs text-green-700 hover:underline disabled:text-gray-400"
                            >
                              Certify
                            </button>
                            <button
                              onClick={() => runAction(
                                () => accessGovernanceAPI.decideItem(selected.id, item.id, { decision: 'revoked' }),
                                selected.id
                              )}
                              disabled={busy}
                              className="text-xs text-red-600 hover:underline disabled:text-gray-400"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Revoke decisions are recorded for the certification record; actual role removal is a separate
            step in Settings → Roles so the change passes the standard assignment safeguards.
          </p>
        </div>
      )}
    </div>
  );
}

function SimulatorTab() {
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [manualPermissions, setManualPermissions] = useState('');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Role list requires roles.manage; degrade to manual permission entry if unavailable.
    rolesAPI.getAll()
      .then((response) => {
        if (!cancelled) setRoleOptions(Array.isArray(response.data?.data) ? response.data.data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((current) => (
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    ));
  };

  const runSimulation = async () => {
    const permissions = manualPermissions
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    try {
      setRunning(true);
      setError('');
      const response = await accessGovernanceAPI.simulate({
        roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
        permissions: permissions.length > 0 ? permissions : undefined,
      });
      setResult(response.data?.data ?? null);
    } catch (simulateError) {
      setError(apiErrorMessage(simulateError, 'Simulation failed.'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <p className="text-sm text-gray-600">
          Test what a role or permission set can and cannot do before assigning it. The result is a
          positive/negative access matrix over every permission in the catalog, plus any
          separation-of-duties rules the combination would violate.
        </p>
        {roleOptions.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Roles</p>
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((role) => (
                <label key={role.id} htmlFor={`sim-role-${role.id}`} className="flex items-center gap-1 text-sm border rounded-md px-2 py-1">
                  <input
                    id={`sim-role-${role.id}`}
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  {role.name}{role.is_system_role ? ' (system)' : ''}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <label htmlFor="sim-permissions" className="block text-sm font-medium text-gray-700">
            Additional permission names (comma or space separated)
          </label>
          <input
            id="sim-permissions"
            value={manualPermissions}
            onChange={(event) => setManualPermissions(event.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="controls.write, evidence.read"
          />
        </div>
        <button
          onClick={runSimulation}
          disabled={running || (selectedRoleIds.length === 0 && manualPermissions.trim().length === 0)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300"
        >
          {running ? 'Running...' : 'Run simulation'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      {result && (
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-green-700 font-medium">{result.allowed_count} allowed</span>
            <span className="text-red-600 font-medium">{result.denied_count} denied</span>
            {result.wildcard && <span className="text-orange-600 font-medium">Wildcard access (*)</span>}
          </div>
          {result.sod_violations.length > 0 && (
            <div className="border border-red-200 bg-red-50 rounded-md p-3">
              <p className="text-sm font-medium text-red-700">This combination violates SoD rules:</p>
              <ul role="list" className="text-xs text-red-700 mt-1 space-y-1">
                {result.sod_violations.map((rule) => (
                  <li role="listitem" key={rule.id}>
                    {rule.name} ({rule.severity}): {rule.conflicting_permissions.join(' + ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2">Permission</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.results.map((entry) => (
                  <tr key={entry.permission}>
                    <td className="px-4 py-2 font-mono text-xs">{entry.permission}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{entry.description ?? ''}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        entry.allowed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                      >
                        {entry.allowed ? 'ALLOWED' : 'DENIED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccessGovernancePage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, 'access_governance.read');
  const canManage = hasPermission(user, 'access_governance.manage');
  const [tab, setTab] = useState<TabKey>('entitlements');

  if (!canRead) {
    return (
      <DashboardLayout>
        <p className="text-gray-500 py-8">You do not have permission to view access governance.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Access Governance</h1>
          <p className="text-sm text-gray-500 mt-1">
            Entitlement reporting, separation-of-duties analysis, access certification campaigns,
            role capability simulation, and AI-assisted RBAC document import (AC-2, AC-5, AC-6).
          </p>
        </div>

        <div className="border-b border-gray-200 flex gap-2">
          <TabButton label="Entitlements" active={tab === 'entitlements'} onClick={() => setTab('entitlements')} />
          <TabButton label="Separation of Duties" active={tab === 'sod'} onClick={() => setTab('sod')} />
          <TabButton label="Access Reviews" active={tab === 'campaigns'} onClick={() => setTab('campaigns')} />
          <TabButton label="Simulator" active={tab === 'simulator'} onClick={() => setTab('simulator')} />
          <TabButton label="Import & AI" active={tab === 'import'} onClick={() => setTab('import')} />
        </div>

        {tab === 'entitlements' && <EntitlementsTab />}
        {tab === 'sod' && <SodTab canManage={canManage} />}
        {tab === 'campaigns' && <CampaignsTab canManage={canManage} />}
        {tab === 'simulator' && <SimulatorTab />}
        {tab === 'import' && <ImportAiTab canManage={canManage} />}
      </div>
    </DashboardLayout>
  );
}
