'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { risksAPI, tprmAPI } from '@/lib/api';

/**
 * Third parties a risk arises from.
 *
 * The writing end of migration 148. `tprm_vendors.risk_tier` already existed,
 * but that is a static classification set at onboarding -- "this is a critical
 * supplier" -- not a scored, treated and reviewed risk with a likelihood, an
 * impact and an owner. Without this link, vendor concentration was invisible to
 * the register and the register was invisible during a vendor review.
 *
 * The vendor's own `risk_tier` is shown next to the link so the two can be
 * compared: a "low" tier vendor carrying a critical register entry is exactly
 * the disagreement worth surfacing rather than smoothing over.
 */

const TIER_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

interface LinkedVendor {
  id: string;
  vendor_id: string;
  notes: string | null;
  name: string;
  vendor_type: string | null;
  risk_tier: string | null;
  review_status: string | null;
  data_access_level: string | null;
}

interface VendorOption {
  id: string;
  name: string;
  risk_tier?: string | null;
}

interface RiskVendorLinksProps {
  riskId: string;
  linked: LinkedVendor[];
  canWrite: boolean;
  onChanged: () => void;
}

export default function RiskVendorLinks({
  riskId, linked, canWrite, onChanged,
}: RiskVendorLinksProps) {
  const [adding, setAdding] = useState(false);
  const [catalog, setCatalog] = useState<VendorOption[]>([]);
  const [choice, setChoice] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCatalog = useCallback(async () => {
    try {
      const res = await tprmAPI.getVendors();
      const data = res.data?.data ?? res.data ?? [];
      setCatalog(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load the vendor list.');
    }
  }, []);

  useEffect(() => {
    if (adding && catalog.length === 0) loadCatalog();
  }, [adding, catalog.length, loadCatalog]);

  const linkedIds = useMemo(
    () => new Set(linked.map((row) => row.vendor_id)),
    [linked]
  );

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog
      .filter((item) => !linkedIds.has(item.id))
      .filter((item) => !term || (item.name || '').toLowerCase().includes(term))
      .slice(0, 100);
  }, [catalog, linkedIds, search]);

  const link = async () => {
    if (!choice) return;
    setBusy(true); setError('');
    try {
      await risksAPI.linkVendor(riskId, { vendorId: choice });
      setChoice(''); setSearch(''); setAdding(false);
      onChanged();
    } catch {
      setError('Could not link that vendor.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (vendorId: string) => {
    setBusy(true); setError('');
    try {
      await risksAPI.unlinkVendor(riskId, vendorId);
      onChanged();
    } catch {
      setError('Could not unlink that vendor.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Vendors</h2>
        {canWrite && (
          <button
            onClick={() => setAdding((open) => !open)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            {adding ? 'Cancel' : '+ Link vendor'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors by name"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              aria-label="Vendor this risk arises from"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="">Select a vendor…</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.risk_tier ? ` (${item.risk_tier} tier)` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={link}
              disabled={!choice || busy}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              Link
            </button>
          </div>
        </div>
      )}

      {linked.length === 0 ? (
        <p className="text-sm text-gray-400">
          No vendors linked. A vendor&apos;s onboarding risk tier is not a scored risk —
          if this exposure comes from a third party, record it here.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {linked.map((row) => (
            <li key={row.id} role="listitem" className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="text-gray-900 font-medium truncate">{row.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {row.risk_tier && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      TIER_STYLES[row.risk_tier] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {row.risk_tier} tier
                    </span>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => unlink(row.vendor_id)}
                      disabled={busy}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Unlink
                    </button>
                  )}
                </div>
              </div>
              <span className="block text-xs text-gray-400">
                {row.vendor_type ? row.vendor_type.replace(/_/g, ' ') : 'type not set'}
                {row.review_status && ` · ${row.review_status.replace(/_/g, ' ')}`}
                {row.data_access_level && ` · ${row.data_access_level} data access`}
              </span>
              {row.notes && <p className="mt-1 text-xs text-gray-600">{row.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
