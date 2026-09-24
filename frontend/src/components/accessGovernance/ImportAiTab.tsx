'use client';

import { useCallback, useEffect, useState } from 'react';
import StructuredOutput from '@/components/ai/StructuredOutput';
import type { RbacAnalysisData, RbacSuggestedRole, RbacSuggestedSodRule } from '@/components/ai/StructuredOutput';
import { accessGovernanceAPI, aiAPI, rolesAPI } from '@/lib/api';

type DocumentType = 'roles_matrix' | 'sod_matrix' | 'roles_responsibilities' | 'other';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  roles_matrix: 'Roles matrix',
  sod_matrix: 'SoD matrix',
  roles_responsibilities: 'Roles & responsibilities',
  other: 'Other',
};

interface RbacDocument {
  id: string;
  file_name: string;
  document_type: DocumentType;
  file_size_bytes: number | null;
  uploaded_by_email: string | null;
  analysis: RbacAnalysisData | null;
  analyzed_at: string | null;
  created_at: string;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadForm({ canManage, busy, onUpload }: {
  canManage: boolean;
  busy: boolean;
  onUpload: (file: File, documentType: DocumentType) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('other');

  if (!canManage) return null;

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <p className="text-sm text-gray-600">
        Upload your own role definitions, SoD matrix, or roles &amp; responsibilities document
        (PDF, DOCX, TXT, MD, or CSV, up to 10 MB). AI will extract the roles it describes, map
        them onto this platform&apos;s permissions, and flag separation-of-duties conflicts.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <label htmlFor="rbac-doc-type" className="text-sm text-gray-700">Type</label>
        <select
          id="rbac-doc-type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as DocumentType)}
          className="border rounded-md px-2 py-1 text-sm"
        >
          {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((type) => (
            <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>
          ))}
        </select>
        <button
          onClick={() => file && onUpload(file, documentType)}
          disabled={busy || !file}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300"
        >
          {busy ? 'Uploading...' : 'Upload'}
        </button>
      </div>
    </div>
  );
}

function AnalysisPanel({ document, canManage, onSaved, onApplyRole, onApplySodRule }: {
  document: RbacDocument;
  canManage: boolean;
  onSaved: () => void;
  onApplyRole: (role: RbacSuggestedRole) => Promise<void>;
  onApplySodRule: (rule: RbacSuggestedSodRule) => Promise<void>;
}) {
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [structured, setStructured] = useState<RbacAnalysisData | null>(document.analysis);
  const [appliedRoles, setAppliedRoles] = useState<Set<string>>(new Set());
  const [appliedRules, setAppliedRules] = useState<Set<string>>(new Set());

  const runAnalysis = async () => {
    try {
      setRunning(true);
      setError('');
      const response = await aiAPI.rbacAnalysis(document.id);
      const payload = response.data?.data;
      setRawResult(typeof payload?.result === 'string' ? payload.result : JSON.stringify(payload?.result ?? {}));
      setStructured((payload?.structured as RbacAnalysisData) ?? null);
    } catch (analyzeError) {
      setError(apiErrorMessage(analyzeError, 'Analysis failed.'));
    } finally {
      setRunning(false);
    }
  };

  const saveAnalysis = async () => {
    if (!structured) return;
    try {
      setSaving(true);
      setError('');
      await accessGovernanceAPI.saveRbacAnalysis(document.id, structured as unknown as Record<string, unknown>);
      onSaved();
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Failed to save analysis.'));
    } finally {
      setSaving(false);
    }
  };

  const applyRole = async (role: RbacSuggestedRole) => {
    try {
      setError('');
      await onApplyRole(role);
      setAppliedRoles((current) => new Set(current).add(role.name));
    } catch (applyError) {
      setError(apiErrorMessage(applyError, 'Failed to create role.'));
    }
  };

  const applySodRule = async (rule: RbacSuggestedSodRule) => {
    try {
      setError('');
      await onApplySodRule(rule);
      setAppliedRules((current) => new Set(current).add(rule.name));
    } catch (applyError) {
      setError(apiErrorMessage(applyError, 'Failed to create SoD rule.'));
    }
  };

  return (
    <div className="border-t border-gray-100 mt-3 pt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <button
            onClick={runAnalysis}
            disabled={running}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:bg-gray-300"
          >
            {running ? 'Analyzing...' : structured ? 'Re-analyze with AI' : 'Analyze with AI'}
          </button>
        )}
        {canManage && structured && (
          <button
            onClick={saveAnalysis}
            disabled={saving}
            className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-md hover:bg-gray-50 disabled:text-gray-400"
          >
            {saving ? 'Saving...' : 'Save analysis'}
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      {rawResult && (
        <StructuredOutput content={rawResult} feature="rbac_analysis" showActions={false} />
      )}
      {!rawResult && structured && (
        <StructuredOutput content={JSON.stringify(structured)} feature="rbac_analysis" showActions={false} />
      )}

      {canManage && structured?.suggested_platform_roles && structured.suggested_platform_roles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {structured.suggested_platform_roles.map((role) => (
            <button
              key={role.name}
              onClick={() => applyRole(role)}
              disabled={appliedRoles.has(role.name)}
              className="px-3 py-1.5 text-xs rounded-md border border-green-300 text-green-700 hover:bg-green-50 disabled:text-gray-400 disabled:border-gray-200"
            >
              {appliedRoles.has(role.name) ? `Created "${role.name}"` : `Create role "${role.name}"`}
            </button>
          ))}
        </div>
      )}

      {canManage && structured?.suggested_sod_rules && structured.suggested_sod_rules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {structured.suggested_sod_rules.map((rule) => (
            <button
              key={rule.name}
              onClick={() => applySodRule(rule)}
              disabled={appliedRules.has(rule.name)}
              className="px-3 py-1.5 text-xs rounded-md border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:text-gray-400 disabled:border-gray-200"
            >
              {appliedRules.has(rule.name) ? `Created SoD rule "${rule.name}"` : `Create SoD rule "${rule.name}"`}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Suggestions are never applied automatically — each action above makes an explicit, reviewed
        create call through the existing role and SoD-rule management APIs.
      </p>
    </div>
  );
}

export default function ImportAiTab({ canManage }: { canManage: boolean }) {
  const [documents, setDocuments] = useState<RbacDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await accessGovernanceAPI.getRbacDocuments();
      setDocuments(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch {
      setError('Failed to load RBAC documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const uploadDocument = async (file: File, documentType: DocumentType) => {
    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', documentType);
      await accessGovernanceAPI.uploadRbacDocument(formData);
      await loadDocuments();
    } catch (uploadError) {
      setError(apiErrorMessage(uploadError, 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    try {
      setError('');
      await accessGovernanceAPI.deleteRbacDocument(documentId);
      await loadDocuments();
    } catch (deleteError) {
      setError(apiErrorMessage(deleteError, 'Failed to delete document.'));
    }
  };

  const applyRole = async (role: RbacSuggestedRole) => {
    await rolesAPI.create({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions,
    });
  };

  const applySodRule = async (rule: RbacSuggestedSodRule) => {
    await accessGovernanceAPI.createSodRule({
      name: rule.name,
      description: rule.description,
      conflictingPermissions: rule.conflicting_permissions,
      severity: (rule.severity as 'low' | 'medium' | 'high' | 'critical') || 'medium',
    });
  };

  if (loading) return <p className="text-gray-500 py-8">Loading RBAC documents...</p>;

  return (
    <div className="space-y-6">
      <UploadForm canManage={canManage} busy={uploading} onUpload={uploadDocument} />
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Uploaded documents ({documents.length})</h3>
        </div>
        {documents.length === 0 && (
          <p className="px-4 py-6 text-gray-500 text-sm">No documents uploaded yet.</p>
        )}
        <div className="divide-y divide-gray-100">
          {documents.map((document) => (
            <div key={document.id} className="px-4 py-3">
              <button
                type="button"
                className="w-full flex items-start justify-between gap-3 text-left"
                aria-expanded={expandedId === document.id}
                onClick={() => setExpandedId(expandedId === document.id ? null : document.id)}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{document.file_name}</p>
                  <p className="text-xs text-gray-500">
                    {DOCUMENT_TYPE_LABELS[document.document_type]} &middot; {formatBytes(document.file_size_bytes)}
                    {document.uploaded_by_email ? ` · ${document.uploaded_by_email}` : ''}
                    {document.analyzed_at ? ' · analyzed' : ' · not yet analyzed'}
                  </p>
                </div>
                <span className="text-gray-400 text-xs mt-1" aria-hidden="true">
                  {expandedId === document.id ? '▲' : '▼'}
                </span>
              </button>
              {expandedId === document.id && (
                <AnalysisPanel
                  document={document}
                  canManage={canManage}
                  onSaved={loadDocuments}
                  onApplyRole={applyRole}
                  onApplySodRule={applySodRule}
                />
              )}
              {canManage && expandedId === document.id && (
                <button
                  onClick={() => deleteDocument(document.id)}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  Delete document
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
