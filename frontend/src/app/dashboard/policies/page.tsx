'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import { organizationAPI, policiesAPI, PolicyStatus } from '@/lib/api';
import PolicyDocumentsTab from '@/components/policies/PolicyDocumentsTab';
import {
  errorMessage,
  formatDate,
  FrameworkOption,
  inputClass,
  isOverdue,
  Modal,
  Policy,
  POLICY_TYPES,
  PolicyStatusBadge,
  policyTypeLabel,
  primaryButton,
  secondaryButton,
  STATUS_META,
} from '@/components/policies/policyShared';

type Tab = 'policies' | 'documents';
type Dialog = 'none' | 'create' | 'generate';

interface NewPolicyForm {
  policy_name: string;
  policy_type: string;
  description: string;
  effective_date: string;
  review_frequency_days: number;
}

const EMPTY_FORM: NewPolicyForm = {
  policy_name: '',
  policy_type: 'security_policy',
  description: '',
  effective_date: '',
  review_frequency_days: 365,
};

function PoliciesPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const canWrite = hasPermission(user, 'controls.write');
  const [tab, setTab] = useState<Tab>('policies');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<PolicyStatus | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog>('none');
  // ?new=1 opens the New policy dialog ("+ New").
  const searchParams = useSearchParams();
  const wantsNew = searchParams.get('new') === '1';
  const newHandled = useRef(false);
  useEffect(() => {
    if (!wantsNew || !canWrite || newHandled.current) return;
    newHandled.current = true;
    setDialog('create');
  }, [wantsNew, canWrite]);
  const [form, setForm] = useState<NewPolicyForm>(EMPTY_FORM);
  const [generateFrameworks, setGenerateFrameworks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await policiesAPI.list({ status: statusFilter || undefined, limit: 500 });
      setPolicies((res.data?.data?.policies || []) as Policy[]);
      setError('');
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load policies'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.organizationId) return;
    organizationAPI.getFrameworks(user.organizationId)
      .then((res) => {
        const list = (res.data?.data || []) as FrameworkOption[];
        setFrameworks(list);
        setGenerateFrameworks(list.map((f) => f.id));
      })
      .catch(() => { /* framework list only feeds the generate and gap-analysis pickers */ });
  }, [user?.organizationId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return policies;
    return policies.filter((p) => `${p.policy_name} ${p.policy_type} ${p.description || ''}`.toLowerCase().includes(term));
  }, [policies, search]);

  const stats = useMemo(() => ({
    total: policies.length,
    published: policies.filter((p) => p.status === 'published').length,
    inReview: policies.filter((p) => p.status === 'under_review' || p.status === 'approved').length,
    overdue: policies.filter((p) => p.status !== 'archived' && isOverdue(p.next_review_date)).length,
  }), [policies]);

  const closeDialog = () => { setDialog('none'); setForm(EMPTY_FORM); };

  const createPolicy = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await policiesAPI.create({
        policy_name: form.policy_name.trim(),
        policy_type: form.policy_type,
        description: form.description.trim() || undefined,
        effective_date: form.effective_date || undefined,
        review_frequency_days: form.review_frequency_days,
      });
      closeDialog();
      router.push(`/dashboard/policies/${(res.data?.data as Policy).id}`);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not create the policy'));
    } finally {
      setSaving(false);
    }
  };

  const generatePolicy = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await policiesAPI.generate({
        policy_name: form.policy_name.trim(),
        policy_type: form.policy_type,
        framework_ids: generateFrameworks,
      });
      const created = (res.data?.data?.policy || res.data?.data) as Policy;
      closeDialog();
      router.push(`/dashboard/policies/${created.id}`);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not generate the policy'));
    } finally {
      setSaving(false);
    }
  };

  const nameValid = form.policy_name.trim().length >= 3;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">
              Write, approve and publish your security and compliance policies, map each section to framework
              controls, schedule reviews, and track which employees have acknowledged the current version.
            </p>
          </div>
          {canWrite && tab === 'policies' && (
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} onClick={() => setDialog('generate')}>Generate from frameworks</button>
              <button type="button" className={primaryButton} onClick={() => setDialog('create')}>New policy</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Policies', value: stats.total },
            { label: 'Published', value: stats.published },
            { label: 'Awaiting approval or publication', value: stats.inReview },
            { label: 'Review overdue', value: stats.overdue, alert: stats.overdue > 0 },
          ].map((card) => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className={`text-2xl font-bold ${card.alert ? 'text-red-600' : 'text-gray-900'}`}>{card.value}</div>
              <div className="text-xs text-gray-600">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="border-b border-gray-200 mb-4 flex gap-4" role="tablist">
          {(['policies', 'documents'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium border-b-2 ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              {t === 'policies' ? 'Policies' : 'Uploaded documents and gap analysis'}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">{error}</div>}

        {tab === 'documents' ? (
          <PolicyDocumentsTab frameworks={frameworks} canWrite={canWrite} />
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                type="search"
                className={`${inputClass} max-w-xs`}
                placeholder="Search policies"
                aria-label="Search policies"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className={`${inputClass} max-w-[200px]`}
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PolicyStatus | '')}
              >
                <option value="">All statuses</option>
                {(Object.keys(STATUS_META) as PolicyStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-2">Policy</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Version</th>
                    <th className="px-4 py-2">Sections</th>
                    <th className="px-4 py-2">Mapped controls</th>
                    <th className="px-4 py-2">Next review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        {policies.length === 0
                          ? 'No policies yet. Create one, or generate a draft from the frameworks you have selected.'
                          : 'No policies match your filters.'}
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/policies/${p.id}`} className="font-medium text-blue-700 hover:underline">{p.policy_name}</Link>
                        <div className="text-xs text-gray-500">{policyTypeLabel(p.policy_type)}</div>
                      </td>
                      <td className="px-4 py-2"><PolicyStatusBadge status={p.status} /></td>
                      <td className="px-4 py-2 text-gray-700">{p.version}</td>
                      <td className="px-4 py-2 text-gray-700">{p.section_count ?? 0}</td>
                      <td className="px-4 py-2 text-gray-700">{p.mapped_controls_count ?? 0}</td>
                      <td className={`px-4 py-2 ${p.status !== 'archived' && isOverdue(p.next_review_date) ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                        {formatDate(p.next_review_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {dialog !== 'none' && (
          <Modal title={dialog === 'create' ? 'New policy' : 'Generate a policy from your frameworks'} onClose={closeDialog}>
            <div className="space-y-4">
              {dialog === 'generate' && (
                <p className="text-sm text-gray-600">
                  Creates a draft with one section per control family, mapped to the controls in the frameworks you pick.
                  Edit the wording before submitting it for approval.
                </p>
              )}
              <div>
                <label htmlFor="policy-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input id="policy-name" className={inputClass} value={form.policy_name} onChange={(e) => setForm({ ...form, policy_name: e.target.value })} placeholder="Information Security Policy" />
              </div>
              <div>
                <label htmlFor="policy-type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select id="policy-type" className={inputClass} value={form.policy_type} onChange={(e) => setForm({ ...form, policy_type: e.target.value })}>
                  {POLICY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {dialog === 'create' ? (
                <>
                  <div>
                    <label htmlFor="policy-description" className="block text-sm font-medium text-gray-700 mb-1">Purpose and scope</label>
                    <textarea id="policy-description" rows={3} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="policy-effective" className="block text-sm font-medium text-gray-700 mb-1">Effective date</label>
                      <input id="policy-effective" type="date" className={inputClass} value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="policy-frequency" className="block text-sm font-medium text-gray-700 mb-1">Review every (days)</label>
                      <input id="policy-frequency" type="number" min={30} max={1095} className={inputClass} value={form.review_frequency_days} onChange={(e) => setForm({ ...form, review_frequency_days: Number(e.target.value) || 365 })} />
                    </div>
                  </div>
                </>
              ) : (
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700 mb-1">Frameworks</legend>
                  {frameworks.length === 0 && <p className="text-sm text-gray-500">Select frameworks for your organization first.</p>}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {frameworks.map((f) => (
                      <label key={f.id} htmlFor={`gen-fw-${f.id}`} className="flex items-center gap-2 text-sm">
                        <input
                          id={`gen-fw-${f.id}`}
                          type="checkbox"
                          checked={generateFrameworks.includes(f.id)}
                          onChange={() => setGenerateFrameworks((prev) => (prev.includes(f.id) ? prev.filter((x) => x !== f.id) : [...prev, f.id]))}
                        />
                        {f.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={secondaryButton} onClick={closeDialog}>Cancel</button>
                <button
                  type="button"
                  className={primaryButton}
                  disabled={saving || !nameValid || (dialog === 'generate' && generateFrameworks.length === 0)}
                  onClick={dialog === 'create' ? createPolicy : generatePolicy}
                >
                  {saving ? 'Saving…' : dialog === 'create' ? 'Create draft' : 'Generate draft'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function PoliciesPage() {
  return (
    <Suspense fallback={null}>
      <PoliciesPageInner />
    </Suspense>
  );
}
