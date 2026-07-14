'use client';

import React, { useState } from 'react';
import { MarkdownContent } from './MarkdownContent';

// ---------------------------------------------------------------------------
// MarkdownBlock — renders AI text output as React nodes (no dangerouslySetInnerHTML).
// Delegates to the shared MarkdownContent component, which is XSS-safe by
// construction because all content is emitted as React children.
// ---------------------------------------------------------------------------
interface MarkdownBlockProps {
  content: string;
  className?: string;
}

export function MarkdownBlock({ content, className = '' }: MarkdownBlockProps) {
  return <MarkdownContent content={content} className={className} />;
}

// ---------------------------------------------------------------------------
// Severity chip
// ---------------------------------------------------------------------------
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 border border-red-200',
  high:     'bg-orange-100 text-orange-800 border border-orange-200',
  medium:   'bg-yellow-100 text-yellow-800 border border-yellow-200',
  low:      'bg-green-100 text-green-800 border border-green-200',
  info:     'bg-blue-100 text-blue-700 border border-blue-200',
};

export function SeverityChip({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity as Severity] || SEVERITY_STYLES.info;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {severity.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Gap Analysis output card
// ---------------------------------------------------------------------------
interface GapItem {
  control_id: string;
  framework?: string;
  title: string;
  severity: string;
  description: string;
  evidence_required?: string[];
  estimated_effort_days?: number;
}

interface GapAnalysisData {
  executive_summary?: string;
  audit_readiness_score?: number;
  gaps?: GapItem[];
  remediation_roadmap?: {
    immediate?: string[];
    short_term?: string[];
    medium_term?: string[];
  };
}

function GapAnalysisCard({ data }: { data: GapAnalysisData }) {
  const [expandedGap, setExpandedGap] = useState<string | null>(null);
  const score = data.audit_readiness_score;

  return (
    <div className="space-y-4">
      {/* Score + summary */}
      {(score !== undefined || data.executive_summary) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-4 mb-3">
            <h3 className="font-semibold text-gray-900">Gap Analysis Summary</h3>
            {score !== undefined && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-400' : 'bg-red-500'}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">{score}/100 readiness</span>
              </div>
            )}
          </div>
          {data.executive_summary && (
            <p className="text-sm text-gray-600 leading-relaxed">{data.executive_summary}</p>
          )}
        </div>
      )}

      {/* Gaps table */}
      {data.gaps && data.gaps.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Identified Gaps ({data.gaps.length})</h4>
          </div>
          <div className="divide-y divide-gray-100">
            {data.gaps.map((gap, i) => (
              <div key={i} className="px-5 py-3">
                <button
                  type="button"
                  className="w-full flex items-start gap-3 cursor-pointer text-left"
                  aria-expanded={expandedGap === `${i}`}
                  onClick={() => setExpandedGap(expandedGap === `${i}` ? null : `${i}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        {gap.control_id}
                      </span>
                      {gap.framework && (
                        <span className="text-xs text-gray-500">{gap.framework}</span>
                      )}
                      <SeverityChip severity={gap.severity} />
                    </div>
                    <p className="text-sm font-medium text-gray-800">{gap.title}</p>
                  </div>
                  <span className="text-gray-400 text-xs mt-1" aria-hidden="true">{expandedGap === `${i}` ? '▲' : '▼'}</span>
                </button>
                {expandedGap === `${i}` && (
                  <div className="mt-3 pl-0 space-y-2">
                    <p className="text-sm text-gray-600">{gap.description}</p>
                    {gap.evidence_required && gap.evidence_required.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Evidence Required:</p>
                        <ul className="space-y-1">
                          {gap.evidence_required.map((ev, j) => (
                            <li key={j} className="text-xs text-gray-600 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                              {ev}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {gap.estimated_effort_days !== undefined && (
                      <p className="text-xs text-gray-500">
                        Estimated effort: <span className="font-medium">{gap.estimated_effort_days} days</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remediation roadmap */}
      {data.remediation_roadmap && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Remediation Roadmap</h4>
          <div className="space-y-3">
            {(['immediate', 'short_term', 'medium_term'] as const).map(phase => {
              const items = data.remediation_roadmap![phase];
              if (!items || items.length === 0) return null;
              const labels = { immediate: '0–30 days', short_term: '30–90 days', medium_term: '90–180 days' };
              const colors = { immediate: 'bg-red-50 border-red-200', short_term: 'bg-yellow-50 border-yellow-200', medium_term: 'bg-green-50 border-green-200' };
              return (
                <div key={phase} className={`border rounded-lg p-3 ${colors[phase]}`}>
                  <p className="text-xs font-semibold text-gray-700 mb-2">{labels[phase]}</p>
                  <ul className="space-y-1">
                    {items.map((item, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playbook steps card
// ---------------------------------------------------------------------------
interface PlaybookStep {
  step: number;
  action: string;
  detail?: string;
  tools?: string[];
  evidence_artifact?: string;
}

interface PlaybookData {
  control_id?: string;
  title?: string;
  estimated_effort_hours?: number;
  required_skills?: string[];
  steps?: PlaybookStep[];
  common_pitfalls?: string[];
  evidence_artifacts?: string[];
}

function PlaybookCard({ data }: { data: PlaybookData }) {
  return (
    <div className="space-y-4">
      {(data.title || data.estimated_effort_hours !== undefined) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              {data.title && <h3 className="font-semibold text-gray-900 mb-1">{data.title}</h3>}
              {data.required_skills && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {data.required_skills.map((s, i) => (
                    <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {data.estimated_effort_hours !== undefined && (
              <span className="text-sm text-gray-500 whitespace-nowrap">{data.estimated_effort_hours}h est.</span>
            )}
          </div>
        </div>
      )}

      {data.steps && data.steps.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900">Implementation Steps</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {data.steps.map((step, i) => (
              <div key={i} className="px-5 py-4 flex gap-4">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {step.step || i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 mb-1">{step.action}</p>
                  {step.detail && <p className="text-sm text-gray-600 mb-2">{step.detail}</p>}
                  {step.tools && step.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {step.tools.map((t, j) => (
                        <span key={j} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {step.evidence_artifact && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <span className="text-green-600">📎</span>
                      Artifact: {step.evidence_artifact}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.common_pitfalls && data.common_pitfalls.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">Common Pitfalls</h4>
          <ul className="space-y-1">
            {data.common_pitfalls.map((p, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-1 text-amber-500 flex-shrink-0">⚠</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test procedure checklist card
// ---------------------------------------------------------------------------
interface TestStep {
  step: number;
  test_type?: string;
  procedure: string;
  pass_criteria?: string;
  fail_criteria?: string;
}

interface TestProcedureData {
  control_id?: string;
  objective?: string;
  test_method?: string;
  steps?: TestStep[];
  expected_results?: { pass?: string; fail?: string };
  sample_size?: string;
  frequency?: string;
  evidence_to_collect?: string[];
}

function TestProcedureCard({ data }: { data: TestProcedureData }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div className="space-y-4">
      {(data.objective || data.test_method) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          {data.test_method && (
            <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-200 mb-2 capitalize">
              {data.test_method}
            </span>
          )}
          {data.objective && <p className="text-sm text-gray-700">{data.objective}</p>}
        </div>
      )}

      {data.steps && data.steps.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Test Checklist</h4>
            <span className="text-xs text-gray-500">{checked.size}/{data.steps.length} complete</span>
          </div>
          <div className="divide-y divide-gray-50">
            {data.steps.map((step, i) => (
              <button
                key={i}
                type="button"
                className={`w-full text-left px-5 py-4 cursor-pointer transition-colors ${checked.has(i) ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                aria-pressed={checked.has(i)}
                onClick={() => toggle(i)}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${checked.has(i) ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`} aria-hidden="true">
                    {checked.has(i) && <span className="text-xs">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {step.test_type && (
                      <span className="text-xs text-gray-400 uppercase tracking-wide mr-2">{step.test_type}</span>
                    )}
                    <p className={`text-sm ${checked.has(i) ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                      {step.procedure}
                    </p>
                    {step.pass_criteria && (
                      <p className="text-xs text-green-600 mt-1">✓ Pass: {step.pass_criteria}</p>
                    )}
                    {step.fail_criteria && (
                      <p className="text-xs text-red-600 mt-0.5">✗ Fail: {step.fail_criteria}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(data.sample_size || data.frequency) && (
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 flex gap-6">
          {data.sample_size && <span><span className="font-medium">Sample: </span>{data.sample_size}</span>}
          {data.frequency && <span><span className="font-medium">Frequency: </span>{data.frequency}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence suggestion card
// ---------------------------------------------------------------------------
interface EvidenceItem {
  title: string;
  description: string;
  collection_method: string;
  format?: string;
  freshness_days?: number;
  automation_possible?: boolean;
  automation_hint?: string;
  example_filename?: string;
  sufficiency_criteria?: string;
}

interface EvidenceSuggestionData {
  control_id?: string;
  control_title?: string;
  framework?: string;
  evidence_items?: EvidenceItem[];
  collection_notes?: string;
  estimated_collection_hours?: number;
}

function EvidenceSuggestionCard({ data }: { data: EvidenceSuggestionData }) {
  return (
    <div className="space-y-4">
      {(data.control_title || data.framework || data.estimated_collection_hours !== undefined) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start justify-between gap-4">
          <div>
            {data.control_title && <h3 className="font-semibold text-gray-900 mb-1">{data.control_title}</h3>}
            {data.framework && (
              <span className="text-xs text-gray-500 font-mono">{data.control_id} · {data.framework}</span>
            )}
          </div>
          {data.estimated_collection_hours !== undefined && (
            <span className="text-sm text-gray-500 whitespace-nowrap">{data.estimated_collection_hours}h est. collection</span>
          )}
        </div>
      )}

      {data.evidence_items && data.evidence_items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900">Suggested Evidence ({data.evidence_items.length})</h4>
          </div>
          <div className="divide-y divide-gray-50">
            {data.evidence_items.map((item, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  {item.format && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">{item.format}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                <p className="text-xs text-gray-500 mb-1">
                  <span className="font-medium">Collection: </span>{item.collection_method}
                  {item.freshness_days !== undefined && <span> · Refresh every {item.freshness_days}d</span>}
                </p>
                {item.automation_possible && item.automation_hint && (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <span aria-hidden="true">⚙</span> Automatable: {item.automation_hint}
                  </p>
                )}
                {item.sufficiency_criteria && (
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="font-medium">Sufficiency: </span>{item.sufficiency_criteria}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.collection_notes && (
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">{data.collection_notes}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit finding draft card
// ---------------------------------------------------------------------------
interface FindingData {
  title?: string;
  severity?: string;
  criteria?: string;
  condition?: string;
  cause?: string;
  effect?: string;
  recommendation?: string;
  management_response_placeholder?: string;
  related_controls?: string[];
  evidence_of_exception?: string[];
  repeat_finding?: boolean;
  finding_id_hint?: string;
}

function FindingCard({ data }: { data: FindingData }) {
  const rows: Array<{ label: string; value?: string }> = [
    { label: 'Criteria', value: data.criteria },
    { label: 'Condition', value: data.condition },
    { label: 'Cause', value: data.cause },
    { label: 'Effect', value: data.effect },
    { label: 'Recommendation', value: data.recommendation },
  ];

  return (
    <div className="space-y-4">
      {(data.title || data.severity) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            {data.title && <h3 className="font-semibold text-gray-900">{data.title}</h3>}
            <div className="flex items-center gap-2 flex-shrink-0">
              {data.repeat_finding && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Repeat</span>
              )}
              {data.severity && <SeverityChip severity={data.severity} />}
            </div>
          </div>
          {data.finding_id_hint && (
            <p className="text-xs text-gray-500 font-mono">{data.finding_id_hint}</p>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
        {rows.filter(r => r.value).map((r) => (
          <div key={r.label} className="px-5 py-3">
            <p className="text-xs font-semibold text-gray-500 mb-1">{r.label}</p>
            <p className="text-sm text-gray-700">{r.value}</p>
          </div>
        ))}
      </div>

      {data.related_controls && data.related_controls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.related_controls.map((c, i) => (
            <span key={i} className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
              {c}
            </span>
          ))}
        </div>
      )}

      {data.evidence_of_exception && data.evidence_of_exception.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">Evidence of Exception</p>
          <ul className="space-y-1">
            {data.evidence_of_exception.map((e, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.management_response_placeholder && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-800 mb-1">Management Response (placeholder)</p>
          <p className="text-sm text-amber-700">{data.management_response_placeholder}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action bar — copy / export / insert actions
// ---------------------------------------------------------------------------
interface ActionBarProps {
  content: string;
  feature?: string;
  onInsert?: (content: string) => void;
  onAttach?: (content: string) => void;
}

function ActionBar({ content, onInsert, onAttach }: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleExport = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-output.md';
    document.body.appendChild(a);
    a.click();
    // Defer revocation so the browser has time to start the download.
    // Revoking synchronously after click() can cancel the download in some browsers.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  };

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
      >
        Export .md
      </button>
      {onInsert && (
        <button
          onClick={() => onInsert(content)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
        >
          Insert into workpaper
        </button>
      )}
      {onAttach && (
        <button
          onClick={() => onAttach(content)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
        >
          Attach to finding
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main StructuredOutput component
// ---------------------------------------------------------------------------
interface StructuredOutputProps {
  /** Raw string from AI response (may be plain text or JSON) */
  content: string;
  /** Feature key to select card rendering */
  feature?: string;
  /** Whether to show copy / export / insert actions */
  showActions?: boolean;
  onInsert?: (content: string) => void;
  onAttach?: (content: string) => void;
  className?: string;
}

export default function StructuredOutput({
  content,
  feature,
  showActions = true,
  onInsert,
  onAttach,
  className = ''
}: StructuredOutputProps) {
  // Try to parse as JSON — if it succeeds and we recognize the feature, render a structured card.
  let parsed: unknown = null;
  try {
    // Strip markdown fences if present
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    if (stripped.startsWith('{') || stripped.startsWith('[')) {
      parsed = JSON.parse(stripped);
    }
  } catch {
    // Not valid JSON — fall through to markdown rendering
  }

  const renderCard = () => {
    if (parsed && typeof parsed === 'object') {
      if (feature === 'gap_analysis') {
        return <GapAnalysisCard data={parsed as GapAnalysisData} />;
      }
      if (feature === 'remediation_playbook') {
        return <PlaybookCard data={parsed as PlaybookData} />;
      }
      if (feature === 'test_procedures') {
        return <TestProcedureCard data={parsed as TestProcedureData} />;
      }
      if (feature === 'evidence_suggestion' || feature === 'evidence_suggest') {
        return <EvidenceSuggestionCard data={parsed as EvidenceSuggestionData} />;
      }
      if (feature === 'finding_analysis' || feature === 'audit_finding_draft' || feature === 'finding') {
        return <FindingCard data={parsed as FindingData} />;
      }
      // Unknown structured feature — render as formatted JSON
      return (
        <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded-xl overflow-x-auto">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    }
    // Plain markdown text
    return <MarkdownBlock content={content} />;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {renderCard()}
      {showActions && (
        <ActionBar
          content={content}
          feature={feature}
          onInsert={onInsert}
          onAttach={onAttach}
        />
      )}
    </div>
  );
}

export { GapAnalysisCard, PlaybookCard, TestProcedureCard, EvidenceSuggestionCard, FindingCard, ActionBar };
