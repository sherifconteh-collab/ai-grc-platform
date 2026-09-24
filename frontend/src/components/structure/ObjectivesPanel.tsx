'use client';

/**
 * Business objectives, in COSO's four categories.
 *
 * The column that justifies the page is the linked-risk roll-up: an objective
 * with three critical risks against it is the one the board should hear about,
 * and that relationship is invisible from either register on its own.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  objectivesAPI, departmentsAPI, usersAPI,
  type ObjectiveCategory,
} from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  PageHeader, SeverityChip, Pill, EmptyState, LoadingRow,
  ErrorBanner, SuccessBanner, Pagination, humanize, formatDate,
} from '@/components/registers/RegisterUI';

interface ObjectiveRow {
  id: string;
  reference: string | null;
  title: string;
  description: string | null;
  category: ObjectiveCategory;
  status: string;
  target_date: string | null;
  department_name: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  linked_risk_count: number;
  max_residual_score: number | null;
  max_risk_severity: string | null;
}

interface DepartmentOption { id: string; name: string }
interface UserOption { id: string; email: string; full_name: string }

interface ObjectiveFormState {
  title: string;
  description: string;
  category: ObjectiveCategory;
  ownerUserId: string;
  departmentId: string;
  targetDate: string;
}

const EMPTY_FORM: ObjectiveFormState = {
  title: '', description: '', category: 'strategic',
  ownerUserId: '', departmentId: '', targetDate: '',
};

const CATEGORIES: ObjectiveCategory[] = ['strategic', 'operational', 'reporting', 'compliance'];
const STATUSES = ['draft', 'active', 'achieved', 'missed', 'cancelled'];
const PAGE_LIMIT = 25;

export default function ObjectivesPanel() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'objectives.write');

  const [objectives, setObjectives] = useState<ObjectiveRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ObjectiveFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadObjectives = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await objectivesAPI.list({
        page,
        limit: PAGE_LIMIT,
        ...(categoryFilter ? { category: categoryFilter as ObjectiveCategory } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setObjectives(Array.isArray(response.data?.data) ? response.data.data : []);
      setTotal(Number(response.data?.pagination?.total) || 0);
    } catch {
      setError('Failed to load business objectives.');
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, statusFilter]);

  useEffect(() => { loadObjectives(); }, [loadObjectives]);

  useEffect(() => {
    (async () => {
      try {
        const [deptRes, userRes] = await Promise.all([
          departmentsAPI.list({ limit: 200 }),
          usersAPI.getOrgUsers(),
        ]);
        setDepartments(Array.isArray(deptRes.data?.data) ? deptRes.data.data : []);
        setOwners(Array.isArray(userRes.data?.data) ? userRes.data.data : []);
      } catch {
        setDepartments([]);
        setOwners([]);
      }
    })();
  }, []);

  const submitObjective = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    setSubmitting(true);
    try {
      await objectivesAPI.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        ownerUserId: form.ownerUserId || undefined,
        departmentId: form.departmentId || undefined,
        targetDate: form.targetDate || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Objective recorded.');
      await loadObjectives();
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(detail || 'Failed to create the objective.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Business objectives"
        description="What the organization is trying to achieve, in COSO's four categories. ISO 31000 defines risk as the effect of uncertainty on objectives — these are what the risk register is a register about."
        action={canWrite ? (
          <button
            type="button"
            onClick={() => { setShowForm((open) => !open); setFormError(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add objective'}
          </button>
        ) : undefined}
      />

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Category</span>
            <select value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Status</span>
            <select value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {showForm && canWrite ? (
        <form onSubmit={submitObjective} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">New objective</h2>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Title *</span>
              <input value={form.title} required
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Description</span>
              <textarea value={form.description} rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Category</span>
              <select value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ObjectiveCategory })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                {CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Target date</span>
              <input type="date" value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Owner</span>
              <select value={form.ownerUserId}
                onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.full_name || o.email}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Department</span>
              <select value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Add objective'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <LoadingRow label="Loading objectives…" />
        ) : objectives.length === 0 ? (
          <EmptyState
            message="No objectives recorded yet."
            hint="Risks are the effect of uncertainty on objectives — recording these makes the register mean something."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Objective</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risks against it</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {objectives.map((objective) => (
                  <tr key={objective.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 whitespace-nowrap">
                      {objective.reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{objective.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {objective.owner_first_name
                          ? `${objective.owner_first_name} ${objective.owner_last_name || ''}`.trim()
                          : 'Unowned'}
                        {objective.department_name ? ` · ${objective.department_name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone="info">{humanize(objective.category)}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={
                        objective.status === 'achieved' ? 'ok'
                          : objective.status === 'missed' ? 'danger' : 'neutral'
                      }>
                        {humanize(objective.status)}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      {Number(objective.linked_risk_count) > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800">{objective.linked_risk_count}</span>
                          <SeverityChip
                            score={objective.max_residual_score}
                            label="Highest linked residual risk"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">None linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {formatDate(objective.target_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} limit={PAGE_LIMIT} total={total} onChange={setPage} />
      </div>
    </>
  );
}
