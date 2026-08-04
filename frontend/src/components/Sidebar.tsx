'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBell from './NotificationBell';
import BrandLogo from './BrandLogo';
import { AccessUser, canAccessAuditorWorkspace, hasAnyPermission, hasPermission, hasRmfFramework, isPlatformAdmin, isDemoEmail } from '@/lib/access';

interface NavigationItem {
  name: string;
  href: string;
  icon: string;
  requiredPermissions?: string[];
  requiredPermissionsAny?: string[];
  isVisible?: (user: AccessUser | null | undefined) => boolean;
}

/**
 * A labelled run of links inside a section. `label` is optional: the first
 * group in a section is usually the section's primary items and does not need
 * a heading repeating what the section already says.
 */
interface NavigationGroup {
  label?: string;
  items: NavigationItem[];
}

interface NavigationSection {
  label: string;
  icon: string;
  groups: NavigationGroup[];
  /** Amber treatment for the platform-admin section. */
  tone?: 'default' | 'admin';
  /**
   * Platform-admin gating needs the account's email (demo accounts are excluded)
   * and `AccessUser` deliberately does not carry one — it models permissions,
   * not identity. Declared as a flag here and evaluated in the component, where
   * the auth user is in scope, rather than widening the access type.
   */
  requiresPlatformAdmin?: boolean;
}

// Rendered above the sections, always visible, never collapsed.
const HOME_ITEM: NavigationItem = {
  name: 'Dashboard', href: '/dashboard', icon: '📊', requiredPermissions: ['dashboard.read'],
};

/**
 * Eight collapsible sections rather than four flat lists of a dozen-plus links
 * each. Grouping follows the GRC domains people already think in — compliance,
 * risk, regulatory obligations, assets and security — so a reader looking for
 * the risk register does not have to scan a "Compliance" list of sixteen.
 */
const navigationSections: NavigationSection[] = [
  {
    label: 'Compliance',
    icon: '✅',
    groups: [
      {
        items: [
          { name: 'Controls', href: '/dashboard/controls', icon: '✅', requiredPermissions: ['organizations.read'] },
          { name: 'AI Control Assessments', href: '/dashboard/controls/pending-assessments', icon: '🤖', requiredPermissions: ['implementations.read'] },
          { name: 'Exceptions', href: '/dashboard/exceptions', icon: '⚠️', requiredPermissions: ['controls.read'] },
          // Remediation sits at controls.read because that is what every POA&M
          // endpoint requires. It used to be reachable only as a tab on
          // Operations, which is gated on settings.manage -- so a compliance
          // analyst who could read and write POA&Ms via the API could not find
          // them in the product.
          { name: 'POA&M', href: '/dashboard/poam', icon: '📝', requiredPermissions: ['controls.read'] },
          { name: 'Frameworks', href: '/dashboard/frameworks', icon: '📐', requiredPermissions: ['organizations.read'] },
        ],
      },
      {
        label: 'Evidence & Audit',
        items: [
          { name: 'Evidence', href: '/dashboard/evidence', icon: '📄', requiredPermissions: ['evidence.read'] },
          { name: 'Assessments', href: '/dashboard/assessments', icon: '📋', requiredPermissions: ['assessments.read'] },
          { name: 'Auditor Workspace', href: '/dashboard/auditor-workspace', icon: '🗂️', requiredPermissions: ['assessments.read'], isVisible: (u) => canAccessAuditorWorkspace(u) },
        ],
      },
      {
        label: 'Programs',
        items: [
          { name: 'RMF Lifecycle', href: '/dashboard/rmf', icon: '🔄', requiredPermissions: ['assessments.read'], isVisible: (u) => hasRmfFramework(u) },
          { name: 'Cyber Resilience', href: '/dashboard/resilience', icon: '🛟', requiredPermissions: ['assessments.read'] },
        ],
      },
    ],
  },
  {
    label: 'Risk',
    icon: '🎲',
    groups: [
      {
        label: 'Register',
        items: [
          { name: 'Risk Register', href: '/dashboard/risks', icon: '🎲', requiredPermissions: ['risks.read'] },
          { name: 'Indicators', href: '/dashboard/indicators', icon: '📉', requiredPermissions: ['indicators.read'] },
        ],
      },
      {
        label: 'Response',
        items: [
          { name: 'Incidents', href: '/dashboard/incidents', icon: '🚨', requiredPermissions: ['incidents.read'] },
        ],
      },
      {
        label: 'Third Party',
        items: [
          { name: 'Third-Party Risk', href: '/dashboard/tprm', icon: '🔗', requiredPermissions: ['organizations.read'] },
          { name: 'Vendor Contracts', href: '/dashboard/vendor-risk', icon: '🤝', requiredPermissions: ['organizations.read'] },
        ],
      },
    ],
  },
  {
    label: 'Regulatory',
    icon: '⚖️',
    groups: [
      {
        items: [
          { name: 'Obligations', href: '/dashboard/obligations', icon: '⚖️', requiredPermissions: ['obligations.read'] },
          { name: 'Regulatory News', href: '/dashboard/regulatory-news', icon: '📰', requiredPermissions: ['organizations.read'] },
          { name: 'AI Laws', href: '/dashboard/ai-laws', icon: '🏛️', requiredPermissions: ['frameworks.read'] },
        ],
      },
    ],
  },
  {
    label: 'Assets & Security',
    icon: '🛡️',
    groups: [
      {
        label: 'Inventory',
        items: [
          { name: 'Assets', href: '/dashboard/assets', icon: '🏗️', requiredPermissions: ['assets.read'] },
          { name: 'SBOM', href: '/dashboard/sbom', icon: '📦', requiredPermissions: ['assets.read'] },
          { name: 'Financial Compliance', href: '/dashboard/cmdb/financial-services-workspace', icon: '🏦', requiredPermissions: ['assets.read'] },
        ],
      },
      {
        label: 'Threat & Vulnerability',
        items: [
          { name: 'Vulnerabilities', href: '/dashboard/vulnerabilities', icon: '🐞', requiredPermissions: ['assets.read'] },
          { name: 'Threat Intelligence', href: '/dashboard/threat-intel', icon: '🎯', requiredPermissions: ['assets.read'] },
          { name: 'Security Posture', href: '/dashboard/security-posture', icon: '🛡️', requiredPermissions: ['ai.use'] },
          { name: 'AI Threat Library', href: '/dashboard/plot4ai', icon: '🃏', requiredPermissions: ['organizations.read'] },
        ],
      },
    ],
  },
  {
    label: 'Insights & Reporting',
    icon: '📈',
    groups: [
      {
        items: [
          { name: 'AI Insights', href: '/dashboard/ai-insights', icon: '📈', requiredPermissions: ['ai.use'] },
          { name: 'Reports', href: '/dashboard/reports', icon: '📑', requiredPermissions: ['reports.read'] },
          { name: 'Dashboard Views', href: '/dashboard/views', icon: '🧩', requiredPermissions: ['dashboard.read'] },
        ],
      },
    ],
  },
  {
    label: 'Organization',
    icon: '🏢',
    groups: [
      {
        label: 'Structure',
        items: [
          { name: 'Organization Profile', href: '/dashboard/organization', icon: '🏢', requiredPermissions: ['organizations.read'] },
          { name: 'Structure', href: '/dashboard/structure', icon: '🏛️', requiredPermissionsAny: ['departments.read', 'objectives.read'] },
          { name: 'My Organizations', href: '/dashboard/my-organizations', icon: '🔀', requiredPermissions: ['organizations.read'] },
        ],
      },
      {
        label: 'Governance',
        items: [
          { name: 'Access Governance', href: '/dashboard/access-governance', icon: '🔑', requiredPermissions: ['access_governance.read'] },
          { name: 'Data Governance', href: '/dashboard/data-governance', icon: '🔒', requiredPermissions: ['settings.manage'] },
          { name: 'Operations', href: '/dashboard/operations', icon: '🧭', requiredPermissions: ['settings.manage'] },
        ],
      },
      {
        label: 'Preferences',
        items: [
          { name: 'Settings', href: '/dashboard/settings', icon: '⚙️', requiredPermissionsAny: ['settings.manage', 'roles.manage'] },
          { name: 'Notifications', href: '/dashboard/notifications', icon: '🔔', requiredPermissions: ['dashboard.read'] },
        ],
      },
    ],
  },
  {
    label: 'Learn & Support',
    icon: '📚',
    groups: [
      {
        items: [
          { name: 'Knowledge Base', href: '/dashboard/knowledge-base', icon: '📚', requiredPermissions: ['ai.use'] },
          { name: 'Training', href: '/dashboard/training', icon: '🎓', requiredPermissions: ['dashboard.read'] },
          { name: 'Help Center', href: '/dashboard/help', icon: '❓', requiredPermissions: ['dashboard.read'] },
          { name: 'Report Issue', href: '/dashboard/report-issue', icon: '🐛', requiredPermissions: ['dashboard.read'] },
        ],
      },
    ],
  },
  {
    label: 'Platform Admin',
    icon: '🛰️',
    tone: 'admin',
    requiresPlatformAdmin: true,
    groups: [
      {
        items: [
          { name: 'Platform Overview', href: '/dashboard/platform', icon: '🛰️' },
          { name: 'Feature Flags', href: '/dashboard/platform/settings', icon: '🎛️' },
          { name: 'All Organizations', href: '/dashboard/platform/organizations', icon: '🏢' },
          { name: 'LLM Status', href: '/dashboard/platform/llm-status', icon: '🔌' },
          { name: 'Backups', href: '/dashboard/platform/backups', icon: '💾' },
          { name: 'Security', href: '/dashboard/platform/security', icon: '🔒' },
          { name: 'License', href: '/dashboard/platform/license', icon: '🪪' },
        ],
      },
    ],
  },
];

const COLLAPSE_STORAGE_KEY = 'sidebarCollapsedSections';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isItemVisible = useCallback((item: NavigationItem) => {
    const hasRequiredPermission = item.requiredPermissions
      ? item.requiredPermissions.every((permission) => hasPermission(user, permission))
      : true;
    const hasAnyRequiredPermission = item.requiredPermissionsAny
      ? hasAnyPermission(user, item.requiredPermissionsAny)
      : true;
    const passesVisibilityGate = item.isVisible ? item.isVisible(user) : true;

    return hasRequiredPermission && hasAnyRequiredPermission && passesVisibilityGate;
  }, [user]);

  // Sections and groups that end up empty after permission filtering are
  // dropped entirely, so a collapsed header never opens onto nothing.
  const showPlatformAdmin = isPlatformAdmin(user) && !isDemoEmail(user?.email);

  const visibleSections = useMemo(() => navigationSections
    .filter((section) => (section.requiresPlatformAdmin ? showPlatformAdmin : true))
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({ ...group, items: group.items.filter(isItemVisible) }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((section) => section.groups.length > 0), [user, isItemVisible]);

  /**
   * Longest-matching href wins, so /dashboard/controls/pending-assessments
   * highlights "AI Control Assessments" and not "Controls" as well. A plain
   * startsWith check lights up both, which is how a sidebar starts lying about
   * where you are.
   */
  const activeHref = useMemo(() => {
    const candidates = [
      HOME_ITEM,
      ...visibleSections.flatMap((s) => s.groups.flatMap((g) => g.items)),
    ];
    let best = '';
    candidates.forEach((item) => {
      const matches = item.href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && item.href.length > best.length) best = item.href;
    });
    return best;
  }, [pathname, visibleSections]);

  const sectionContainingActive = useMemo(() => visibleSections.find(
    (section) => section.groups.some((group) => group.items.some((item) => item.href === activeHref))
  )?.label, [visibleSections, activeHref]);

  // Everything starts collapsed; the section you are in opens itself. Undefined
  // until the stored preference is read so the first paint does not flash a
  // different state than the one the user left behind.
  const [collapsed, setCollapsed] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let stored: Record<string, boolean> = {};
    try {
      const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          stored = Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
              .filter(([, value]) => typeof value === 'boolean')
          ) as Record<string, boolean>;
        }
      }
    } catch {
      // A corrupt or unavailable preference is not worth breaking navigation
      // over — fall through to the default collapsed state.
      stored = {};
    }
    const defaults = Object.fromEntries(
      navigationSections.map((section) => [section.label, true])
    );
    setCollapsed({ ...defaults, ...stored });
  }, []);

  // Navigating into a collapsed section expands it, so a deep link never lands
  // you on a page whose nav entry is hidden.
  useEffect(() => {
    if (!sectionContainingActive) return;
    setCollapsed((current) => {
      if (!current || current[sectionContainingActive] === false) return current;
      return { ...current, [sectionContainingActive]: false };
    });
  }, [sectionContainingActive]);

  const toggleSection = (label: string) => {
    setCollapsed((current) => {
      const next = { ...(current || {}), [label]: !(current?.[label] ?? true) };
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Preference persistence is a nicety; ignore quota or privacy-mode errors.
      }
      return next;
    });
  };

  const isCollapsed = (label: string) => (collapsed ? collapsed[label] ?? true : label !== sectionContainingActive);

  const itemClasses = (isActive: boolean, tone: 'default' | 'admin') => {
    if (isActive) {
      return tone === 'admin' ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white';
    }
    return tone === 'admin'
      ? 'text-amber-100/90 hover:bg-amber-800/40 hover:text-white'
      : 'text-gray-300 hover:bg-gray-800 hover:text-white';
  };

  return (
    <div className="relative z-20 flex h-screen flex-col w-64 bg-gray-900 overflow-hidden">
      {/* Logo */}
      <div className="flex items-center h-16 px-4 bg-gray-800 border-b border-gray-700">
        <BrandLogo
          className="flex items-center gap-3"
          imageClassName="h-9 w-9 rounded-full"
          showTagline={false}
          showWordmark={true}
          size={36}
          wordmarkClassName="text-lg font-bold text-white leading-tight"
        />
      </div>

      {/* User Info */}
      <div className="relative z-30 p-4 border-b border-gray-700 overflow-visible">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
            {user?.fullName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.fullName || 'User'}
            </p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            {user?.organizationName && (
              <p className="text-xs text-purple-400 truncate" title={user.organizationName}>
                🏢 {user.organizationName}
              </p>
            )}
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1" aria-label="Main navigation">
        {isItemVisible(HOME_ITEM) && (
          <Link
            href={HOME_ITEM.href}
            aria-current={activeHref === HOME_ITEM.href ? 'page' : undefined}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${itemClasses(activeHref === HOME_ITEM.href, 'default')}`}
          >
            <span className="mr-3 text-base">{HOME_ITEM.icon}</span>
            {HOME_ITEM.name}
          </Link>
        )}

        {visibleSections.map((section) => {
          const tone = section.tone || 'default';
          const sectionId = `nav-section-${section.label.replace(/\s+/g, '-').toLowerCase()}`;
          const collapsedNow = isCollapsed(section.label);
          const containsActive = section.label === sectionContainingActive;

          return (
            <div key={section.label} className="pt-1">
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={!collapsedNow}
                aria-controls={sectionId}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold
                  uppercase tracking-wider transition-colors
                  ${tone === 'admin'
                    ? 'text-amber-300 hover:bg-amber-800/30'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
                `}
              >
                <span className="text-sm" aria-hidden="true">{section.icon}</span>
                <span className="flex-1 text-left">{section.label}</span>
                {/* A dot marks the section you are in while it is closed, so
                    collapsing does not lose your place. */}
                {collapsedNow && containsActive && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${tone === 'admin' ? 'bg-amber-400' : 'bg-purple-400'}`}
                    aria-hidden="true"
                  />
                )}
                <svg
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsedNow ? '' : 'rotate-90'}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 5.21a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L10.94 10 7.21 6.27a.75.75 0 010-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              <div id={sectionId} hidden={collapsedNow} className="mt-0.5 space-y-0.5">
                {section.groups.map((group, groupIndex) => (
                  <div key={group.label || `group-${groupIndex}`}>
                    {group.label && (
                      <div className="px-3 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                        {group.label}
                      </div>
                    )}
                    {group.items.map((item) => {
                      const isActive = item.href === activeHref;
                      return (
                        <Link
                          key={`${item.href}-${item.name}`}
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          className={`
                            flex items-center pl-6 pr-3 py-2 text-sm font-medium rounded-lg
                            transition-colors ${itemClasses(isActive, tone)}
                          `}
                        >
                          <span className="mr-2.5 text-base" aria-hidden="true">{item.icon}</span>
                          <span className="truncate">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={logout}
          className="w-full flex items-center px-4 py-2 text-sm font-medium text-gray-300 rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span className="mr-3">🚪</span>
          Logout
        </button>
      </div>
    </div>
  );
}
