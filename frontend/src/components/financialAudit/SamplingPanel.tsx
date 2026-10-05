'use client';

import { useState } from 'react';
import { financialAuditAPI, type ControlFrequency } from '@/lib/api';
import { errorMessage, inputClass, primaryButton } from '@/components/financialAudit/auditShared';
import { ErrorBanner, humanize } from '@/components/financialAudit/auditShared';

const FREQUENCIES: ControlFrequency[] = ['annual', 'quarterly', 'monthly', 'weekly', 'daily', 'recurring'];
const TABLE: Record<string, [number, number, number]> = {
  annual: [1, 1, 1], quarterly: [2, 2, 2], monthly: [2, 2, 3], weekly: [5, 10, 15], daily: [20, 30, 40], recurring: [25, 45, 60],
};

interface StatResult { sample_size: number; unadjusted_sample_size: number; allowed_deviations: number; basis: string }

export default function SamplingPanel() {
  const [form, setForm] = useState({ confidence: '95', tolerable: '5', expected: '0', population: '' });
  const [result, setResult] = useState<StatResult | null>(null);
  const [error, setError] = useState('');

  const calculate = async () => {
    setError('');
    try {
      const res = await financialAuditAPI.statisticalSampleSize({
        confidence_level: Number(form.confidence),
        tolerable_rate: Number(form.tolerable),
        expected_rate: Number(form.expected),
        population: form.population ? Number(form.population) : undefined,
      });
      setResult(res.data?.data as StatResult);
    } catch (err: unknown) {
      setResult(null);
      setError(errorMessage(err, 'Could not calculate'));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold text-gray-900 mb-1">Frequency table (manual controls)</h2>
        <p className="text-xs text-gray-600 mb-3">ControlWeave defaults following common audit practice; override the size on any test. Automated controls are tested with one instance per configured scenario when IT general controls are effective.</p>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs font-semibold text-gray-600 uppercase"><tr><th className="py-1">Frequency</th><th>Low risk</th><th>Moderate</th><th>High risk</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {FREQUENCIES.map((f) => (
              <tr key={f}><td className="py-1">{f === 'recurring' ? 'Multiple times a day' : humanize(f)}</td>{TABLE[f].map((n, i) => <td key={i}>{n}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="font-semibold text-gray-900 mb-1">Statistical attribute sampling</h2>
        <p className="text-xs text-gray-600 mb-3">Smallest sample whose upper deviation limit stays within the tolerable rate at the chosen confidence, from the binomial distribution. A population under a few thousand items gets a finite population correction.</p>
        <ErrorBanner message={error} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Confidence %<input className={inputClass} type="number" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} /></label>
          <label>Tolerable deviation %<input className={inputClass} type="number" value={form.tolerable} onChange={(e) => setForm({ ...form, tolerable: e.target.value })} /></label>
          <label>Expected deviation %<input className={inputClass} type="number" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} /></label>
          <label>Population (optional)<input className={inputClass} type="number" value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} /></label>
        </div>
        <button type="button" className={`${primaryButton} mt-3`} onClick={calculate}>Calculate</button>
        {result && (
          <div className="mt-4 text-sm" role="status">
            <div className="text-3xl font-semibold text-gray-900">{result.sample_size}</div>
            <div className="text-gray-600">items; the control fails if more than {result.allowed_deviations} deviation(s) are found.</div>
            <div className="text-xs text-gray-500 mt-1">{result.basis}</div>
          </div>
        )}
      </section>
    </div>
  );
}
