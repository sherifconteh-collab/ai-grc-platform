// @tier: community
'use client';

/**
 * Risk detail.
 *
 * GET /risks/:id has always returned the full picture -- assessment, treatments,
 * reviews, control/asset/objective links -- and had no screen. The register was
 * a list and a heat map; clicking a row did nothing. This page is that screen,
 * and it is also where the new risk-to-remediation link (migration 140) is
 * surfaced: a register that cannot show what is being done about a risk is only
 * half a register.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { risksAPI, poamAPI } from '@/lib/api';
import type { RiskCategory, RiskStatus, TreatmentStrategy, SeverityBand } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import {
  SeverityChip, Pill, ErrorBanner, SuccessBanner, humanize, formatDate, severityForScore,
} from '@/components/registers/RegisterUI';
import { StatusBadge, PriorityBadge, POAM_STATUS_COLORS } from '@/components/poam/PoamStatusBadge';
import { errorMessage } from '@/lib/poamTypes';

interface RiskTreatment {
  id: string;
  title: string;
  description: string | null;
  treatment_type: TreatmentStrategy;
  status: string;
  due_date: string | null;
  progress_percent: number;
  target_residual_score: number | null;
  estimated_cost: string | number | null;
}

interface LinkedControl {
  id: string;
  control_id: string;
  effectiveness: string | null;
  control_ref: string;
  control_title: string;
  framework_name: string | null;
}

interface LinkedAsset {
  id: string;
  asset_id: string;
  asset_name: string;
  criticality: string | null;
  asset_category: string | null;
}

interface LinkedObjective {
  id: string;
  objective_id: string;
  reference: string | null;
  title: string;
  category: string | null;
}

interface RiskReview {
  id: string;
  outcome: string | null;
  notes: string | null;
  reviewed_at: string;
  first_name: string | null;
  last_name: string | null;
}

interface LinkedPoam {
  id: string;
  poam_item_id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  scheduled_completion_date: string | null;
  treatment_id: string | null;
  owner_email: string | null;
}

interface RiskDetail {
  id: string;
  reference: string | null;
  title: string;
  description: string | null;
  category: RiskCategory;
  status: RiskStatus;
  threat_source: string | null;
  vulnerability: string | null;
  inherent_likelihood: number | null;
  inherent_impact: number | null;
  inherent_score: number | null;
  residual_likelihood: number | null;
  residual_impact: number | null;
  residual_score: number | null;
  inherent_severity: SeverityBand | null;
  residual_severity: SeverityBand | null;
  treatment_strategy: TreatmentStrategy | null;
  accepted_by: string | null;
  accepted_at: string | null;
  acceptance_rationale: string | null;
  next_review_date: string | null;
  department_name: string | null;
  identified_date: string | null;
  tags: string[] | null;
  treatments: RiskTreatment[];
  controls: LinkedControl[];
  assets: LinkedAsset[];
  objectives: LinkedObjective[];
  reviews: RiskReview[];
  poams: LinkedPoam[];
  remediation_complete: boolean;
  review_due: boolean;
}

export default function RiskDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { user } = useAuth();

  const [risk, setRisk] = useState<RiskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [creatingPoam, setCreatingPoam] = useState(false);
  const [poamTitle, setPoamTitle] = useState('');
  const [poamTreatmentId, setPoamTreatmentId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewOutcome, setReviewOutcome] = useState('unchanged');

  const canWrite = hasPermission(user, 'risks.write');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError('');
      const res = await risksAPI.get(id);
      setRisk(res.data?.data || null);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load risk'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleCreatePoam = async () => {
    try {
      setBusy(true);
      setError('');
      await poamAPI.createFromRisk(id, {
        title: poamTitle.trim() || undefined,
        treatment_id: poamTreatmentId || null,
      });
      setPoamTitle('');
      setPoamTreatmentId('');
      setCreatingPoam(false);
      setToast('Remediation item created and linked to this risk');
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to create the remediation item'));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlinkPoam = async (poamItemId: string) => {
    try {
      setBusy(true);
      await risksAPI.unlinkPoam(id, poamItemId);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to unlink'));
    } finally {
      setBusy(false);
    }
  };

  const handleAddReview = async () => {
    try {
      setBusy(true);
      setError('');
      await risksAPI.addReview(id, {
        outcome: reviewOutcome as 'unchanged' | 'reassessed' | 'escalated' | 'de_escalated' | 'closed',
        notes: reviewNotes.trim() || undefined,
      });
      setReviewNotes('');
      setToast('Review recorded');
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to record review'));
    } finally {
      setBusy(false);
    }
  };

  const riskReduction = useMemo(() => {
    if (!risk?.inherent_score || !risk?.residual_score) return null;
    return risk.inherent_score - risk.residual_score;
  }, [risk?.inherent_score, risk?.residual_score]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center text-gray-500 text-sm">Loading risk...</div>
      </DashboardLayout>
    );
  }

  if (!risk) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center space-y-3">
          <p className="text-gray-600">{error || 'Risk not found.'}</p>
          <Link href="/dashboard/risks" className="text-sm text-purple-600 hover:underline">Back to the register</Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
          <Link href="/dashboard/risks" className="hover:text-purple-700">Risk Register</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{risk.reference || risk.title}</span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{risk.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {risk.reference && <Pill>{risk.reference}</Pill>}
              <Pill>{humanize(risk.category)}</Pill>
              <Pill tone={risk.status === 'closed' ? 'ok' : 'neutral'}>{humanize(risk.status)}</Pill>
              {risk.treatment_strategy && <Pill>{humanize(risk.treatment_strategy)}</Pill>}
            </div>
          </div>
        </header>

        {error && <ErrorBanner message={error} />}
        {toast && <SuccessBanner message={toast} />}

        {risk.review_due && (
          <div role="status" className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
            {risk.remediation_complete
              ? 'Every linked remediation item is closed. This risk is due for reassessment — the residual '
                + 'score is deliberately left unchanged until someone records that reassessment, so the '
                + 'register shows what was actually assessed rather than what was inferred.'
              : 'This risk is past its scheduled review date.'}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Assessment</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Inherent</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SeverityChip
                      severity={risk.inherent_severity || severityForScore(risk.inherent_score)}
                      score={risk.inherent_score}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    likelihood {risk.inherent_likelihood ?? '—'} × impact {risk.inherent_impact ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Residual</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SeverityChip
                      severity={risk.residual_severity || severityForScore(risk.residual_score)}
                      score={risk.residual_score}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    likelihood {risk.residual_likelihood ?? '—'} × impact {risk.residual_impact ?? '—'}
                  </p>
                </div>
              </div>
              {riskReduction !== null && (
                <p className="text-xs text-gray-600">
                  Controls have reduced this risk by <strong>{riskReduction}</strong> point(s).
                </p>
              )}
              <DetailField label="Description" value={risk.description} />
              <DetailField label="Threat source" value={risk.threat_source} />
              <DetailField label="Vulnerability" value={risk.vulnerability} />
            </section>

            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Remediation
                  {risk.poams.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-500">{risk.poams.length} item(s)</span>
                  )}
                </h2>
                {canWrite && !creatingPoam && (
                  <button
                    onClick={() => setCreatingPoam(true)}
                    className="text-xs px-2 py-1 border border-purple-300 text-purple-700 rounded hover:bg-purple-50"
                  >
                    + Create POA&amp;M from this risk
                  </button>
                )}
              </div>

              {creatingPoam && (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2">
                  <div>
                    <label htmlFor="poam-title" className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                    <input
                      id="poam-title"
                      type="text"
                      value={poamTitle}
                      onChange={(e) => setPoamTitle(e.target.value)}
                      placeholder={`Treat risk ${risk.reference || ''}: ${risk.title}`}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  {risk.treatments.length > 0 && (
                    <div>
                      <label htmlFor="poam-treatment" className="block text-xs font-medium text-gray-700 mb-1">
                        Executes which treatment? (optional)
                      </label>
                      <select
                        id="poam-treatment"
                        value={poamTreatmentId}
                        onChange={(e) => setPoamTreatmentId(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">Not tied to a specific treatment</option>
                        {risk.treatments.map((treatment) => (
                          <option key={treatment.id} value={treatment.id}>{treatment.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setCreatingPoam(false); setPoamTitle(''); setPoamTreatmentId(''); }}
                      className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreatePoam}
                      disabled={busy}
                      className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      {busy ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </div>
              )}

              {risk.poams.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No remediation items linked. A treatment strategy records the decision; a POA&amp;M records
                  the work.
                </p>
              ) : (
                <ul role="list" className="divide-y divide-gray-100">
                  {risk.poams.map((poam) => (
                    <li key={poam.poam_item_id} role="listitem" className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/poam/${poam.poam_item_id}`}
                          className="text-sm font-medium text-purple-700 hover:underline"
                        >
                          {poam.title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {poam.owner_email || 'unassigned'}
                          {poam.due_date && ` · due ${formatDate(poam.due_date)}`}
                          {poam.treatment_id && ' · executes a treatment'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge value={poam.priority} />
                        <StatusBadge value={poam.status} colorMap={POAM_STATUS_COLORS} />
                        {canWrite && (
                          <button
                            onClick={() => handleUnlinkPoam(poam.poam_item_id)}
                            disabled={busy}
                            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            unlink
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Treatments</h2>
              {risk.treatments.length === 0 ? (
                <p className="text-sm text-gray-400">No treatments planned.</p>
              ) : (
                <ul role="list" className="divide-y divide-gray-100">
                  {risk.treatments.map((treatment) => (
                    <li key={treatment.id} role="listitem" className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{treatment.title}</p>
                          {treatment.description && (
                            <p className="text-xs text-gray-600 mt-0.5">{treatment.description}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">
                            {humanize(treatment.treatment_type)}
                            {treatment.due_date && ` · due ${formatDate(treatment.due_date)}`}
                            {treatment.target_residual_score !== null && ` · target residual ${treatment.target_residual_score}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Pill tone={treatment.status === 'completed' ? 'ok' : 'neutral'}>
                            {humanize(treatment.status)}
                          </Pill>
                          <p className="text-xs text-gray-500 mt-1">{treatment.progress_percent}%</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Review history</h2>
              {canWrite && (
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[12rem]">
                    <label htmlFor="review-notes" className="block text-xs font-medium text-gray-700 mb-1">
                      Review note
                    </label>
                    <input
                      id="review-notes"
                      type="text"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="What you reassessed and what changed."
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="review-outcome" className="block text-xs font-medium text-gray-700 mb-1">Outcome</label>
                    <select
                      id="review-outcome"
                      value={reviewOutcome}
                      onChange={(e) => setReviewOutcome(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {['unchanged', 'reassessed', 'escalated', 'de_escalated', 'closed'].map((outcome) => (
                        <option key={outcome} value={outcome}>{humanize(outcome)}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAddReview}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    Record
                  </button>
                </div>
              )}
              {risk.reviews.length === 0 ? (
                <p className="text-sm text-gray-400">No reviews recorded. A register nobody revisits is a stale document.</p>
              ) : (
                <ul role="list" className="divide-y divide-gray-100">
                  {risk.reviews.map((review) => (
                    <li key={review.id} role="listitem" className="py-2">
                      <p className="text-sm text-gray-900">{review.notes || humanize(review.outcome || 'reviewed')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[review.first_name, review.last_name].filter(Boolean).join(' ') || 'unknown'} ·{' '}
                        {new Date(review.reviewed_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-1 text-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Ownership</h2>
              <p className="text-xs text-gray-500">Department</p>
              <p className="text-gray-900">{risk.department_name || '—'}</p>
              <p className="text-xs text-gray-500 mt-2">Identified</p>
              <p className="text-gray-900">{formatDate(risk.identified_date)}</p>
              <p className="text-xs text-gray-500 mt-2">Next review</p>
              <p className="text-gray-900">{formatDate(risk.next_review_date)}</p>
              {risk.accepted_at && (
                <>
                  <p className="text-xs text-gray-500 mt-2">Accepted</p>
                  <p className="text-gray-900">{formatDate(risk.accepted_at)}</p>
                  {risk.acceptance_rationale && (
                    <p className="text-xs text-gray-600 mt-1">{risk.acceptance_rationale}</p>
                  )}
                </>
              )}
            </section>

            <LinkSection title="Controls" emptyText="No controls linked.">
              {risk.controls.map((control) => (
                <li key={control.id} role="listitem" className="text-sm">
                  <Link href={`/dashboard/controls/${control.control_id}`} className="text-purple-700 hover:underline font-medium">
                    {control.control_ref}
                  </Link>
                  <span className="text-gray-600"> — {control.control_title}</span>
                  <span className="block text-xs text-gray-400">
                    {control.framework_name || 'framework not set'}
                    {control.effectiveness && ` · ${humanize(control.effectiveness)}`}
                  </span>
                </li>
              ))}
            </LinkSection>

            <LinkSection title="Assets" emptyText="No assets linked.">
              {risk.assets.map((asset) => (
                <li key={asset.id} role="listitem" className="text-sm">
                  <span className="text-gray-900">{asset.asset_name}</span>
                  <span className="block text-xs text-gray-400">
                    {asset.asset_category || 'uncategorized'}
                    {asset.criticality && ` · ${humanize(asset.criticality)}`}
                  </span>
                </li>
              ))}
            </LinkSection>

            <LinkSection title="Objectives" emptyText="No objectives linked.">
              {risk.objectives.map((objective) => (
                <li key={objective.id} role="listitem" className="text-sm">
                  <span className="text-gray-900">{objective.reference ? `${objective.reference} — ` : ''}{objective.title}</span>
                  {objective.category && (
                    <span className="block text-xs text-gray-400">{humanize(objective.category)}</span>
                  )}
                </li>
              ))}
            </LinkSection>
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

function LinkSection({
  title, emptyText, children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.filter(Boolean).length > 0;
  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {hasItems ? (
        <ul role="list" className="space-y-2">{children}</ul>
      ) : (
        <p className="text-sm text-gray-400">{emptyText}</p>
      )}
    </section>
  );
}
