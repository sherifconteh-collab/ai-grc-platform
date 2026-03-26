'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBell from './NotificationBell';
import BrandLogo from './BrandLogo';
import { AccessUser, canAccessAuditorWorkspace, hasAnyPermission, hasPermission, hasTierAtLeast, hasRmfFramework, isPlatformAdmin, isDemoEmail, OrganizationTier } from '@/lib/access';

interface NavigationItem {
  name: string;
  href: string;
  icon: string;
  requiredPermissions?: string[];
  requiredPermissionsAny?: string[];
  minTier?: OrganizationTier;
  isVisible?: (user: AccessUser | null | undefined) => boolean;
}

interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

const navigationSections: NavigationSection[] = [
  {
    label: '',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: '📊', requiredPermissions: ['dashboard.read'] },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { name: 'Controls', href: '/dashboard/controls', icon: '✅', requiredPermissions: ['organizations.read'] },
      { name: 'Frameworks', href: '/dashboard/frameworks', icon: '📐', requiredPermissions: ['organizations.read'] },
      { name: 'Evidence', href: '/dashboard/evidence', icon: '📄', requiredPermissions: ['evidence.read'], minTier: 'pro' },
      { name: 'Assessments', href: '/dashboard/assessments', icon: '📋', requiredPermissions: ['assessments.read'] },
      { name: 'Reports', href: '/dashboard/reports', icon: '📑', requiredPermissions: ['reports.read'], minTier: 'pro' },
      { name: 'RMF Lifecycle', href: '/dashboard/rmf', icon: '🔄', requiredPermissions: ['assessments.read'], isVisible: (u) => hasRmfFramework(u) },
      { name: 'Auditor Workspace', href: '/dashboard/auditor-workspace', icon: '🗂️', requiredPermissions: ['assessments.read'], isVisible: (u) => canAccessAuditorWorkspace(u) },
    ],
  },
  {
    label: 'Assets & Risk',
    items: [
      { name: 'Assets', href: '/dashboard/assets', icon: '🏗️', requiredPermissions: ['assets.read'], minTier: 'pro' },
      { name: 'Vulnerabilities', href: '/dashboard/vulnerabilities', icon: '🛡️', requiredPermissions: ['assets.read'], minTier: 'pro' },
      { name: 'SBOM', href: '/dashboard/sbom', icon: '📦', requiredPermissions: ['assets.read'], minTier: 'enterprise' },
      { name: 'Security Posture', href: '/dashboard/security-posture', icon: '🛡️', requiredPermissions: ['ai.use'], minTier: 'pro' },
      { name: 'Threat Intelligence', href: '/dashboard/threat-intel', icon: '🎯', requiredPermissions: ['assets.read'], minTier: 'enterprise' },
      { name: 'Vendor Contracts', href: '/dashboard/vendor-risk', icon: '🤝', requiredPermissions: ['organizations.read'], minTier: 'pro' },
      { name: 'Third-Party Risk', href: '/dashboard/tprm', icon: '🔗', requiredPermissions: ['organizations.read'], minTier: 'enterprise' },
      { name: 'Financial Compliance', href: '/dashboard/cmdb/financial-services-workspace', icon: '🏦', requiredPermissions: ['assets.read'], minTier: 'govcloud' },
    ],
  },
  {
    label: 'AI & Intelligence',
    items: [
      { name: 'AI Analysis', href: '/dashboard/ai-analysis', icon: '✨', requiredPermissions: ['ai.use'] },
      { name: 'AI Security', href: '/dashboard/ai-security', icon: '🔐', requiredPermissions: ['ai.use'], minTier: 'enterprise' },
      { name: 'AI Monitoring', href: '/dashboard/ai-monitoring', icon: '🤖', requiredPermissions: ['ai.use'], minTier: 'pro' },
      { name: 'AI Governance', href: '/dashboard/ai-governance', icon: '🏛️', requiredPermissions: ['organizations.read'], minTier: 'enterprise' },
      { name: 'AI Threat Library', href: '/dashboard/plot4ai', icon: '🃏', requiredPermissions: ['organizations.read'] },
      { name: 'Knowledge Base', href: '/dashboard/knowledge-base', icon: '📚', requiredPermissions: ['ai.use'], minTier: 'enterprise' },
      { name: 'Regulatory News', href: '/dashboard/regulatory-news', icon: '📰', requiredPermissions: ['organizations.read'] },
    ],
  },
  {
    label: 'Organization',
    items: [
      { name: 'My Organizations', href: '/dashboard/my-organizations', icon: '🔀', requiredPermissions: ['organizations.read'] },
      { name: 'Organization Profile', href: '/dashboard/organization', icon: '🏢', requiredPermissions: ['organizations.read'] },
      { name: 'Operations', href: '/dashboard/operations', icon: '🧭', requiredPermissions: ['settings.manage'] },
      { name: 'Data Governance', href: '/dashboard/data-governance', icon: '🔒', requiredPermissions: ['settings.manage'], minTier: 'enterprise' },
      { name: 'Settings', href: '/dashboard/settings', icon: '⚙️', requiredPermissionsAny: ['settings.manage', 'roles.manage'] },
      { name: 'Notifications', href: '/dashboard/notifications', icon: '🔔', requiredPermissions: ['dashboard.read'] },
      { name: 'Help Center', href: '/dashboard/help', icon: '❓', requiredPermissions: ['dashboard.read'] },
      { name: 'Report Issue', href: '/dashboard/report-issue', icon: '🐛', requiredPermissions: ['dashboard.read'] },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isItemVisible = (item: NavigationItem) => {
    const hasRequiredPermission = item.requiredPermissions
      ? item.requiredPermissions.every((permission) => hasPermission(user, permission))
      : true;
    const hasAnyRequiredPermission = item.requiredPermissionsAny
      ? hasAnyPermission(user, item.requiredPermissionsAny)
      : true;
    const hasRequiredTier = item.minTier
      ? hasTierAtLeast(user, item.minTier)
      : true;
    const passesVisibilityGate = item.isVisible ? item.isVisible(user) : true;

    return hasRequiredPermission && hasAnyRequiredPermission && hasRequiredTier && passesVisibilityGate;
  };

  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter(isItemVisible),
    }))
    .filter((section) => section.items.length > 0);

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
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {visibleSections.map((section) => (
          <div key={section.label || '__root'}>
            {section.label && (
              <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
              return (
                <Link
                  key={`${item.href}-${item.name}`}
                  href={item.href}
                  className={`
                    flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors
                    ${
                      isActive
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }
                  `}
                >
                  <span className="mr-3 text-base">{item.icon}</span>
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}
        {isPlatformAdmin(user) && !isDemoEmail(user?.email) && (
          <>
            <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
              Platform Admin
            </div>
            <Link
              href="/dashboard/platform"
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                pathname === '/dashboard/platform'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-100 hover:bg-amber-800/40 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg">🛰️</span>
              Platform Overview
            </Link>
            <Link
              href="/dashboard/platform/settings"
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                pathname === '/dashboard/platform/settings'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-100 hover:bg-amber-800/40 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg">🎛️</span>
              Feature Flags
            </Link>
            <Link
              href="/dashboard/platform/organizations"
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                pathname.startsWith('/dashboard/platform/organizations')
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-100 hover:bg-amber-800/40 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg">🏢</span>
              All Organizations
            </Link>
            <Link
              href="/dashboard/platform/llm-status"
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                pathname === '/dashboard/platform/llm-status'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-100 hover:bg-amber-800/40 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg">🔌</span>
              LLM Status
            </Link>
          </>
        )}
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
