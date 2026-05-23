'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import { auditAPI, aiAPI } from '@/lib/api';

interface RegBICheck {
  id: string;
  name: string;
  status: 'aligned' | 'gap' | 'in_progress';
  description: string;
}

const REG_BI_CHECKS: RegBICheck[] = [
  { id: 'rbi-1', name: 'Best-Interest Obligation Disclosure', status: 'aligned', description: 'AI recommendations include conflicts-of-interest disclosure' },
  { id: 'rbi-2', name: 'Care Obligation — Suitability', status: 'aligned', description: 'Model validates customer risk profile before recommendation' },
  { id: 'rbi-3', name: 'Conflict of Interest Identification', status: 'in_progress', description: 'Automated detection of proprietary product bias in AI outputs' },
  { id: 'rbi-4', name: 'Customer Communication Review', status: 'gap', description: 'AI-generated client communications require supervisory pre-review' },
  { id: 'rbi-5', name: 'Algorithmic Trading Surveillance', status: 'aligned', description: 'Real-time monitoring of AI-driven trading decisions for anomalies' },
];

interface SR117Model {
  id: string;
  name: string;
  tier: 'critical' | 'high' | 'medium' | 'low';
  lastValidation: string;
  status: 'validated' | 'pending' | 'overdue';
}

const SR117_MODELS: SR117Model[] = [
  { id: 'mdl-1', name: 'Credit Scoring Engine v3.2', tier: 'critical', lastValidation: '2025-11-15', status: 'validated' },
  { id: 'mdl-2', name: 'AML Transaction Monitor', tier: 'critical', lastValidation: '2025-09-20', status: 'pending' },
  { id: 'mdl-3', name: 'Robo-Advisory Allocator', tier: 'high', lastValidation: '2025-12-01', status: 'validated' },
  { id: 'mdl-4', name: 'Customer Churn Predictor', tier: 'medium', lastValidation: '2025-06-10', status: 'overdue' },
  { id: 'mdl-5', name: 'Fraud Detection Ensemble', tier: 'critical', lastValidation: '2025-10-05', status: 'validated' },
];

const STATUS_COLORS: Record<string, string> = {
  aligned: 'bg-green-100 text-green-700',
  gap: 'bg-red-100 text-red-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  validated: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  overdue: 'bg-red-100 text-red-700',
};

const TIER_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};

interface AuditEntry {
  id: string;
  event_type: string;
  resource_type?: string;
  details?: Record<string, unknown>;
  created_at: string;
  user_id?: string;
  outcome?: string;
}

export default function FinancialServicesWorkspacePage() {
  const { user } = useAuth();
  const canReadAudit = hasPermission(user, 'audit.read');
  const canWriteAudit = hasPermission(user, 'audit.write');
  const [activeTab, setActiveTab] = useState<'regbi' | 'sr117' | 'finra' | 'sec'>('regbi');
  const [auditNote, setAuditNote] = useState('');
  const [narrative, setNarrative] = useState('');
  const [generating, setGenerating] = useState(false);
  const [narrativeError, setNarrativeError] = useState('');
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [auditSuccess, setAuditSuccess] = useState('');
  const [auditError, setAuditError] = useState('');
  const auditSuccessTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const auditErrorTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (auditSuccessTimer.current) clearTimeout(auditSuccessTimer.current);
      if (auditErrorTimer.current) clearTimeout(auditErrorTimer.current);
    };
  }, []);

  const loadAuditEntries = useCallback(async () => {
    try {
      setAuditLoading(true);
      const res = await auditAPI.getLogs({ eventType: 'finra_supervisory_review', limit: 50, offset: 0 });
      const logs = res.data?.data?.logs || res.data?.data || [];
      setAuditEntries(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.error('Failed to load FINRA audit entries:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canReadAudit) {
      loadAuditEntries();
    }
  }, [canReadAudit, loadAuditEntries]);

  const handleLogAuditEntry = async () => {
    if (!auditNote.trim()) return;
    setAuditSubmitting(true);
    setAuditSuccess('');
    setAuditError('');
    try {
      await auditAPI.createLog({
        event_type: 'finra_supervisory_review',
        resource_type: 'finra_audit_trail',
        details: { note: auditNote, review_type: 'supervisory' },
      });
      setAuditNote('');
      setAuditSuccess('Audit entry logged successfully.');
      await loadAuditEntries();
      if (auditSuccessTimer.current) clearTimeout(auditSuccessTimer.current);
      auditSuccessTimer.current = setTimeout(() => setAuditSuccess(''), 4000);
    } catch (err) {
      console.error('Failed to log audit entry:', err);
      setAuditError('Failed to log audit entry. Please try again.');
      if (auditErrorTimer.current) clearTimeout(auditErrorTimer.current);
      auditErrorTimer.current = setTimeout(() => setAuditError(''), 5000);
    } finally {
      setAuditSubmitting(false);
    }
  };

  const handleGenerateNarrative = async () => {
    setGenerating(true);
    setNarrative('');
    setNarrativeError('');
    try {
      const res = await aiAPI.complianceQuery({
        question: 'Generate a SEC explainability narrative for our compliance posture covering Reg BI alignment, SR 11-7 model risk, and FINRA supervisory obligations. Focus on how AI is used in advisory, trading, and client-facing operations.',
      });
      const result = res.data?.data?.result || res.data?.data?.response || '';
      if (result) {
        setNarrative(result);
      } else {
        setNarrativeError('No narrative was returned. Please check your AI provider configuration in Settings → LLM Configuration.');
      }
    } catch (err) {
      console.error('Failed to generate SEC narrative:', err);
      setNarrativeError('Failed to generate narrative. Ensure an AI provider is configured in Settings → LLM Configuration.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Financial Services Compliance Workspace</h1>
              <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full border border-amber-300">⭐ Utilities</span>
            </div>
            <p className="text-gray-600 mt-1">Reg BI alignment, SR 11-7 model inventory, FINRA audit trail, and SEC explainability</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/help" className="text-sm text-gray-500 hover:text-purple-600 hover:underline font-medium">📖 Help</Link>
            <Link href="/dashboard/cmdb" className="text-sm text-purple-600 hover:underline font-medium">← Back to CMDB</Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6 -mb-px">
            {[
              { key: 'regbi' as const, label: 'Reg BI Alignment', icon: '⚖️' },
              { key: 'sr117' as const, label: 'SR 11-7 Models', icon: '📊' },
              { key: 'finra' as const, label: 'FINRA Audit Trail', icon: '📝' },
              { key: 'sec' as const, label: 'SEC Explainability', icon: '📋' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'regbi' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Reg BI Best-Interest Alignment Checks</h2>
              <div className="flex gap-2 text-xs">
                <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-medium">{REG_BI_CHECKS.filter(c => c.status === 'aligned').length} Aligned</span>
                <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-medium">{REG_BI_CHECKS.filter(c => c.status === 'in_progress').length} In Progress</span>
                <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-medium">{REG_BI_CHECKS.filter(c => c.status === 'gap').length} Gaps</span>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Check</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Description</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {REG_BI_CHECKS.map(check => (
                    <tr key={check.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{check.name}</td>
                      <td className="px-4 py-3 text-gray-600">{check.description}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS_COLORS[check.status]}`}>
                          {check.status === 'in_progress' ? 'In Progress' : check.status.charAt(0).toUpperCase() + check.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'sr117' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">SR 11-7 Model Inventory</h2>
              <span className="text-xs text-gray-500">{SR117_MODELS.length} models tracked</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Model Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Risk Tier</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Last Validation</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {SR117_MODELS.map(model => (
                    <tr key={model.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{model.name}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${TIER_COLORS[model.tier]}`}>
                          {model.tier.charAt(0).toUpperCase() + model.tier.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{model.lastValidation}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS_COLORS[model.status]}`}>
                          {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'finra' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">FINRA Supervisory Audit Trail</h2>
            <p className="text-sm text-gray-600">Log supervisory review actions for AI-generated communications, trading decisions, and compliance events per FINRA Notice 24-09.</p>

            {!canWriteAudit && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <p className="text-sm text-yellow-700">Your role does not have <strong>audit.write</strong> permission. You can view existing entries but cannot log new ones. Contact your administrator to update your permissions.</p>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisory Review Note</label>
                <textarea
                  value={auditNote}
                  onChange={e => setAuditNote(e.target.value)}
                  rows={4}
                  placeholder="Describe the supervisory action taken, AI output reviewed, and any corrective measures applied..."
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-400"
                  disabled={!canWriteAudit}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleLogAuditEntry}
                  disabled={!auditNote.trim() || auditSubmitting || !canWriteAudit}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {auditSubmitting ? '⏳ Logging…' : '📝 Log Audit Entry'}
                </button>
                <span className="text-xs text-gray-400">Entries are immutable once logged</span>
              </div>
              {auditSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <p className="text-sm text-green-700">{auditSuccess}</p>
                </div>
              )}
              {auditError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <p className="text-sm text-red-700">{auditError}</p>
                </div>
              )}
            </div>

            {/* Audit Entries Table */}
            {!canReadAudit ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <p className="text-sm text-yellow-700">Your role does not have <strong>audit.read</strong> permission. Contact your administrator to view the FINRA audit trail.</p>
              </div>
            ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Logged Entries</h3>
                <span className="text-xs text-gray-500">{auditEntries.length} entries</span>
              </div>
              {auditLoading ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">Loading audit entries…</div>
              ) : auditEntries.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">No FINRA supervisory review entries logged yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Timestamp</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Note</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {typeof entry.details === 'object' && entry.details !== null && 'note' in entry.details
                            ? String(entry.details.note)
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            {entry.outcome || 'success'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                <strong>Tip:</strong> FINRA Notice 24-09 requires firms to maintain records of all supervisory reviews of AI-generated content. Use this trail to document each review with timestamps and reviewer identity for audit readiness.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'sec' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">SEC Explainability Narrative Generator</h2>
            <p className="text-sm text-gray-600">Generate compliance narratives for SEC filings and examinations that explain how AI is used in advisory, trading, and client-facing operations.</p>
            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <button
                onClick={handleGenerateNarrative}
                disabled={generating}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {generating ? '⏳ Generating…' : '📋 Generate SEC Explainability Narrative'}
              </button>
              {narrativeError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">{narrativeError}</p>
                </div>
              )}
              {narrative && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Generated Narrative</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Ready for review</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{narrative}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
