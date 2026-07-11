'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { auditorWorkspacePublicAPI } from '@/lib/api';

interface WorkspaceSummary {
  controls_in_scope: number;
  controls_implemented: number;
  open_poam_items: number;
  open_vulnerabilities: number;
  evidence_count: number;
}

interface WorkspaceEngagement {
  id: string;
  engagement_type: string;
  scope: string | null;
  status: string;
  period_start: string | null;
  period_end: string | null;
}

interface WorkspaceFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  recommendation: string | null;
  due_date: string | null;
  created_at: string;
}

interface WorkspacePbcRequest {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
  created_at: string;
}

interface WorkspaceEvidenceItem {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

interface AuditorWorkspacePublicData {
  workspace: { name: string; read_only: boolean; expires_at: string };
  summary: WorkspaceSummary;
  engagement: WorkspaceEngagement | null;
  findings: WorkspaceFinding[];
  pbc_requests: WorkspacePbcRequest[];
  recent_evidence: WorkspaceEvidenceItem[];
}

const SEVERITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Low', color: 'bg-blue-100 text-blue-800' },
};

function getSeverityInfo(severity: string) {
  return SEVERITY_META[severity] || { label: labelize(severity), color: 'bg-gray-100 text-gray-700' };
}

function labelize(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  // Use UTC getters (not toLocaleDateString) so server and client render the
  // same string regardless of the runtime's local timezone — avoids Next.js
  // hydration mismatches on this public, unauthenticated page.
  return `${MONTH_ABBREVIATIONS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatFileSize(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

const SUMMARY_TILES: Array<{ key: keyof WorkspaceSummary; label: string }> = [
  { key: 'controls_in_scope', label: 'Controls In Scope' },
  { key: 'controls_implemented', label: 'Controls Implemented' },
  { key: 'open_poam_items', label: 'Open POA&M Items' },
  { key: 'open_vulnerabilities', label: 'Open Vulnerabilities' },
  { key: 'evidence_count', label: 'Evidence Items' },
];

export default function AuditorWorkspaceSharedPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<AuditorWorkspacePublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const response = await auditorWorkspacePublicAPI.getPublicWorkspace(token);
        if (cancelled) return;
        if (response?.success && response?.data) {
          setData(response.data);
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (token) {
      load();
    } else {
      setNotFound(true);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Loading auditor workspace...</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Not Found</h1>
          <p className="text-sm text-gray-600 mb-6">
            This auditor workspace link could not be found or has expired.
          </p>
          <Link href="/" className="text-purple-600 hover:underline text-sm font-medium">
            Back to ControlWeave
          </Link>
        </div>
      </div>
    );
  }

  const { workspace, summary, engagement, findings, pbc_requests: pbcRequests, recent_evidence: recentEvidence } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-3xl font-extrabold text-gray-900">{workspace.name}</h1>
            {workspace.read_only && (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">
                Read-Only
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-8">
            Expires: {formatDate(workspace.expires_at)}
          </p>

          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {SUMMARY_TILES.map((tile) => (
                <div key={tile.key} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{summary[tile.key]}</div>
                  <div className="text-xs text-gray-500 mt-1">{tile.label}</div>
                </div>
              ))}
            </div>
          </section>

          {engagement && (
            <section className="mb-10">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Engagement</h2>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-800">{labelize(engagement.engagement_type)}</span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-semibold">
                    {labelize(engagement.status)}
                  </span>
                </div>
                {engagement.scope && (
                  <p className="text-sm text-gray-600 mb-2">{engagement.scope}</p>
                )}
                <p className="text-xs text-gray-500">
                  {formatDate(engagement.period_start)} – {formatDate(engagement.period_end)}
                </p>
              </div>
            </section>
          )}

          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Findings</h2>
            {findings.length === 0 ? (
              <p className="text-sm text-gray-500">No findings recorded.</p>
            ) : (
              <ul role="list" className="space-y-3">
                {findings.map((finding) => {
                  const severityInfo = getSeverityInfo(finding.severity);
                  return (
                    <li role="listitem" key={finding.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium text-gray-800">{finding.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${severityInfo.color}`}
                          aria-label={`Severity: ${severityInfo.label}`}
                        >
                          {severityInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">
                        Status: {labelize(finding.status)} · Due: {formatDate(finding.due_date)}
                      </p>
                      {finding.recommendation && (
                        <p className="text-sm text-gray-600">{finding.recommendation}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4">PBC Requests</h2>
            {pbcRequests.length === 0 ? (
              <p className="text-sm text-gray-500">No PBC requests recorded.</p>
            ) : (
              <ul role="list" className="space-y-3">
                {pbcRequests.map((pbc) => (
                  <li role="listitem" key={pbc.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-gray-800">{pbc.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                        {labelize(pbc.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Priority: {labelize(pbc.priority)} · Due: {formatDate(pbc.due_date)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-2">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Evidence</h2>
            {recentEvidence.length === 0 ? (
              <p className="text-sm text-gray-500">No evidence available.</p>
            ) : (
              <ul role="list" className="space-y-2">
                {recentEvidence.map((evidence) => (
                  <li
                    role="listitem"
                    key={evidence.id}
                    className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 text-sm"
                  >
                    <span className="text-gray-800 truncate">{evidence.file_name}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {evidence.mime_type} · {formatFileSize(evidence.file_size)} · {formatDate(evidence.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-4 mt-8">
            <Link href="/" className="text-purple-600 hover:underline">
              Back to ControlWeave
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
