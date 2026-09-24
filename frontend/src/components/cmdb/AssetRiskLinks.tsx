'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cmdbAPI } from '@/lib/api';

/**
 * The risks an asset is exposed to.
 *
 * `risk_asset_links` and its write side (POST/DELETE /risks/:id/assets) shipped
 * with migration 140, but only the risk half was ever reachable: you could
 * attach an asset while editing a risk and then never see it again from the
 * asset. An asset owner asks the question in the opposite direction -- "what is
 * this exposed to?" -- so this is the read side of the same link.
 *
 * Deliberately read-only. Linking stays on the risk detail page so one screen
 * owns the relationship; duplicating the write here would mean two places to
 * keep consistent for no new capability.
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

interface LinkedRisk {
  id: string;
  title: string;
  category: string;
  status: string;
  inherent_score: number | null;
  residual_score: number | null;
  next_review_date: string | null;
}

interface AssetRiskLinksProps {
  assetId: string;
}

export default function AssetRiskLinks({ assetId }: AssetRiskLinksProps) {
  const [risks, setRisks] = useState<LinkedRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.assetRisks.list(assetId);
      const data = res.data?.data ?? [];
      setRisks(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError('Could not load linked risks.');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Risk Exposure</h3>
        <Link href="/dashboard/risks" className="text-xs text-purple-600 hover:text-purple-800 font-medium">
          Risk register →
        </Link>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : risks.length === 0 ? (
        <p className="text-xs text-gray-500">
          No risks linked to this asset. Attach it from a risk in the{' '}
          <Link href="/dashboard/risks" className="text-purple-600 hover:underline">
            risk register
          </Link>{' '}
          — an asset with no recorded exposure is an unassessed asset, not a safe one.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {risks.map((risk) => {
            const residual = band(risk.residual_score);
            return (
              <li key={risk.id} role="listitem" className="border border-gray-200 rounded-lg p-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/risks/${risk.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-purple-700 truncate"
                  >
                    {risk.title}
                  </Link>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${residual.className}`}>
                    {residual.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="capitalize">{risk.category.replace(/_/g, ' ')}</span>
                  <span>·</span>
                  <span className="capitalize">{risk.status.replace(/_/g, ' ')}</span>
                  {/* Both scores are shown because migration 140 stores both on
                      purpose: residual alone hides how much treatment achieved. */}
                  <span>·</span>
                  <span aria-label="inherent then residual score">
                    inherent {risk.inherent_score ?? '—'} → residual {risk.residual_score ?? '—'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
