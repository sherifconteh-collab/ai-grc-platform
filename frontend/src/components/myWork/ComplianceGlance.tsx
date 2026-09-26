'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { dashboardAPI } from '@/lib/api';
import { recordLinks } from '@/lib/deepLinks';

interface FrameworkStat {
  id: string;
  name: string;
  compliancePercentage: number;
}

interface GlanceData {
  overall: number;
  frameworks: FrameworkStat[];
}

function parseStats(raw: unknown): GlanceData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { overall?: { compliancePercentage?: unknown }; frameworks?: unknown };
  const overall = Number(data.overall?.compliancePercentage);
  if (!Number.isFinite(overall)) return null;
  const frameworks = Array.isArray(data.frameworks)
    ? data.frameworks
      .filter((f): f is FrameworkStat => Boolean(f) && typeof (f as FrameworkStat).name === 'string')
      .map((f) => ({ id: String(f.id), name: f.name, compliancePercentage: Number(f.compliancePercentage) || 0 }))
    : [];
  return { overall, frameworks };
}

export function useComplianceGlance() {
  const [data, setData] = useState<GlanceData | null>(null);
  useEffect(() => {
    dashboardAPI.getStats()
      .then((res) => setData(parseStats(res.data?.data)))
      .catch(() => setData(null));
  }, []);
  return data;
}

export default function ComplianceGlance({ data }: { data: GlanceData | null }) {
  if (!data) return null;
  return (
    <section aria-labelledby="glance-heading" className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 id="glance-heading" className="mb-3 text-base font-semibold text-gray-900">Compliance at a glance</h2>
      <ul className="space-y-3">
        {data.frameworks.slice(0, 4).map((f) => (
          <li key={f.id}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="truncate text-gray-700">{f.name}</span>
              <span className="font-semibold text-gray-900">{Math.round(f.compliancePercentage)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${f.name} compliance`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.compliancePercentage)}>
              <div className="h-full bg-purple-600" style={{ width: `${Math.min(100, f.compliancePercentage)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <Link href={recordLinks.complianceOverview()} className="mt-4 inline-block text-sm font-semibold text-purple-800 hover:underline">
        Open the full compliance dashboard
      </Link>
    </section>
  );
}
