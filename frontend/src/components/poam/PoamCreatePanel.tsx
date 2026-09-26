'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { poamAPI } from '@/lib/api';
import { recordLinks } from '@/lib/deepLinks';
import { invalidateMyWork } from '@/lib/useMyWork';

interface PoamCreatePanelProps {
  /** framework_controls.id to link the new item to (from ?controlId=). */
  controlId?: string;
  /** risks.id the item remediates (from ?riskId=); created through the risk endpoint so it is linked. */
  riskId?: string;
  onCancel: () => void;
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : 'Could not create the item';
}

/** Minimal create form; the new item opens on its own page for everything else. */
export default function PoamCreatePanel({ controlId, riskId, onCancel }: PoamCreatePanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setError('Give the item a title of at least three characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = riskId
        ? await poamAPI.createFromRisk(riskId, { title: title.trim(), due_date: dueDate || undefined, control_id: controlId || null })
        : await poamAPI.create({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          due_date: dueDate || null,
          control_id: controlId || null,
        });
      const data = res.data?.data as { id?: string; item?: { id?: string } } | undefined;
      const newId = data?.item?.id || data?.id;
      invalidateMyWork();
      if (newId) router.push(recordLinks.poam(newId));
      else onCancel();
    } catch (err: unknown) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form aria-label="New POA&M item" onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">New POA&amp;M item</h2>
      {(controlId || riskId) && (
        <p className="rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-800">
          This item will be linked to the {riskId ? 'risk' : 'control'} you came from.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div>
        <label htmlFor="new-poam-title" className="mb-1 block text-xs font-medium text-gray-700">Title</label>
        <input id="new-poam-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {!riskId && (
        <div>
          <label htmlFor="new-poam-description" className="mb-1 block text-xs font-medium text-gray-700">Description</label>
          <textarea id="new-poam-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {!riskId && (
          <div>
            <label htmlFor="new-poam-priority" className="mb-1 block text-xs font-medium text-gray-700">Priority</label>
            <select id="new-poam-priority" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm capitalize">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="new-poam-due" className="mb-1 block text-xs font-medium text-gray-700">Due date</label>
          <input id="new-poam-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-md bg-purple-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50">
          {saving ? 'Creating...' : 'Create and open'}
        </button>
      </div>
    </form>
  );
}
