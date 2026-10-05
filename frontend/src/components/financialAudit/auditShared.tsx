'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';

// UI helpers shared by the financial audit readiness screens (generic table, tab,
// banner and modal pieces; kept local so the screens need nothing else).

export const inputClass = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
export const primaryButton = 'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50';
export const secondaryButton = 'px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50';

export function downloadBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).replace(/^It /, 'IT ');
}

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="border-b border-gray-200 mb-6 overflow-x-auto" role="tablist">
      <div className="flex gap-1 min-w-max">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{tab.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  hint?: string;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-gray-900',
  good: 'text-green-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
};

export function StatCard({ label, value, tone = 'default', hint }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${TONES[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

const STATUS_CLASSES: Record<string, string> = {
  effective: 'bg-green-100 text-green-800',
  effective_with_exceptions: 'bg-amber-100 text-amber-800',
  ineffective: 'bg-red-100 text-red-800',
  open: 'bg-red-50 text-red-700',
  investigating: 'bg-amber-100 text-amber-800',
  mitigated: 'bg-blue-100 text-blue-800',
  accepted: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  false_positive: 'bg-gray-100 text-gray-700',
  pending: 'bg-gray-100 text-gray-700',
  certified: 'bg-green-100 text-green-800',
  revoke: 'bg-red-100 text-red-800',
  approved: 'bg-green-100 text-green-800',
  escalated: 'bg-red-100 text-red-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  in_progress: 'bg-amber-100 text-amber-800',
};

export function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-gray-400">Not tested</span>;
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status] || 'bg-gray-100 text-gray-700'}`}>{humanize(status)}</span>;
}

interface CsvInputProps {
  onSubmit: (csv: string) => Promise<void> | void;
  busy?: boolean;
  submitLabel?: string;
  help?: ReactNode;
}

/** Choose a CSV file or paste CSV text, then submit it. */
export function CsvInput({ onSubmit, busy, submitLabel = 'Import', help }: CsvInputProps) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };

  return (
    <div className="space-y-3">
      {help && <div className="text-xs text-gray-600">{help}</div>}
      <label className="block text-sm text-gray-700">
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={readFile} className="block mt-1 text-sm" />
      </label>
      <label className="block text-sm text-gray-700">
        or paste CSV
        <textarea className={`${inputClass} font-mono text-xs mt-1`} rows={6} value={text} onChange={(e) => { setText(e.target.value); setFileName(''); }} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" className={primaryButton} disabled={busy || !text.trim()} onClick={() => onSubmit(text)}>
          {busy ? 'Working…' : submitLabel}
        </button>
        {fileName && <span className="text-xs text-gray-500">{fileName} ({text.split('\n').length - 1} rows)</span>}
      </div>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">{message}</div>;
}

export function NoticeBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm" role="status">{message}</div>;
}

export function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white rounded-lg shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
