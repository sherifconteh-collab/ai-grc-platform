'use client';

import Link from 'next/link';
import { Inbox } from 'lucide-react';
import type { MyWorkItem } from '@/lib/api';
import { workItemAction } from '@/lib/deepLinks';

export type WorkFilter = 'all' | 'overdue' | 'week' | 'approvals' | 'reviews';

export const WORK_FILTERS: { id: WorkFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'week', label: 'This week' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'reviews', label: 'Reviews' },
];

const APPROVAL_KINDS = new Set(['poam_approval', 'exception_approval']);
const REVIEW_KINDS = new Set(['risk', 'pbc']);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekOutIso(): string {
  return new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
}

export function isWorkFilter(value: string | null): value is WorkFilter {
  return WORK_FILTERS.some((f) => f.id === value);
}

export function filterWork(items: MyWorkItem[], filter: WorkFilter): MyWorkItem[] {
  const today = todayIso();
  const weekOut = weekOutIso();
  switch (filter) {
    case 'overdue': return items.filter((i) => i.due_date && i.due_date < today);
    case 'week': return items.filter((i) => i.due_date && i.due_date >= today && i.due_date <= weekOut);
    case 'approvals': return items.filter((i) => APPROVAL_KINDS.has(i.kind));
    case 'reviews': return items.filter((i) => REVIEW_KINDS.has(i.kind));
    default: return items;
  }
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function DueBadge({ due }: { due: string | null }) {
  if (!due) return <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">No due date</span>;
  if (due < todayIso()) return <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Overdue, {formatDate(due)}</span>;
  if (due <= weekOutIso()) return <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Due {formatDate(due)}</span>;
  return <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">Due {formatDate(due)}</span>;
}

interface WorkListProps {
  items: MyWorkItem[];
  loading: boolean;
  emptyMessage: string;
}

export default function WorkList({ items, loading, emptyMessage }: WorkListProps) {
  if (loading && items.length === 0) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading your work">
        {[0, 1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-xl bg-white" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
        <Inbox className="h-8 w-8 text-gray-400" aria-hidden="true" />
        <p className="text-sm text-gray-600">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white" aria-label="Work items">
      {items.map((item) => {
        const action = workItemAction(item);
        const heading = item.ref ? `${item.ref} ${item.title}` : item.title;
        return (
          <li key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4" data-work-kind={item.kind} data-work-title={item.title}>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <DueBadge due={item.due_date} />
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{action.typeLabel}</span>
              </div>
              <Link href={action.href} className="block truncate text-base font-medium text-gray-900 hover:text-purple-800">
                {heading}
              </Link>
              {item.context && <p className="truncate text-sm text-gray-500">{item.context}</p>}
            </div>
            <Link
              href={action.href}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800"
              aria-label={`${action.label}: ${heading}`}
            >
              {action.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
