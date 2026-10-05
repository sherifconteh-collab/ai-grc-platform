'use client';

import { useCallback, useEffect, useState } from 'react';
import { assessmentsAPI, financialAuditAPI, type ControlTestConclusion, type DeficiencyLevel, type SampleResult } from '@/lib/api';
import { errorMessage, inputClass, Modal, primaryButton, secondaryButton } from '@/components/financialAudit/auditShared';
import { ErrorBanner, humanize, StatusPill } from '@/components/financialAudit/auditShared';

interface Sample {
  sample_number: number;
  item_reference: string | null;
  result: SampleResult;
  exception_description: string | null;
}

interface TestRecord {
  id: string;
  control_ref: string;
  control_description: string;
  test_type: 'design' | 'operating_effectiveness';
  fiscal_year: number | null;
  sample_method: string;
  sample_size: number;
  population_size: number | null;
  selection_seed: string | null;
  status: 'planned' | 'in_progress' | 'completed';
  conclusion: ControlTestConclusion | null;
  tester_id: string | null;
  tester_name: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  engagement_id: string | null;
  finding_id: string | null;
  procedures: string | null;
  notes: string | null;
  samples: Sample[];
  exceptions: number;
}

interface Engagement { id: string; name: string }

interface TestDetailProps {
  testId: string;
  canWrite: boolean;
  currentUserId: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}

export default function TestDetail({ testId, canWrite, currentUserId, onClose, onChanged }: TestDetailProps) {
  const [test, setTest] = useState<TestRecord | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [conclusion, setConclusion] = useState<ControlTestConclusion | ''>('');
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [finding, setFinding] = useState<{ engagement_id: string; nfr_number: string; deficiency_level: DeficiencyLevel; auditor_organization: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await financialAuditAPI.getTest(testId);
      setTest(res.data?.data as TestRecord);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load the test'));
    }
  }, [testId]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (err: unknown) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const record = (n: number, result: SampleResult) => {
    const description = result === 'exception' ? window.prompt('Describe the exception') : undefined;
    if (result === 'exception' && !description) return;
    act(() => financialAuditAPI.recordSample(testId, n, { result, exception_description: description || undefined }), 'Could not save the result');
  };

  const openFinding = async () => {
    try {
      const res = await assessmentsAPI.getEngagements({ limit: 100 });
      const list = (res.data?.data?.engagements || res.data?.data || []) as Engagement[];
      setEngagements(Array.isArray(list) ? list : []);
    } catch {
      setEngagements([]);
    }
    setFinding({ engagement_id: test?.engagement_id || '', nfr_number: '', deficiency_level: 'control_deficiency', auditor_organization: '' });
  };

  if (!test) return <Modal title="Control test" onClose={onClose} wide><ErrorBanner message={error} /><p className="text-sm text-gray-500">Loading…</p></Modal>;
  const editable = canWrite && test.status !== 'completed';
  const pending = test.samples.filter((s) => s.result === 'pending').length;

  return (
    <Modal title={`${test.control_ref}: test of ${test.test_type === 'design' ? 'design' : 'operating effectiveness'}`} onClose={onClose} wide>
      <ErrorBanner message={error} />
      <div className="text-sm text-gray-700 space-y-1 mb-4">
        <div>{test.control_description}</div>
        <div className="text-xs text-gray-500">
          FY {test.fiscal_year || 'n/a'} · {humanize(test.sample_method)} · {test.sample_size} sample(s){test.population_size !== null ? ` from ${test.population_size}` : ''}
          {test.selection_seed ? ` · selection seed ${test.selection_seed}` : ''} · tester {test.tester_name || 'n/a'}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={test.status} /> <StatusPill status={test.conclusion} />
          {test.reviewed_at && <span className="text-xs text-green-700">Reviewed by {test.reviewer_name}</span>}
        </div>
      </div>

      <div className="border border-gray-200 rounded-md max-h-80 overflow-y-auto mb-4">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase sticky top-0">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Exception</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {test.samples.map((s) => (
              <tr key={s.sample_number}>
                <td className="px-3 py-1.5">{s.sample_number}</td>
                <td className="px-3 py-1.5 text-xs">{s.item_reference || ''}</td>
                <td className="px-3 py-1.5">
                  {editable ? (
                    <div className="flex gap-1" role="group" aria-label={`Result for sample ${s.sample_number}`}>
                      {(['pass', 'exception', 'not_applicable'] as SampleResult[]).map((r) => (
                        <button key={r} type="button" disabled={busy} onClick={() => record(s.sample_number, r)}
                          className={`px-2 py-0.5 rounded text-xs border ${s.result === r ? (r === 'exception' ? 'bg-red-600 text-white border-red-600' : 'bg-blue-600 text-white border-blue-600') : 'border-gray-300 text-gray-700'}`}>
                          {r === 'not_applicable' ? 'N/A' : humanize(r)}
                        </button>
                      ))}
                    </div>
                  ) : <StatusPill status={s.result === 'exception' ? 'ineffective' : s.result === 'pass' ? 'effective' : s.result} />}
                </td>
                <td className="px-3 py-1.5 text-xs text-red-700">{s.exception_description || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="space-y-2 mb-4">
          <div className="text-sm text-gray-700">{pending ? `${pending} sample(s) still need a result.` : `${test.exceptions} exception(s) recorded.`}</div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">Conclusion
              <select className={inputClass} value={conclusion} onChange={(e) => setConclusion(e.target.value as ControlTestConclusion | '')}>
                <option value="">Suggested from samples</option>
                <option value="effective">Effective</option>
                <option value="effective_with_exceptions">Effective with exceptions</option>
                <option value="ineffective">Ineffective</option>
              </select>
            </label>
            <label className="text-sm flex-1 min-w-[16rem]">Notes
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Required when overriding the suggested conclusion" />
            </label>
            <button type="button" className={primaryButton} disabled={busy || pending > 0}
              onClick={() => act(() => financialAuditAPI.completeTest(testId, { conclusion: conclusion || undefined, notes: notes || undefined }), 'Could not complete the test')}>
              Complete test
            </button>
          </div>
        </div>
      )}

      {canWrite && test.status === 'completed' && (
        <div className="flex flex-wrap gap-2">
          {!test.reviewed_at && test.tester_id !== currentUserId && (
            <button type="button" className={primaryButton} disabled={busy} onClick={() => act(() => financialAuditAPI.reviewTest(testId), 'Review failed')}>Sign off review</button>
          )}
          {!test.reviewed_at && test.tester_id === currentUserId && <span className="text-xs text-gray-500 self-center">Another person must review this test.</span>}
          {!test.finding_id && test.conclusion && test.conclusion !== 'effective' && (
            <button type="button" className={secondaryButton} onClick={openFinding}>Raise finding (NFR)</button>
          )}
          {test.finding_id && <span className="text-xs text-gray-600 self-center">Finding recorded; track it under Engagements → Findings and POA&amp;M.</span>}
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => act(() => financialAuditAPI.reopenTest(testId), 'Could not reopen')}>Reopen</button>
        </div>
      )}

      {finding && (
        <div className="mt-4 border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label>Engagement
            <select className={inputClass} value={finding.engagement_id} onChange={(e) => setFinding({ ...finding, engagement_id: e.target.value })}>
              <option value="">Select an engagement</option>
              {engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
          <label>NFR number<input className={inputClass} value={finding.nfr_number} onChange={(e) => setFinding({ ...finding, nfr_number: e.target.value })} placeholder="NFR-2026-01" /></label>
          <label>Classification
            <select className={inputClass} value={finding.deficiency_level} onChange={(e) => setFinding({ ...finding, deficiency_level: e.target.value as DeficiencyLevel })}>
              <option value="control_deficiency">Control deficiency</option>
              <option value="significant_deficiency">Significant deficiency</option>
              <option value="material_weakness">Material weakness</option>
            </select>
          </label>
          <label>Auditor<input className={inputClass} value={finding.auditor_organization} onChange={(e) => setFinding({ ...finding, auditor_organization: e.target.value })} /></label>
          <div className="md:col-span-2 flex justify-end">
            <button type="button" className={primaryButton} disabled={busy || !finding.engagement_id}
              onClick={() => act(async () => {
                const res = await financialAuditAPI.raiseFinding(testId, { ...finding, nfr_number: finding.nfr_number || undefined, auditor_organization: finding.auditor_organization || undefined });
                const created = res.data?.data as { id: string };
                if (window.confirm('Finding recorded. Open a corrective action plan (POA&M item) for it now?')) {
                  await financialAuditAPI.createCap(created.id, {});
                }
                setFinding(null);
              }, 'Could not raise the finding')}>
              Record finding
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
