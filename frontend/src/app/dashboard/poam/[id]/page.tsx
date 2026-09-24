// @tier: community
'use client';

/**
 * Remediation item detail.
 *
 * Everything here is backed by endpoints that shipped long ago and had no
 * screen: status editing, progress updates, submit-for-review, the auditor
 * queue and decision, approval history, milestones. PR #664 documented them as
 * API-only rather than building them; this is the screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { poamAPI, usersAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import { StatusBadge, PriorityBadge, SlippageIndicator, POAM_STATUS_COLORS } from '@/components/poam/PoamStatusBadge';
import PoamMilestones from '@/components/poam/PoamMilestones';
import PoamReviewPanel from '@/components/poam/PoamReviewPanel';
import { remediationTerms } from '@/lib/poamTerminology';
import {
  PoamItem, PoamUpdate, PoamLinkedControl, PoamLinkedRisk, PoamApprovalRequest,
  POAM_STATUSES, POAM_PRIORITIES, errorMessage,
} from '@/lib/poamTypes';

interface OrgUser {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

export default function PoamDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { user } = useAuth();

  const [item, setItem] = useState<PoamItem | null>(null);
  const [updates, setUpdates] = useState<PoamUpdate[]>([]);
  const [controls, setControls] = useState<PoamLinkedControl[]>([]);
  const [risks, setRisks] = useState<PoamLinkedRisk[]>([]);
  const [approvals, setApprovals] = useState<PoamApprovalRequest[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', status: 'open', priority: 'medium',
    owner_id: '', due_date: '', resources_required: '', remediation_plan: '',
    closure_notes: '', risk_acceptance_expires_at: '',
  });

  const canWrite = hasPermission(user, 'controls.write');
  const canReview = hasPermission(user, 'audit.write');

  const terms = useMemo(
    () => remediationTerms({
      frameworkSpecificType: item?.framework_specific_type,
      frameworkCode: item?.framework_code,
    }),
    [item?.framework_specific_type, item?.framework_code]
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError('');
      const [detailRes, approvalRes] = await Promise.allSettled([
        poamAPI.getById(id),
        poamAPI.getApprovalHistory(id),
      ]);

      if (detailRes.status === 'rejected') {
        setError(errorMessage(detailRes.reason, 'Failed to load item'));
        return;
      }

      const data = detailRes.value.data?.data;
      const loaded: PoamItem = data?.item;
      setItem(loaded);
      setUpdates(data?.updates || []);
      setControls(data?.controls || []);
      setRisks(data?.risks || []);
      if (approvalRes.status === 'fulfilled') {
        setApprovals(approvalRes.value.data?.data || []);
      }

      if (loaded) {
        setForm({
          title: loaded.title || '',
          description: loaded.description || '',
          status: loaded.status || 'open',
          priority: loaded.priority || 'medium',
          owner_id: loaded.owner_id || '',
          due_date: loaded.due_date ? loaded.due_date.slice(0, 10) : '',
          resources_required: loaded.resources_required || '',
          remediation_plan: loaded.remediation_plan || '',
          closure_notes: loaded.closure_notes || '',
          risk_acceptance_expires_at: loaded.risk_acceptance_expires_at
            ? loaded.risk_acceptance_expires_at.slice(0, 10)
            : '',
        });
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load item'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    usersAPI.getOrgUsers()
      .then((res) => setOrgUsers(res.data?.data || []))
      .catch(() => setOrgUsers([]));
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      await poamAPI.update(id, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        owner_id: form.owner_id || undefined,
        due_date: form.due_date || undefined,
        resources_required: form.resources_required,
        remediation_plan: form.remediation_plan.trim() || undefined,
        closure_notes: form.closure_notes.trim() || undefined,
        risk_acceptance_expires_at: form.risk_acceptance_expires_at || undefined,
      });
      setEditing(false);
      setToast('Changes saved');
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to save changes'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    try {
      setSaving(true);
      setError('');
      await poamAPI.addUpdate(id, note.trim());
      setNote('');
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to add note'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    try {
      setSubmittingReview(true);
      setError('');
      await poamAPI.submitForReview(id, {
        control_id: item?.control_id || undefined,
        justification: form.remediation_plan.trim() || item?.remediation_plan || undefined,
        framework_specific_type: item?.framework_specific_type || undefined,
      });
      setToast('Submitted for auditor review');
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to submit for review'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleUnlinkControl = async (controlId: string) => {
    try {
      setSaving(true);
      await poamAPI.unlinkControl(id, controlId);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to unlink control'));
    } finally {
      setSaving(false);
    }
  };

  // Matches the backend guard on POST /:id/submit-for-review.
  const canSubmitForReview = canWrite && item
    && ['in_progress', 'pending_review'].includes(item.status);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center text-gray-500 text-sm">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!item) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center space-y-3">
          <p className="text-gray-600">{error || 'Item not found.'}</p>
          <Link href="/dashboard/poam" className="text-sm text-purple-600 hover:underline">
            Back to the register
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
          <Link href="/dashboard/poam" className="hover:text-purple-700">{terms.plural}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{item.title}</span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{item.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusBadge value={item.status} colorMap={POAM_STATUS_COLORS} />
              <PriorityBadge value={item.priority} />
              <span className="text-xs text-gray-500 capitalize">
                Raised from {String(item.source_type || 'manual').replace(/_/g, ' ')}
              </span>
              {item.framework_specific_type && item.framework_specific_type !== 'standard' && (
                <span className="text-xs text-gray-500">· {item.framework_specific_type}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canSubmitForReview && (
              <button
                onClick={handleSubmitForReview}
                disabled={submittingReview}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {submittingReview ? 'Submitting...' : 'Submit for review'}
              </button>
            )}
            {canWrite && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Edit
              </button>
            )}
          </div>
        </header>

        {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {toast && <div role="status" className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">{toast}</div>}

        <PoamReviewPanel
          item={item}
          currentUserId={user?.id ? String(user.id) : null}
          canReview={canReview}
          onReviewed={() => { setToast('Review decision recorded'); load(); }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {editing ? (
              <EditForm
                form={form}
                setForm={setForm}
                orgUsers={orgUsers}
                saving={saving}
                onSave={handleSave}
                onCancel={() => { setEditing(false); load(); }}
              />
            ) : (
              <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Details</h2>
                <DetailField label="Description" value={item.description} />
                <DetailField label="Remediation plan" value={item.remediation_plan} />
                <DetailField label="Resources required" value={item.resources_required} />
                <DetailField label="Owner" value={item.owner_email} />
                <DetailField label="Closure notes" value={item.closure_notes} />

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Schedule</p>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <div>
                      <p className="text-xs text-gray-500">Originally scheduled</p>
                      <p className="text-sm text-gray-900">
                        {item.scheduled_completion_date
                          ? new Date(item.scheduled_completion_date).toLocaleDateString()
                          : 'not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Current target</p>
                      <p className="text-sm text-gray-900">
                        {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'not set'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-1">
                    <SlippageIndicator
                      scheduledCompletionDate={item.scheduled_completion_date}
                      dueDate={item.due_date}
                    />
                  </div>
                  {/* The original commitment is write-once by design (migration
                      134) -- it is the baseline slippage is measured against,
                      so the UI must not offer to move it. */}
                  {item.scheduled_completion_date && (
                    <p className="text-xs text-gray-400 mt-1">
                      The original commitment is set once and cannot be edited; move the current target instead
                      so the slippage stays visible.
                    </p>
                  )}
                </div>
              </section>
            )}

            <PoamMilestones poamItemId={id} canWrite={canWrite} onChange={load} />

            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Progress</h2>
              {canWrite && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a progress note..."
                    aria-label="Add a progress note"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={saving || !note.trim()}
                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}
              {updates.length === 0 ? (
                <p className="text-sm text-gray-400">No progress recorded yet.</p>
              ) : (
                <ul role="list" className="divide-y divide-gray-100">
                  {updates.map((update) => (
                    <li key={update.id} role="listitem" className="py-2">
                      <p className="text-sm text-gray-900">{update.note}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {update.previous_status && update.new_status && (
                          <span className="mr-2">
                            {update.previous_status.replace(/_/g, ' ')} → {update.new_status.replace(/_/g, ' ')}
                          </span>
                        )}
                        {update.changed_by_email || 'system'} · {new Date(update.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {approvals.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Approval history</h2>
                <ul role="list" className="divide-y divide-gray-100">
                  {approvals.map((approval) => (
                    <li key={approval.id} role="listitem" className="py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <StatusBadge value={approval.review_status || 'pending'} />
                        {approval.control_code && (
                          <span className="text-xs text-gray-500">{approval.control_code}</span>
                        )}
                      </div>
                      {approval.justification && (
                        <p className="text-gray-700 mt-1">{approval.justification}</p>
                      )}
                      {approval.review_comments && (
                        <p className="text-gray-600 mt-1 italic">Reviewer: {approval.review_comments}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        Submitted by {approval.submitted_by_email || 'unknown'} on{' '}
                        {new Date(approval.submitted_at).toLocaleString()}
                        {approval.reviewed_at && ` · reviewed by ${approval.reviewed_by_email || 'unknown'} on ${new Date(approval.reviewed_at).toLocaleString()}`}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Controls</h2>
              {controls.length === 0 ? (
                <p className="text-sm text-gray-400">No controls linked.</p>
              ) : (
                <ul role="list" className="space-y-2">
                  {controls.map((control) => (
                    <li key={control.control_id} role="listitem" className="text-sm">
                      <Link
                        href={`/dashboard/controls/${control.control_id}`}
                        className="text-purple-700 hover:underline font-medium"
                      >
                        {control.control_code}
                      </Link>
                      <span className="text-gray-600"> — {control.control_title}</span>
                      <span className="block text-xs text-gray-400">
                        {control.framework_name || control.framework_code || 'framework not set'}
                        {canWrite && (
                          <button
                            onClick={() => handleUnlinkControl(control.control_id)}
                            disabled={saving}
                            className="ml-2 text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            unlink
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Risks</h2>
              {risks.length === 0 ? (
                <p className="text-sm text-gray-400">Not linked to any register entry.</p>
              ) : (
                <ul role="list" className="space-y-2">
                  {risks.map((risk) => (
                    <li key={risk.risk_id} role="listitem" className="text-sm">
                      <Link href={`/dashboard/risks/${risk.risk_id}`} className="text-purple-700 hover:underline font-medium">
                        {risk.risk_reference || risk.risk_title}
                      </Link>
                      <span className="block text-xs text-gray-400">
                        {risk.risk_status?.replace(/_/g, ' ')}
                        {risk.residual_score !== null && ` · residual ${risk.residual_score}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-1 text-xs text-gray-500">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Record</h2>
              <p>Created {new Date(item.created_at).toLocaleString()}</p>
              {item.created_by_email && <p>By {item.created_by_email}</p>}
              {item.closed_at && <p>Closed {new Date(item.closed_at).toLocaleString()}</p>}
              {item.risk_acceptance_expires_at && (
                <p className="text-purple-700">
                  Risk acceptance expires {new Date(item.risk_acceptance_expires_at).toLocaleDateString()}
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{value || '—'}</p>
    </div>
  );
}

interface EditFormState {
  title: string; description: string; status: string; priority: string;
  owner_id: string; due_date: string; resources_required: string;
  remediation_plan: string; closure_notes: string; risk_acceptance_expires_at: string;
}

function EditForm({
  form, setForm, orgUsers, saving, onSave, onCancel,
}: {
  form: EditFormState;
  setForm: (value: EditFormState) => void;
  orgUsers: OrgUser[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Edit details</h2>

      <Field label="Title" htmlFor="poam-title">
        <input
          id="poam-title"
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </Field>

      <Field label="Description" htmlFor="poam-description">
        <textarea
          id="poam-description"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" htmlFor="poam-status">
          <select
            id="poam-status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {POAM_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="poam-priority">
          <select
            id="poam-priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {POAM_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner" htmlFor="poam-owner">
          <select
            id="poam-owner"
            value={form.owner_id}
            onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Unassigned</option>
            {orgUsers.map((orgUser) => (
              <option key={orgUser.id} value={orgUser.id}>{orgUser.email}</option>
            ))}
          </select>
        </Field>
        <Field label="Current target date" htmlFor="poam-due">
          <input
            id="poam-due"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>
      </div>

      <Field label="Resources required" htmlFor="poam-resources">
        <textarea
          id="poam-resources"
          rows={2}
          value={form.resources_required}
          onChange={(e) => setForm({ ...form, resources_required: e.target.value })}
          placeholder="Funding, staff and tooling needed to close this item."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </Field>

      <Field label="Remediation plan" htmlFor="poam-plan">
        <textarea
          id="poam-plan"
          rows={3}
          value={form.remediation_plan}
          onChange={(e) => setForm({ ...form, remediation_plan: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Closure notes" htmlFor="poam-closure">
          <textarea
            id="poam-closure"
            rows={2}
            value={form.closure_notes}
            onChange={(e) => setForm({ ...form, closure_notes: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>
        <Field label="Risk acceptance expires" htmlFor="poam-acceptance">
          <input
            id="poam-acceptance"
            type="date"
            value={form.risk_acceptance_expires_at}
            onChange={(e) => setForm({ ...form, risk_acceptance_expires_at: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.title.trim()}
          className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
