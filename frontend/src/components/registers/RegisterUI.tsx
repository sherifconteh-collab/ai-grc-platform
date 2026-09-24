// @tier: community
'use client';

/**
 * Presentation primitives shared by the six register pages (risks, incidents,
 * obligations, objectives, indicators, departments).
 *
 * Severity colouring in particular lives here rather than in each page: a heat
 * map that colours 16 as critical while the list beside it colours the same
 * risk as high is the kind of inconsistency that makes people stop trusting
 * the numbers.
 */

import { ReactNode } from 'react';
import type { SeverityBand, BreachLevel } from '@/lib/api';

const SEVERITY_STYLES: Record<SeverityBand, string> = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

const BREACH_STYLES: Record<BreachLevel, string> = {
  green: 'bg-green-100 text-green-800 border-green-200',
  amber: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  red: 'bg-red-100 text-red-800 border-red-200',
};

/** Heat-map cell fill. Matches riskRegisterService's 1-25 band boundaries. */
export function severityForScore(score: number | null | undefined): SeverityBand | null {
  if (score === null || score === undefined) return null;
  const numeric = Number(score);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  if (numeric <= 4) return 'low';
  if (numeric <= 9) return 'medium';
  if (numeric <= 15) return 'high';
  return 'critical';
}

export function SeverityChip({ severity, score, label }: {
  severity?: SeverityBand | null;
  score?: number | null;
  label?: string;
}) {
  const resolved = severity ?? severityForScore(score);
  if (!resolved) {
    return (
      <span
        className="text-xs font-medium px-2 py-1 rounded-full border bg-gray-100 text-gray-600 border-gray-200"
        aria-label={label ? `${label}: not assessed` : 'Not assessed'}
      >
        Not assessed
      </span>
    );
  }
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full border ${SEVERITY_STYLES[resolved]}`}
      aria-label={`${label || 'Severity'}: ${resolved}${score != null ? `, score ${score}` : ''}`}
    >
      {resolved}
      {score != null ? ` (${score})` : ''}
    </span>
  );
}

export function BreachChip({ level }: { level?: BreachLevel | null }) {
  if (!level) {
    return (
      <span className="text-xs px-2 py-1 rounded-full border bg-gray-100 text-gray-600 border-gray-200"
        aria-label="Indicator status: never measured">
        No reading
      </span>
    );
  }
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full border ${BREACH_STYLES[level]}`}
      aria-label={`Indicator status: ${level}`}>
      {level}
    </span>
  );
}

/** Neutral pill for statuses, categories and other enumerated values. */
export function Pill({ children, tone = 'neutral' }: {
  children: ReactNode;
  tone?: 'neutral' | 'info' | 'warn' | 'danger' | 'ok';
}) {
  const styles = {
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    warn: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    danger: 'bg-red-100 text-red-800 border-red-200',
    ok: 'bg-green-100 text-green-800 border-green-200',
  }[tone];
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full border ${styles}`}>
      {children}
    </span>
  );
}

export function StatCard({ label, value, tone = 'neutral', hint }: {
  label: string;
  value: number | string;
  tone?: 'neutral' | 'warn' | 'danger' | 'ok';
  hint?: string;
}) {
  const valueTone = {
    neutral: 'text-gray-900',
    warn: 'text-yellow-700',
    danger: 'text-red-700',
    ok: 'text-green-700',
  }[tone];
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({ title, description, action }: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-600 max-w-3xl">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-gray-700 font-medium">{message}</p>
      {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-sm text-gray-500" role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
      role="status">
      {message}
    </div>
  );
}

/** Turns snake_case enum values into readable labels without a lookup table. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export function Pagination({ page, limit, total, onChange }: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
      <p className="text-sm text-gray-600">
        Page {page} of {pages} — {total} total
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
