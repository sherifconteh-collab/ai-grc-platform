/**
 * The app's navigation map, shared by the sidebar, the mobile menu and the
 * Ctrl+K palette's "Go to" list, so the three can never disagree about what a
 * page is called or where it lives. scripts/check-ui-links.js verifies every
 * href here resolves to a page.
 */
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, Bell, Bug, Building, Building2, ChartLine, CircleCheck,
  CircleHelp, ClipboardCheck, ClipboardList, Compass, Crosshair, Dices, FileChartColumn,
  FileText, FolderKanban, GraduationCap, House, Landmark, LayoutGrid, Layers, LifeBuoy, Link2, Lock, Network,
  Newspaper, Package, Plug, RefreshCw, Satellite, Scale, Server, Settings, Shield,
  ShieldAlert, ShieldCheck, Siren, ToggleLeft, TrendingDown, TriangleAlert, UserCheck,
  BookOpen, MessageSquareWarning, IdCard, HardDrive, Bot,
} from 'lucide-react';
import { AccessUser, canAccessAuditorWorkspace, hasAnyPermission, hasPermission, hasRmfFramework } from './access';

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  requiredPermissions?: string[];
  requiredPermissionsAny?: string[];
  isVisible?: (user: AccessUser | null | undefined) => boolean;
  /** Extra words the Ctrl+K palette matches on. */
  keywords?: string[];
}

/**
 * A labelled run of links inside a section. `label` is optional: the first
 * group in a section is usually the section's primary items and does not need
 * a heading repeating what the section already says.
 */
export interface NavigationGroup {
  label?: string;
  items: NavigationItem[];
}

export interface NavigationSection {
  label: string;
  icon: LucideIcon;
  groups: NavigationGroup[];
  /** Amber treatment for the platform-admin section. */
  tone?: 'default' | 'admin';
  /**
   * Platform-admin gating needs the account's email (demo accounts are
   * excluded) and `AccessUser` deliberately does not carry one. Evaluated
   * where the auth user is in scope.
   */
  requiresPlatformAdmin?: boolean;
}

// Rendered above the sections, always visible, never collapsed. Home is My Work.
export const HOME_ITEM: NavigationItem = {
  name: 'Home', href: '/dashboard', icon: House, requiredPermissions: ['dashboard.read'], keywords: ['my work', 'tasks', 'assigned'],
};

/**
 * Eight collapsible sections grouped by the GRC domains people already think in.
 * Merged pages (vendor contracts into Third-Party Risk, automated and pending
 * evidence into Evidence) keep their old URLs as redirects, so bookmarks still
 * land in the right place. This community edition has no Policies frontend
 * page, no ERP module and no financial-audit/HIPAA-SRA modules, so those items
 * that ControlWeaver-Pro carries are simply absent here.
 */
export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    label: 'Compliance',
    icon: CircleCheck,
    groups: [
      {
        items: [
          { name: 'Controls', href: '/dashboard/controls', icon: ShieldCheck, requiredPermissions: ['organizations.read'] },
          { name: 'AI Control Assessments', href: '/dashboard/controls/pending-assessments', icon: Bot, requiredPermissions: ['implementations.read'] },
          { name: 'Exceptions', href: '/dashboard/exceptions', icon: TriangleAlert, requiredPermissions: ['controls.read'] },
          // POA&M sits at controls.read because that is what every POA&M endpoint requires.
          { name: 'POA&M', href: '/dashboard/poam', icon: ClipboardList, requiredPermissions: ['controls.read'], keywords: ['remediation', 'plan of action'] },
          { name: 'Frameworks', href: '/dashboard/frameworks', icon: Layers, requiredPermissions: ['organizations.read'] },
          { name: 'Compliance Overview', href: '/dashboard/overview', icon: ChartLine, requiredPermissions: ['dashboard.read'], keywords: ['dashboard', 'score'] },
        ],
      },
      {
        label: 'Evidence & Audit',
        items: [
          { name: 'Evidence', href: '/dashboard/evidence', icon: FileText, requiredPermissions: ['evidence.read'], keywords: ['upload', 'artifacts', 'auto collection', 'pending evidence'] },
          { name: 'Assessments', href: '/dashboard/assessments', icon: ClipboardCheck, requiredPermissions: ['assessments.read'] },
          { name: 'Auditor Workspace', href: '/dashboard/auditor-workspace', icon: FolderKanban, requiredPermissions: ['assessments.read'], isVisible: (u) => canAccessAuditorWorkspace(u), keywords: ['pbc', 'workpapers', 'findings'] },
        ],
      },
      {
        label: 'Programs',
        items: [
          { name: 'RMF Lifecycle', href: '/dashboard/rmf', icon: RefreshCw, requiredPermissions: ['assessments.read'], isVisible: (u) => hasRmfFramework(u) },
          { name: 'Cyber Resilience', href: '/dashboard/resilience', icon: LifeBuoy, requiredPermissions: ['assessments.read'] },
        ],
      },
    ],
  },
  {
    label: 'Risk',
    icon: Dices,
    groups: [
      {
        label: 'Register',
        items: [
          { name: 'Risk Register', href: '/dashboard/risks', icon: Dices, requiredPermissions: ['risks.read'] },
          { name: 'Indicators', href: '/dashboard/indicators', icon: TrendingDown, requiredPermissions: ['indicators.read'], keywords: ['kri', 'kpi'] },
        ],
      },
      {
        label: 'Response',
        items: [
          { name: 'Incidents', href: '/dashboard/incidents', icon: Siren, requiredPermissions: ['incidents.read'] },
        ],
      },
      {
        label: 'Third Party',
        items: [
          { name: 'Third-Party Risk', href: '/dashboard/tprm', icon: Link2, requiredPermissions: ['tprm.read'], keywords: ['vendors', 'vendor contracts', 'tprm'] },
        ],
      },
    ],
  },
  {
    label: 'Regulatory',
    icon: Scale,
    groups: [
      {
        items: [
          { name: 'Obligations', href: '/dashboard/obligations', icon: Scale, requiredPermissions: ['obligations.read'] },
          { name: 'Regulatory News', href: '/dashboard/regulatory-news', icon: Newspaper, requiredPermissions: ['organizations.read'] },
          { name: 'AI Laws', href: '/dashboard/ai-laws', icon: Landmark, requiredPermissions: ['frameworks.read'] },
        ],
      },
    ],
  },
  {
    label: 'Assets & Security',
    icon: Shield,
    groups: [
      {
        label: 'Inventory',
        items: [
          { name: 'Assets', href: '/dashboard/assets', icon: Server, requiredPermissions: ['assets.read'], keywords: ['cmdb', 'inventory', 'hardware', 'software'] },
          { name: 'SBOM', href: '/dashboard/sbom', icon: Package, requiredPermissions: ['assets.read'] },
          { name: 'Financial Compliance', href: '/dashboard/cmdb/financial-services-workspace', icon: Building2, requiredPermissions: ['assets.read'] },
        ],
      },
      {
        label: 'Threat & Vulnerability',
        items: [
          { name: 'Vulnerabilities', href: '/dashboard/vulnerabilities', icon: Bug, requiredPermissions: ['assets.read'] },
          { name: 'Threat Intelligence', href: '/dashboard/threat-intel', icon: Crosshair, requiredPermissions: ['assets.read'] },
          { name: 'Security Posture', href: '/dashboard/security-posture', icon: Shield, requiredPermissions: ['ai.use'] },
          { name: 'AI Threat Library', href: '/dashboard/plot4ai', icon: Layers, requiredPermissions: ['organizations.read'] },
        ],
      },
    ],
  },
  {
    label: 'Insights & Reporting',
    icon: ChartLine,
    groups: [
      {
        items: [
          { name: 'AI Insights', href: '/dashboard/ai-insights', icon: ChartLine, requiredPermissions: ['ai.use'] },
          { name: 'Reports', href: '/dashboard/reports', icon: FileChartColumn, requiredPermissions: ['reports.read'] },
          { name: 'Dashboard Views', href: '/dashboard/views', icon: LayoutGrid, requiredPermissions: ['dashboard.read'] },
        ],
      },
    ],
  },
  {
    label: 'Organization',
    icon: Building2,
    groups: [
      {
        label: 'Structure',
        items: [
          { name: 'Organization Profile', href: '/dashboard/organization', icon: Building, requiredPermissions: ['organizations.read'] },
          { name: 'Structure', href: '/dashboard/structure', icon: Network, requiredPermissionsAny: ['departments.read', 'objectives.read'] },
          { name: 'My Organizations', href: '/dashboard/my-organizations', icon: ArrowLeftRight, requiredPermissions: ['organizations.read'] },
        ],
      },
      {
        label: 'Governance',
        items: [
          { name: 'Access Governance', href: '/dashboard/access-governance', icon: UserCheck, requiredPermissions: ['access_governance.read'] },
          { name: 'Data Governance', href: '/dashboard/data-governance', icon: Lock, requiredPermissions: ['settings.manage'] },
          { name: 'Operations', href: '/dashboard/operations', icon: Compass, requiredPermissions: ['settings.manage'] },
        ],
      },
      {
        label: 'Preferences',
        items: [
          { name: 'Settings', href: '/dashboard/settings', icon: Settings, requiredPermissionsAny: ['settings.manage', 'roles.manage'] },
          { name: 'Notifications', href: '/dashboard/notifications', icon: Bell, requiredPermissions: ['dashboard.read'] },
        ],
      },
    ],
  },
  {
    label: 'Learn & Support',
    icon: BookOpen,
    groups: [
      {
        items: [
          { name: 'Knowledge Base', href: '/dashboard/knowledge-base', icon: BookOpen, requiredPermissions: ['ai.use'] },
          { name: 'Training', href: '/dashboard/training', icon: GraduationCap, requiredPermissions: ['dashboard.read'] },
          { name: 'Help Center', href: '/dashboard/help', icon: CircleHelp, requiredPermissions: ['dashboard.read'] },
          { name: 'Report Issue', href: '/dashboard/report-issue', icon: MessageSquareWarning, requiredPermissions: ['dashboard.read'] },
        ],
      },
    ],
  },
  {
    label: 'Platform Admin',
    icon: Satellite,
    tone: 'admin',
    requiresPlatformAdmin: true,
    groups: [
      {
        items: [
          { name: 'Platform Overview', href: '/dashboard/platform', icon: Satellite },
          { name: 'Feature Flags', href: '/dashboard/platform/settings', icon: ToggleLeft },
          { name: 'All Organizations', href: '/dashboard/platform/organizations', icon: Building2 },
          { name: 'LLM Status', href: '/dashboard/platform/llm-status', icon: Plug },
          { name: 'Backups', href: '/dashboard/platform/backups', icon: HardDrive },
          { name: 'Security', href: '/dashboard/platform/security', icon: ShieldAlert },
          { name: 'License', href: '/dashboard/platform/license', icon: IdCard },
        ],
      },
    ],
  },
];

/** Pinned by default for a new user; each person can change theirs. */
export const DEFAULT_PINNED_HREFS = [
  '/dashboard/controls',
  '/dashboard/evidence',
  '/dashboard/poam',
  '/dashboard/risks',
  '/dashboard/assessments',
];

export function isNavItemVisible(item: NavigationItem, user: AccessUser | null | undefined): boolean {
  const hasRequired = item.requiredPermissions
    ? item.requiredPermissions.every((permission) => hasPermission(user, permission))
    : true;
  const hasAny = item.requiredPermissionsAny ? hasAnyPermission(user, item.requiredPermissionsAny) : true;
  const passesGate = item.isVisible ? item.isVisible(user) : true;
  return hasRequired && hasAny && passesGate;
}

export function visibleSections(user: AccessUser | null | undefined, showPlatformAdmin: boolean): NavigationSection[] {
  return NAVIGATION_SECTIONS
    .filter((section) => (section.requiresPlatformAdmin ? showPlatformAdmin : true))
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({ ...group, items: group.items.filter((item) => isNavItemVisible(item, user)) }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}

export function allNavItems(sections: NavigationSection[]): NavigationItem[] {
  return sections.flatMap((section) => section.groups.flatMap((group) => group.items));
}
