'use client';

import { useCallback, useEffect, useState } from 'react';
import { rmfInheritanceAPI, type LeveragedAuthorizationInput } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LeveragedAuthorization {
  id: string;
  rmf_package_id: string;
  cots_product_id: string;
  inheritance_type: 'full' | 'partial' | 'hybrid';
  status: 'active' | 'pending' | 'expired' | 'revoked';
  authorization_reference: string | null;
  inherited_controls: string[];
  provider_responsibilities: string | null;
  customer_responsibilities: string | null;
  review_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  product_name: string;
  vendor_name: string;
  product_type: string | null;
  lifecycle_status: string | null;
  support_end_date: string | null;
  authorization_status: string | null;
  authorization_impact_level: string | null;
  external_authorization_id: string | null;
  created_by_name: string | null;
  at_risk: boolean;
  created_at: string;
  updated_at: string;
}

interface EligibleCotsProduct {
  id: string;
  product_name: string;
  vendor_name: string;
  product_type: string | null;
  lifecycle_status: string | null;
  system_id: string | null;
  support_end_date: string | null;
  authorization_status: string | null;
  authorization_impact_level: string | null;
  external_authorization_id: string | null;
}

interface LeveragedAuthorizationsProps {
  packageId: string;
  canWrite: boolean;
  onChanged: () => void;
}

interface AddFormState {
  cots_product_id: string;
  inheritance_type: 'full' | 'partial' | 'hybrid';
  status: 'active' | 'pending' | 'expired' | 'revoked';
  inherited_controls: string;
  provider_responsibilities: string;
  customer_responsibilities: string;
  authorization_reference: string;
  review_date: string;
  expiration_date: string;
  notes: string;
}

const EMPTY_ADD_FORM: AddFormState = {
  cots_product_id: '',
  inheritance_type: 'partial',
  status: 'active',
  inherited_controls: '',
  provider_responsibilities: '',
  customer_responsibilities: '',
  authorization_reference: '',
  review_date: '',
  expiration_date: '',
  notes: '',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const INHERITANCE_BADGES: Record<string, { label: string; color: string }> = {
  full: { label: 'Full Inheritance', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Partial Inheritance', color: 'bg-blue-100 text-blue-700' },
  hybrid: { label: 'Hybrid', color: 'bg-purple-100 text-purple-700' },
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  expired: { label: 'Expired', color: 'bg-orange-100 text-orange-700' },
  revoked: { label: 'Revoked', color: 'bg-red-100 text-red-700' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function splitControlIds(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).map(c => c.trim().toUpperCase()).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LeveragedAuthorizations({ packageId, canWrite, onChanged }: LeveragedAuthorizationsProps) {
  const [links, setLinks] = useState<LeveragedAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const [eligibleProducts, setEligibleProducts] = useState<EligibleCotsProduct[]>([]);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [exporting, setExporting] = useState<'pdf' | 'csv' | 'oscal' | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      const res = await rmfInheritanceAPI.getLeveragedAuthorizations(packageId);
      setLinks(res.data?.data || []);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to load leveraged authorizations'));
    }
  }, [packageId]);

  useEffect(() => {
    setLoading(true);
    setError('');
    loadLinks().finally(() => setLoading(false));
  }, [loadLinks]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openAddModal = async () => {
    setFormError('');
    setAddForm(EMPTY_ADD_FORM);
    setShowAdd(true);
    try {
      const res = await rmfInheritanceAPI.getEligibleCotsProducts(packageId);
      setEligibleProducts(res.data?.data || []);
    } catch (err: unknown) {
      setFormError(extractErrorMessage(err, 'Failed to load eligible COTS products'));
      setEligibleProducts([]);
    }
  };

  const handleAdd = async () => {
    if (!addForm.cots_product_id) {
      setFormError('Select a COTS product to link');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const payload: LeveragedAuthorizationInput = {
        cots_product_id: addForm.cots_product_id,
        inheritance_type: addForm.inheritance_type,
        status: addForm.status,
        authorization_reference: addForm.authorization_reference.trim() || null,
        inherited_controls: splitControlIds(addForm.inherited_controls),
        provider_responsibilities: addForm.provider_responsibilities.trim() || null,
        customer_responsibilities: addForm.customer_responsibilities.trim() || null,
        review_date: addForm.review_date || null,
        expiration_date: addForm.expiration_date || null,
        notes: addForm.notes.trim() || null,
      };
      await rmfInheritanceAPI.createLeveragedAuthorization(packageId, payload);
      setShowAdd(false);
      setAddForm(EMPTY_ADD_FORM);
      await loadLinks();
      onChanged();
    } catch (err: unknown) {
      setFormError(extractErrorMessage(err, 'Failed to add leveraged authorization'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (link: LeveragedAuthorization) => {
    if (!confirm(`Remove the leveraged authorization for ${link.product_name}? This cannot be undone.`)) return;
    setError('');
    try {
      await rmfInheritanceAPI.deleteLeveragedAuthorization(packageId, link.id);
      await loadLinks();
      onChanged();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to remove leveraged authorization'));
    }
  };

  const handleExportCrmPdf = async () => {
    setExporting('pdf');
    setError('');
    try {
      const res = await rmfInheritanceAPI.downloadCrmReportPdf(packageId);
      triggerBlobDownload(res.data as Blob, `crm-${packageId}.pdf`);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to export CRM PDF'));
    } finally {
      setExporting(null);
    }
  };

  const handleExportCrmCsv = async () => {
    setExporting('csv');
    setError('');
    try {
      const res = await rmfInheritanceAPI.downloadCrmReportCsv(packageId);
      triggerBlobDownload(res.data as Blob, `crm-${packageId}.csv`);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to export CRM CSV'));
    } finally {
      setExporting(null);
    }
  };

  const handleExportOscal = async () => {
    setExporting('oscal');
    setError('');
    try {
      const res = await rmfInheritanceAPI.downloadOscalSsp(packageId);
      triggerBlobDownload(res.data as Blob, `oscal-ssp-${packageId}.json`);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to export OSCAL SSP'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Leveraged Authorizations</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Controls inherited from COTS / SaaS products (FedRAMP-style leveraged authorization)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCrmPdf}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'Export CRM (PDF)'}
          </button>
          <button
            onClick={handleExportCrmCsv}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CRM (CSV)'}
          </button>
          <button
            onClick={handleExportOscal}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
          >
            {exporting === 'oscal' ? 'Exporting…' : 'Export OSCAL SSP'}
          </button>
          {canWrite && (
            <button
              onClick={openAddModal}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-6 text-center">Loading leveraged authorizations…</div>
      ) : links.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center">
          No leveraged authorizations recorded for this package yet.
        </div>
      ) : (
        <ul role="list" className="space-y-3">
          {links.map(link => {
            const inheritanceBadge = INHERITANCE_BADGES[link.inheritance_type] || {
              label: link.inheritance_type,
              color: 'bg-gray-100 text-gray-700',
            };
            const statusBadge = STATUS_BADGES[link.status] || { label: link.status, color: 'bg-gray-100 text-gray-700' };
            const isExpanded = expanded.has(link.id);
            return (
              <li
                key={link.id}
                role="listitem"
                className={`p-4 rounded-lg border ${link.at_risk ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{link.product_name}</p>
                    <p className="text-xs text-gray-500">{link.vendor_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-label={`Inheritance type: ${inheritanceBadge.label}`}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${inheritanceBadge.color}`}
                    >
                      {inheritanceBadge.label}
                    </span>
                    <span
                      aria-label={`Status: ${statusBadge.label}`}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge.color}`}
                    >
                      {statusBadge.label}
                    </span>
                    {link.at_risk && (
                      <span
                        aria-label="At risk"
                        className="px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-900"
                      >
                        ⚠ At Risk
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                  <button
                    onClick={() => toggleExpanded(link.id)}
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Hide' : 'Show'} {link.inherited_controls.length} inherited control
                    {link.inherited_controls.length === 1 ? '' : 's'}
                  </button>
                  {link.authorization_reference && <span>Reference: {link.authorization_reference}</span>}
                  <span>Expires: {formatDate(link.expiration_date)}</span>
                </div>

                {isExpanded && (
                  <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Inherited control identifiers">
                    {link.inherited_controls.length === 0 ? (
                      <span className="text-xs text-gray-400">No control identifiers listed.</span>
                    ) : (
                      link.inherited_controls.map(controlId => (
                        <span
                          key={controlId}
                          aria-label={`Inherited control ${controlId}`}
                          className="px-2 py-0.5 rounded bg-white border border-gray-200 text-xs font-mono text-gray-700"
                        >
                          {controlId}
                        </span>
                      ))
                    )}
                  </div>
                )}

                {canWrite && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleRemove(link)}
                      className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showAdd && (
        <AddLeveragedAuthorizationModal
          form={addForm}
          setForm={setAddForm}
          eligibleProducts={eligibleProducts}
          submitting={submitting}
          error={formError}
          onSubmit={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
interface AddModalProps {
  form: AddFormState;
  setForm: React.Dispatch<React.SetStateAction<AddFormState>>;
  eligibleProducts: EligibleCotsProduct[];
  submitting: boolean;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}

function AddLeveragedAuthorizationModal({
  form,
  setForm,
  eligibleProducts,
  submitting,
  error,
  onSubmit,
  onClose,
}: AddModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Add Leveraged Authorization</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">COTS / SaaS Product *</label>
            <select
              value={form.cots_product_id}
              onChange={e => setForm(f => ({ ...f, cots_product_id: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a product…</option>
              {eligibleProducts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.product_name} — {p.vendor_name}{p.authorization_status ? ` — ${p.authorization_status}` : ''}
                </option>
              ))}
            </select>
            {eligibleProducts.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">No eligible COTS products available to link.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inheritance Type</label>
              <select
                value={form.inheritance_type}
                onChange={e => setForm(f => ({ ...f, inheritance_type: e.target.value as AddFormState['inheritance_type'] }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="full">Full</option>
                <option value="partial">Partial</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as AddFormState['status'] }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inherited Controls</label>
            <textarea
              value={form.inherited_controls}
              onChange={e => setForm(f => ({ ...f, inherited_controls: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., AC-2, AC-3, SC-7 (comma or whitespace separated)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Authorization Reference</label>
            <input
              type="text"
              value={form.authorization_reference}
              onChange={e => setForm(f => ({ ...f, authorization_reference: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., FedRAMP authorization ID"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review Date</label>
              <input
                type="date"
                value={form.review_date}
                onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
              <input
                type="date"
                value={form.expiration_date}
                onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider Responsibilities</label>
            <textarea
              value={form.provider_responsibilities}
              onChange={e => setForm(f => ({ ...f, provider_responsibilities: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="Controls the provider is responsible for..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Responsibilities</label>
            <textarea
              value={form.customer_responsibilities}
              onChange={e => setForm(f => ({ ...f, customer_responsibilities: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="Controls the customer organization is responsible for..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add Leveraged Authorization'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
