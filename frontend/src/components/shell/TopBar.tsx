'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBell from '../NotificationBell';
import { contextCreateActions, visibleCreateActions, CreateAction } from './createActions';

interface TopBarProps {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

function NewMenu({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const context = contextCreateActions(pathname, user);
  const general = visibleCreateActions(user);
  const renderItem = (a: CreateAction) => {
    const Icon = a.icon;
    return (
      <li key={a.href}>
        <Link role="menuitem" href={a.href} onClick={onDone} className="flex min-h-[40px] items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-purple-50 focus:bg-purple-50 focus:outline-none">
          <Icon className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {a.label}
        </Link>
      </li>
    );
  };
  return (
    <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
      {context.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">For this page</div>
          <ul role="menu" aria-label="Create for this page">{context.map(renderItem)}</ul>
          <div className="my-2 border-t border-gray-100" />
        </>
      )}
      <ul role="menu" aria-label="Create new">{general.map(renderItem)}</ul>
      {general.length === 0 && context.length === 0 && (
        <p className="px-3 py-2 text-sm text-gray-500">Your role cannot create records.</p>
      )}
    </div>
  );
}

export default function TopBar({ onOpenMenu, onOpenSearch }: TopBarProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setNewOpen(false); }, [pathname]);

  useEffect(() => {
    if (!newOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNewOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [newOpen]);

  const initial = user?.fullName?.charAt(0).toUpperCase() || 'U';

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-1.5 sm:gap-2 border-b border-gray-200 bg-white px-3 sm:px-6">
      <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 md:hidden">
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search (Ctrl+K)"
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 text-left text-sm text-gray-500 hover:border-gray-400 sm:max-w-xl"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate"><span className="sm:hidden">Search</span><span className="hidden sm:inline">Search controls, risks, vendors, pages...</span></span>
        <kbd className="hidden rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-500 sm:block">Ctrl K</kbd>
      </button>

      <div className="relative" ref={newRef}>
        <button
          type="button"
          onClick={() => setNewOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={newOpen}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-purple-700 px-3 text-sm font-semibold text-white hover:bg-purple-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">New</span>
          <span className="sr-only sm:hidden">Create new</span>
        </button>
        {newOpen && <NewMenu onDone={() => setNewOpen(false)} />}
      </div>

      <NotificationBell />

      <div
        className="hidden h-9 w-9 items-center justify-center rounded-full bg-purple-600 text-sm font-semibold text-white sm:flex"
        title={[user?.fullName, user?.email, user?.organizationName].filter(Boolean).join('\n')}
        aria-label={`Signed in as ${user?.fullName || user?.email || 'user'}`}
        role="img"
      >
        {initial}
      </div>
    </header>
  );
}
