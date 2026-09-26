/**
 * Settings sections, each with its own URL (/dashboard/settings/<slug>), so a
 * warning, a search result or a help article can link straight to it. The
 * settings screen, its left-hand nav and the Ctrl+K palette all read this list.
 */
import { AccessUser, hasPermission, isPlatformAdmin } from './access';

export type SettingsTab =
  | 'roles'
  | 'llm'
  | 'ai_activity'
  | 'automation'
  | 'notifications'
  | 'integrations'
  | 'content'
  | 'audit'
  | 'platform'
  | 'security'
  | 'sso'
  | 'account';

export interface SettingsSection {
  tab: SettingsTab;
  slug: string;
  label: string;
  group: 'You' | 'Organization';
  /** Extra words the "Find a setting" box and Ctrl+K match on. */
  keywords: string[];
  isVisible: (user: AccessUser | null | undefined) => boolean;
}

const canManageSettings = (u: AccessUser | null | undefined) => hasPermission(u, 'settings.manage');

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { tab: 'security', slug: 'security', label: 'Security and sign-in', group: 'You', keywords: ['password', 'two-factor', '2fa', 'totp', 'mfa', 'passkey', 'sessions'], isVisible: () => true },
  { tab: 'notifications', slug: 'notifications', label: 'Notifications', group: 'You', keywords: ['email', 'alerts', 'smtp', 'digest'], isVisible: () => true },
  { tab: 'roles', slug: 'users-and-roles', label: 'Users and roles', group: 'Organization', keywords: ['invite', 'team', 'permissions', 'rbac', 'members'], isVisible: (u) => hasPermission(u, 'roles.manage') },
  { tab: 'sso', slug: 'single-sign-on', label: 'Single sign-on', group: 'Organization', keywords: ['sso', 'oidc', 'okta', 'azure ad', 'auth0', 'keycloak'], isVisible: canManageSettings },
  { tab: 'llm', slug: 'ai-providers', label: 'AI providers', group: 'Organization', keywords: ['llm', 'api key', 'byok', 'claude', 'openai', 'gemini', 'model'], isVisible: canManageSettings },
  { tab: 'ai_activity', slug: 'ai-activity', label: 'AI activity', group: 'Organization', keywords: ['ai usage', 'decision log'], isVisible: canManageSettings },
  { tab: 'integrations', slug: 'integrations', label: 'Integrations', group: 'Organization', keywords: ['splunk', 'siem', 'webhooks'], isVisible: canManageSettings },
  { tab: 'automation', slug: 'automation', label: 'Automation', group: 'Organization', keywords: ['crosswalk', 'threshold', 'jobs', 'schedules'], isVisible: canManageSettings },
  { tab: 'content', slug: 'content', label: 'Content', group: 'Organization', keywords: ['templates', 'branding'], isVisible: canManageSettings },
  { tab: 'audit', slug: 'audit-log', label: 'Audit log', group: 'Organization', keywords: ['audit trail', 'events', 'history', 'au-2'], isVisible: canManageSettings },
  { tab: 'platform', slug: 'platform', label: 'Platform', group: 'Organization', keywords: ['platform admin'], isVisible: (u) => canManageSettings(u) && isPlatformAdmin(u) },
  { tab: 'account', slug: 'account', label: 'Account and data', group: 'Organization', keywords: ['export', 'cancel', 'delete organization', 'data export'], isVisible: canManageSettings },
];

export function sectionForSlug(slug: string | undefined): SettingsSection | undefined {
  return slug ? SETTINGS_SECTIONS.find((s) => s.slug === slug) : undefined;
}

export function sectionForTab(tab: string | null | undefined): SettingsSection | undefined {
  return tab ? SETTINGS_SECTIONS.find((s) => s.tab === tab) : undefined;
}

export function visibleSettingsSections(user: AccessUser | null | undefined): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => s.isVisible(user));
}

export function defaultSettingsSection(user: AccessUser | null | undefined): SettingsSection {
  const preferred: SettingsTab = hasPermission(user, 'roles.manage') ? 'roles' : canManageSettings(user) ? 'llm' : 'security';
  return sectionForTab(preferred) ?? SETTINGS_SECTIONS[0];
}
