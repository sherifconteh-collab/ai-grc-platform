'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { tprmAPI } from '@/lib/api';

/**
 * Register risks arising from a vendor.
 *
 * The reading end of migration 148. `tprm_vendors.risk_tier` is a static label
 * applied at onboarding; these are scored, treated and reviewed register
 * entries. The two can disagree, and that disagreement is the point: a vendor
 * tiered "low" carrying an open critical risk is what a reviewer needs to see.
 *
 * Fetches on its own rather than taking the rows as a prop, because this repo's
 * TPRM page renders the vendor modal from the list row and never calls
 * GET /tprm/vendors/:id -- which is where the risks live.
 *
 * Read-only: linking is owned by the risk detail page, matching every other
 * risk link, so exactly one screen writes the relationship.
 */

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

interface VendorRisk {
  id: string;
  risk_id: string;
  notes: string | null;
  title: string;
  category: string;
  status: string;
  inherent_score: number | null;
  residual_score: number | null;
  next_review_date: string | null;
}

interface VendorRiskLinksProps {
  vendorId: string;
  /** The vendor's onboarding tier, shown only so a contradiction is visible. */
  riskTier?: string | null;
}

export default function VendorRiskLinks({ vendorId, riskTier }: VendorRiskLinksProps) {
  const [risks, setRisks] = useState<VendorRisk[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [maxResidual, setMaxResidual] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await tprmAPI.getVendor(vendorId);
      const payload = res.data?.data ?? {};
      const rows = Array.isArray(payload.risks) ? payload.risks : [];
      setRisks(rows);
      setOpenCount(Number(payload.open_risk_count) || 0);
      setMaxResidual(
        payload.max_residual_score === null || payload.max_residual_score === undefined
          ? null
          : Number(payload.max_residual_score)
      );
      setError('');
    } catch {
      setError('Could not load register risks for this vendor.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  const worst = band(maxResidual);
  // A vendor tiered low or medium while carrying an open high/critical risk is
  // the case the tier alone would hide.
  const tierUnderstated = Boolean(
    riskTier
    && ['low', 'medium'].includes(String(riskTier).toLowerCase())
    && maxResidual !== null
    && maxResidual >= 10
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Register Risks</h3>
        <Link href="/dashboard/risks" className="text-xs text-purple-600 hover:text-purple-800 font-medium">
          Risk register →
        </Link>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : risks.length === 0 ? (
        <p className="text-xs text-gray-500">
          No register risks recorded for this vendor. The onboarding tier
          {riskTier ? ` (${riskTier})` : ''} is a classification, not an assessment —
          attach a scored risk from the{' '}
          <Link href="/dashboard/risks" className="text-purple-600 hover:underline">
            register
          </Link>.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
            <span className="text-gray-600">{openCount} open</span>
            <span className={`px-1.5 py-0.5 rounded ${worst.className}`}>
              worst residual: {worst.label}
            </span>
            {tierUnderstated && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                onboarding tier is {riskTier} — the register disagrees
              </span>
            )}
          </div>
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
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="capitalize">{row.category.replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span className="capitalize">{row.status.replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span aria-label="inherent then residual score">
                      inherent {row.inherent_score ?? '—'} → residual {row.residual_score ?? '—'}
                    </span>
                  </div>
                  {row.notes && <p className="mt-1 text-xs text-gray-600">{row.notes}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
