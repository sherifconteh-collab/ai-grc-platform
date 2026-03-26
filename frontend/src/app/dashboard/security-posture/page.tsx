// @tier: community
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { aiAPI } from '@/lib/api';

interface OwaspCategory {
  id: string;
  name: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  evidenceCount: number;
  summary: string;
  recommendations: string[];
}

interface NistFamily {
  family: string;
  name: string;
  pct: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  businessRisk: string;
  nextControls: string[];
}

interface PostureData {
  owasp: OwaspCategory[];
  nist: NistFamily[];
}

const RISK_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  high:     { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
  medium:   { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' },
  low:      { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  none:     { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200', badge: 'bg-green-100 text-green-700' },
};

function RiskBadge({ level }: { level: string }) {
  const c = RISK_COLORS[level] || RISK_COLORS.none;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase ${c.badge}`}>
      {level}
    </span>
  );
}

function PriorityBar({ pct }: { pct: number }) {
  const color = pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className={`${color} h-2 rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function SecurityPosturePage() {
  const [posture, setPosture] = useState<PostureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'owasp' | 'nist'>('owasp');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await aiAPI.securityPosture();
      const data = res.data?.data?.result ?? res.data?.data ?? res.data;
      setPosture(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed. Check your AI configuration.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Security Posture Analysis</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Proactive guidance based on your OWASP Top 10:2025 exposure and NIST control family coverage
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a5 5 0 00-1.466 3.466V19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-.308a5 5 0 00-1.466-3.466l-.346-.346z" />
                </svg>
                Run Analysis
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Link href="/dashboard/ai-analysis"
            className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span>✨</span>
            <div>
              <div className="font-medium text-purple-800">AI Analysis Hub</div>
              <div className="text-purple-600">Gap analysis & risk heatmap</div>
            </div>
          </Link>
          <Link href="/dashboard/ai-monitoring"
            className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors text-xs">
            <span>📊</span>
            <div>
              <div className="font-medium text-slate-800">AI Monitoring</div>
              <div className="text-slate-600">Compliance-layer rules & events</div>
            </div>
          </Link>
          <Link href="/dashboard/threat-intel"
            className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs">
            <span>🎯</span>
            <div>
              <div className="font-medium text-orange-800">Threat Intelligence</div>
              <div className="text-orange-600">CVEs & exploit indicators</div>
            </div>
          </Link>
          <Link href="/dashboard/vulnerabilities"
            className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-xs">
            <span>🔍</span>
            <div>
              <div className="font-medium text-red-800">Vulnerabilities</div>
              <div className="text-red-600">ACAS, SBOM, STIG findings</div>
            </div>
          </Link>
        </div>

        {!posture && !loading && (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-gray-600 font-medium">No analysis yet</p>
            <p className="text-gray-400 text-sm mt-1">Click Run Analysis to generate your security posture report</p>
          </div>
        )}

        {posture && (
          <>
            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="-mb-px flex gap-6">
                <button
                  onClick={() => setActiveTab('owasp')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'owasp'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  OWASP Top 10:2025
                  {posture.owasp?.length ? (
                    <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                      {posture.owasp.filter(c => ['critical','high'].includes(c.riskLevel)).length} critical/high
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={() => setActiveTab('nist')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'nist'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  NIST Control Families
                  {posture.nist?.length ? (
                    <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                      {posture.nist.length} prioritized
                    </span>
                  ) : null}
                </button>
              </nav>
            </div>

            {/* OWASP Tab */}
            {activeTab === 'owasp' && (
              <div className="grid gap-4">
                {(posture.owasp ?? []).map((cat) => {
                  const c = RISK_COLORS[cat.riskLevel] || RISK_COLORS.none;
                  const expanded = expandedCards.has(cat.id);
                  return (
                    <div key={cat.id} className={`rounded-lg border ${c.border} ${c.bg} overflow-hidden`}>
                      <button
                        className="w-full text-left p-4 flex items-center justify-between"
                        onClick={() => toggleCard(cat.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-gray-500 w-16">{cat.id}</span>
                          <span className={`font-semibold ${c.text}`}>{cat.name}</span>
                          {cat.evidenceCount > 0 && (
                            <span className="text-xs text-gray-500">{cat.evidenceCount} finding{cat.evidenceCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <RiskBadge level={cat.riskLevel} />
                          <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-4 pb-4 border-t border-gray-200 bg-white bg-opacity-60">
                          {cat.summary && (
                            <p className="text-sm text-gray-700 mt-3 mb-3">{cat.summary}</p>
                          )}
                          {cat.recommendations?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommendations</p>
                              <ul className="space-y-1.5">
                                {cat.recommendations.map((rec, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-indigo-500 mt-0.5">•</span>
                                    {rec}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!posture.owasp?.length && (
                  <p className="text-center text-gray-500 text-sm py-8">No OWASP analysis data returned.</p>
                )}
              </div>
            )}

            {/* NIST Tab */}
            {activeTab === 'nist' && (
              <div className="grid gap-4">
                {(posture.nist ?? []).map((fam) => {
                  const c = RISK_COLORS[fam.priority] || RISK_COLORS.low;
                  const expanded = expandedCards.has(fam.family);
                  return (
                    <div key={fam.family} className={`rounded-lg border ${c.border} ${c.bg} overflow-hidden`}>
                      <button
                        className="w-full text-left p-4 flex items-center justify-between gap-4"
                        onClick={() => toggleCard(fam.family)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs font-bold text-gray-500 w-10">{fam.family}</span>
                          <div className="min-w-0">
                            <span className={`font-semibold ${c.text} block`}>{fam.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="w-32">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>Coverage</span>
                              <span>{fam.pct}%</span>
                            </div>
                            <PriorityBar pct={fam.pct} />
                          </div>
                          <RiskBadge level={fam.priority} />
                          <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-4 pb-4 border-t border-gray-200 bg-white bg-opacity-60">
                          {fam.businessRisk && (
                            <p className="text-sm text-gray-700 mt-3 mb-3">
                              <span className="font-medium">Business risk: </span>{fam.businessRisk}
                            </p>
                          )}
                          {fam.nextControls?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended next controls</p>
                              <div className="flex flex-wrap gap-2">
                                {fam.nextControls.map((ctrl, i) => (
                                  <span key={i} className="bg-indigo-100 text-indigo-700 text-xs font-mono px-2 py-1 rounded">
                                    {ctrl}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!posture.nist?.length && (
                  <div className="text-center text-gray-500 text-sm py-8">
                    <p>No NIST control family data available.</p>
                    <p className="text-xs mt-1">Add NIST SP 800-53 as an active framework to see family-level guidance.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
