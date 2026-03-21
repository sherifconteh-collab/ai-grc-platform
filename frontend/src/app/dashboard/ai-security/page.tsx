// @tier: enterprise
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { aiAPI } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SecurityPillar {
  name: string;
  status: 'strong' | 'moderate' | 'needs_attention' | 'not_assessed';
  score: number | null;
  description: string;
  controlsTotal: number;
  controlsMet: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PILLARS: SecurityPillar[] = [
  {
    name: 'OWASP Top 10 for LLMs',
    status: 'not_assessed',
    score: null,
    description: 'Identify and mitigate the top 10 security risks for large language model applications.',
    controlsTotal: 10,
    controlsMet: 0,
  },
  {
    name: 'NIST AI RMF Alignment',
    status: 'not_assessed',
    score: null,
    description: 'Assess alignment with the NIST AI Risk Management Framework across Govern, Map, Measure, and Manage functions.',
    controlsTotal: 0,
    controlsMet: 0,
  },
  {
    name: 'EU AI Act Readiness',
    status: 'not_assessed',
    score: null,
    description: 'Evaluate readiness for the EU AI Act requirements including risk classification, transparency, and human oversight.',
    controlsTotal: 0,
    controlsMet: 0,
  },
  {
    name: 'PLOT4ai Threat Modeling',
    status: 'not_assessed',
    score: null,
    description: 'Map AI-specific threats across autonomy, transparency, robustness, and fairness dimensions.',
    controlsTotal: 0,
    controlsMet: 0,
  },
  {
    name: 'AI Supply Chain Risk',
    status: 'not_assessed',
    score: null,
    description: 'Assess risks from third-party AI models, datasets, and components in your supply chain.',
    controlsTotal: 0,
    controlsMet: 0,
  },
  {
    name: 'AIUC-1 Agentic AI Certification',
    status: 'not_assessed',
    score: null,
    description: 'Track certification readiness for AIUC-1 across data privacy, security, safety, reliability, accountability, and societal impact.',
    controlsTotal: 31,
    controlsMet: 0,
  },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  strong: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  moderate: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  needs_attention: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  not_assessed: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
};

const STATUS_LABELS: Record<string, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  needs_attention: 'Needs Attention',
  not_assessed: 'Not Assessed',
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AISecurityPage() {
  const [pillars, setPillars] = useState<SecurityPillar[]>(PILLARS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAssessment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Use the AI security posture endpoint to get an overview
      const res = await aiAPI.securityPosture();
      const data = res.data?.data?.result ?? res.data?.data;

      // If the backend returns structured pillar data, merge it
      if (data && typeof data === 'object') {
        // Build a lookup keyed on lowercase pillar name fragments
        const pillarKeyMap: Record<string, Partial<SecurityPillar>> = {};
        if (data.owasp) pillarKeyMap['owasp'] = data.owasp;
        if (data.nist_ai_rmf) pillarKeyMap['nist ai rmf'] = data.nist_ai_rmf;
        if (data.eu_ai_act) pillarKeyMap['eu ai act'] = data.eu_ai_act;
        if (data.plot4ai) pillarKeyMap['plot4ai'] = data.plot4ai;
        if (data.supply_chain) pillarKeyMap['supply chain'] = data.supply_chain;
        if (data.aiuc1) pillarKeyMap['aiuc-1'] = data.aiuc1;

        setPillars(prev => prev.map(pillar => {
          const key = Object.keys(pillarKeyMap).find(k => pillar.name.toLowerCase().includes(k));
          if (key && pillarKeyMap[key]) {
            return { ...pillar, ...pillarKeyMap[key] };
          }
          return { ...pillar };
        }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run AI security assessment');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Auto-run assessment on mount
    runAssessment();
  }, [runAssessment]);

  const assessedCount = pillars.filter(p => p.status !== 'not_assessed').length;
  const overallScore = pillars.reduce((sum, p) => sum + (p.score || 0), 0) / Math.max(assessedCount, 1);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔐 AI Security Hub</h1>
            <p className="text-gray-600 mt-1">
              Consolidated view of your AI security posture across six GRC-native pillars.
            </p>
          </div>
          <button
            onClick={runAssessment}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Assessing...' : '🔄 Run Assessment'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Overall Score */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Overall AI Security Score</h2>
              <p className="text-sm text-gray-500 mt-1">
                {assessedCount} of {pillars.length} pillars assessed
              </p>
            </div>
            <div className="text-right">
              {assessedCount > 0 ? (
                <p className="text-3xl font-bold text-gray-900">{Math.round(overallScore)}%</p>
              ) : (
                <p className="text-lg text-gray-400">—</p>
              )}
            </div>
          </div>
          {assessedCount > 0 && (
            <div className="w-full bg-gray-200 rounded-full h-3 mt-4">
              <div
                className={`h-3 rounded-full ${overallScore >= 70 ? 'bg-green-500' : overallScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, overallScore)}%` }}
              />
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="ml-3 text-gray-600">Running AI security assessment...</span>
          </div>
        )}

        {/* Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pillars.map((pillar) => {
            const colors = STATUS_COLORS[pillar.status];
            return (
              <div key={pillar.name} className={`rounded-lg border ${colors.border} ${colors.bg} p-5`}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{pillar.name}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.text} ${colors.bg}`}>
                    {STATUS_LABELS[pillar.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{pillar.description}</p>
                {pillar.controlsTotal > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Controls Met</span>
                      <span>{pillar.controlsMet} / {pillar.controlsTotal}</span>
                    </div>
                    <div className="w-full bg-white/50 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(pillar.controlsMet / pillar.controlsTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {pillar.score !== null && (
                  <p className="text-lg font-bold text-gray-900 mt-2">{pillar.score}%</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
