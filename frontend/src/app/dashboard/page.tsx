// @tier: community
'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import WorkList, { WORK_FILTERS, WorkFilter, filterWork, isWorkFilter } from '@/components/myWork/WorkList';
import GettingStarted from '@/components/myWork/GettingStarted';
import ComplianceGlance, { useComplianceGlance } from '@/components/myWork/ComplianceGlance';
import { useAuth } from '@/contexts/AuthContext';
import { useMyWork } from '@/lib/useMyWork';
import { recordLinks } from '@/lib/deepLinks';

interface SummaryCardProps {
  label: string;
  value: string;
  tone: 'amber' | 'blue' | 'purple' | 'green';
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

const TONES: Record<SummaryCardProps['tone'], string> = {
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  purple: 'text-purple-800',
  green: 'text-green-700',
};

function SummaryCard({ label, value, tone, active, onClick, href }: SummaryCardProps) {
  const body = (
    <>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-3xl font-semibold ${TONES[tone]}`}>{value}</span>
    </>
  );
  const cls = `flex min-h-[92px] flex-col justify-between rounded-xl border bg-white p-4 text-left transition-colors hover:border-purple-400 ${active ? 'border-purple-600 ring-1 ring-purple-600' : 'border-gray-200'}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} aria-pressed={active} className={cls}>{body}</button>;
}

const EMPTY_MESSAGES: Record<WorkFilter, string> = {
  all: 'Nothing is waiting on you. New assignments, approvals and reviews will show up here.',
  overdue: 'Nothing is overdue.',
  week: 'Nothing is due in the next seven days.',
  approvals: 'Nothing is waiting on your approval.',
  reviews: 'No reviews or acknowledgments are waiting on you.',
};

function MyWorkInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFilter = searchParams.get('filter');
  const filter: WorkFilter = isWorkFilter(rawFilter) ? rawFilter : 'all';
  const { items, summary, loading, error, refresh } = useMyWork();
  const glance = useComplianceGlance();

  const setFilter = (next: WorkFilter) => {
    const target = next === 'all' || next === filter ? '/dashboard' : `/dashboard?filter=${next}`;
    router.replace(target, { scroll: false });
  };

  const visible = filterWork(items, filter);
  const firstName = user?.fullName?.split(' ')[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">My Work</h1>
        <p className="mt-1 text-gray-600">
          {firstName ? `${firstName}, here` : 'Here'} is everything waiting on you, across every module. Each item opens the exact record.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Overdue" value={String(summary?.overdue ?? 0)} tone="amber" active={filter === 'overdue'} onClick={() => setFilter('overdue')} />
        <SummaryCard label="Due this week" value={String(summary?.due_this_week ?? 0)} tone="blue" active={filter === 'week'} onClick={() => setFilter('week')} />
        <SummaryCard label="Waiting on your approval" value={String(summary?.approvals ?? 0)} tone="purple" active={filter === 'approvals'} onClick={() => setFilter('approvals')} />
        <SummaryCard label="Overall compliance" value={glance ? `${Math.round(glance.overall)}%` : '--'} tone="green" href={recordLinks.complianceOverview()} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter work">
            {WORK_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`min-h-[36px] rounded-full border px-3.5 text-sm font-medium ${filter === f.id ? 'border-purple-700 bg-purple-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'}`}
              >
                {f.label}
              </button>
            ))}
            <button type="button" onClick={() => { refresh(); }} className="ml-auto text-sm font-medium text-purple-800 hover:underline">
              Refresh
            </button>
          </div>
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <WorkList items={visible} loading={loading} emptyMessage={EMPTY_MESSAGES[filter]} />
        </div>
        <aside className="space-y-6">
          <GettingStarted />
          <ComplianceGlance data={glance} />
        </aside>
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="py-12 text-center text-gray-500">Loading...</div>}>
        <MyWorkInner />
      </Suspense>
    </DashboardLayout>
  );
}
