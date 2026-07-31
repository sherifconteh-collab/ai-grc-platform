// @tier: community
'use client';

/**
 * Organization structure — departments and business objectives.
 *
 * These were two separate dashboard pages. Both are org-configuration lists
 * with no lifecycle of their own: a hierarchy or a list, a create form, and a
 * roll-up. Two nav entries for that is bloat, and they are read together — you
 * assign an objective to a department, and a department's risk count only means
 * something next to the objectives that department owns.
 *
 * The registers with real lifecycles (risks, incidents, obligations,
 * indicators) stay on their own pages; they are not tabs of anything.
 *
 * Each tab is permission-gated independently, so a user with only
 * `objectives.read` sees one tab rather than an empty Departments view.
 */

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import DepartmentsPanel from '@/components/structure/DepartmentsPanel';
import ObjectivesPanel from '@/components/structure/ObjectivesPanel';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

type StructureTab = 'departments' | 'objectives';

function StructurePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const tabs = useMemo(() => ([
    { key: 'departments' as StructureTab, label: 'Departments', permission: 'departments.read' },
    { key: 'objectives' as StructureTab, label: 'Business Objectives', permission: 'objectives.read' },
  ].filter((tab) => hasPermission(user, tab.permission))), [user]);

  const requested = searchParams.get('tab');
  // Fall back to the first tab the user can actually see, so a bookmarked
  // ?tab=departments does not render a blank panel for someone who only has
  // objectives access.
  const active: StructureTab = tabs.some((t) => t.key === requested)
    ? (requested as StructureTab)
    : (tabs[0]?.key ?? 'departments');

  const selectTab = (tab: StructureTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/dashboard/structure?${params.toString()}`);
  };

  if (tabs.length === 0) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-gray-700 font-medium">
            You do not have access to the organization structure.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Organization structure</h1>
        <p className="mt-1 text-sm text-gray-600 max-w-3xl">
          The business units that own risks, incidents and obligations, and the
          objectives they work toward. ISO 31000 defines risk as the effect of
          uncertainty on objectives, so these two are read together.
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6" aria-label="Organization structure tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              aria-current={active === tab.key ? 'page' : undefined}
              className={`
                whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors
                ${active === tab.key
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {active === 'departments' ? <DepartmentsPanel /> : <ObjectivesPanel />}
    </DashboardLayout>
  );
}

export default function StructurePage() {
  return (
    <Suspense fallback={null}>
      <StructurePageInner />
    </Suspense>
  );
}
