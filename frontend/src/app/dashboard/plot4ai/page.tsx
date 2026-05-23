// @tier: community
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { plot4aiAPI } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Plot4aiCategory {
  id: number;
  name: string;
  colour: string;
  cardCount: number;
}

interface Plot4aiThreat {
  question: string;
  threatif: string;
  label: string;
  aitypes: string[];
  roles: string[];
  explanation: string;
  recommendation: string;
  sources: string;
  categories: string[];
  phases: string[];
  categoryId: number;
  categoryName: string;
  categoryColour: string;
}

interface Plot4aiFilters {
  categories: Plot4aiCategory[];
  aiTypes: string[];
  roles: string[];
  phases: string[];
}

interface Plot4aiStats {
  totalThreats: number;
  totalCategories: number;
  byCategory: Plot4aiCategory[];
  byAiType: { type: string; count: number }[];
  byRole: { role: string; count: number }[];
  byPhase: { phase: string; count: number }[];
  source: string;
  license: string;
  website: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PHASE_ICONS: Record<string, string> = {
  Design: '📐',
  Input: '📥',
  Model: '🧠',
  Output: '📤',
  Deploy: '🚀',
  Monitor: '📡',
};

function renderMarkdownLinks(text: string) {
  if (!text) return null;
  // Split on markdown links [text](url)
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      return (
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">
          {match[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownField({ label, text }: { label: string; text: string }) {
  return (
    <p>
      <strong className="text-gray-400">{label}:</strong>{' '}
      <span className="whitespace-pre-line">{renderMarkdownLinks(text)}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Plot4aiPage() {
  const [threats, setThreats] = useState<Plot4aiThreat[]>([]);
  const [filters, setFilters] = useState<Plot4aiFilters | null>(null);
  const [stats, setStats] = useState<Plot4aiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active filters
  const [selectedCategory, setSelectedCategory] = useState<number | ''>('');
  const [selectedAiType, setSelectedAiType] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedPhase, setSelectedPhase] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Expanded card
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Debounce search input to avoid firing API calls on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadFilters = useCallback(async () => {
    try {
      const [filtersRes, statsRes] = await Promise.all([
        plot4aiAPI.getFilters(),
        plot4aiAPI.getStats(),
      ]);
      setFilters(filtersRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      // Filters are optional — page still works without them
    }
  }, []);

  const loadThreats = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string | number> = {};
      if (selectedCategory !== '') params.category = selectedCategory;
      if (selectedAiType) params.aitype = selectedAiType;
      if (selectedRole) params.role = selectedRole;
      if (selectedPhase) params.phase = selectedPhase;
      if (debouncedSearch) params.search = debouncedSearch;

      const res = await plot4aiAPI.getThreats(params as Parameters<typeof plot4aiAPI.getThreats>[0]);
      setThreats(res.data.data);
    } catch {
      setError('Failed to load PLOT4ai threat library. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedAiType, selectedRole, selectedPhase, debouncedSearch]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadThreats();
  }, [loadThreats]);

  const resetFilters = () => {
    setSelectedCategory('');
    setSelectedAiType('');
    setSelectedRole('');
    setSelectedPhase('');
    setSearchTerm('');
  };

  const hasActiveFilters = selectedCategory !== '' || selectedAiType || selectedRole || selectedPhase || searchTerm;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              🃏 AI Threat Library
              <span className="text-sm font-normal text-gray-400">(PLOT4ai)</span>
            </h1>
            <p className="text-gray-400 mt-1">
              Browse 138 AI threat cards to identify privacy and security risks in your AI systems.
              <a
                href="https://plot4.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 ml-1"
              >
                Learn more →
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
              className="px-3 py-2 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              {viewMode === 'cards' ? '📋 Table View' : '🃏 Card View'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-2xl font-bold text-white">{stats.totalThreats}</p>
              <p className="text-sm text-gray-400">Total Threats</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-2xl font-bold text-white">{stats.totalCategories}</p>
              <p className="text-sm text-gray-400">Categories</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-2xl font-bold text-white">{stats.byAiType.length}</p>
              <p className="text-sm text-gray-400">AI Types</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <p className="text-2xl font-bold text-white">{stats.byPhase.length}</p>
              <p className="text-sm text-gray-400">Lifecycle Phases</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Filters</h2>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-purple-400 hover:text-purple-300">
                Clear all filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Search */}
            <div>
              <input
                type="text"
                placeholder="Search threats…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            {/* Category */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : '')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Categories</option>
                {filters?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.cardCount})
                  </option>
                ))}
              </select>
            </div>
            {/* AI Type */}
            <div>
              <select
                value={selectedAiType}
                onChange={(e) => setSelectedAiType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All AI Types</option>
                {filters?.aiTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {/* Role */}
            <div>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Roles</option>
                {filters?.roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            {/* Phase */}
            <div>
              <select
                value={selectedPhase}
                onChange={(e) => setSelectedPhase(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Phases</option>
                {filters?.phases.map((p) => (
                  <option key={p} value={p}>{PHASE_ICONS[p] || '📎'} {p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-4 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-300 ml-4">✕</button>
          </div>
        )}

        {/* Results Count */}
        {!loading && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Showing {threats.length} of {stats?.totalThreats || '…'} threats
              {hasActiveFilters && <span className="text-purple-400 ml-1">(filtered)</span>}
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
            <span className="ml-3 text-gray-400">Loading threat library…</span>
          </div>
        )}

        {/* Card View */}
        {!loading && viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {threats.map((threat, idx) => {
              const isExpanded = expandedCard === idx;
              return (
                <button
                  type="button"
                  key={`${threat.categoryId}-${threat.label}-${idx}`}
                  className="bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer text-left w-full"
                  onClick={() => setExpandedCard(isExpanded ? null : idx)}
                >
                  {/* Card Header with Category Color Bar */}
                  <div
                    className="h-2 rounded-t-lg"
                    style={{ backgroundColor: `#${threat.categoryColour}` }}
                  />
                  <div className="p-4 space-y-3">
                    {/* Label & Category */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-white font-semibold text-sm leading-tight">{threat.label}</h3>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: `#${threat.categoryColour}20`,
                          color: `#${threat.categoryColour}`,
                          border: `1px solid #${threat.categoryColour}40`,
                        }}
                      >
                        {threat.categoryName}
                      </span>
                    </div>

                    {/* Question */}
                    <p className="text-gray-300 text-sm italic">&ldquo;{threat.question}&rdquo;</p>

                    {/* Threat Condition */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Threat if:</span>
                      <span className="text-xs px-2 py-0.5 bg-red-900/30 text-red-400 rounded-full border border-red-800">
                        {threat.threatif}
                      </span>
                    </div>

                    {/* Tags row */}
                    <div className="flex flex-wrap gap-1.5">
                      {threat.aitypes.map((t) => (
                        <span key={t} className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded-full border border-blue-800">
                          {t}
                        </span>
                      ))}
                      {threat.roles.map((r) => (
                        <span key={r} className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full border border-green-800">
                          {r}
                        </span>
                      ))}
                    </div>

                    {/* Phases */}
                    <div className="flex flex-wrap gap-1.5">
                      {threat.phases.map((p) => (
                        <span key={p} className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                          {PHASE_ICONS[p] || '📎'} {p}
                        </span>
                      ))}
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-700 space-y-4">
                        {/* Explanation */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Explanation</h4>
                          <p className="text-sm text-gray-300 whitespace-pre-line">{threat.explanation}</p>
                        </div>

                        {/* Recommendation */}
                        {threat.recommendation && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Recommendation</h4>
                            <div className="text-sm text-gray-300 whitespace-pre-line">{renderMarkdownLinks(threat.recommendation)}</div>
                          </div>
                        )}

                        {/* Sources */}
                        {threat.sources && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Sources</h4>
                            <div className="text-sm text-gray-300">{renderMarkdownLinks(threat.sources)}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expand hint */}
                    <p className="text-xs text-gray-500 text-center">
                      {isExpanded ? '▲ Click to collapse' : '▼ Click to expand'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {!loading && viewMode === 'table' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-700/50">
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Threat</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Category</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Question</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">AI Types</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Roles</th>
                    <th className="text-left px-4 py-3 text-gray-300 font-medium">Phases</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {threats.map((threat, idx) => (
                    <tr
                      key={`${threat.categoryId}-${threat.label}-${idx}`}
                      className="hover:bg-gray-700/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedCard(expandedCard === idx ? null : idx)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${threat.categoryColour}` }} />
                          <span className="text-white font-medium">{threat.label}</span>
                        </div>
                        {expandedCard === idx && (
                          <div className="mt-2 space-y-2 text-gray-300 text-xs">
                            <p><strong className="text-gray-400">Explanation:</strong> {threat.explanation}</p>
                            {threat.recommendation && <MarkdownField label="Recommendation" text={threat.recommendation} />}
                            {threat.sources && <MarkdownField label="Sources" text={threat.sources} />}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `#${threat.categoryColour}20`,
                            color: `#${threat.categoryColour}`,
                          }}
                        >
                          {threat.categoryName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{threat.question}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {threat.aitypes.map((t) => (
                            <span key={t} className="text-xs px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {threat.roles.map((r) => (
                            <span key={r} className="text-xs px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {threat.phases.map((p) => (
                            <span key={p} className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                              {PHASE_ICONS[p] || ''} {p}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && threats.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-gray-400 text-lg">No threats match your filters</p>
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span>📈</span>
            <div>
              <div className="font-medium text-purple-800">AI Insights</div>
              <div className="text-purple-600">Gap analysis, forecast, audit readiness, risk heatmap</div>
            </div>
          </Link>
          <Link href="/dashboard/threat-intel"
            className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs">
            <span>🎯</span>
            <div>
              <div className="font-medium text-orange-800">Threat Intelligence</div>
              <div className="text-orange-600">Active threat indicators & feeds</div>
            </div>
          </Link>
        </div>

        {/* Attribution Footer */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
          <p className="text-xs text-gray-500">
            Threat data sourced from{' '}
            <a href="https://plot4.ai/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
              PLOT4ai — Practical Library Of Threats 4 Artificial Intelligence
            </a>
            {' '}· Licensed under{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
              CC BY-SA 4.0
            </a>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
