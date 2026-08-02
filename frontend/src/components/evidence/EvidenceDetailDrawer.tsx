'use client';

/**
 * Evidence detail: metadata, version history and integrity verification.
 *
 * Issue #570 asked for real version history because the old "versioning" was an
 * integer counter that overwrote the file in place. Migration 133 added
 * `evidence_versions` and the routes shipped -- but the issue's frontend
 * checkbox ("update the evidence frontend page to show version history and
 * allow downloading/reviewing prior versions") was never done, and the issue
 * was closed as completed anyway. EVIDENCE.md has said "Versioning has no UI
 * yet" ever since.
 *
 * Lives in its own component because evidence/page.tsx is already ~1900 lines,
 * well past the 800-line target in .claude/rules/code-review.md.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { evidenceAPI } from '@/lib/api';
import { errorMessage } from '@/lib/poamTypes';

export interface EvidenceSummary {
  id: string;
  file_name: string;
  description: string | null;
  mime_type: string;
  file_size: number;
  tags: string[];
  evidence_type: string | null;
  pii_classification: string;
  pii_types: string[];
  data_sensitivity: string;
  uploaded_at: string;
  uploaded_by_name: string;
}

interface EvidenceVersion {
  id: string;
  version_number: number;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  integrity_hash_sha256: string | null;
  description: string | null;
  tags: string[] | null;
  evidence_type: string | null;
  pii_classification: string | null;
  pii_types: string[] | null;
  data_sensitivity: string | null;
  change_note: string | null;
  superseded_by_email?: string | null;
  created_at: string;
}

interface IntegrityResult {
  matches: boolean;
  expected_hash: string | null;
  current_hash: string | null;
  previous_verified_at: string | null;
}

const PII_CLASSIFICATIONS = ['none', 'low', 'moderate', 'high', 'critical'];
const DATA_SENSITIVITIES = ['public', 'internal', 'confidential', 'restricted'];

interface EvidenceDetailDrawerProps {
  evidence: EvidenceSummary;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function EvidenceDetailDrawer({
  evidence, canWrite, onClose, onChanged,
}: EvidenceDetailDrawerProps) {
  const [tab, setTab] = useState<'metadata' | 'versions' | 'integrity'>('metadata');
  const [versions, setVersions] = useState<EvidenceVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    description: evidence.description || '',
    tags: (evidence.tags || []).join(', '),
    evidence_type: evidence.evidence_type || '',
    pii_classification: evidence.pii_classification || 'none',
    data_sensitivity: evidence.data_sensitivity || 'internal',
    change_note: '',
  });

  const loadVersions = useCallback(async () => {
    try {
      setLoadingVersions(true);
      const res = await evidenceAPI.getVersions(evidence.id);
      setVersions(res.data?.data || []);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load version history'));
    } finally {
      setLoadingVersions(false);
    }
  }, [evidence.id]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const handleSaveMetadata = async () => {
    try {
      setSaving(true);
      setError('');
      // The change note is what makes the resulting history entry legible --
      // the backend snapshots the pre-update row into evidence_versions, so a
      // note here is the only explanation a later reader gets.
      await evidenceAPI.update(evidence.id, {
        description: form.description,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        evidence_type: form.evidence_type || undefined,
        pii_classification: form.pii_classification,
        data_sensitivity: form.data_sensitivity,
        change_note: form.change_note.trim() || undefined,
      });
      setForm({ ...form, change_note: '' });
      setToast('Metadata saved as a new version');
      await loadVersions();
      onChanged();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to save metadata'));
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceFile = async () => {
    if (!replaceFile) return;
    try {
      setSaving(true);
      setError('');
      const formData = new FormData();
      formData.append('file', replaceFile);
      if (form.change_note.trim()) formData.append('change_note', form.change_note.trim());
      await evidenceAPI.createVersion(evidence.id, formData);
      setReplaceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setForm({ ...form, change_note: '' });
      setToast('New version uploaded; the superseded file and its hash are retained');
      await loadVersions();
      onChanged();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to upload new version'));
    } finally {
      setSaving(false);
    }
  };

  const handleIntegrityCheck = async () => {
    try {
      setCheckingIntegrity(true);
      setError('');
      const res = await evidenceAPI.integrityCheck(evidence.id);
      setIntegrity(res.data?.data || null);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to verify integrity'));
      setIntegrity(null);
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const downloadBlob = (data: BlobPart, filename: string) => {
    const url = URL.createObjectURL(new Blob([data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadVersion = async (version: EvidenceVersion) => {
    try {
      const res = await evidenceAPI.downloadVersion(evidence.id, version.version_number);
      downloadBlob(res.data, version.file_name || `${evidence.file_name}.v${version.version_number}`);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to download that version'));
    }
  };

  const handleDownloadCurrent = async () => {
    try {
      const res = await evidenceAPI.download(evidence.id);
      downloadBlob(res.data, evidence.file_name);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to download the file'));
    }
  };

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'metadata', label: 'Metadata' },
    { id: 'versions', label: `Version history${versions.length ? ` (${versions.length})` : ''}` },
    { id: 'integrity', label: 'Integrity' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Evidence detail">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{evidence.file_name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {(evidence.file_size / 1024).toFixed(0)} KB · uploaded {new Date(evidence.uploaded_at).toLocaleDateString()}
              {evidence.uploaded_by_name && ` by ${evidence.uploaded_by_name}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="border-b border-gray-200 px-6">
          <nav className="-mb-px flex space-x-6" aria-label="Evidence detail sections">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setTab(entry.id)}
                className={`pb-3 pt-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === entry.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-6 py-4 space-y-4">
          {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
          {toast && <div role="status" className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded text-sm">{toast}</div>}

          {tab === 'metadata' && (
            <>
              <div className="flex justify-end">
                <button onClick={handleDownloadCurrent} className="text-sm text-purple-600 hover:text-purple-800">
                  Download current file
                </button>
              </div>

              <div>
                <label htmlFor="evidence-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  id="evidence-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={!canWrite}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label htmlFor="evidence-tags" className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                <input
                  id="evidence-tags"
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  disabled={!canWrite}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="evidence-pii" className="block text-sm font-medium text-gray-700 mb-1">PII classification</label>
                  <select
                    id="evidence-pii"
                    value={form.pii_classification}
                    onChange={(e) => setForm({ ...form, pii_classification: e.target.value })}
                    disabled={!canWrite}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {PII_CLASSIFICATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="evidence-sensitivity" className="block text-sm font-medium text-gray-700 mb-1">Data sensitivity</label>
                  <select
                    id="evidence-sensitivity"
                    value={form.data_sensitivity}
                    onChange={(e) => setForm({ ...form, data_sensitivity: e.target.value })}
                    disabled={!canWrite}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {DATA_SENSITIVITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              </div>

              {canWrite && (
                <>
                  <div>
                    <label htmlFor="evidence-change-note" className="block text-sm font-medium text-gray-700 mb-1">
                      Change note
                    </label>
                    <input
                      id="evidence-change-note"
                      type="text"
                      value={form.change_note}
                      onChange={(e) => setForm({ ...form, change_note: e.target.value })}
                      placeholder="Why this changed — recorded against the superseded version."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Saving snapshots the current values into version history first, so nothing is lost.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveMetadata}
                      disabled={saving}
                      className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save metadata'}
                    </button>
                  </div>

                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <h3 className="text-sm font-medium text-gray-900">Replace the file</h3>
                    <p className="text-xs text-gray-500">
                      The superseded file and its hash are retained, so integrity stays demonstrable across
                      the replacement.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      aria-label="Replacement file"
                      onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleReplaceFile}
                        disabled={saving || !replaceFile}
                        className="px-4 py-2 text-sm border border-purple-300 text-purple-700 rounded-md hover:bg-purple-50 disabled:opacity-50"
                      >
                        {saving ? 'Uploading...' : 'Upload as new version'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'versions' && (
            loadingVersions ? (
              <p className="text-sm text-gray-500">Loading version history...</p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-gray-400">
                No superseded versions yet. The current file is version 1; editing metadata or replacing
                the file will record the previous state here.
              </p>
            ) : (
              <ul role="list" className="divide-y divide-gray-100">
                {versions.map((version) => (
                  <li key={version.id} role="listitem" className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          Version {version.version_number}
                          {version.file_name && <span className="font-normal text-gray-600"> — {version.file_name}</span>}
                        </p>
                        {version.change_note && (
                          <p className="text-sm text-gray-700 mt-0.5">{version.change_note}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          {/* Showing the classification as it was is the point:
                              before migration 133 a reclassification destroyed
                              the record of what it had been while relied on. */}
                          PII: {version.pii_classification || 'not set'}
                          {version.data_sensitivity && ` · ${version.data_sensitivity}`}
                          {version.file_size ? ` · ${(version.file_size / 1024).toFixed(0)} KB` : ''}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Superseded {new Date(version.created_at).toLocaleString()}
                          {version.superseded_by_email && ` by ${version.superseded_by_email}`}
                        </p>
                        {version.integrity_hash_sha256 && (
                          <p className="text-xs text-gray-400 font-mono truncate" title={version.integrity_hash_sha256}>
                            sha256 {version.integrity_hash_sha256.slice(0, 24)}…
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDownloadVersion(version)}
                        className="text-xs text-purple-600 hover:text-purple-800 shrink-0"
                      >
                        Download
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {tab === 'integrity' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Recomputes the file&apos;s SHA-256 and compares it against the hash recorded at upload.
                A mismatch means the stored file has changed since it was accepted as evidence.
              </p>
              <button
                onClick={handleIntegrityCheck}
                disabled={checkingIntegrity}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {checkingIntegrity ? 'Verifying...' : 'Verify integrity'}
              </button>

              {integrity && (
                <div
                  className={`border rounded-md p-3 text-sm ${
                    integrity.matches
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                  role="status"
                >
                  <p className="font-medium">
                    {integrity.matches
                      ? 'Verified — the file matches the hash recorded at upload.'
                      : 'Mismatch — the stored file does not match the hash recorded at upload.'}
                  </p>
                  <dl className="mt-2 space-y-1 text-xs font-mono break-all">
                    <div>
                      <dt className="inline text-gray-600">expected: </dt>
                      <dd className="inline">{integrity.expected_hash || 'none recorded'}</dd>
                    </div>
                    <div>
                      <dt className="inline text-gray-600">current: </dt>
                      <dd className="inline">{integrity.current_hash || 'unavailable'}</dd>
                    </div>
                  </dl>
                  {integrity.previous_verified_at && (
                    <p className="text-xs mt-2 font-sans">
                      Previously verified {new Date(integrity.previous_verified_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
