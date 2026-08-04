'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cmdbAPI, organizationAPI } from '@/lib/api';
import type { AssetControlComplianceStatus } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Which controls apply to an asset, and whether the asset satisfies them.
 *
 * `asset_control_mappings` has existed since migration 005 -- a table, an
 * org-scoped unique constraint, and until now nothing that reads or writes it.
 * This is the only place in the product that creates one, so it is deliberately
 * writable rather than a read-only view.
 *
 * The compliance status recorded here is the asset's own, not the control's.
 * A control can be implemented at the organization level and still be
 * non-compliant on one particular server, which is exactly the disagreement
 * worth being able to record.
 */

const STATUS_OPTIONS: Array<{ value: AssetControlComplianceStatus; label: string; className: string }> = [
  { value: 'not_assessed', label: 'Not assessed', className: 'bg-gray-100 text-gray-600' },
  { value: 'compliant', label: 'Compliant', className: 'bg-green-100 text-green-700' },
  { value: 'partially_compliant', label: 'Partial', className: 'bg-yellow-100 text-yellow-700' },
  { value: 'non_compliant', label: 'Non-compliant', className: 'bg-red-100 text-red-700' },
  { value: 'not_applicable', label: 'N/A', className: 'bg-blue-100 text-blue-700' },
];

function statusStyle(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0];
}

interface MappedControl {
  id: string;
  control_id: string;
  compliance_status: string;
  notes: string | null;
  last_assessed: string | null;
  next_assessment: string | null;
  control_ref: string;
  control_title: string;
  framework_code: string | null;
  framework_name: string | null;
}

interface ControlOption {
  id: string;
  control_id: string;
  title: string;
  framework_name?: string | null;
}

interface AssetControlLinksProps {
  assetId: string;
  canWrite: boolean;
}

export default function AssetControlLinks({ assetId, canWrite }: AssetControlLinksProps) {
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? '';
  const [mappings, setMappings] = useState<MappedControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [catalog, setCatalog] = useState<ControlOption[]>([]);
  const [choice, setChoice] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cmdbAPI.assetControls.list(assetId);
      const data = res.data?.data ?? [];
      setMappings(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError('Could not load mapped controls.');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { load(); }, [load]);

  // The catalog comes from the organization's activated frameworks rather than
  // every control that exists: mapping an asset to a control the organization
  // is not pursuing produces a row nothing will ever report on.
  const loadCatalog = useCallback(async () => {
    if (!organizationId) return;
    try {
      const res = await organizationAPI.getControls(organizationId, { limit: 500 });
      const data = res.data?.data ?? res.data ?? [];
      setCatalog(Array.isArray(data) ? data : []);
    } catch {
      setError('Could not load the control catalog.');
    }
  }, [organizationId]);

  useEffect(() => {
    if (adding && catalog.length === 0) loadCatalog();
  }, [adding, catalog.length, loadCatalog]);

  const mappedIds = useMemo(
    () => new Set(mappings.map((row) => row.control_id)),
    [mappings]
  );

  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog
      .filter((item) => !mappedIds.has(item.id))
      .filter((item) => !term
        || (item.control_id || '').toLowerCase().includes(term)
        || (item.title || '').toLowerCase().includes(term))
      .slice(0, 100);
  }, [catalog, mappedIds, search]);

  const attach = async () => {
    if (!choice) return;
    setBusy(true); setError('');
    try {
      await cmdbAPI.assetControls.create(assetId, { control_id: choice });
      setChoice(''); setSearch(''); setAdding(false);
      await load();
    } catch {
      setError('Could not map that control.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (controlId: string, status: AssetControlComplianceStatus) => {
    setBusy(true); setError('');
    try {
      await cmdbAPI.assetControls.update(assetId, controlId, { compliance_status: status });
      await load();
    } catch {
      setError('Could not update that mapping.');
    } finally {
      setBusy(false);
    }
  };

  const detach = async (controlId: string) => {
    setBusy(true); setError('');
    try {
      await cmdbAPI.assetControls.remove(assetId, controlId);
      await load();
    } catch {
      setError('Could not remove that mapping.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Mapped Controls</h3>
        {canWrite && organizationId && (
          <button
            onClick={() => setAdding((open) => !open)}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            {adding ? 'Cancel' : '+ Map a control'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {adding && (
        <div className="border border-gray-200 rounded-lg p-3 mb-3 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search controls by reference or title"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              aria-label="Control to map to this asset"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="">Select a control…</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.control_id} — {item.title}
                </option>
              ))}
            </select>
            <button
              onClick={attach}
              disabled={!choice || busy}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              Map
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : mappings.length === 0 ? (
        <p className="text-xs text-gray-500">
          No controls mapped to this asset. An asset with no mapped controls is
          outside the compliance picture entirely — it is not covered by
          anything, and nothing reports on it.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {mappings.map((row) => {
            const style = statusStyle(row.compliance_status);
            return (
              <li key={row.id} role="listitem" className="border border-gray-200 rounded-lg p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.control_ref} — {row.control_title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.framework_code || row.framework_name || 'framework not set'}
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        value={row.compliance_status}
                        onChange={(e) => changeStatus(row.control_id, e.target.value as AssetControlComplianceStatus)}
                        disabled={busy}
                        aria-label={`Compliance status for ${row.control_ref} on this asset`}
                        className={`text-xs rounded px-1.5 py-0.5 border-0 ${style.className}`}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => detach(row.control_id)}
                        disabled={busy}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${style.className}`}>
                      {style.label}
                    </span>
                  )}
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
