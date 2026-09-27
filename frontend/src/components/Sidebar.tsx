'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, LogOut, Pin, PinOff, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import BrandLogo from './BrandLogo';
import { hasPermission, isDemoEmail, isPlatformAdmin } from '@/lib/access';
import {
  allNavItems, DEFAULT_PINNED_HREFS, HOME_ITEM, NAVIGATION_SECTIONS, NavigationItem, isNavItemVisible, visibleSections,
} from '@/lib/navigation';
import { useMyWork } from '@/lib/useMyWork';

const COLLAPSE_STORAGE_KEY = 'sidebarCollapsedSections';
const PINS_STORAGE_KEY = 'cw_nav_pins';

interface SidebarProps {
  /** Small screens only: whether the drawer is open. Ignored at md and up. */
  mobileOpen?: boolean;
  onClose?: () => void;
}

function readStoredBooleans(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean')
    ) as Record<string, boolean>;
  } catch {
    // A corrupt or unavailable preference is not worth breaking navigation over.
    return {};
  }
}

function readStoredPins(): string[] {
  try {
    const raw = window.localStorage.getItem(PINS_STORAGE_KEY);
    if (!raw) return DEFAULT_PINNED_HREFS;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : DEFAULT_PINNED_HREFS;
  } catch {
    return DEFAULT_PINNED_HREFS;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preference persistence is a nicety; ignore quota or privacy-mode errors.
  }
}

/** Longest-matching href wins, so a sub-page does not light up its parent too. */
function findActiveHref(pathname: string, items: NavigationItem[]): string {
  let best = '';
  items.forEach((item) => {
    const matches = item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && item.href.length > best.length) best = item.href;
  });
  return best;
}

interface NavLinkProps {
  item: NavigationItem;
  active: boolean;
  tone: 'default' | 'admin';
  indent?: boolean;
  pinned?: boolean;
  onTogglePin?: (href: string) => void;
  onNavigate?: () => void;
}

function NavLink({ item, active, tone, indent, pinned, onTogglePin, onNavigate }: NavLinkProps) {
  const Icon = item.icon;
  const base = active
    ? tone === 'admin' ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white'
    : tone === 'admin' ? 'text-amber-100/90 hover:bg-amber-800/40 hover:text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white';
  return (
    <div className={`group flex items-center rounded-lg ${base}`}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[40px] flex-1 items-center gap-2.5 ${indent ? 'pl-6' : 'pl-3'} pr-2 py-2 text-sm font-medium`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.name}</span>
      </Link>
      {onTogglePin && (
        <button
          type="button"
          onClick={() => onTogglePin(item.href)}
          aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
          title={pinned ? 'Unpin' : 'Pin to top'}
          className="mr-1 rounded p-1.5 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 hover:bg-white/10"
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const showPlatformAdmin = isPlatformAdmin(user) && !isDemoEmail(user?.email);
  const sections = useMemo(() => visibleSections(user, showPlatformAdmin), [user, showPlatformAdmin]);
  const items = useMemo(() => allNavItems(sections), [sections]);
  const showHome = isNavItemVisible(HOME_ITEM, user);
  const { summary } = useMyWork(showHome && hasPermission(user, 'dashboard.read'));

  const activeHref = useMemo(() => findActiveHref(pathname, [HOME_ITEM, ...items]), [pathname, items]);
  const sectionContainingActive = useMemo(
    () => sections.find((s) => s.groups.some((g) => g.items.some((i) => i.href === activeHref)))?.label,
    [sections, activeHref]
  );

  // null until stored preferences are read, so the first paint does not flash.
  const [collapsed, setCollapsed] = useState<Record<string, boolean> | null>(null);
  const [pins, setPins] = useState<string[]>(DEFAULT_PINNED_HREFS);

  useEffect(() => {
    const defaults = Object.fromEntries(NAVIGATION_SECTIONS.map((s) => [s.label, true]));
    setCollapsed({ ...defaults, ...readStoredBooleans(COLLAPSE_STORAGE_KEY) });
    setPins(readStoredPins());
  }, []);

  // Landing on a page opens the section it lives in, unless it is pinned
  // (then it is already visible at the top).
  useEffect(() => {
    if (!sectionContainingActive || pins.includes(activeHref)) return;
    setCollapsed((current) => (!current || current[sectionContainingActive] === false
      ? current
      : { ...current, [sectionContainingActive]: false }));
  }, [sectionContainingActive, activeHref, pins]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileOpen || !onClose) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onClose]);

  const toggleSection = (label: string) => {
    setCollapsed((current) => {
      const next = { ...(current || {}), [label]: !(current?.[label] ?? true) };
      writeStored(COLLAPSE_STORAGE_KEY, next);
      return next;
    });
  };

  const togglePin = useCallback((href: string) => {
    setPins((current) => {
      const next = current.includes(href) ? current.filter((h) => h !== href) : [...current, href];
      writeStored(PINS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const pinnedItems = pins
    .map((href) => items.find((i) => i.href === href))
    .filter((i): i is NavigationItem => Boolean(i));
  const isCollapsed = (label: string) => (collapsed ? collapsed[label] ?? true : label !== sectionContainingActive);
  const workCount = summary?.total ?? 0;

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-gray-950/50 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-72 flex-col overflow-hidden bg-gray-900 transition-transform md:static md:z-20 md:w-64 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? 'Main menu' : undefined}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-700 bg-gray-800 px-4">
          <BrandLogo
            className="flex items-center gap-3"
            imageClassName="h-9 w-9 rounded-full"
            showTagline={false}
            showWordmark={true}
            size={36}
            wordmarkClassName="text-lg font-bold text-white leading-tight"
          />
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-gray-700 md:hidden">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Main navigation">
          {showHome && (
            <Link
              href={HOME_ITEM.href}
              onClick={onClose}
              aria-current={activeHref === HOME_ITEM.href ? 'page' : undefined}
              className={`flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${activeHref === HOME_ITEM.href ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
            >
              <HOME_ITEM.icon className="h-4 w-4" aria-hidden="true" />
              <span className="flex-1">{HOME_ITEM.name}</span>
              {workCount > 0 && (
                <span className="rounded-full bg-purple-400 px-2 py-0.5 text-xs font-semibold text-gray-900" aria-label={`${workCount} items waiting on you`}>
                  {workCount}
                </span>
              )}
            </Link>
          )}

          {pinnedItems.length > 0 && (
            <div className="pt-2">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Pinned</div>
              {pinnedItems.map((item) => (
                <NavLink key={`pin-${item.href}`} item={item} active={item.href === activeHref} tone="default" pinned onTogglePin={togglePin} onNavigate={onClose} />
              ))}
            </div>
          )}

          <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">All sections</div>
          {sections.map((section) => {
            const tone = section.tone || 'default';
            const sectionId = `nav-section-${section.label.replace(/\s+/g, '-').toLowerCase()}`;
            const collapsedNow = isCollapsed(section.label);
            const SectionIcon = section.icon;
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={!collapsedNow}
                  aria-controls={sectionId}
                  className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tone === 'admin' ? 'text-amber-300 hover:bg-amber-800/30' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                >
                  <SectionIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">{section.label}</span>
                  {collapsedNow && section.label === sectionContainingActive && (
                    <span className={`h-1.5 w-1.5 rounded-full ${tone === 'admin' ? 'bg-amber-400' : 'bg-purple-400'}`} aria-hidden="true" />
                  )}
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsedNow ? '' : 'rotate-90'}`} aria-hidden="true" />
                </button>
                <div id={sectionId} hidden={collapsedNow} className="mt-0.5 space-y-0.5">
                  {section.groups.map((group, groupIndex) => (
                    <div key={group.label || `group-${groupIndex}`}>
                      {group.label && (
                        <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">{group.label}</div>
                      )}
                      {group.items.map((item) => (
                        <NavLink
                          key={`${item.href}-${item.name}`}
                          item={item}
                          active={item.href === activeHref}
                          tone={tone}
                          indent
                          pinned={pins.includes(item.href)}
                          onTogglePin={tone === 'admin' ? undefined : togglePin}
                          onNavigate={onClose}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-gray-700 p-3">
          <button
            type="button"
            onClick={logout}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
