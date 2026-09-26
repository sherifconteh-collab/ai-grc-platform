'use client';

import { useRouter } from 'next/navigation';
import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, CornerDownLeft, Plus, Search, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { searchAPI, SearchResult } from '@/lib/api';
import { SEARCH_TYPE_LABELS, recordLinks, searchResultHref } from '@/lib/deepLinks';
import { HOME_ITEM, allNavItems, visibleSections } from '@/lib/navigation';
import { isDemoEmail, isPlatformAdmin } from '@/lib/access';
import { visibleSettingsSections } from '@/lib/settingsSections';
import { visibleCreateActions } from './createActions';

const RECENTS_KEY = 'cw_palette_recents';
const MAX_RECENTS = 6;

interface PaletteEntry {
  key: string;
  group: 'Best match' | 'Recent' | 'Records' | 'Go to' | 'Settings' | 'Create';
  label: string;
  detail?: string;
  href: string;
  icon?: LucideIcon;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

function readRecents(): PaletteEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is { label: string; href: string; detail?: string } =>
        Boolean(e) && typeof e === 'object' && typeof (e as { label?: unknown }).label === 'string'
        && typeof (e as { href?: unknown }).href === 'string' && String((e as { href: string }).href).startsWith('/dashboard'))
      .map((e) => ({ key: `recent:${e.href}`, group: 'Recent' as const, label: e.label, detail: e.detail, href: e.href }));
  } catch {
    return [];
  }
}

function rememberRecent(entry: PaletteEntry) {
  try {
    const next = [{ label: entry.label, href: entry.href, detail: entry.detail }, ...readRecents()
      .filter((r) => r.href !== entry.href)
      .map((r) => ({ label: r.label, href: r.href, detail: r.detail }))].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience; storage errors are not worth surfacing.
  }
}

function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q);
}

function useRecordSearch(query: string, open: boolean) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchAPI.query(q, controller.signal)
        .then((res) => setResults(res.data?.data?.results ?? []))
        .catch(() => { if (!controller.signal.aborted) setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, open]);
  return { results, loading };
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<PaletteEntry[]>([]);
  const { results, loading } = useRecordSearch(query, open);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setRecents(readRecents());
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const staticEntries = useMemo(() => {
    const showAdmin = isPlatformAdmin(user) && !isDemoEmail(user?.email);
    const pages: PaletteEntry[] = [HOME_ITEM, ...allNavItems(visibleSections(user, showAdmin))].map((item) => ({
      key: `page:${item.href}`, group: 'Go to', label: item.name, detail: (item.keywords || []).join(' '), href: item.href, icon: item.icon, keywords: item.keywords,
    }));
    const settings: PaletteEntry[] = visibleSettingsSections(user).map((s) => ({
      key: `settings:${s.slug}`, group: 'Settings', label: `Settings: ${s.label}`, detail: s.keywords.join(' '), href: recordLinks.settings(s.slug), icon: Settings, keywords: [s.label.toLowerCase(), ...s.keywords],
    }));
    const creates: PaletteEntry[] = visibleCreateActions(user).map((a) => ({
      key: `create:${a.href}`, group: 'Create', label: `New ${a.label.toLowerCase()}`, href: a.href, icon: Plus,
    }));
    return { pages, settings, creates };
  }, [user]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...recents, ...staticEntries.creates, ...staticEntries.pages.slice(0, 8)];
    const records: PaletteEntry[] = results.map((r) => ({
      key: `record:${r.type}:${r.id}`,
      group: 'Records',
      label: r.ref ? `${r.ref} ${r.title}` : r.title,
      detail: [SEARCH_TYPE_LABELS[r.type], r.context].filter(Boolean).join(' · '),
      href: searchResultHref(r),
    }));
    const byText = (e: PaletteEntry) => matches(e.label, q) || matches(e.detail || '', q);
    // A page or setting named exactly what was typed ("sso", "poam", "audit log")
    // is almost always the target, so it outranks partial record matches.
    const isExact = (e: PaletteEntry) => e.label.toLowerCase() === q
      || e.label.toLowerCase() === `settings: ${q}` || (e.keywords || []).some((k) => k.toLowerCase() === q);
    const statics = [...staticEntries.pages, ...staticEntries.settings];
    const exact = statics.filter(isExact).map((e) => ({ ...e, group: 'Best match' as const }));
    const exactKeys = new Set(exact.map((e) => e.key));
    const notExact = (e: PaletteEntry) => !exactKeys.has(e.key);
    return [
      ...exact,
      ...records,
      ...staticEntries.pages.filter(byText).filter(notExact).slice(0, 6),
      ...staticEntries.settings.filter(byText).filter(notExact).slice(0, 4),
      ...staticEntries.creates.filter(byText).slice(0, 3),
    ];
  }, [query, results, recents, staticEntries]);

  useEffect(() => { setActiveIndex(0); }, [query, results.length]);

  if (!open) return null;

  const choose = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    if (entry.group === 'Records' || entry.group === 'Recent') {
      rememberRecent({ ...entry, group: 'Recent' });
    }
    onClose();
    router.push(entry.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(entries.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(entries[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  const activeId = entries[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-950/40 px-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and go to"
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4">
          <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search records, pages and settings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search controls, risks, vendors, pages, settings..."
            className="h-14 w-full border-0 bg-transparent text-base text-gray-900 outline-none focus:ring-0"
          />
          <kbd className="hidden rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 sm:block">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto py-2">
          {entries.map((entry, index) => {
            const showHeader = entry.group !== lastGroup;
            lastGroup = entry.group;
            const Icon = entry.icon || ArrowRight;
            const active = index === activeIndex;
            return (
              <li key={entry.key} role="presentation">
                {showHeader && (
                  <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{entry.group}</div>
                )}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(entry)}
                  className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${active ? 'bg-purple-50' : ''}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{entry.label}</div>
                    {entry.detail && (entry.group === 'Records' || entry.group === 'Recent') && (
                      <div className="truncate text-xs text-gray-500">{entry.detail}</div>
                    )}
                  </div>
                  {active && <CornerDownLeft className="h-4 w-4 text-purple-600" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
          {entries.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              {loading ? 'Searching...' : query.trim().length < 2 ? 'Type at least two characters.' : `Nothing matches "${query.trim()}".`}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
