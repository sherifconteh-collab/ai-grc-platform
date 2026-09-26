'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DrawerField {
  label: string;
  value: ReactNode;
}

export interface DrawerAction {
  label: string;
  href: string;
  primary?: boolean;
}

interface RecordDrawerProps {
  /** Small line above the title, e.g. the record type or reference. */
  eyebrow?: string;
  title: string;
  fields: DrawerField[];
  actions: DrawerAction[];
  fullPageHref: string;
  position: { index: number; total: number };
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  children?: ReactNode;
}

/**
 * Right-hand drawer over a list: read a record and start its next step without
 * losing your place. Arrow keys (or j/k) move through the list; Esc closes.
 */
export default function RecordDrawer({
  eyebrow, title, fields, actions, fullPageHref, position, onPrev, onNext, onClose, children,
}: RecordDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNext, onPrev]);

  const atStart = position.index <= 0;
  const atEnd = position.index >= position.total - 1;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-gray-950/30" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${title} details`}
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-3">
          <button type="button" onClick={onPrev} disabled={atStart} aria-label="Previous record" className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={onNext} disabled={atEnd} aria-label="Next record" className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="ml-1.5 text-sm text-gray-500">{position.index + 1} of {position.total}</span>
          <div className="flex-1" />
          <Link href={fullPageHref} className="px-2 text-sm font-semibold text-purple-800 hover:underline">Open full page</Link>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            {eyebrow && <div className="text-xs text-gray-500">{eyebrow}</div>}
            <h2 className="mt-0.5 text-xl font-semibold text-gray-900">{title}</h2>
          </div>
          {fields.length > 0 && (
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {fields.map((f) => (
                <div key={f.label} className="rounded-lg border border-gray-200 p-2.5">
                  <dt className="text-xs text-gray-500">{f.label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-gray-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className={a.primary
                    ? 'inline-flex min-h-[40px] items-center rounded-lg bg-purple-700 px-3.5 text-sm font-semibold text-white hover:bg-purple-800'
                    : 'inline-flex min-h-[40px] items-center rounded-lg border border-gray-300 px-3.5 text-sm text-gray-800 hover:bg-gray-50'}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          )}
          {children}
        </div>
      </section>
    </div>
  );
}
