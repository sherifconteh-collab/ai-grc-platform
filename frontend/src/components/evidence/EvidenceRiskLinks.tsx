'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { evidenceAPI } from '@/lib/api';

/**
 * The register risks a document supports.
 *
 * The reading end of migration 149. Evidence has been linkable to controls
 * since migration 009/014, so a document's relationship to a risk was only
 * reachable transitively -- and only when the risk happened to have controls
 * linked and those controls happened to carry this document.
 *
 * Read-only: linking is owned by the risk, matching every other risk link, so
 * exactly one screen writes the relationship.
 */

const RELEVANCE_LABELS: Record<string, string> = {
  assessment: 'Assessment',
  treatment: 'Treatment',
  monitoring: 'Monitoring',
  acceptance: 'Acceptance',
};

const RELEVANCE_STYLES: Record<string, string> = {
  assessment: 'bg-blue-100 text-blue-700',
  treatment: 'bg-purple-100 text-purple-700',
  monitoring: 'bg-green-100 text-green-700',
  acceptance: 'bg-amber-100 text-amber-800',
};

const SEVERITY_BANDS: Array<{ min: number; label: string; className: string }> = [
  { min: 15, label: 'Critical', className: 'bg-red-100 text-red-700' },
  { min: 10, label: 'High', className: 'bg-orange-100 text-orange-700' },
  { min: 5, label: 'Medium', className: 'bg-yellow-100 text-yellow-700' },
  { min: 1, label: 'Low', className: 'bg-green-100 text-green-700' },
];

// Scores are likelihood x impact on a 1-5 scale, so 1-25.
function band(score: number | null) {
  if (score === null || score === undefined) {
    return { label: 'Unscored', className: 'bg-gray-100 text-gray-600' };
  }
  return SEVERITY_BANDS.find((entry) => score >= entry.min)
    ?? { label: 'Low', className: 'bg-green-100 text-green-700' };
}

interface SupportedRisk {
  id: string;
  risk_id: string;
  relevance: string;
  notes: string | null;
  title: string;
  category: string;
  status: string;
  inherent_score: number | null;
  residual_score: number | null;
}

interface EvidenceRiskLinksProps {
  evidenceId: string;
}

export default function EvidenceRiskLinks({ evidenceId }: EvidenceRiskLinksProps) {
  const [risks, setRisks] = useState<SupportedRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await evidenceAPI.getRisks(evidenceId);
      const data = res.data?.data ?? [];
      setRisks(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError('Could not load supported risks.');
    } finally {
      setLoading(false);
    }
  }, [evidenceId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Supports Risks</h3>
        <Link href="/dashboard/risks" className="text-xs text-purple-600 hover:text-purple-800 font-medium">
          Risk register →
        </Link>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : risks.length === 0 ? (
        <p className="text-xs text-gray-500">
          Not attached to any risk. Attach it from the risk in the{' '}
          <Link href="/dashboard/risks" className="text-purple-600 hover:underline">
            register
          </Link>{' '}
          — linking it to a control shows the control exists, not that a particular
          risk is under management.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {risks.map((row) => {
            const residual = band(row.residual_score);
            return (
              <li key={row.id} role="listitem" className="border border-gray-200 rounded-lg p-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/risks/${row.risk_id}`}
                    className="text-sm font-medium text-gray-900 hover:text-purple-700 truncate"
                  >
                    {row.title}
                  </Link>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${residual.className}`}>
                    {residual.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded ${
                    RELEVANCE_STYLES[row.relevance] || 'bg-gray-100 text-gray-600'
                  }`}>
                    {RELEVANCE_LABELS[row.relevance] ?? row.relevance}
                  </span>
                  <span className="capitalize">{row.category.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span className="capitalize">{row.status.replace(/_/g, ' ')}</span>
                </div>
                {row.notes && <p className="mt-1 text-xs text-gray-600">{row.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
