'use client';

/**
 * Departments — the organizational structure risks, incidents, obligations and
 * objectives are owned by.
 *
 * Rendered as a hierarchy rather than a flat list, because the question people
 * bring to this page is "which part of the business carries the most
 * unmitigated risk", and that only reads properly with the structure visible.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { departmentsAPI, usersAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  PageHeader, Pill, EmptyState, LoadingRow,
  ErrorBanner, SuccessBanner,
} from '@/components/registers/RegisterUI';

interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_id: string | null;
  parent_name: string | null;
  head_first_name: string | null;
  head_last_name: string | null;
  cost_center: string | null;
  is_active: boolean;
  child_count: number;
  open_risk_count: number;
  open_incident_count: number;
}

interface UserOption { id: string; email: string; full_name: string }

interface DepartmentFormState {
  name: string;
  code: string;
  description: string;
  parentId: string;
  headUserId: string;
  costCenter: string;
}

const EMPTY_FORM: DepartmentFormState = {
  name: '', code: '', description: '', parentId: '', headUserId: '', costCenter: '',
};

interface TreeNode extends DepartmentRow {
  depth: number;
}

/**
 * Flattens the hierarchy into render order with a depth for indentation.
 * Departments whose parent is not in the loaded set (deactivated, or beyond
 * the page) are surfaced at the root rather than dropped — a hidden department
 * is worse than a mis-indented one.
 */
function toTree(rows: DepartmentRow[]): TreeNode[] {
  const byParent = new Map<string | null, DepartmentRow[]>();
  const ids = new Set(rows.map((row) => row.id));

  rows.forEach((row) => {
    const parent = row.parent_id && ids.has(row.parent_id) ? row.parent_id : null;
    const siblings = byParent.get(parent) || [];
    siblings.push(row);
    byParent.set(parent, siblings);
  });

  const output: TreeNode[] = [];
  const walk = (parent: string | null, depth: number) => {
    const children = byParent.get(parent) || [];
    children.forEach((child) => {
      output.push({ ...child, depth });
      // Depth is capped for indentation purposes only; the data is unbounded.
      walk(child.id, Math.min(depth + 1, 6));
    });
  };
  walk(null, 0);
  return output;
}

export default function DepartmentsPanel() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'departments.write');

  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [owners, setOwners] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DepartmentFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await departmentsAPI.list({ limit: 200, includeInactive });
      setDepartments(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setError('Failed to load departments.');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => { loadDepartments(); }, [loadDepartments]);

  useEffect(() => {
    (async () => {
      try {
        const response = await usersAPI.getOrgUsers();
        setOwners(Array.isArray(response.data?.data) ? response.data.data : []);
      } catch {
        setOwners([]);
      }
    })();
  }, []);

  const tree = useMemo(() => toTree(departments), [departments]);

  const submitDepartment = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await departmentsAPI.create({
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        parentId: form.parentId || undefined,
        headUserId: form.headUserId || undefined,
        costCenter: form.costCenter.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setMessage('Department created.');
      await loadDepartments();
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(detail || 'Failed to create the department.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeDepartment = async (department: DepartmentRow) => {
    setError('');
    try {
      const response = await departmentsAPI.remove(department.id);
      setMessage(response.data?.message || 'Department removed.');
      await loadDepartments();
    } catch {
      setError('Failed to remove the department.');
    }
  };

  return (
    <>
      <PageHeader
        title="Departments"
        description="The business units that own risks, incidents, obligations and objectives. Deleting a department that still owns records deactivates it instead, so historic records keep their owning unit."
        action={canWrite ? (
          <button
            type="button"
            onClick={() => { setShowForm((open) => !open); setFormError(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add department'}
          </button>
        ) : undefined}
      />

      <ErrorBanner message={error} />
      <SuccessBanner message={message} />

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)} />
          Show deactivated departments
        </label>
      </div>

      {showForm && canWrite ? (
        <form onSubmit={submitDepartment} className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">New department</h2>
          {formError ? <ErrorBanner message={formError} /> : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Name *</span>
              <input value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Code</span>
              <input value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="block text-gray-700 mb-1">Description</span>
              <textarea value={form.description} rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Reports to</span>
              <select value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">Top level</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Head</span>
              <select value={form.headUserId}
                onChange={(e) => setForm({ ...form, headUserId: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2">
                <option value="">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.full_name || o.email}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-700 mb-1">Cost center</span>
              <input value={form.costCenter}
                onChange={(e) => setForm({ ...form, costCenter: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2" />
            </label>
          </div>

          <div className="mt-4">
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Add department'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200">
        {loading ? (
          <LoadingRow label="Loading departments…" />
        ) : tree.length === 0 ? (
          <EmptyState
            message="No departments yet."
            hint={canWrite ? 'Add the business units that will own risks and incidents.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Head</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Open risks</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Open incidents</th>
                  {canWrite ? <th scope="col" className="px-4 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tree.map((department) => (
                  <tr key={department.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div style={{ paddingLeft: `${department.depth * 20}px` }}>
                        <p className="text-sm font-medium text-gray-900">
                          {department.name}
                          {department.code ? (
                            <span className="ml-2 text-xs text-gray-500 font-mono">{department.code}</span>
                          ) : null}
                          {!department.is_active ? (
                            <span className="ml-2"><Pill>Deactivated</Pill></span>
                          ) : null}
                        </p>
                        {department.description ? (
                          <p className="text-xs text-gray-500 mt-0.5">{department.description}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {department.head_first_name
                        ? `${department.head_first_name} ${department.head_last_name || ''}`.trim()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={department.open_risk_count > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                        {department.open_risk_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={department.open_incident_count > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                        {department.open_incident_count}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {department.is_active ? (
                          <button
                            type="button"
                            onClick={() => removeDepartment(department)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
