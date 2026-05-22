// @tier: enterprise
'use client';

import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ragAPI } from '@/lib/api';

interface IndexedDocument {
  source_type: string;
  source_id: string;
  source_name: string;
  chunk_count: number;
  status: string;
  indexed_at: string;
}

interface SearchResult {
  chunkText: string;
  sourceName: string;
  sourceType: string;
  similarity: number;
}

interface RagStats {
  documentCount: number;
  totalChunks: number;
  lastIndexedAt: string | null;
}

export default function KnowledgeBasePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [stats, setStats] = useState<RagStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadSourceName, setUploadSourceName] = useState('');
  const [uploadSourceType, setUploadSourceType] = useState('document');

  // Text indexing state
  const [textMode, setTextMode] = useState(false);
  const [indexText, setIndexText] = useState('');
  const [textSourceName, setTextSourceName] = useState('');
  const [textIndexing, setTextIndexing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function loadData() {
    setLoading(true);
    try {
      const [docsRes, statsRes] = await Promise.all([
        ragAPI.listDocuments(),
        ragAPI.getStats()
      ]);
      setDocuments(docsRes.data?.data || []);
      setStats(statsRes.data?.data || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load knowledge base';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (uploadSourceName) formData.append('source_name', uploadSourceName);
      formData.append('source_type', uploadSourceType);
      await ragAPI.indexFile(formData);
      setToast(`Indexed "${file.name}" successfully`);
      setUploadSourceName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleTextIndex() {
    if (!indexText.trim() || indexText.trim().length < 50) {
      setError('Text must be at least 50 characters.');
      return;
    }
    setTextIndexing(true);
    setError('');
    try {
      await ragAPI.indexText({
        text: indexText,
        source_name: textSourceName || 'Manual Entry',
        source_type: uploadSourceType
      });
      setToast('Text indexed successfully');
      setIndexText('');
      setTextSourceName('');
      loadData();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Indexing failed';
      setError(msg);
    } finally {
      setTextIndexing(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError('');
    try {
      const res = await ragAPI.search({ query: searchQuery, top_k: 5 });
      setSearchResults(res.data?.data || []);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Search failed';
      setError(msg);
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete(sourceId: string, sourceType?: string) {
    try {
      await ragAPI.removeDocument(sourceId, sourceType);
      setToast('Document removed');
      setDeleteId(null);
      loadData();
    } catch {
      setError('Failed to remove document');
    }
  }

  const sourceTypeLabel = (type: string) => {
    const labels: Record<string, string> = { document: '📄 Document', evidence: '📎 Evidence', policy: '📋 Policy', control_narrative: '📝 Narrative' };
    return labels[type] || `📄 ${type}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
            <p className="text-gray-500 mt-1">Index documents for AI-powered retrieval (RAG). Indexed content enriches every AI analysis with your organization&apos;s own policies, evidence, and procedures.</p>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{toast}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-2xl font-bold text-purple-600">{stats.documentCount}</div>
              <div className="text-sm text-gray-500 mt-1">Indexed Documents</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-2xl font-bold text-purple-600">{stats.totalChunks}</div>
              <div className="text-sm text-gray-500 mt-1">Total Chunks</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-2xl font-bold text-purple-600">
                {stats.lastIndexedAt ? new Date(stats.lastIndexedAt).toLocaleDateString() : '—'}
              </div>
              <div className="text-sm text-gray-500 mt-1">Last Indexed</div>
            </div>
          </div>
        )}

        {/* Upload / Index Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Add to Knowledge Base</h2>
            <button
              onClick={() => setTextMode(!textMode)}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              {textMode ? '📁 Upload File' : '📝 Paste Text'}
            </button>
          </div>

          {!textMode ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Name (optional)</label>
                  <input
                    type="text"
                    value={uploadSourceName}
                    onChange={e => setUploadSourceName(e.target.value)}
                    placeholder="e.g., Security Policy v2.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
                  <select
                    value={uploadSourceType}
                    onChange={e => setUploadSourceType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="document">Document</option>
                    <option value="policy">Policy</option>
                    <option value="evidence">Evidence</option>
                    <option value="control_narrative">Control Narrative</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.doc,.docx,.csv"
                  className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                />
                <button
                  onClick={handleFileUpload}
                  disabled={uploading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {uploading ? 'Indexing…' : 'Upload & Index'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Supported: PDF, DOCX, TXT, MD, CSV (max 10 MB)</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
                  <input
                    type="text"
                    value={textSourceName}
                    onChange={e => setTextSourceName(e.target.value)}
                    placeholder="e.g., Access Control Policy"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
                  <select
                    value={uploadSourceType}
                    onChange={e => setUploadSourceType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="document">Document</option>
                    <option value="policy">Policy</option>
                    <option value="evidence">Evidence</option>
                    <option value="control_narrative">Control Narrative</option>
                  </select>
                </div>
              </div>
              <textarea
                value={indexText}
                onChange={e => setIndexText(e.target.value)}
                rows={6}
                placeholder="Paste document text here (minimum 50 characters)…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                onClick={handleTextIndex}
                disabled={textIndexing}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {textIndexing ? 'Indexing…' : 'Index Text'}
              </button>
            </div>
          )}
        </div>

        {/* Semantic Search */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Semantic Search</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search your knowledge base… (e.g., 'access control policy for privileged users')"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {searching ? 'Searching…' : '🔍 Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-3">
              {searchResults.map((result, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{result.sourceName || result.sourceType}</span>
                    <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                      {(result.similarity * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">{result.chunkText}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Indexed Documents */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Indexed Documents</h2>

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading…</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-lg mb-1">No documents indexed yet</p>
              <p className="text-sm">Upload a document above to get started. Evidence files are also auto-indexed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Chunks</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Indexed</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.source_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-900">{doc.source_name || '(unnamed)'}</td>
                      <td className="py-3">{sourceTypeLabel(doc.source_type)}</td>
                      <td className="py-3">{doc.chunk_count}</td>
                      <td className="py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          doc.status === 'indexed' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500">{new Date(doc.indexed_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        {deleteId === doc.source_id ? (
                          <div className="flex gap-2">
                            <button onClick={() => handleDelete(doc.source_id, doc.source_type)} className="text-xs text-red-600 font-semibold">Confirm</button>
                            <button onClick={() => setDeleteId(null)} className="text-xs text-gray-500">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(doc.source_id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
