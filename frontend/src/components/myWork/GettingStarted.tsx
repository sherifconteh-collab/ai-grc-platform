'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Circle, X } from 'lucide-react';
import { GettingStartedFlags, myWorkAPI } from '@/lib/api';
import { createLinks, recordLinks } from '@/lib/deepLinks';

const DISMISS_KEY = 'cw_getting_started_dismissed';

const STEPS: { key: keyof GettingStartedFlags; label: string; href: string }[] = [
  { key: 'framework_selected', label: 'Choose your frameworks', href: '/dashboard/organization' },
  { key: 'control_updated', label: 'Set the status of a control', href: '/dashboard/controls' },
  { key: 'evidence_uploaded', label: 'Upload your first evidence', href: createLinks.evidence() },
  { key: 'teammate_invited', label: 'Invite a teammate', href: recordLinks.settings('users-and-roles') },
  { key: 'risk_recorded', label: 'Record a risk', href: createLinks.risk() },
  { key: 'integration_connected', label: 'Connect an integration', href: '/dashboard/integrations' },
];

export default function GettingStarted() {
  const [flags, setFlags] = useState<GettingStartedFlags | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
    myWorkAPI.gettingStarted()
      .then((res) => setFlags(res.data?.data ?? null))
      .catch(() => setFlags(null));
  }, []);

  if (!flags || dismissed) return null;
  const done = STEPS.filter((s) => flags[s.key]).length;
  if (done === STEPS.length) return null;

  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* per-browser preference only */ }
  };

  return (
    <section aria-labelledby="getting-started-heading" className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 id="getting-started-heading" className="text-base font-semibold text-gray-900">Getting started</h2>
          <p className="text-sm text-gray-500">{done} of {STEPS.length} done</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Hide getting started" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="Getting started progress" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done}>
        <div className="h-full bg-purple-600" style={{ width: `${(done / STEPS.length) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {STEPS.map((step) => (
          <li key={step.key}>
            {flags[step.key] ? (
              <span className="flex items-center gap-2 py-1.5 text-sm text-gray-400 line-through">
                <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                {step.label}
              </span>
            ) : (
              <Link href={step.href} className="flex items-center gap-2 rounded-md py-1.5 text-sm font-medium text-purple-800 hover:underline">
                <Circle className="h-4 w-4 text-gray-300" aria-hidden="true" />
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
