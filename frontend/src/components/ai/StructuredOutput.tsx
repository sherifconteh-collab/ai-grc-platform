'use client';

/**
 * StructuredOutput — renders the validated `data.structured` field returned
 * by AI routes that have a registered schema (gap analysis, remediation
 * playbook, evidence suggestion, test procedures, finding).
 *
 * Renders semantic, accessible markup:
 *   - readiness bar (gap analysis)
 *   - severity-chipped gap cards
 *   - numbered playbook step list
 *   - interactive checklist for test procedures
 *   - structured finding (criteria/condition/cause/effect/recommendation)
 *
 * Each list uses `<ul role="list">` with `<li role="listitem">` semantics so
 * screen readers announce row counts correctly.
 */

import React, { useId, useState } from 'react';

type Severity = 'critical' | 'high' | 'medium' | 'low' | string;

const severityClass: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700',
  high:     'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700',
  medium:   'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-700',
  low:      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
};

function SeverityChip({ severity }: { severity: Severity }) {
  const cls = severityClass[severity?.toLowerCase?.()] || 'bg-zinc-100 text-zinc-800 border-zinc-300';
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}>
      {severity}
    </span>
  );
}

function ReadinessBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const tone = pct >= 80 ? 'bg-green-600' : pct >= 60 ? 'bg-yellow-500' : pct >= 40 ? 'bg-orange-500' : 'bg-red-600';
  return (
    <div className="my-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">Readiness</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Readiness ${pct}%`}
      >
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GapAnalysis({ data }: { data: any }) {
  return (
    <div>
      {typeof data.readiness_score === 'number' && <ReadinessBar score={data.readiness_score} />}
      {data.summary && <p className="my-2 text-sm leading-relaxed">{data.summary}</p>}
      {Array.isArray(data.gaps) && data.gaps.length > 0 && (
        <section aria-label="Gaps">
          <h4 className="mt-3 mb-1 text-sm font-semibold">Gaps</h4>
          <ul role="list" className="space-y-2">
            {data.gaps.map((g: any, i: number) => (
              <li key={i} role="listitem" className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs">{g.control}</span>
                  <SeverityChip severity={g.severity} />
                </div>
                <p className="mt-1 text-sm">{g.description}</p>
                {Array.isArray(g.evidence_required) && g.evidence_required.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Evidence: {g.evidence_required.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {Array.isArray(data.recommended_roadmap) && data.recommended_roadmap.length > 0 && (
        <section aria-label="Recommended roadmap" className="mt-3">
          <h4 className="mb-1 text-sm font-semibold">Recommended Roadmap</h4>
          <ul role="list" className="list-disc space-y-1 pl-5 text-sm">
            {data.recommended_roadmap.map((step: string, i: number) => (
              <li key={i} role="listitem">{step}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RemediationPlaybook({ data }: { data: any }) {
  return (
    <div>
      {data.objective && <p className="my-2 text-sm font-medium">{data.objective}</p>}
      {Array.isArray(data.prerequisites) && data.prerequisites.length > 0 && (
        <section aria-label="Prerequisites">
          <h4 className="mt-2 mb-1 text-sm font-semibold">Prerequisites</h4>
          <ul role="list" className="list-disc space-y-1 pl-5 text-sm">
            {data.prerequisites.map((p: string, i: number) => <li key={i} role="listitem">{p}</li>)}
          </ul>
        </section>
      )}
      {Array.isArray(data.steps) && data.steps.length > 0 && (
        <section aria-label="Steps">
          <h4 className="mt-3 mb-1 text-sm font-semibold">Steps</h4>
          <ol role="list" className="space-y-2">
            {data.steps.map((s: any, i: number) => (
              <li key={i} role="listitem" className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs dark:bg-zinc-700">{s.order}</span>
                  <span className="text-sm">{s.action}</span>
                </div>
                {(s.owner || typeof s.estimated_hours === 'number') && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {s.owner ? `Owner: ${s.owner}` : ''}
                    {s.owner && typeof s.estimated_hours === 'number' ? ' · ' : ''}
                    {typeof s.estimated_hours === 'number' ? `Est. ${s.estimated_hours}h` : ''}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function TestProcedures({ data }: { data: any }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setChecked(c => ({ ...c, [i]: !c[i] }));
  const idPrefix = useId();

  return (
    <div>
      {data.objective && <p className="my-2 text-sm font-medium">{data.objective}</p>}
      {data.scope && <p className="my-1 text-xs text-zinc-600 dark:text-zinc-400">Scope: {data.scope}</p>}
      {Array.isArray(data.steps) && data.steps.length > 0 && (
        <section aria-label="Test procedures">
          <h4 className="mt-3 mb-1 text-sm font-semibold">Procedures</h4>
          <ul role="list" className="space-y-2">
            {data.steps.map((s: any, i: number) => {
              const id = `${idPrefix}-tp-step-${i}`;
              return (
                <li key={i} role="listitem" className="flex items-start gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
                  <input
                    id={id}
                    type="checkbox"
                    checked={!!checked[i]}
                    onChange={() => toggle(i)}
                    className="mt-1"
                    aria-label={`Mark procedure ${s.order} complete`}
                  />
                  <label htmlFor={id} className="flex-1 text-sm">
                    <span className="mr-2 rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs dark:bg-zinc-700">{s.order}</span>
                    {s.procedure}
                    {s.method && (
                      <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs uppercase tracking-wide text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                        {s.method}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function EvidenceSuggestion({ data }: { data: any }) {
  return (
    <div>
      {(data.control_title || data.framework) && (
        <p className="my-1 text-sm font-medium">
          {data.control_title}{data.framework ? ` · ${data.framework}` : ''}
        </p>
      )}
      {Array.isArray(data.evidence_items) && data.evidence_items.length > 0 && (
        <ul role="list" className="space-y-2">
          {data.evidence_items.map((e: any, i: number) => (
            <li key={i} role="listitem" className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="text-sm font-medium">{e.name}</div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {[e.format, e.cadence, e.source_system].filter(Boolean).join(' · ')}
              </div>
              {e.notes && <p className="mt-1 text-xs">{e.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Finding({ data }: { data: any }) {
  const fields: [string, string][] = [
    ['Criteria', data.criteria],
    ['Condition', data.condition],
    ['Cause', data.cause],
    ['Effect', data.effect],
    ['Recommendation', data.recommendation],
  ];
  return (
    <dl className="space-y-2">
      {fields.map(([label, value]) =>
        value ? (
          <div key={label} className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd className="mt-1 text-sm">{value}</dd>
          </div>
        ) : null
      )}
    </dl>
  );
}

export interface StructuredOutputProps {
  feature: string;
  data: unknown;
  className?: string;
}

const FEATURE_RENDERERS: Record<string, React.FC<{ data: any }>> = {
  gap_analysis: GapAnalysis,
  remediation_playbook: RemediationPlaybook,
  vulnerability_remediation: RemediationPlaybook,
  test_procedures: TestProcedures,
  evidence_suggestion: EvidenceSuggestion,
  evidence_suggest: EvidenceSuggestion,
  finding: Finding,
  audit_finding_draft: Finding,
};

export default function StructuredOutput({ feature, data, className }: StructuredOutputProps) {
  if (data == null || typeof data !== 'object') return null;
  const Renderer = FEATURE_RENDERERS[feature];
  if (!Renderer) return null;
  return (
    <div className={className} data-feature={feature} data-testid="structured-output">
      <Renderer data={data} />
    </div>
  );
}
