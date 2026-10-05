'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { MarkdownContent } from '@/components/ai/MarkdownContent';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import { policiesAPI, PolicyStatus } from '@/lib/api';
import PolicyAttestationPanel, { Attestation } from '@/components/policies/PolicyAttestationPanel';
import PolicyReviewsPanel, { PolicyReview } from '@/components/policies/PolicyReviewsPanel';
import { focusTarget } from '@/lib/focusTarget';
import {
  errorMessage,
  formatDate,
  inputClass,
  isOverdue,
  Modal,
  Policy,
  PolicyStatusBadge,
  policyTypeLabel,
  primaryButton,
  secondaryButton,
} from '@/components/policies/policyShared';

interface PolicySection {
  id: string;
  section_number: string;
  section_title: string;
  section_content: string;
  display_order: number;
  mapped_controls_count: number;
}

interface MappedControl {
  id: string;
  control_code?: string;
  control_id_code?: string;
  control_title?: string;
  title?: string;
  framework_code: string;
  implementation_status: string | null;
}

interface PolicyDetail {
  policy: Policy;
  sections: PolicySection[];
  recent_reviews: PolicyReview[];
  attestation: Attestation;
}

interface SectionDraft {
  section_number: string;
  section_title: string;
  section_content: string;
  display_order: number;
}

// Status transitions offered in the UI. The backend enforces separation of
// duties on approval (the policy author cannot approve their own policy).
const NEXT_ACTIONS: Record<PolicyStatus, { to: PolicyStatus; label: string }[]> = {
  draft: [{ to: 'under_review', label: 'Submit for review' }],
  under_review: [{ to: 'approved', label: 'Approve' }, { to: 'draft', label: 'Return to draft' }],
  approved: [{ to: 'published', label: 'Publish' }, { to: 'draft', label: 'Return to draft' }],
  published: [{ to: 'archived', label: 'Archive' }],
  archived: [{ to: 'draft', label: 'Restore as draft' }],
};

function nextVersion(version: string): string {
  const match = /^(\d+)\.(\d+)$/.exec(version || '');
  return match ? `${match[1]}.${Number(match[2]) + 1}` : `${version || '1.0'}.1`;
}

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const policyId = params.id;
  const { user } = useAuth();
  // Deep link from My Work: ?action=acknowledge brings the acknowledgment panel into view.
  const searchParams = useSearchParams();
  const deepLinkAction = searchParams.get('action');
  const deepLinkHandled = useRef(false);
  const canWrite = hasPermission(user, 'controls.write');
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [controls, setControls] = useState<Record<string, MappedControl[]>>({});
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await policiesAPI.get(policyId);
      setDetail(res.data?.data as PolicyDetail);
      setError('');
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load the policy'));
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (deepLinkHandled.current || !detail || deepLinkAction !== 'acknowledge') return;
    deepLinkHandled.current = true;
    focusTarget('policy-acknowledge-button');
  }, [deepLinkAction, detail]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      return true;
    } catch (err: unknown) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (to: PolicyStatus) => {
    const policy = detail?.policy;
    if (!policy) return;
    // Re-opening a published or archived policy starts a new version, so the
    // next publication needs fresh acknowledgments.
    const version = (policy.status === 'published' || policy.status === 'archived') && to === 'draft'
      ? nextVersion(policy.version)
      : undefined;
    run(() => policiesAPI.update(policy.id, { status: to, version }), 'Status change failed');
  };

  const toggleSection = async (section: PolicySection) => {
    if (expanded === section.id) { setExpanded(null); return; }
    setExpanded(section.id);
    if (!controls[section.id] && section.mapped_controls_count > 0) {
      try {
        const res = await policiesAPI.getSectionControls(policyId, section.id);
        setControls((prev) => ({ ...prev, [section.id]: (res.data?.data || []) as MappedControl[] }));
      } catch {
        setControls((prev) => ({ ...prev, [section.id]: [] }));
      }
    }
  };

  const saveSection = async () => {
    if (!sectionDraft) return;
    const ok = await run(() => policiesAPI.saveSection(policyId, sectionDraft), 'Could not save the section');
    if (ok) setSectionDraft(null);
  };

  if (loading) {
    return <DashboardLayout><div className="p-6 text-sm text-gray-500">Loading…</div></DashboardLayout>;
  }
  if (!detail) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <p className="text-sm text-red-700">{error || 'Policy not found.'}</p>
          <Link href="/dashboard/policies" className="text-sm text-blue-700 hover:underline">Back to policies</Link>
        </div>
      </DashboardLayout>
    );
  }

  const { policy, sections, recent_reviews: reviews, attestation } = detail;
  const editable = canWrite && policy.status !== 'published' && policy.status !== 'archived';

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6">
        <Link href="/dashboard/policies" className="text-sm text-blue-700 hover:underline">&larr; Policies</Link>

        <div className="flex flex-wrap items-start justify-between gap-4 mt-2 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{policy.policy_name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
              <PolicyStatusBadge status={policy.status} />
              <span>{policyTypeLabel(policy.policy_type)}</span>
              <span>Version {policy.version}</span>
              <span>Effective {formatDate(policy.effective_date)}</span>
              <span className={isOverdue(policy.next_review_date) && policy.status !== 'archived' ? 'text-red-600 font-medium' : ''}>
                Next review {formatDate(policy.next_review_date)}
              </span>
            </div>
            {policy.approved_at && (
              <p className="text-xs text-gray-500 mt-1">Approved {formatDate(policy.approved_at)}{policy.approved_by_email ? ` by ${policy.approved_by_email}` : ''}</p>
            )}
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {NEXT_ACTIONS[policy.status].map((action, index) => (
                <button key={action.to} type="button" disabled={busy} onClick={() => changeStatus(action.to)} className={index === 0 ? primaryButton : secondaryButton}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">{error}</div>}
        {policy.description && <p className="text-sm text-gray-700 mb-6 whitespace-pre-line">{policy.description}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-3" aria-labelledby="sections-heading">
            <div className="flex items-center justify-between">
              <h2 id="sections-heading" className="text-lg font-semibold text-gray-900">Sections ({sections.length})</h2>
              {editable && (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setSectionDraft({ section_number: String(sections.length + 1), section_title: '', section_content: '', display_order: sections.length + 1 })}
                >
                  Add section
                </button>
              )}
            </div>
            {!editable && canWrite && policy.status === 'published' && (
              <p className="text-xs text-gray-500">Published policies are read-only. Archive and restore it as a draft to start a new version.</p>
            )}
            {sections.length === 0 && <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-4">This policy has no sections yet.</p>}
            {sections.map((section) => (
              <article key={section.id} className="bg-white border border-gray-200 rounded-lg">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  aria-expanded={expanded === section.id}
                  onClick={() => toggleSection(section)}
                >
                  <span className="font-medium text-gray-900">{section.section_title}</span>
                  <span className="text-xs text-gray-500">{section.mapped_controls_count} mapped control{section.mapped_controls_count === 1 ? '' : 's'}</span>
                </button>
                {expanded === section.id && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="prose prose-sm max-w-none mt-3"><MarkdownContent content={section.section_content} /></div>
                    {(controls[section.id] || []).length > 0 && (
                      <div className="mt-3">
                        <h3 className="text-xs font-semibold text-gray-700 uppercase mb-1">Mapped controls</h3>
                        <ul role="list" className="flex flex-wrap gap-1">
                          {(controls[section.id] || []).map((c) => (
                            <li role="listitem" key={c.id} className="text-xs border border-gray-200 rounded px-2 py-0.5" title={c.control_title || c.title || ''}>
                              {c.framework_code}: {c.control_code || c.control_id_code}
                              {c.implementation_status ? ` (${c.implementation_status.replace(/_/g, ' ')})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {editable && (
                      <button
                        type="button"
                        className="mt-3 text-sm text-blue-700 hover:underline"
                        onClick={() => setSectionDraft({
                          section_number: section.section_number,
                          section_title: section.section_title,
                          section_content: section.section_content,
                          display_order: section.display_order,
                        })}
                      >
                        Edit section
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>

          <div className="space-y-6">
            <div id="policy-acknowledge" className="scroll-mt-20">
              <PolicyAttestationPanel policyId={policy.id} status={policy.status} attestation={attestation} onChanged={load} />
            </div>
            <PolicyReviewsPanel policyId={policy.id} reviews={reviews} canWrite={canWrite} onChanged={load} />
          </div>
        </div>

        {sectionDraft && (
          <Modal title="Policy section" onClose={() => setSectionDraft(null)} wide>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label htmlFor="section-number" className="block text-sm font-medium text-gray-700 mb-1">Number</label>
                  <input id="section-number" className={inputClass} value={sectionDraft.section_number} onChange={(e) => setSectionDraft({ ...sectionDraft, section_number: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <label htmlFor="section-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input id="section-title" className={inputClass} value={sectionDraft.section_title} onChange={(e) => setSectionDraft({ ...sectionDraft, section_title: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="section-content" className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
                <textarea id="section-content" rows={14} className={`${inputClass} font-mono`} value={sectionDraft.section_content} onChange={(e) => setSectionDraft({ ...sectionDraft, section_content: e.target.value })} />
              </div>
              <p className="text-xs text-gray-500">Saving a section with an existing number replaces it and keeps its control mappings.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className={secondaryButton} onClick={() => setSectionDraft(null)}>Cancel</button>
                <button
                  type="button"
                  className={primaryButton}
                  disabled={busy || !sectionDraft.section_number.trim() || !sectionDraft.section_title.trim() || !sectionDraft.section_content.trim()}
                  onClick={saveSection}
                >
                  {busy ? 'Saving…' : 'Save section'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
