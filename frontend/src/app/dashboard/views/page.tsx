'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { dashboardBuilderAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface DashboardWidget {
  id: string;
  dashboard_view_id: string;
  widget_type: string;
  title: string;
  widget_config: Record<string, unknown>;
  position_row: number;
  position_col: number;
  width: number;
  height: number;
}

interface DashboardView {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  is_shared: boolean;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  widgets: DashboardWidget[];
}

const WIDGET_TYPES = ['metric', 'chart', 'list', 'text'] as const;

const EMPTY_VIEW_FORM = { name: '', description: '', is_shared: false, is_default: false };

const EMPTY_WIDGET_FORM = {
  widget_type: 'metric' as (typeof WIDGET_TYPES)[number],
  title: '',
  widget_config: '{}',
  position_row: 0,
  position_col: 0,
  width: 1,
  height: 1,
};

export default function DashboardViewsPage() {
  const { toast, toastType, showToast } = useToast();
  const [views, setViews] = useState<DashboardView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showViewForm, setShowViewForm] = useState(false);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [viewForm, setViewForm] = useState(EMPTY_VIEW_FORM);
  const [viewFormError, setViewFormError] = useState('');
  const [savingView, setSavingView] = useState(false);

  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);

  const [showWidgetForm, setShowWidgetForm] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [widgetForm, setWidgetForm] = useState(EMPTY_WIDGET_FORM);
  const [widgetFormError, setWidgetFormError] = useState('');
  const [savingWidget, setSavingWidget] = useState(false);

  const loadViews = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await dashboardBuilderAPI.getViews();
      const data: DashboardView[] = Array.isArray(response.data?.data) ? response.data.data : [];
      setViews(data);
    } catch {
      setError('Failed to load dashboard views.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadViews();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedView = views.find((v) => v.id === selectedViewId) || null;

  const openCreateViewForm = () => {
    setEditingViewId(null);
    setViewForm(EMPTY_VIEW_FORM);
    setViewFormError('');
    setShowViewForm(true);
  };

  const openEditViewForm = (view: DashboardView) => {
    setEditingViewId(view.id);
    setViewForm({
      name: view.name,
      description: view.description || '',
      is_shared: view.is_shared,
      is_default: view.is_default,
    });
    setViewFormError('');
    setShowViewForm(true);
  };

  const submitViewForm = async () => {
    if (viewForm.name.trim().length < 2) {
      setViewFormError('Name is required (min 2 characters).');
      return;
    }
    setSavingView(true);
    setViewFormError('');
    try {
      const payload = {
        name: viewForm.name.trim(),
        description: viewForm.description.trim() || null,
        is_shared: viewForm.is_shared,
        is_default: viewForm.is_default,
        layout: {},
      };
      if (editingViewId) {
        await dashboardBuilderAPI.updateView(editingViewId, payload);
      } else {
        await dashboardBuilderAPI.createView(payload);
      }
      setShowViewForm(false);
      await loadViews();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setViewFormError(error.response?.data?.error || 'Failed to save dashboard view.');
    } finally {
      setSavingView(false);
    }
  };

  const deleteView = async (id: string) => {
    try {
      await dashboardBuilderAPI.deleteView(id);
      if (selectedViewId === id) setSelectedViewId(null);
      await loadViews();
    } catch {
      showToast('Failed to delete dashboard view.', 'error');
    }
  };

  const openCreateWidgetForm = () => {
    setEditingWidgetId(null);
    setWidgetForm(EMPTY_WIDGET_FORM);
    setWidgetFormError('');
    setShowWidgetForm(true);
  };

  const openEditWidgetForm = (widget: DashboardWidget) => {
    setEditingWidgetId(widget.id);
    setWidgetForm({
      widget_type: (WIDGET_TYPES as readonly string[]).includes(widget.widget_type)
        ? (widget.widget_type as (typeof WIDGET_TYPES)[number])
        : 'metric',
      title: widget.title,
      widget_config: JSON.stringify(widget.widget_config ?? {}, null, 2),
      position_row: widget.position_row,
      position_col: widget.position_col,
      width: widget.width,
      height: widget.height,
    });
    setWidgetFormError('');
    setShowWidgetForm(true);
  };

  const submitWidgetForm = async () => {
    if (!selectedView) return;
    if (!widgetForm.title.trim()) {
      setWidgetFormError('Title is required.');
      return;
    }
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = widgetForm.widget_config.trim() ? JSON.parse(widgetForm.widget_config) : {};
    } catch {
      setWidgetFormError('Widget config must be valid JSON.');
      return;
    }
    setSavingWidget(true);
    setWidgetFormError('');
    try {
      const payload = {
        widget_type: widgetForm.widget_type,
        title: widgetForm.title.trim(),
        widget_config: parsedConfig,
        position_row: widgetForm.position_row,
        position_col: widgetForm.position_col,
        width: widgetForm.width,
        height: widgetForm.height,
      };
      if (editingWidgetId) {
        await dashboardBuilderAPI.updateWidget(editingWidgetId, payload);
      } else {
        await dashboardBuilderAPI.addWidget(selectedView.id, payload);
      }
      setShowWidgetForm(false);
      await loadViews();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setWidgetFormError(error.response?.data?.error || 'Failed to save widget.');
    } finally {
      setSavingWidget(false);
    }
  };

  const deleteWidget = async (widgetId: string) => {
    try {
      await dashboardBuilderAPI.deleteWidget(widgetId);
      await loadViews();
    } catch {
      showToast('Failed to delete widget.', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-lg shadow text-white ${
              toastType === 'error' ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {toast}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard Views</h1>
            <p className="text-gray-600 mt-2">
              Save custom dashboard views and compose them from widgets. This is an early MVP — widgets are
              managed as structured data, not yet rendered as a live grid.
            </p>
          </div>
          <button
            onClick={openCreateViewForm}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + New View
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}

        {loading ? (
          <div className="animate-pulse h-32 rounded-lg bg-gray-100" />
        ) : views.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-sm text-gray-500">
            No dashboard views yet. Create one to start composing widgets.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {views.map((view) => (
              <div
                key={view.id}
                className={`bg-white rounded-lg shadow-md p-4 border-l-4 cursor-pointer transition-colors ${
                  selectedViewId === view.id ? 'border-purple-600' : 'border-gray-200'
                }`}
                onClick={() => setSelectedViewId(view.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{view.name}</p>
                    {view.description && <p className="text-xs text-gray-500 mt-1">{view.description}</p>}
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {view.is_default && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">default</span>
                    )}
                    {view.is_shared && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">shared</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">{view.widgets?.length || 0} widget(s)</p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditViewForm(view);
                    }}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteView(view.id);
                    }}
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedView && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-bold text-gray-900">{selectedView.name} — Widgets</h2>
              <button
                onClick={openCreateWidgetForm}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                + Add Widget
              </button>
            </div>

            {selectedView.widgets.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No widgets in this view yet.</p>
            ) : (
              <ul role="list" className="mt-4 divide-y divide-gray-100">
                {selectedView.widgets
                  .slice()
                  .sort((a, b) => a.position_row - b.position_row || a.position_col - b.position_col)
                  .map((widget) => (
                    <li role="listitem" key={widget.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {widget.title}
                          <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {widget.widget_type}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          row {widget.position_row}, col {widget.position_col} · {widget.width}×{widget.height}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEditWidgetForm(widget)}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteWidget(widget.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {showViewForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{editingViewId ? 'Edit View' : 'New View'}</h2>
                <button
                  onClick={() => setShowViewForm(false)}
                  aria-label="Close"
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {viewFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {viewFormError}
                </div>
              )}

              <div>
                <label htmlFor="view-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="view-name"
                  type="text"
                  value={viewForm.name}
                  onChange={(e) => setViewForm({ ...viewForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="view-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="view-description"
                  value={viewForm.description}
                  onChange={(e) => setViewForm({ ...viewForm, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={viewForm.is_shared}
                  onChange={(e) => setViewForm({ ...viewForm, is_shared: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Share with organization</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={viewForm.is_default}
                  onChange={(e) => setViewForm({ ...viewForm, is_default: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Set as my default view</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowViewForm(false)}
                  className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={submitViewForm}
                  disabled={savingView}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {savingView ? 'Saving...' : editingViewId ? 'Save Changes' : 'Create View'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showWidgetForm && selectedView && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingWidgetId ? 'Edit Widget' : 'Add Widget'}
                </h2>
                <button
                  onClick={() => setShowWidgetForm(false)}
                  aria-label="Close"
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {widgetFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {widgetFormError}
                </div>
              )}

              <div>
                <label htmlFor="widget-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Widget Type
                </label>
                <select
                  id="widget-type"
                  value={widgetForm.widget_type}
                  onChange={(e) =>
                    setWidgetForm({ ...widgetForm, widget_type: e.target.value as (typeof WIDGET_TYPES)[number] })
                  }
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {WIDGET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="widget-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  id="widget-title"
                  type="text"
                  value={widgetForm.title}
                  onChange={(e) => setWidgetForm({ ...widgetForm, title: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="widget-row" className="block text-xs font-medium text-gray-700 mb-1">
                    Row
                  </label>
                  <input
                    id="widget-row"
                    type="number"
                    min={0}
                    value={widgetForm.position_row}
                    onChange={(e) => setWidgetForm({ ...widgetForm, position_row: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="widget-col" className="block text-xs font-medium text-gray-700 mb-1">
                    Column
                  </label>
                  <input
                    id="widget-col"
                    type="number"
                    min={0}
                    value={widgetForm.position_col}
                    onChange={(e) => setWidgetForm({ ...widgetForm, position_col: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="widget-width" className="block text-xs font-medium text-gray-700 mb-1">
                    Width
                  </label>
                  <input
                    id="widget-width"
                    type="number"
                    min={1}
                    value={widgetForm.width}
                    onChange={(e) => setWidgetForm({ ...widgetForm, width: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="widget-height" className="block text-xs font-medium text-gray-700 mb-1">
                    Height
                  </label>
                  <input
                    id="widget-height"
                    type="number"
                    min={1}
                    value={widgetForm.height}
                    onChange={(e) => setWidgetForm({ ...widgetForm, height: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="widget-config" className="block text-sm font-medium text-gray-700 mb-1">
                  Widget Config (JSON)
                </label>
                <textarea
                  id="widget-config"
                  value={widgetForm.widget_config}
                  onChange={(e) => setWidgetForm({ ...widgetForm, widget_config: e.target.value })}
                  rows={5}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowWidgetForm(false)}
                  className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={submitWidgetForm}
                  disabled={savingWidget}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {savingWidget ? 'Saving...' : editingWidgetId ? 'Save Changes' : 'Add Widget'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
