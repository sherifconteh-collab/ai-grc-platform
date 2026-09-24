'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { trainingAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

interface TrainingStep {
  title: string;
  description: string | null;
  hint: string | null;
  target_page: string | null;
}

interface TrainingScenario {
  id: string;
  organization_id: string | null;
  is_template: boolean;
  title: string;
  description: string | null;
  difficulty: Difficulty;
  steps: TrainingStep[];
  is_active: boolean;
  completed_steps: number[] | null;
  progress_started_at: string | null;
  completed_at: string | null;
}

interface ProgressParticipant {
  user_id: string;
  user_name: string;
  email: string;
  completed_steps: number[];
  started_at: string;
  completed_at: string | null;
}

interface ScenarioProgress {
  scenario_id: string;
  title: string;
  step_count: number;
  participants: ProgressParticipant[];
}

interface StepFormRow {
  title: string;
  description: string;
  hint: string;
  target_page: string;
}

interface ScenarioForm {
  title: string;
  description: string;
  difficulty: Difficulty;
  steps: StepFormRow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DIFFICULTY_BADGES: Record<Difficulty, { label: string; color: string }> = {
  beginner: { label: 'Beginner', color: 'bg-green-100 text-green-700' },
  intermediate: { label: 'Intermediate', color: 'bg-blue-100 text-blue-700' },
  advanced: { label: 'Advanced', color: 'bg-purple-100 text-purple-700' },
};

const EMPTY_STEP: StepFormRow = { title: '', description: '', hint: '', target_page: '' };

const EMPTY_FORM: ScenarioForm = {
  title: '',
  description: '',
  difficulty: 'beginner',
  steps: [{ ...EMPTY_STEP }],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TrainingPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'assessments.write');

  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedScenario, setSelectedScenario] = useState<TrainingScenario | null>(null);
  const [detailTab, setDetailTab] = useState<'steps' | 'instructor'>('steps');
  const [progress, setProgress] = useState<ScenarioProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScenarioForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------
  const loadScenarios = useCallback(async () => {
    try {
      const res = await trainingAPI.getScenarios();
      setScenarios(res.data?.data || []);
    } catch {
      setError('Failed to load training scenarios');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadScenarios();
      setLoading(false);
    };
    init();
  }, [loadScenarios]);

  const loadProgress = useCallback(async (scenarioId: string) => {
    setProgressLoading(true);
    try {
      const res = await trainingAPI.getProgress(scenarioId);
      setProgress(res.data?.data);
    } catch {
      setProgress(null);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'detail' && detailTab === 'instructor' && selectedScenario) {
      loadProgress(selectedScenario.id);
    }
  }, [view, detailTab, selectedScenario, loadProgress]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const openDetail = (scenario: TrainingScenario) => {
    setSelectedScenario(scenario);
    setDetailTab('steps');
    setProgress(null);
    setView('detail');
  };

  const backToList = () => {
    setView('list');
    setSelectedScenario(null);
    setProgress(null);
  };

  // ---------------------------------------------------------------------------
  // Progress toggling
  // ---------------------------------------------------------------------------
  const toggleStep = async (stepIdx: number) => {
    if (!selectedScenario) return;
    const current = selectedScenario.completed_steps || [];
    const next = current.includes(stepIdx)
      ? current.filter((i) => i !== stepIdx)
      : [...current, stepIdx].sort((a, b) => a - b);

    const allDone = next.length === selectedScenario.steps.length;
    const updated: TrainingScenario = {
      ...selectedScenario,
      completed_steps: next,
      completed_at: allDone ? new Date().toISOString() : null,
    };
    setSelectedScenario(updated);
    setScenarios((list) => list.map((sc) => (sc.id === updated.id ? updated : sc)));

    try {
      await trainingAPI.updateProgress(selectedScenario.id, next);
    } catch {
      setActionError('Failed to save progress — please retry.');
      setSelectedScenario(selectedScenario);
      setScenarios((list) => list.map((sc) => (sc.id === selectedScenario.id ? selectedScenario : sc)));
      setTimeout(() => setActionError(''), 4000);
    }
  };

  // ---------------------------------------------------------------------------
  // Create / edit / delete
  // ---------------------------------------------------------------------------
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (scenario: TrainingScenario) => {
    setEditingId(scenario.id);
    setForm({
      title: scenario.title,
      description: scenario.description || '',
      difficulty: scenario.difficulty,
      steps: scenario.steps.length
        ? scenario.steps.map((s) => ({
            title: s.title,
            description: s.description || '',
            hint: s.hint || '',
            target_page: s.target_page || '',
          }))
        : [{ ...EMPTY_STEP }],
    });
    setShowForm(true);
  };

  const addStepRow = () => {
    setForm((f) => ({ ...f, steps: [...f.steps, { ...EMPTY_STEP }] }));
  };

  const removeStepRow = (idx: number) => {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));
  };

  const updateStepRow = (idx: number, field: keyof StepFormRow, value: string) => {
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setActionError('Title is required');
      return;
    }
    const validSteps = form.steps.filter((s) => s.title.trim());
    if (validSteps.length === 0) {
      setActionError('At least one step with a title is required');
      return;
    }

    setSubmitting(true);
    setActionError('');
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      difficulty: form.difficulty,
      steps: validSteps.map((s) => ({
        title: s.title.trim(),
        description: s.description.trim() || undefined,
        hint: s.hint.trim() || undefined,
        target_page: s.target_page.trim() || undefined,
      })),
    };

    try {
      if (editingId) {
        await trainingAPI.updateScenario(editingId, payload);
        setActionSuccess('Scenario updated');
      } else {
        await trainingAPI.createScenario(payload);
        setActionSuccess('Scenario created');
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadScenarios();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setActionError(message || 'Failed to save scenario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (scenario: TrainingScenario) => {
    if (!confirm(`Delete "${scenario.title}"? This cannot be undone.`)) return;
    try {
      await trainingAPI.deleteScenario(scenario.id);
      if (selectedScenario?.id === scenario.id) backToList();
      setActionSuccess('Scenario deleted');
      await loadScenarios();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch {
      setActionError('Failed to delete scenario');
      setTimeout(() => setActionError(''), 4000);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Classroom Mode</h1>
            <p className="text-sm text-gray-500 mt-1">Guided training scenarios that walk learners through real dashboard pages.</p>
          </div>
          {canWrite && view === 'list' && (
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + New Scenario
            </button>
          )}
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
          </div>
        )}
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {actionError}
            <button onClick={() => setActionError('')} className="ml-2 underline">dismiss</button>
          </div>
        )}
        {actionSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {actionSuccess}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading training scenarios...</div>
        ) : view === 'list' ? (
          /* ================================================================
             LIST VIEW
             ================================================================ */
          scenarios.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <p className="text-4xl mb-3">🎓</p>
              <h3 className="text-lg font-semibold text-gray-900">No Training Scenarios Yet</h3>
              <p className="text-gray-500 mt-1 text-sm">Create your first scenario to guide learners through the platform.</p>
              {canWrite && (
                <button
                  onClick={openCreate}
                  className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  + New Scenario
                </button>
              )}
            </div>
          ) : (
            <div role="list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenarios.map((scenario) => {
                const badge = DIFFICULTY_BADGES[scenario.difficulty] || DIFFICULTY_BADGES.beginner;
                const total = scenario.steps.length;
                const done = scenario.completed_steps?.length ?? 0;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const started = scenario.completed_steps !== null;
                return (
                  <div
                    key={scenario.id}
                    role="listitem"
                    onClick={() => openDetail(scenario)}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer flex flex-col"
                  >
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <h3 className="font-semibold text-gray-900">{scenario.title}</h3>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {scenario.is_template && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Built-in</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                      </div>
                    </div>
                    {scenario.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">{scenario.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mb-3">{total} step{total === 1 ? '' : 's'}</p>

                    {started && (
                      <div className="mt-auto">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{done}/{total}</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`${scenario.title} progress`}
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"
                        >
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}

                    {!scenario.is_template && canWrite && (
                      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-50">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(scenario);
                          }}
                          aria-label={`Edit ${scenario.title}`}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(scenario);
                          }}
                          aria-label={`Delete ${scenario.title}`}
                          className="px-2 py-1 text-xs text-red-500 hover:text-red-700 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ================================================================
             DETAIL VIEW
             ================================================================ */
          selectedScenario && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={backToList} className="text-gray-500 hover:text-gray-700 text-sm">
                  ← Back
                </button>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedScenario.title}</h2>
                    {selectedScenario.description && (
                      <p className="text-sm text-gray-500 mt-1">{selectedScenario.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedScenario.is_template && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Built-in</span>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${DIFFICULTY_BADGES[selectedScenario.difficulty].color}`}>
                      {DIFFICULTY_BADGES[selectedScenario.difficulty].label}
                    </span>
                  </div>
                </div>

                {selectedScenario.completed_at && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    Scenario completed on {formatDate(selectedScenario.completed_at)}.
                  </div>
                )}

                {canWrite && (
                  <div className="flex bg-gray-100 rounded-lg p-1 text-sm w-fit mb-4">
                    {(['steps', 'instructor'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setDetailTab(tab)}
                        className={`px-3 py-1.5 rounded-md transition-colors ${
                          detailTab === tab ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab === 'steps' ? 'Steps' : 'Instructor View'}
                      </button>
                    ))}
                  </div>
                )}

                {detailTab === 'steps' ? (
                  <ul role="list" className="space-y-3">
                    {selectedScenario.steps.map((step, idx) => {
                      const checked = (selectedScenario.completed_steps || []).includes(idx);
                      const checkboxId = `training-step-${selectedScenario.id}-${idx}`;
                      return (
                        <li
                          key={idx}
                          role="listitem"
                          className={`p-4 rounded-lg border flex items-start gap-3 ${
                            checked ? 'border-green-200 bg-green-50' : 'border-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            id={checkboxId}
                            checked={checked}
                            onChange={() => toggleStep(idx)}
                            className="mt-1 h-4 w-4"
                          />
                          <div className="flex-1">
                            <label htmlFor={checkboxId} className="font-medium text-gray-900 cursor-pointer">
                              {idx + 1}. {step.title}
                            </label>
                            {step.description && (
                              <p className="text-sm text-gray-600 mt-0.5">{step.description}</p>
                            )}
                            {step.hint && (
                              <p className="text-xs text-gray-400 mt-1">Hint: {step.hint}</p>
                            )}
                            {step.target_page && (
                              <Link
                                href={step.target_page}
                                className="inline-block text-xs text-indigo-600 hover:underline mt-1"
                              >
                                Go to {step.target_page} →
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <InstructorProgressTable progress={progress} loading={progressLoading} formatDate={formatDate} />
                )}
              </div>
            </div>
          )
        )}

        {/* ================================================================
           SCENARIO FORM MODAL (create / edit)
           ================================================================ */}
        {showForm && (
          <Modal title={editingId ? 'Edit Scenario' : 'New Scenario'} onClose={() => setShowForm(false)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Responding to a New Assessment Finding"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Brief description of what this scenario teaches..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as Difficulty }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Steps</label>
                  <button
                    type="button"
                    onClick={addStepRow}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    + Add Step
                  </button>
                </div>
                <div className="space-y-3">
                  {form.steps.map((step, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded-lg space-y-2 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">Step {idx + 1}</span>
                        {form.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStepRow(idx)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) => updateStepRow(idx, 'title', e.target.value)}
                        placeholder="Step title *"
                        className="w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        value={step.description}
                        onChange={(e) => updateStepRow(idx, 'description', e.target.value)}
                        placeholder="Step description"
                        className="w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        value={step.hint}
                        onChange={(e) => updateStepRow(idx, 'hint', e.target.value)}
                        placeholder="Hint"
                        className="w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="text"
                        value={step.target_page}
                        onChange={(e) => updateStepRow(idx, 'target_page', e.target.value)}
                        placeholder="/dashboard/rmf"
                        className="w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Create Scenario'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function InstructorProgressTable({
  progress,
  loading,
  formatDate,
}: {
  progress: ScenarioProgress | null;
  loading: boolean;
  formatDate: (d: string | null) => string;
}) {
  if (loading) {
    return <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading participant progress...</div>;
  }
  if (!progress || progress.participants.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">No learners have started this scenario yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="py-2 pr-4 font-medium">Learner</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Progress</th>
            <th className="py-2 pr-4 font-medium">Started</th>
            <th className="py-2 pr-4 font-medium">Completed</th>
          </tr>
        </thead>
        <tbody>
          {progress.participants.map((p) => (
            <tr key={p.user_id} className="border-b border-gray-50 last:border-0">
              <td className="py-2 pr-4 font-medium text-gray-800">{p.user_name}</td>
              <td className="py-2 pr-4 text-gray-500">{p.email}</td>
              <td className="py-2 pr-4 text-gray-700">
                {p.completed_steps.length}/{progress.step_count}
              </td>
              <td className="py-2 pr-4 text-gray-500">{formatDate(p.started_at)}</td>
              <td className="py-2 pr-4">
                {p.completed_at ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    {formatDate(p.completed_at)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">In progress</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
