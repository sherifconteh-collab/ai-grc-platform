// @tier: free
'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { aiAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AIResult {
  result?: string | Record<string, unknown>;
  [key: string]: unknown;
}

type FeatureKey =
  | 'gap_analysis'
  | 'crosswalk_optimizer'
  | 'compliance_forecast'
  | 'regulatory_monitor'
  | 'risk_heatmap'
  | 'shadow_it'
  | 'asset_control_mapping'
  | 'training_recommendations'
  | 'ai_governance_check';

interface Feature {
  key: FeatureKey;
  label: string;
  icon: string;
  description: string;
  frameworks: string[];
  category: 'compliance' | 'risk' | 'ai' | 'operations';
  run: () => Promise<{ data: { data?: AIResult } }>;
}

interface MemoryStats {
  totalEntries: number;
  distinctFeatures: number;
  oldestEntry: string | null;
  newestEntry: string | null;
  retentionDays: number;
}

interface MemoryEntry {
  id: string;
  feature: string;
  input_summary: string;
  output_summary: string;
  key_findings: string;
  keywords: string;
  created_at: string;
}

interface BoosterStatus {
  enabled: boolean;
  parallelAgents: number;
  autoRouting: boolean;
  recentMetrics: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    avgSuccessDurationMs: number | null;
  };
  availableSwarms: number;
  features: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resultToText(data: AIResult | string | null): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  const r = (data as AIResult).result;
  if (typeof r === 'string') return r;
  if (r) return JSON.stringify(r, null, 2);
  return JSON.stringify(data, null, 2);
}

const CATEGORY_COLORS: Record<string, string> = {
  compliance: 'bg-blue-50 border-blue-200 text-blue-800',
  risk: 'bg-red-50 border-red-200 text-red-800',
  ai: 'bg-purple-50 border-purple-200 text-purple-800',
  operations: 'bg-green-50 border-green-200 text-green-800',
};

const CATEGORY_BADGE: Record<string, string> = {
  compliance: 'bg-blue-100 text-blue-700',
  risk: 'bg-red-100 text-red-700',
  ai: 'bg-purple-100 text-purple-700',
  operations: 'bg-green-100 text-green-700',
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AIAnalysisPage() {
  const [results, setResults] = useState<Partial<Record<FeatureKey, string>>>({});
  const [loading, setLoading] = useState<Partial<Record<FeatureKey, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<FeatureKey, string>>>({});
  const [expanded, setExpanded] = useState<Partial<Record<FeatureKey, boolean>>>({});

  // Reasoning Memory state
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);

  const [memoryError, setMemoryError] = useState<string | null>(null);

  // Agent Booster state
  const [boosterStatus, setBoosterStatus] = useState<BoosterStatus | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | Feature['category']>('all');

  useEffect(() => {
    aiAPI.getReasoningMemoryStats()
      .then(res => setMemoryStats(res.data?.data as MemoryStats || null))
      .catch(() => {});
    aiAPI.getAgentBoosterStatus()
      .then(res => setBoosterStatus(res.data?.data as BoosterStatus || null))
      .catch(() => {});
  }, []);

  const loadMemoryEntries = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const res = await aiAPI.getReasoningMemoryEntries({ limit: 20 });
      setMemoryEntries((res.data?.data || []) as MemoryEntry[]);
      setMemoryExpanded(true);
    } catch {
      setMemoryEntries([]);
      setMemoryError('Failed to load memory entries.');
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  const clearMemory = useCallback(async () => {
    if (!confirm('Clear all reasoning memory for your organization? This cannot be undone.')) return;
    setClearingMemory(true);
    setMemoryError(null);
    try {
      await aiAPI.clearReasoningMemory();
      setMemoryStats(prev => prev ? { ...prev, totalEntries: 0, distinctFeatures: 0 } : null);
      setMemoryEntries([]);
    } catch {
      setMemoryError('Failed to clear memory. Please try again.');
    } finally {
      setClearingMemory(false);
    }
  }, []);

  const features: Feature[] = [
    {
      key: 'gap_analysis',
      label: 'Gap Analysis',
      icon: '🔍',
      description: 'Identify control gaps across your active frameworks and get prioritized remediation steps.',
      frameworks: ['NIST 800-53', 'ISO 27001', 'SOC 2', 'HIPAA', 'PCI-DSS', 'CMMC', 'FedRAMP'],
      category: 'compliance',
      run: () => aiAPI.gapAnalysis(),
    },
    {
      key: 'crosswalk_optimizer',
      label: 'Crosswalk Optimizer',
      icon: '🗺️',
      description: 'Find overlapping controls across frameworks to minimize duplicated implementation effort.',
      frameworks: ['NIST 800-53', 'ISO 27001', 'SOC 2', 'NIST CSF', 'CMMC', 'FedRAMP'],
      category: 'compliance',
      run: () => aiAPI.crosswalkOptimizer(),
    },
    {
      key: 'compliance_forecast',
      label: 'Compliance Forecast',
      icon: '📈',
      description: 'Predict your compliance trajectory and timeline to audit-readiness based on current evidence.',
      frameworks: ['All active frameworks'],
      category: 'compliance',
      run: () => aiAPI.complianceForecast(),
    },
    {
      key: 'regulatory_monitor',
      label: 'Regulatory Monitor',
      icon: '📡',
      description: 'Detect recent regulatory changes from NIST, CISA, GDPR, DORA, EBA, and FINRA affecting your frameworks.',
      frameworks: ['NIST', 'GDPR', 'DORA', 'EBA', 'FINRA', 'HIPAA', 'PCI-DSS'],
      category: 'compliance',
      run: () => aiAPI.regulatoryMonitor(),
    },
    {
      key: 'risk_heatmap',
      label: 'Risk Heatmap',
      icon: '🌡️',
      description: 'Generate an AI-driven risk heatmap across control families, assets, and third parties.',
      frameworks: ['NIST 800-53', 'ISO 27001', 'NIST CSF'],
      category: 'risk',
      run: () => aiAPI.riskHeatmap(),
    },
    {
      key: 'shadow_it',
      label: 'Shadow IT Detection',
      icon: '👁️',
      description: 'Identify unauthorized systems and AI tools across your environment by analyzing asset and control data.',
      frameworks: ['NIST 800-53 CM', 'ISO 27001 A.8', 'SOC 2 CC6'],
      category: 'risk',
      run: () => aiAPI.shadowIT(),
    },
    {
      key: 'asset_control_mapping',
      label: 'Asset → Control Mapping',
      icon: '🔗',
      description: 'Map your CMDB assets to applicable controls and highlight coverage gaps.',
      frameworks: ['NIST 800-53', 'ISO 27001', 'SOC 2'],
      category: 'operations',
      run: () => aiAPI.assetControlMapping(),
    },
    {
      key: 'training_recommendations',
      label: 'Training Recommendations',
      icon: '🎓',
      description: 'Get AI-recommended training programs based on your control gaps and team role profile.',
      frameworks: ['NIST 800-53 AT', 'ISO 27001 A.6', 'CMMC Practice MP'],
      category: 'operations',
      run: () => aiAPI.trainingRecommendations(),
    },
    {
      key: 'ai_governance_check',
      label: 'AI Governance Check',
      icon: '🛡️',
      description: 'Assess your organization\'s AI governance posture against ISO/IEC 42001, EU AI Act, and DORA AI requirements.',
      frameworks: ['ISO/IEC 42001', 'EU AI Act', 'DORA', 'FINRA 2026', 'NIST AI RMF'],
      category: 'ai',
      run: () => aiAPI.aiGovernance(),
    },
  ];

  const runFeature = useCallback(async (feature: Feature) => {
    setLoading(prev => ({ ...prev, [feature.key]: true }));
    setErrors(prev => ({ ...prev, [feature.key]: undefined }));
    try {
      const res = await feature.run();
      const data = res.data?.data ?? res.data;
      const text = resultToText(data as AIResult);
      setResults(prev => ({ ...prev, [feature.key]: text }));
      setExpanded(prev => ({ ...prev, [feature.key]: true }));
    } catch (err: unknown) {
      const e = err as { code?: string; response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
      const isTimeout = e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'));
      const backendMsg = e.response?.data?.error || e.response?.data?.message;
      const msg = backendMsg
        || (isTimeout
          ? 'Analysis request timed out. The AI provider may be slow — try again or switch provider in Settings → LLM Configuration.'
          : e.response?.status === 500
            ? 'Analysis failed on the server. Verify AI provider configuration in Settings → LLM Configuration, then check backend logs.'
            : e.message)
        || 'Analysis failed. Check your AI configuration in Settings.';
      setErrors(prev => ({ ...prev, [feature.key]: msg }));
    } finally {
      setLoading(prev => ({ ...prev, [feature.key]: false }));
    }
  }, []);

  const categoryOrder: Feature['category'][] = ['compliance', 'risk', 'ai', 'operations'];
  const categoryLabels: Record<Feature['category'], string> = {
    compliance: '📋 Compliance Intelligence',
    risk: '⚠️ Risk Analysis',
    ai: '🤖 AI Governance',
    operations: '🔧 Operational Insights',
  };

  const categoryCounts: Record<Feature['category'], number> = {
    compliance: features.filter(f => f.category === 'compliance').length,
    risk: features.filter(f => f.category === 'risk').length,
    ai: features.filter(f => f.category === 'ai').length,
    operations: features.filter(f => f.category === 'operations').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Analysis Hub</h1>
          <p className="mt-1 text-sm text-gray-500">
            AI-powered analysis across your frameworks, assets, and third-party risk. Requires AI configuration in Settings → LLM Configuration.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recommended Flow</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="font-semibold text-indigo-900">1) Pick an Analysis</div>
              <p className="text-indigo-700 mt-1">Use the category filters below to find the right analysis for your needs.</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="font-semibold text-blue-900">2) Run & Review</div>
              <p className="text-blue-700 mt-1">Click ▶ Run on any analysis to get AI-powered insights for your organization.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="font-semibold text-emerald-900">3) Take Action</div>
              <p className="text-emerald-700 mt-1">Expand results to review findings, then follow remediation guidance.</p>
            </div>
          </div>
        </div>

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Link href="/dashboard/controls"
            className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
            <span>✅</span>
            <div className="text-xs">
              <div className="font-medium text-blue-800">Controls</div>
              <div className="text-blue-600">Per-control AI analysis</div>
            </div>
          </Link>
          <Link href="/dashboard/frameworks"
            className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
            <span>📐</span>
            <div className="text-xs">
              <div className="font-medium text-purple-800">Frameworks</div>
              <div className="text-purple-600">Gap & crosswalk analysis</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-governance"
            className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors">
            <span>🏛️</span>
            <div className="text-xs">
              <div className="font-medium text-orange-800">AI Governance</div>
              <div className="text-orange-600">Third-party AI risk</div>
            </div>
          </Link>
          <Link href="/dashboard/security-posture"
            className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
            <span>🛡️</span>
            <div className="text-xs">
              <div className="font-medium text-red-800">Security Posture</div>
              <div className="text-red-600">OWASP & NIST posture</div>
            </div>
          </Link>
          <Link href="/dashboard/auditor-workspace"
            className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
            <span>📋</span>
            <div className="text-xs">
              <div className="font-medium text-indigo-800">Auditor Workspace</div>
              <div className="text-indigo-600">Audit preparation</div>
            </div>
          </Link>
        </div>

        {/* Feature groups */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter Analyses</span>
            <button
              onClick={() => setActiveCategory('all')}
              className={`text-xs px-3 py-1.5 rounded-full border ${activeCategory === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
              All ({features.length})
            </button>
            {categoryOrder.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border ${activeCategory === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {categoryLabels[cat].replace(/^.+\s/, '')} ({categoryCounts[cat]})
              </button>
            ))}
          </div>
        </div>

        {categoryOrder
          .filter(cat => activeCategory === 'all' || activeCategory === cat)
          .map(cat => {
            const group = features.filter(f => f.category === cat);
            return (
              <div key={cat}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {categoryLabels[cat]}
                </h2>
                <div className="grid grid-cols-1 gap-3">
                  {group.map(feature => {
                    const isLoading = loading[feature.key];
                    const result = results[feature.key];
                    const error = errors[feature.key];
                    const isExpanded = expanded[feature.key];
                    const catStyle = CATEGORY_COLORS[feature.category];
                    const badgeStyle = CATEGORY_BADGE[feature.category];

                    return (
                      <div key={feature.key} className={`rounded-xl border p-4 ${catStyle}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{feature.icon}</span>
                            <div>
                              <h3 className="font-semibold text-sm">{feature.label}</h3>
                              <p className="text-xs opacity-75 mt-0.5">{feature.description}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => runFeature(feature)}
                            disabled={!!isLoading}
                            className="shrink-0 px-3 py-1.5 bg-white border rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 shadow-sm"
                          >
                            {isLoading ? '⏳ Running…' : '▶ Run'}
                          </button>
                        </div>

                        <details className="mt-1">
                          <summary className="text-xs font-medium cursor-pointer opacity-80 hover:opacity-100">
                            Supported frameworks ({feature.frameworks.length})
                          </summary>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {feature.frameworks.map(fw => (
                              <span key={fw} className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeStyle}`}>
                                {fw}
                              </span>
                            ))}
                          </div>
                        </details>

                        {error && (
                          <div className="bg-red-100 border border-red-300 rounded p-2 text-xs text-red-700 mt-2">
                            {error}
                          </div>
                        )}

                        {result && (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpanded(prev => ({ ...prev, [feature.key]: !isExpanded }))}
                              className="text-xs font-medium underline opacity-70 hover:opacity-100"
                            >
                              {isExpanded ? '▲ Collapse result' : '▼ Show result'}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 text-xs bg-white/70 rounded p-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto border">
                                {result}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {/* ─── Reasoning Memory (ReasoningBank) ─────────────────────────── */}
        <details className="bg-linear-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧠</span>
                <div>
                  <h2 className="text-lg font-bold text-blue-900">Reasoning Memory</h2>
                  <p className="text-xs text-blue-600">Advanced panel — open to review memory stats and entries.</p>
                </div>
              </div>
              <span className="text-xs text-blue-700">Expand</span>
            </div>
          </summary>
          <div className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧠</span>
              <div>
                <h2 className="text-lg font-bold text-blue-900">Reasoning Memory</h2>
                <p className="text-xs text-blue-600">
                  Persistent semantic memory — AI agents learn from past analyses to provide increasingly accurate and context-aware assessments.
                </p>
              </div>
            </div>
            {memoryStats && memoryStats.totalEntries > 0 && (
              <button
                onClick={clearMemory}
                disabled={clearingMemory}
                className="text-xs px-3 py-1.5 bg-red-100 text-red-700 border border-red-200 rounded-lg hover:bg-red-200 disabled:opacity-50"
              >
                {clearingMemory ? '⏳ Clearing…' : '🗑️ Clear Memory'}
              </button>
            )}
          </div>

          {memoryStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="bg-white border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-900">{memoryStats.totalEntries}</div>
                <div className="text-xs text-blue-600">Memory Entries</div>
              </div>
              <div className="bg-white border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-900">{memoryStats.distinctFeatures}</div>
                <div className="text-xs text-blue-600">Feature Types</div>
              </div>
              <div className="bg-white border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-900">{memoryStats.retentionDays}d</div>
                <div className="text-xs text-blue-600">Retention Period</div>
              </div>
              <div className="bg-white border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-sm font-medium text-blue-900 truncate">
                  {memoryStats.newestEntry ? new Date(memoryStats.newestEntry).toLocaleDateString() : '—'}
                </div>
                <div className="text-xs text-blue-600">Latest Entry</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-blue-500 mb-3">Loading memory stats…</div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={loadMemoryEntries}
              disabled={memoryLoading}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {memoryLoading ? '⏳ Loading…' : memoryExpanded ? '🔄 Refresh Entries' : '📋 View Recent Entries'}
            </button>
            <span className="text-xs text-blue-500">
              Memory is auto-populated when gap analysis, risk heatmaps, and other AI features run.
            </span>
          </div>

          {memoryError && (
            <div className="mt-2 bg-red-100 border border-red-300 rounded-lg p-2 text-xs text-red-700">
              {memoryError}
            </div>
          )}

          {memoryExpanded && memoryEntries.length > 0 && (
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
              {memoryEntries.map(entry => (
                <div key={entry.id} className="bg-white border border-blue-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                      {entry.feature}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  {entry.key_findings && (
                    <p className="text-xs text-gray-700 mt-1 line-clamp-3">{entry.key_findings}</p>
                  )}
                  {!entry.key_findings && entry.output_summary && (
                    <p className="text-xs text-gray-700 mt-1 line-clamp-3">{entry.output_summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {memoryExpanded && memoryEntries.length === 0 && !memoryLoading && (
            <div className="mt-3 text-center py-6 text-xs text-blue-400">
              No memory entries yet. Run AI analyses to populate reasoning memory.
            </div>
          )}
          </div>
        </details>

        {/* ─── Agent Booster ─────────────────────────────────────────── */}
        {boosterStatus && (
          <details className="bg-linear-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <div>
                    <h2 className="text-lg font-bold text-amber-900">Agent Booster</h2>
                    <p className="text-xs text-amber-600">Advanced panel — open for routing and performance details.</p>
                  </div>
                </div>
                <span className="text-xs text-amber-700">Expand</span>
              </div>
            </summary>
            <div className="mt-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚡</span>
              <div>
                <h2 className="text-lg font-bold text-amber-900">Agent Booster</h2>
                <p className="text-xs text-amber-600">
                  High-performance parallel execution engine — runs multiple AI agents concurrently with auto-routing across 6 providers for optimal cost and speed.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <div className="bg-white border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-900">
                  {boosterStatus.enabled ? '✅' : '❌'}
                </div>
                <div className="text-xs text-amber-600">Status</div>
              </div>
              <div className="bg-white border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-900">{boosterStatus.parallelAgents}</div>
                <div className="text-xs text-amber-600">Max Parallel Agents</div>
              </div>
              <div className="bg-white border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-900">{boosterStatus.availableSwarms}</div>
                <div className="text-xs text-amber-600">Agent Configs</div>
              </div>
              <div className="bg-white border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{boosterStatus.recentMetrics.successfulRuns}</div>
                <div className="text-xs text-amber-600">Successful (7d)</div>
              </div>
              <div className="bg-white border border-amber-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-900">
                  {boosterStatus.recentMetrics.avgSuccessDurationMs
                    ? `${(boosterStatus.recentMetrics.avgSuccessDurationMs / 1000).toFixed(1)}s`
                    : '—'}
                </div>
                <div className="text-xs text-amber-600">Avg Duration</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {boosterStatus.features.map(f => (
                <span key={f} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full border border-amber-200">
                  {f}
                </span>
              ))}
            </div>

            {boosterStatus.autoRouting && (
              <p className="text-xs text-amber-600 mt-2">
                🔀 Auto-routing enabled — model selection is automatically optimized across providers based on performance history.
              </p>
            )}
            </div>
          </details>
        )}
      </div>
    </DashboardLayout>
  );
}
