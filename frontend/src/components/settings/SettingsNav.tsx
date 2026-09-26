'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsTab, visibleSettingsSections } from '@/lib/settingsSections';
import { recordLinks } from '@/lib/deepLinks';

interface SettingsNavProps {
  active: SettingsTab;
}

export default function SettingsNav({ active }: SettingsNavProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => visibleSettingsSections(user), [user]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? sections.filter((s) => s.label.toLowerCase().includes(q) || s.keywords.some((k) => k.includes(q)))
    : sections;
  const groups: Array<'You' | 'Organization'> = ['You', 'Organization'];

  return (
    <nav aria-label="Settings" className="mb-6 w-full shrink-0 rounded-lg border border-gray-200 bg-white p-3 lg:sticky lg:top-4 lg:mb-0 lg:w-60 lg:self-start">
      <label className="mb-3 flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 text-gray-500 focus-within:border-purple-500">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a setting"
          aria-label="Find a setting"
          className="w-full border-0 bg-transparent p-0 text-sm text-gray-900 outline-none focus:ring-0"
        />
      </label>
      {groups.map((group) => {
        const inGroup = matches.filter((s) => s.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="mb-2">
            <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{group}</div>
            <ul className="space-y-0.5">
              {inGroup.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={recordLinks.settings(s.slug)}
                    aria-current={s.tab === active ? 'page' : undefined}
                    className={`block rounded-md px-2 py-2 text-sm ${s.tab === active ? 'bg-purple-50 font-semibold text-purple-800' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {matches.length === 0 && <p className="px-2 py-3 text-sm text-gray-500">No setting matches &quot;{query}&quot;.</p>}
    </nav>
  );
}
