'use client';

/**
 * Milestone editing for a remediation item.
 *
 * Migration 134 added poam_milestones because a federal POA&M is a list of
 * discrete milestones with their own target dates, not a single overall due
 * date -- "quarterly scanning stood up by March, remediation SLA met by June"
 * cannot be expressed with one date. The table, the routes and the API client
 * all shipped; this is the editor that issue #569 asked for and that was never
 * built.
 */

import { useCallback, useEffect, useState } from 'react';
import { poamMilestonesAPI } from '@/lib/api';
import { StatusBadge, MILESTONE_STATUS_COLORS } from '@/components/poam/PoamStatusBadge';
import { PoamMilestone, MILESTONE_STATUSES, errorMessage } from '@/lib/poamTypes';

interface PoamMilestonesProps {
  poamItemId: string;
  canWrite: boolean;
  onChange?: () => void;
}

export default function PoamMilestones({ poamItemId, canWrite, onChange }: PoamMilestonesProps) {
  const [milestones, setMilestones] = useState<PoamMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ description: '', target_date: '', status: 'pending' });
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await poamMilestonesAPI.getAll(poamItemId);
      setMilestones(res.data?.data || []);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to load milestones'));
    } finally {
      setLoading(false);
    }
  }, [poamItemId]);

  useEffect(() => { load(); }, [load]);

  const resetDraft = () => setDraft({ description: '', target_date: '', status: 'pending' });

  const handleAdd = async () => {
    if (!draft.description.trim()) {
      setError('Milestone description is required');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await poamMilestonesAPI.create(poamItemId, {
        description: draft.description.trim(),
        target_date: draft.target_date || null,
        status: draft.status,
        // Append to the end; the list is ordered by sort_order.
        sort_order: milestones.length,
      });
      resetDraft();
      setShowAdd(false);
      await load();
      onChange?.();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to add milestone'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (milestoneId: string) => {
    if (!draft.description.trim()) {
      setError('Milestone description is required');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await poamMilestonesAPI.update(poamItemId, milestoneId, {
        description: draft.description.trim(),
        target_date: draft.target_date || null,
        status: draft.status,
      });
      setEditingId(null);
      resetDraft();
      await load();
      onChange?.();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to update milestone'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (milestoneId: string) => {
    try {
      setSaving(true);
      setError('');
      await poamMilestonesAPI.remove(poamItemId, milestoneId);
      await load();
      onChange?.();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to delete milestone'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (milestone: PoamMilestone) => {
    setEditingId(milestone.id);
    setShowAdd(false);
    setDraft({
      description: milestone.description,
      target_date: milestone.target_date ? milestone.target_date.slice(0, 10) : '',
      status: milestone.status,
    });
  };

  const completed = milestones.filter((m) => m.status === 'completed').length;

  return (
    <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          Milestones
          {milestones.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-500">
              {completed} of {milestones.length} complete
            </span>
          )}
        </h2>
        {canWrite && !showAdd && (
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); resetDraft(); }}
            className="text-xs px-2 py-1 border border-purple-300 text-purple-700 rounded hover:bg-purple-50"
          >
            + Add milestone
          </button>
        )}
      </div>

      {milestones.length > 0 && (
        <div
          className="w-full bg-gray-100 rounded-full h-2"
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={milestones.length}
          aria-label={`Milestone progress: ${completed} of ${milestones.length} complete`}
        >
          <div
            className="bg-purple-600 h-2 rounded-full transition-all"
            style={{ width: `${milestones.length ? (completed / milestones.length) * 100 : 0}%` }}
          />
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading milestones...</p>
      ) : milestones.length === 0 && !showAdd ? (
        <p className="text-sm text-gray-400">
          No milestones yet. Federal reporting expects discrete milestones with their own target dates
          rather than a single overall deadline.
        </p>
      ) : (
        <ul role="list" className="divide-y divide-gray-100">
          {milestones.map((milestone) => (
            <li key={milestone.id} role="listitem" className="py-2">
              {editingId === milestone.id ? (
                <MilestoneForm
                  draft={draft}
                  setDraft={setDraft}
                  saving={saving}
                  onSave={() => handleUpdate(milestone.id)}
                  onCancel={() => { setEditingId(null); resetDraft(); }}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{milestone.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Target: {milestone.target_date ? new Date(milestone.target_date).toLocaleDateString() : 'not set'}
                      {milestone.completed_date && ` · Completed ${new Date(milestone.completed_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge value={milestone.status} colorMap={MILESTONE_STATUS_COLORS} />
                    {canWrite && (
                      <>
                        <button
                          onClick={() => startEdit(milestone)}
                          className="text-xs text-purple-600 hover:text-purple-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(milestone.id)}
                          disabled={saving}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <MilestoneForm
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onSave={handleAdd}
          onCancel={() => { setShowAdd(false); resetDraft(); }}
        />
      )}
    </section>
  );
}

interface MilestoneDraft {
  description: string;
  target_date: string;
  status: string;
}

function MilestoneForm({
  draft, setDraft, saving, onSave, onCancel,
}: {
  draft: MilestoneDraft;
  setDraft: (value: MilestoneDraft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-md p-3">
      <div>
        <label htmlFor="milestone-description" className="block text-xs font-medium text-gray-700 mb-1">
          Description
        </label>
        <input
          id="milestone-description"
          type="text"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="e.g. Quarterly vulnerability scanning stood up"
          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="milestone-target" className="block text-xs font-medium text-gray-700 mb-1">
            Target date
          </label>
          <input
            id="milestone-target"
            type="date"
            value={draft.target_date}
            onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label htmlFor="milestone-status" className="block text-xs font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="milestone-status"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {MILESTONE_STATUSES.map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
