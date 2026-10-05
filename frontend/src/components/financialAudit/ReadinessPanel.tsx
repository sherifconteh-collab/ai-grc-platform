'use client';

import { useCallback, useEffect, useState } from 'react';
import { financialAuditAPI } from '@/lib/api';
import { errorMessage, secondaryButton } from '@/components/financialAudit/auditShared';
import { downloadBlob, ErrorBanner, humanize, StatCard } from '@/components/financialAudit/auditShared';

interface ProcessRow {
  process: string;
  key_controls: number;
  design_effective: number;
  tested: number;
  effective: number;
  ineffective: number;
  not_tested: number;
}

interface DeficiencyCounts {
  findings: number;
  open: number;
  without_cap: number;
  caps_overdue: number;
}

interface Readiness {
  totals: { controls: number; key_controls: number; tested: number; effective: number; ineffective: number; readiness_percent: number };
  processes: ProcessRow[];
  assertion_coverage: Record<string, Record<string, number>>;
  assertion_gaps: { process: string; assertion: string }[];
  deficiencies: { material_weaknesses: DeficiencyCounts; significant_deficiencies: DeficiencyCounts; control_deficiencies: DeficiencyCounts };
  blockers: string[];
  assurance: 'unmodified' | 'qualified' | 'not_ready';
}

const ASSERTIONS = ['existence_occurrence', 'completeness', 'rights_obligations', 'valuation_allocation', 'presentation_disclosure', 'accuracy', 'cutoff'];
const ASSERTION_SHORT: Record<string, string> = {
  existence_occurrence: 'E/O', completeness: 'C', rights_obligations: 'R&O', valuation_allocation: 'V/A', presentation_disclosure: 'P&D', accuracy: 'A', cutoff: 'CO',
};

const ASSURANCE: Record<Readiness['assurance'], { label: string; className: string; text: string }> = {
  unmodified: { label: 'Ready for an unmodified statement', className: 'bg-green-50 border-green-200 text-green-800', text: 'Every key control is tested and effective, with no open material weakness.' },
  qualified: { label: 'Qualified: material weakness open', className: 'bg-red-50 border-red-200 text-red-800', text: 'Open material weaknesses must be reported in the Statement of Assurance or management assessment.' },
  not_ready: { label: 'Not ready', className: 'bg-amber-50 border-amber-200 text-amber-800', text: 'Resolve the items below before signing.' },
};

interface ReadinessPanelProps {
  fiscalYear: number | null;
}

export default function ReadinessPanel({ fiscalYear }: ReadinessPanelProps) {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await financialAuditAPI.readiness(fiscalYear || undefined);
      setData(res.data?.data as Readiness);
      setError('');
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load readiness'));
    }
  }, [fiscalYear]);

  useEffect(() => { load(); }, [load]);

  const exportMatrix = async () => {
    try {
      const res = await financialAuditAPI.exportMatrix(fiscalYear || undefined);
      downloadBlob(res.data as Blob, `risk-control-matrix${fiscalYear ? `-fy${fiscalYear}` : ''}.csv`);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Export failed'));
    }
  };

  if (!data) return <><ErrorBanner message={error} /><p className="text-sm text-gray-500">Loading…</p></>;
  const status = ASSURANCE[data.assurance];
  const d = data.deficiencies;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <div className={`border rounded-lg p-4 ${status.className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{status.label}</div>
            <div className="text-sm">{status.text}</div>
          </div>
          <button type="button" className={secondaryButton} onClick={exportMatrix}>Export matrix with results (CSV)</button>
        </div>
        {data.blockers.length > 0 && (
          <ul className="list-disc ml-5 mt-3 text-sm space-y-1" role="list">
            {data.blockers.map((b) => <li key={b} role="listitem">{b}</li>)}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Key controls" value={data.totals.key_controls} hint={`${data.totals.controls} in the matrix`} />
        <StatCard label="Tested" value={data.totals.tested} />
        <StatCard label="Effective" value={data.totals.effective} tone="good" />
        <StatCard label="Ineffective" value={data.totals.ineffective} tone={data.totals.ineffective ? 'bad' : 'default'} />
        <StatCard label="Readiness" value={`${data.totals.readiness_percent}%`} tone={data.totals.readiness_percent >= 90 ? 'good' : 'warn'} hint="Key controls tested effective" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Material weaknesses" value={d.material_weaknesses.open} tone={d.material_weaknesses.open ? 'bad' : 'good'} hint={`${d.material_weaknesses.caps_overdue} CAP(s) overdue`} />
        <StatCard label="Significant deficiencies" value={d.significant_deficiencies.open} tone={d.significant_deficiencies.open ? 'warn' : 'good'} hint={`${d.significant_deficiencies.without_cap} without a CAP`} />
        <StatCard label="Control deficiencies" value={d.control_deficiencies.open} hint={`${d.control_deficiencies.without_cap} without a CAP`} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
            <tr>
              <th className="px-4 py-2">Process</th>
              <th className="px-4 py-2">Key controls</th>
              <th className="px-4 py-2">Design effective</th>
              <th className="px-4 py-2">Operating effective</th>
              <th className="px-4 py-2">Ineffective</th>
              <th className="px-4 py-2">Not tested</th>
              {ASSERTIONS.map((a) => <th key={a} className="px-2 py-2 text-center" title={humanize(a)}>{ASSERTION_SHORT[a]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.processes.length === 0 && (
              <tr><td colSpan={6 + ASSERTIONS.length} className="px-4 py-6 text-center text-gray-500">Add key controls to the risk-control matrix to see readiness by process.</td></tr>
            )}
            {data.processes.map((p) => (
              <tr key={p.process}>
                <td className="px-4 py-2 font-medium text-gray-900">{humanize(p.process)}</td>
                <td className="px-4 py-2">{p.key_controls}</td>
                <td className="px-4 py-2">{p.design_effective}</td>
                <td className="px-4 py-2 text-green-700">{p.effective}</td>
                <td className={`px-4 py-2 ${p.ineffective ? 'text-red-700 font-medium' : ''}`}>{p.ineffective}</td>
                <td className={`px-4 py-2 ${p.not_tested ? 'text-amber-700' : ''}`}>{p.not_tested}</td>
                {ASSERTIONS.map((a) => {
                  const n = data.assertion_coverage[p.process]?.[a] || 0;
                  const gap = data.assertion_gaps.some((g) => g.process === p.process && g.assertion === a);
                  return (
                    <td key={a} className={`px-2 py-2 text-center ${gap ? 'bg-red-50 text-red-700 font-semibold' : n ? 'text-gray-900' : 'text-gray-300'}`} title={gap ? 'No key control addresses this assertion' : `${n} key control(s)`}>
                      {gap ? 'gap' : n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Assertions: E/O existence or occurrence, C completeness, R&amp;O rights and obligations, V/A valuation or allocation, P&amp;D presentation and disclosure, A accuracy, CO cutoff.
        Gaps are shown for transaction cycles; IT general and entity-level controls support every assertion indirectly.
      </p>
    </div>
  );
}
