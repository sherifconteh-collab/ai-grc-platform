'use client';

/**
 * Status, priority and severity chips for remediation records.
 *
 * Lifted out of app/dashboard/operations/page.tsx so the Operations rollup, the
 * dedicated list, the detail page and the control screen all colour the same
 * status the same way. Two copies of a status colour map is how "pending
 * auditor review" ends up amber on one screen and grey on another.
 */

export const POAM_STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  pending_review: 'bg-indigo-100 text-indigo-800',
  pending_auditor_review: 'bg-purple-100 text-purple-800',
  auditor_approved: 'bg-green-100 text-green-800',
  auditor_rejected: 'bg-red-100 text-red-800',
  closed: 'bg-green-100 text-green-800',
  risk_accepted: 'bg-purple-100 text-purple-800',
  delayed: 'bg-red-100 text-red-800',
};

export const POAM_PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

export const MILESTONE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  delayed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

interface StatusBadgeProps {
  value: string | null | undefined;
  colorMap?: Record<string, string>;
  /** Accessible label, e.g. "Status: open". Chips are otherwise bare text. */
  label?: string;
}

export function StatusBadge({ value, colorMap = POAM_STATUS_COLORS, label }: StatusBadgeProps) {
  const normalized = String(value || '').toLowerCase();
  const cls = colorMap[normalized] || 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}
      aria-label={label || (value ? `${String(value).replace(/_/g, ' ')}` : undefined)}
    >
      {String(value || '—').replace(/_/g, ' ')}
    </span>
  );
}

export function PriorityBadge({ value }: { value: string | null | undefined }) {
  return <StatusBadge value={value || 'medium'} colorMap={POAM_PRIORITY_COLORS} label={`Priority: ${value || 'medium'}`} />;
}

/**
 * Days between the original commitment and the current target.
 *
 * Migration 134 split scheduled_completion_date from due_date precisely so a
 * moved date is visible rather than silent, so this renders zero slippage
 * explicitly rather than hiding it.
 */
export function SlippageIndicator({
  scheduledCompletionDate,
  dueDate,
}: {
  scheduledCompletionDate: string | null | undefined;
  dueDate: string | null | undefined;
}) {
  if (!scheduledCompletionDate || !dueDate) return null;

  const scheduled = new Date(scheduledCompletionDate);
  const due = new Date(dueDate);
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(due.getTime())) return null;

  const days = Math.round((due.getTime() - scheduled.getTime()) / 86_400_000);

  if (days === 0) {
    return <span className="text-xs text-green-700">On the original schedule</span>;
  }
  if (days < 0) {
    return <span className="text-xs text-green-700">{Math.abs(days)} day(s) ahead of the original schedule</span>;
  }
  return (
    <span className="text-xs text-red-700 font-medium">
      Slipped {days} day(s) from the original commitment
    </span>
  );
}
