// @tier: community
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { plot4aiAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Threat {
  id: string;
  threat_name: string;
  description: string;
  category: number;
  ai_type: string | null;
  role: string | null;
  phase: string | null;
  created_at: string;
}

interface Filters {
  ai_types: string[];
  roles: string[];
  phases: string[];
}

interface Stats {
  total: number;
  by_category: Record<string, number>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<number, string> = {
  1: 'Threats to Autonomy',
  2: 'Threats to Transparency',
  3: 'Threats to Technical Robustness',
  4: 'Threats to Fairness',
};

const CATEGORY_COLORS: Record<number, { bg: string; text: string; border: string; badge: string }> = {
  1: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  2: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  3: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
  4: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
};

const DEFAULT_COLORS = { bg: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-700' };

// ─── Components ──────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: number }) {
  const c = CATEGORY_COLORS[category] || DEFAULT_COLORS;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.badge}`}>
      {CATEGORY_LABELS[category] || `Category ${category}`}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Plot4aiPage() {
  const [threats, setThreats] = useState<Threat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedAiType, setSelectedAiType] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedPhase, setSelectedPhase] = useState('');
  const [expandedThreats, setExpandedThreats] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      if (selectedCategory) params.category = selectedCategory;
      if (selectedAiType) params.aitype = selectedAiType;
      if (selectedRole) params.role = selectedRole;
      if (selectedPhase) params.phase = selectedPhase;

      const [threatsRes, statsRes, filtersRes] = await Promise.all([
        plot4aiAPI.getThreats(params),
        plot4aiAPI.getStats(),
        plot4aiAPI.getFilters(),
      ]);

      setThreats(threatsRes.data?.data || []);
      setStats(statsRes.data?.data || null);
      setFilters(filtersRes.data?.data || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load threat library';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedAiType, selectedRole, selectedPhase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleThreat = (id: string) => {
    setExpandedThreats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedAiType('');
    setSelectedRole('');
    setSelectedPhase('');
  };

  const hasActiveFilters = !!(searchQuery || selectedCategory || selectedAiType || selectedRole || selectedPhase);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🃏 AI Threat Library — PLOT4ai</h1>
          <p className="text-gray-600 mt-1">
            Explore AI-specific threats based on the PLOT4ai framework. Identify risks across autonomy,
            transparency, robustness, and fairness dimensions of your AI systems.
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Total Threats" value={stats.total} />
            {Object.entries(stats.by_category).map(([cat, count]) => (
              <StatCard
                key={cat}
                label={CATEGORY_LABELS[Number(cat)] || `Category ${cat}`}
                value={count}
              />
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Search threats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={selectedAiType}
              onChange={(e) => setSelectedAiType(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All AI Types</option>
              {filters?.ai_types?.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Roles</option>
              {filters?.roles?.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={selectedPhase}
              onChange={(e) => setSelectedPhase(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Phases</option>
              {filters?.phases?.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">Loading threat library...</span>
          </div>
        )}

        {/* Threat List */}
        {!loading && !error && threats.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 text-lg">No threats found</p>
            <p className="text-gray-400 text-sm mt-1">
              {hasActiveFilters
                ? 'Try adjusting your filters.'
                : 'The PLOT4ai threat table has not been seeded yet. Run the seed script to populate threats.'}
            </p>
          </div>
        )}

        {!loading && threats.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Showing {threats.length} threat{threats.length !== 1 ? 's' : ''}
            </p>
            {threats.map((threat) => {
              const isExpanded = expandedThreats.has(threat.id);
              const colors = CATEGORY_COLORS[threat.category] || DEFAULT_COLORS;
              return (
                <div
                  key={threat.id}
                  className={`bg-white rounded-lg border ${colors.border} overflow-hidden`}
                >
                  <button
                    onClick={() => toggleThreat(threat.id)}
                    className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {threat.threat_name}
                          </h3>
                          <CategoryBadge category={threat.category} />
                        </div>
                        {!isExpanded && threat.description && (
                          <p className="text-sm text-gray-500 mt-1 truncate">
                            {threat.description}
                          </p>
                        )}
                      </div>
                      <span className="text-gray-400 ml-2 flex-shrink-0">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className={`px-4 pb-4 border-t ${colors.border}`}>
                      {threat.description && (
                        <p className="text-sm text-gray-700 mt-3 leading-relaxed whitespace-pre-wrap">
                          {threat.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                        {threat.ai_type && (
                          <span><strong>AI Type:</strong> {threat.ai_type}</span>
                        )}
                        {threat.role && (
                          <span><strong>Role:</strong> {threat.role}</span>
                        )}
                        {threat.phase && (
                          <span><strong>Phase:</strong> {threat.phase}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
