'use client';

import { useCallback, useEffect, useState } from 'react';
import { financialAuditAPI } from '@/lib/api';
import { errorMessage, formatDate, inputClass, Modal, primaryButton, secondaryButton } from '@/components/financialAudit/auditShared';
import { ErrorBanner, humanize, StatusPill } from '@/components/financialAudit/auditShared';
import TestDetail from './TestDetail';
import type { RcmEntry } from './RcmPanel';

interface TestRow {
  id: string;
  control_ref: string;
  process: string;
  test_type: 'design' | 'operating_effectiveness';
  fiscal_year: number | null;
  sample_method: string;
  sample_size: number;
  status: string;
  conclusion: string | null;
  exceptions: number;
  pending: number;
  reviewed_at: string | null;
  created_at: string;
}

interface PlanForm {
  test_type: 'design' | 'operating_effectiveness';
  sample_method: string;
  population_size: string;
  sample_size: string;
  confidence_level: string;
  tolerable_rate: string;
  expected_rate: string;
  procedures: string;
}

interface TestingPanelProps {
  fiscalYear: number | null;
  canWrite: boolean;
  currentUserId: string | undefined;
  planFor: RcmEntry | null;
  onPlanClosed: () => void;
}

export default function TestingPanel({ fiscalYear, canWrite, currentUserId, planFor, onPlanClosed }: TestingPanelProps) {
  const [rows, setRows] = useState<TestRow[]>([]);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await financialAuditAPI.listTests({ fiscal_year: fiscalYear || undefined });
      setRows((res.data?.data || []) as TestRow[]);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load tests'));
    }
  }, [fiscalYear]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (planFor) {
      setPlan({ test_type: 'operating_effectiveness', sample_method: 'frequency_table', population_size: '', sample_size: '', confidence_level: '95', tolerable_rate: '5', expected_rate: '0', procedures: '' });
    }
  }, [planFor]);

  const closePlan = () => { setPlan(null); onPlanClosed(); };

  const submitPlan = async () => {
    if (!plan || !planFor) return;
    setBusy(true);
    setError('');
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    try {
      const res = await financialAuditAPI.createTest({
        rcm_entry_id: planFor.id,
        test_type: plan.test_type,
        fiscal_year: fiscalYear || new Date().getFullYear(),
        sample_method: plan.test_type === 'design' ? 'walkthrough' : plan.sample_method,
        population_size: num(plan.population_size),
        sample_size: num(plan.sample_size),
        confidence_level: plan.sample_method === 'statistical' ? num(plan.confidence_level) : undefined,
        tolerable_rate: plan.sample_method === 'statistical' ? num(plan.tolerable_rate) : undefined,
        expected_rate: plan.sample_method === 'statistical' ? num(plan.expected_rate) : undefined,
        procedures: plan.procedures || undefined,
      });
      closePlan();
      await load();
      setOpenId((res.data?.data as { id: string }).id);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not plan the test'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ErrorBanner message={error} />
      <p className="text-sm text-gray-600 mb-3">Plan tests from the Risk-Control Matrix tab. Samples are selected reproducibly from a seed shown on each test.</p>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2">Control</th><th className="px-3 py-2">Test</th><th className="px-3 py-2">FY</th>
              <th className="px-3 py-2">Method</th><th className="px-3 py-2">Samples</th><th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Conclusion</th><th className="px-3 py-2">Reviewed</th><th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No tests yet.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(t.id)}>
                <td className="px-3 py-2 font-medium text-blue-700">{t.control_ref}<div className="text-xs text-gray-500">{humanize(t.process)}</div></td>
                <td className="px-3 py-2">{t.test_type === 'design' ? 'Design' : 'Operating effectiveness'}</td>
                <td className="px-3 py-2">{t.fiscal_year || ''}</td>
                <td className="px-3 py-2 text-xs">{humanize(t.sample_method)}</td>
                <td className="px-3 py-2 text-xs">{t.sample_size}{t.pending ? ` (${t.pending} pending)` : ''}{t.exceptions ? <span className="text-red-700"> · {t.exceptions} exception(s)</span> : ''}</td>
                <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                <td className="px-3 py-2"><StatusPill status={t.conclusion} /></td>
                <td className="px-3 py-2 text-xs">{t.reviewed_at ? formatDate(t.reviewed_at) : ''}</td>
                <td className="px-3 py-2 text-xs">{formatDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan && planFor && (
        <Modal title={`Plan a test of ${planFor.control_ref}`} onClose={closePlan} wide>
          <p className="text-sm text-gray-700 mb-3">{planFor.control_description} <span className="text-gray-500">({humanize(planFor.frequency)}, {humanize(planFor.control_type)}, {planFor.risk_level} risk)</span></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label>Test type
              <select className={inputClass} value={plan.test_type} onChange={(e) => setPlan({ ...plan, test_type: e.target.value as PlanForm['test_type'] })}>
                <option value="operating_effectiveness">Operating effectiveness</option>
                <option value="design">Design (walkthrough)</option>
              </select>
            </label>
            {plan.test_type === 'operating_effectiveness' && (
              <label>Sample method
                <select className={inputClass} value={plan.sample_method} onChange={(e) => setPlan({ ...plan, sample_method: e.target.value })}>
                  <option value="frequency_table">Frequency table</option>
                  <option value="statistical">Statistical (attribute)</option>
                  <option value="judgmental">Judgmental</option>
                  <option value="full_population">Full population (up to 500)</option>
                </select>
              </label>
            )}
            <label>Population size<input className={inputClass} type="number" min={0} value={plan.population_size} onChange={(e) => setPlan({ ...plan, population_size: e.target.value })} placeholder="Occurrences in the period" /></label>
            <label>Sample size override<input className={inputClass} type="number" min={1} value={plan.sample_size} onChange={(e) => setPlan({ ...plan, sample_size: e.target.value })} placeholder="Leave blank to calculate" /></label>
            {plan.sample_method === 'statistical' && plan.test_type === 'operating_effectiveness' && (
              <>
                <label>Confidence %<input className={inputClass} type="number" value={plan.confidence_level} onChange={(e) => setPlan({ ...plan, confidence_level: e.target.value })} /></label>
                <label>Tolerable deviation %<input className={inputClass} type="number" value={plan.tolerable_rate} onChange={(e) => setPlan({ ...plan, tolerable_rate: e.target.value })} /></label>
                <label>Expected deviation %<input className={inputClass} type="number" value={plan.expected_rate} onChange={(e) => setPlan({ ...plan, expected_rate: e.target.value })} /></label>
              </>
            )}
            <label className="md:col-span-2">Procedures<textarea className={inputClass} rows={3} value={plan.procedures} onChange={(e) => setPlan({ ...plan, procedures: e.target.value })} placeholder="Inspection, reperformance, inquiry steps" /></label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" className={secondaryButton} onClick={closePlan}>Cancel</button>
            <button type="button" className={primaryButton} disabled={busy} onClick={submitPlan}>{busy ? 'Selecting…' : 'Plan test and select sample'}</button>
          </div>
        </Modal>
      )}

      {openId && (
        <TestDetail testId={openId} canWrite={canWrite} currentUserId={currentUserId} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}
