'use client';

import { useCallback, useEffect, useState } from 'react';
import { policiesAPI } from '@/lib/api';
import {
  errorMessage,
  formatDate,
  FrameworkOption,
  primaryButton,
  secondaryButton,
} from './policyShared';

interface PolicyUpload {
  id: string;
  file_name: string;
  file_size: number | null;
  processing_status: string;
  processing_error: string | null;
  upload_date: string;
  is_baseline: boolean;
  uploaded_by_email: string | null;
  linked_policy_name: string | null;
}

interface ControlGap {
  id: string;
  control_code: string;
  control_title: string;
  gap_type: string;
  gap_severity: string;
  gap_description: string | null;
  recommended_action: string | null;
}

interface GapAnalysis {
  id: string;
  framework_name: string;
  analysis_date: string;
  total_controls_analyzed: number;
  controls_covered: number;
  controls_with_gaps: number;
  coverage_percentage: string | number | null;
  gaps: ControlGap[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-700',
};

interface PolicyDocumentsTabProps {
  frameworks: FrameworkOption[];
  canWrite: boolean;
}

export default function PolicyDocumentsTab({ frameworks, canWrite }: PolicyDocumentsTabProps) {
  const [uploads, setUploads] = useState<PolicyUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedUpload, setSelectedUpload] = useState<PolicyUpload | null>(null);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<GapAnalysis[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await policiesAPI.listUploads();
      setUploads((res.data?.data || []) as PolicyUpload[]);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load policy documents'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (frameworks.length && selectedFrameworks.length === 0) {
      setSelectedFrameworks(frameworks.map((f) => f.id));
    }
  }, [frameworks, selectedFrameworks.length]);

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await policiesAPI.upload(file);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const openUpload = async (upload: PolicyUpload) => {
    setSelectedUpload(upload);
    setAnalyses([]);
    try {
      const res = await policiesAPI.getUploadGaps(upload.id);
      setAnalyses((res.data?.data?.analyses || res.data?.data || []) as GapAnalysis[]);
    } catch {
      setAnalyses([]);
    }
  };

  const analyze = async () => {
    if (!selectedUpload || selectedFrameworks.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await policiesAPI.analyzeUpload(selectedUpload.id, selectedFrameworks);
      await openUpload(selectedUpload);
      await load();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Gap analysis failed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleFramework = (id: string) => {
    setSelectedFrameworks((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 max-w-2xl">
          Upload an existing policy document (PDF, DOC, DOCX or TXT, up to 10 MB) and compare it against your
          frameworks to find the controls it does not yet address.
        </p>
        {canWrite && (
          <label className={`${primaryButton} cursor-pointer`}>
            {busy ? 'Working…' : 'Upload document'}
            <input type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" onChange={onUpload} disabled={busy} />
          </label>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
            <tr>
              <th className="px-4 py-2">Document</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Uploaded</th>
              <th className="px-4 py-2">Linked policy</th>
              <th className="px-4 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>}
            {!loading && uploads.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No policy documents uploaded yet.</td></tr>
            )}
            {uploads.map((upload) => (
              <tr key={upload.id} className={selectedUpload?.id === upload.id ? 'bg-blue-50' : ''}>
                <td className="px-4 py-2 font-medium text-gray-900">
                  {upload.file_name}
                  {upload.is_baseline && <span className="ml-2 text-xs text-blue-700">(baseline)</span>}
                </td>
                <td className="px-4 py-2 text-gray-700">{upload.processing_status}</td>
                <td className="px-4 py-2 text-gray-700">{formatDate(upload.upload_date)}</td>
                <td className="px-4 py-2 text-gray-700">{upload.linked_policy_name || '-'}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" className="text-blue-600 hover:underline" onClick={() => openUpload(upload)}>
                    Gap analysis
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUpload && (
        <section className="bg-white border border-gray-200 rounded-lg p-4" aria-labelledby="gap-heading">
          <h2 id="gap-heading" className="text-base font-semibold text-gray-900 mb-3">Gap analysis: {selectedUpload.file_name}</h2>
          {canWrite && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-700 mb-2">Compare against</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {frameworks.map((f) => (
                  <label key={f.id} htmlFor={`gap-fw-${f.id}`} className="flex items-center gap-1 text-sm border border-gray-200 rounded px-2 py-1">
                    <input id={`gap-fw-${f.id}`} type="checkbox" checked={selectedFrameworks.includes(f.id)} onChange={() => toggleFramework(f.id)} />
                    {f.name}
                  </label>
                ))}
              </div>
              <button type="button" className={primaryButton} disabled={busy || selectedFrameworks.length === 0} onClick={analyze}>
                {busy ? 'Analyzing…' : 'Run gap analysis'}
              </button>
            </div>
          )}
          {analyses.length === 0 && <p className="text-sm text-gray-500">No analysis has been run for this document yet.</p>}
          {analyses.map((analysis) => (
            <div key={analysis.id} className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{analysis.framework_name}</h3>
                <span className="text-xs text-gray-500">{formatDate(analysis.analysis_date)}</span>
              </div>
              <div className="mt-2 mb-3 flex items-center gap-3">
                <div
                  className="flex-1 h-2 bg-gray-100 rounded"
                  role="progressbar"
                  aria-label={`${analysis.framework_name} coverage`}
                  aria-valuenow={Number(analysis.coverage_percentage || 0)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-2 bg-green-500 rounded" style={{ width: `${Math.min(100, Number(analysis.coverage_percentage || 0))}%` }} />
                </div>
                <span className="text-sm text-gray-700">
                  {Number(analysis.coverage_percentage || 0).toFixed(0)}% covered ({analysis.controls_covered}/{analysis.total_controls_analyzed})
                </span>
              </div>
              <ul role="list" className="space-y-2 max-h-80 overflow-y-auto">
                {analysis.gaps.slice(0, 100).map((gap) => (
                  <li role="listitem" key={gap.id} className="text-sm border border-gray-100 rounded p-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_STYLES[gap.gap_severity] || SEVERITY_STYLES.low}`} aria-label={`Severity ${gap.gap_severity}`}>
                        {gap.gap_severity}
                      </span>
                      <span className="font-medium text-gray-900">{gap.control_code}</span>
                      <span className="text-gray-700">{gap.control_title}</span>
                    </div>
                    {gap.recommended_action && <p className="text-xs text-gray-600 mt-1">{gap.recommended_action}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className={`${secondaryButton} mt-4`} onClick={() => setSelectedUpload(null)}>Close</button>
        </section>
      )}
    </div>
  );
}

