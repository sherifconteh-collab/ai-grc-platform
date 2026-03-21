// @tier: enterprise
'use client';

import { useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ragAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RagDocument {
  source_id: string;
  source_name: string;
  source_type: string;
  chunk_count: number;
  indexed_at: string;
}

interface RagStats {
  total_documents: number;
  total_chunks: number;
  source_types: Record<string, number>;
}

interface SearchResult {
  content: string;
  source_name: string;
  source_type: string;
  similarity: number;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [stats, setStats] = useState<RagStats | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'documents' | 'index'>('search');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Index state
  const [indexText, setIndexText] = useState('');
  const [indexSourceName, setIndexSourceName] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexSuccess, setIndexSuccess] = useState('');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [docsRes, statsRes] = await Promise.all([
        ragAPI.listDocuments().catch(() => ({ data: { data: [] } })),
        ragAPI.getStats().catch(() => ({ data: { data: null } })),
      ]);
      setDocuments(docsRes.data?.data || []);
      setStats(statsRes.data?.data || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError('');
    setSearchResults([]);
    try {
      const res = await ragAPI.search({ query: searchQuery, top_k: 10 });
      setSearchResults(res.data?.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleIndexText = async () => {
    if (!indexText.trim() || !indexSourceName.trim()) return;
    setIndexing(true);
    setError('');
    setIndexSuccess('');
    try {
      await ragAPI.indexText({ text: indexText, source_name: indexSourceName });
      setIndexSuccess(`Successfully indexed "${indexSourceName}"`);
      setIndexText('');
      setIndexSourceName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Indexing failed');
    } finally {
      setIndexing(false);
    }
  };

  const handleRemoveDocument = async (sourceId: string, sourceType?: string) => {
    try {
      await ragAPI.removeDocument(sourceId, sourceType);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to remove document:', err);
      setError(err instanceof Error ? err.message : 'Could not remove document.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📚 Knowledge Base</h1>
          <p className="text-gray-600 mt-1">
            RAG-powered document search — index compliance documents and search them with AI-powered semantic search.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {indexSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-sm">{indexSuccess}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            {(['search', 'documents', 'index'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === 'documents') fetchDocuments();
                }}
                className={`py-2 px-1 border-b-2 text-sm font-medium capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'index' ? 'Index Content' : tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Ask a question about your compliance documents..."
                className="flex-1 border border-gray-300 rounded-md px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{searchResults.length} results found</p>
                {searchResults.map((result, i) => (
                  <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-blue-600">{result.source_name}</span>
                      <span className="text-xs text-gray-400">{result.source_type}</span>
                      <span className="text-xs text-gray-400">
                        {(result.similarity * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{result.content}</p>
                  </div>
                ))}
              </div>
            )}

            {!searching && searchResults.length === 0 && searchQuery && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No results found. Try a different query.</p>
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                <span className="ml-3 text-gray-600">Loading documents...</span>
              </div>
            ) : documents.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No documents indexed yet.</p>
                <p className="text-gray-400 text-sm mt-1">Use the Index Content tab to add documents.</p>
              </div>
            ) : (
              <>
                {stats && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Documents</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.total_documents}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Chunks</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.total_chunks}</p>
                    </div>
                  </div>
                )}
                {documents.map((doc) => (
                  <div key={doc.source_id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{doc.source_name}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Type: {doc.source_type} · {doc.chunk_count} chunks · Indexed: {new Date(doc.indexed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveDocument(doc.source_id, doc.source_type)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Index Tab */}
        {activeTab === 'index' && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Name</label>
              <input
                type="text"
                value={indexSourceName}
                onChange={(e) => setIndexSourceName(e.target.value)}
                placeholder="e.g., NIST 800-53 Control Guidance"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                value={indexText}
                onChange={(e) => setIndexText(e.target.value)}
                rows={10}
                placeholder="Paste compliance document content here..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleIndexText}
              disabled={indexing || !indexText.trim() || !indexSourceName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {indexing ? 'Indexing...' : 'Index Content'}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
