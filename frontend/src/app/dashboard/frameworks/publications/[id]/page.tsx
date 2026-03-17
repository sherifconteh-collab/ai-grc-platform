'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { frameworkAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

type MappingStrength = 'primary' | 'supporting' | 'informative';

interface PublicationMapping {
  id?: string;
  framework_code: string;
  framework_name?: string;
  control_id: string;
  control_title?: string;
  framework_control_id?: string | null;
  mapping_strength: MappingStrength;
  mapping_note?: string | null;
  sort_order: number;
}

interface PublicationTask {
  task_id: string;
  title: string;
  href: string;
  framework_code: string;
  control_id: string;
  source_document?: string | null;
}

interface PublicationDetail {
  id: string;
  publication_code: string;
  title: string;
  publication_family: string;
  publication_type: string;
  summary: string | null;
  primary_use_case: string | null;
  recommended_for_private: boolean;
  federal_focus: boolean;
  publication_url: string | null;
  related_tasks: PublicationTask[];
  mappings: PublicationMapping[];
}

interface PublicationCoverage {
  mapped_controls: number;
  primary_controls: number;
  supporting_controls: number;
  informative_controls: number;
  completed_controls: number;
  in_progress_controls: number;
  not_started_controls: number;
  completion_percent: number;
}

interface CatalogControl {
  framework_control_id: string;
  framework_code: string;
  framework_name: string;
  control_id: string;
  control_title: string;
}

function normalizeMappingRows(rows: PublicationMapping[]): PublicationMapping[] {
  return [...rows]
    .filter((row) => row.framework_code.trim() && row.control_id.trim())
    .map((row, index) => ({
      ...row,
      framework_code: row.framework_code.trim(),
      control_id: row.control_id.trim(),
      mapping_strength: row.mapping_strength || 'informative',
      mapping_note: row.mapping_note ? row.mapping_note.trim() : null,
      sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index + 1
    }));
}

export default function PublicationDetailPage() {
  const params = useParams<{ id: string }>();
  const publicationId = String(params?.id || '');
  const { user } = useAuth();
  const canManage = hasPermission(user, 'frameworks.manage');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [publication, setPublication] = useState<PublicationDetail | null>(null);
  const [coverage, setCoverage] = useState<PublicationCoverage | null>(null);
  const [rows, setRows] = useState<PublicationMapping[]>([]);

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFrameworkCode, setCatalogFrameworkCode] = useState('');
  const [catalogResults, setCatalogResults] = useState<CatalogControl[]>([]);

  const frameworkFilterOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.framework_code))).filter(Boolean).sort(),
    [rows]
  );

  const loadPublication = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await frameworkAPI.getNistPublicationById(publicationId, { include_mappings: true });
      const payload = response.data?.data || {};
      const loadedPublication = payload.publication as PublicationDetail;
      setPublication(loadedPublication);
      setCoverage(payload.coverage || null);
      setRows(
        (loadedPublication?.mappings || []).map((mapping, index) => ({
          ...mapping,
          sort_order: Number.isFinite(Number(mapping.sort_order))
            ? Number(mapping.sort_order)
            : index + 1
        }))
      );
    } catch (loadError: any) {
      setError(loadError.response?.data?.error || 'Failed to load publication details');
    } finally {
      setLoading(false);
    }
  }, [publicationId]);

  const searchCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      const response = await frameworkAPI.searchNistControlCatalog({
        search: catalogSearch || undefined,
        framework_code: catalogFrameworkCode || undefined,
        limit: 75
      });
      setCatalogResults(response.data?.data || []);
    } catch {
      setCatalogResults([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogFrameworkCode, catalogSearch]);

  useEffect(() => {
    if (!publicationId) return;
    loadPublication();
  }, [loadPublication, publicationId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchCatalog();
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchCatalog]);

  function updateRow(index: number, key: keyof PublicationMapping, value: string | number) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [key]: value
      };
      return next;
    });
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  function addBlankRow() {
    setRows((prev) => [
      ...prev,
      {
        framework_code: '',
        control_id: '',
        mapping_strength: 'informative',
        mapping_note: '',
        sort_order: prev.length + 1
      }
    ]);
  }

  function addCatalogControl(control: CatalogControl) {
    setRows((prev) => {
      const exists = prev.some((row) =>
        row.framework_code === control.framework_code && row.control_id === control.control_id
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          framework_code: control.framework_code,
          framework_name: control.framework_name,
          control_id: control.control_id,
          control_title: control.control_title,
          framework_control_id: control.framework_control_id,
          mapping_strength: 'supporting',
          mapping_note: `Linked from ${publication?.publication_code || 'publication'} workspace`,
          sort_order: prev.length + 1
        }
      ];
    });
  }

  async function saveMappings() {
    if (!canManage || !publication) return;
    try {
      setSaving(true);
      setError('');
      setSuccessMessage('');
      const normalizedRows = normalizeMappingRows(rows);
      const response = await frameworkAPI.saveNistPublicationMappings(publication.id, {
        mappings: normalizedRows.map((row) => ({
          framework_code: row.framework_code,
          control_id: row.control_id,
          mapping_strength: row.mapping_strength,
          mapping_note: row.mapping_note || null,
          sort_order: row.sort_order
        })),
        replace_existing: true
      });

      const payload = response.data?.data || {};
      const updatedPublication = payload.publication as PublicationDetail;
      setPublication(updatedPublication);
      setCoverage(payload.coverage || null);
      setRows(updatedPublication.mappings || []);
      setSuccessMessage('Mapping workspace saved.');
      window.setTimeout(() => setSuccessMessage(''), 2200);
    } catch (saveError: any) {
      const apiError = saveError.response?.data;
      if (apiError?.invalid_mappings?.length) {
        const invalidList = apiError.invalid_mappings
          .map((mapping: { framework_code: string; control_id: string }) => `${mapping.framework_code}:${mapping.control_id}`)
          .join(', ');
        setError(`Invalid mappings: ${invalidList}`);
      } else {
        setError(apiError?.error || 'Failed to save mappings');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="py-16 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!publication) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Publication not found'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/dashboard/frameworks/mappings" className="text-sm text-purple-700 hover:text-purple-900">
              ← Back to Mapping and Coverage
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mt-2">{publication.publication_code}</h1>
            <p className="text-gray-700 mt-1">{publication.title}</p>
          </div>
          {canManage && (
            <button
              onClick={saveMappings}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Mapping Workspace'}
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {successMessage}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
              {publication.publication_family}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
              {publication.publication_type}
            </span>
            {publication.recommended_for_private && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Private-ready</span>
            )}
            {publication.federal_focus && (
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">Federal-focus</span>
            )}
          </div>
          <p className="text-sm text-gray-700">{publication.summary || 'No summary provided.'}</p>
          {publication.primary_use_case && (
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-semibold text-gray-700">Primary use case:</span> {publication.primary_use_case}
            </p>
          )}
          {publication.publication_url && (
            <a
              href={publication.publication_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-3 text-sm text-purple-700 hover:text-purple-900"
            >
              Open source publication
            </a>
          )}
        </div>

        {coverage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Mapped Controls" value={coverage.mapped_controls} />
            <MetricCard label="Completed" value={coverage.completed_controls} />
            <MetricCard label="In Progress" value={coverage.in_progress_controls} />
            <MetricCard label="Completion" value={`${coverage.completion_percent}%`} />
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <section className="xl:col-span-2 bg-white rounded-lg shadow-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">Control Mapping Workspace</h2>
              {canManage && (
                <button
                  onClick={addBlankRow}
                  className="px-3 py-1.5 text-sm rounded-md bg-slate-200 text-slate-800 hover:bg-slate-300"
                >
                  + Add Row
                </button>
              )}
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Framework</th>
                    <th className="px-3 py-2 text-left">Control</th>
                    <th className="px-3 py-2 text-left">Strength</th>
                    <th className="px-3 py-2 text-left">Note</th>
                    <th className="px-3 py-2 text-left">Order</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-gray-500" colSpan={6}>
                        No mappings yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr key={`${row.framework_code}-${row.control_id}-${index}`} className="border-t border-gray-200">
                        <td className="px-3 py-2">
                          {canManage ? (
                            <input
                              value={row.framework_code}
                              onChange={(e) => updateRow(index, 'framework_code', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md"
                              placeholder="nist_800_53"
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-700">{row.framework_code}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {canManage ? (
                            <input
                              value={row.control_id}
                              onChange={(e) => updateRow(index, 'control_id', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md"
                              placeholder="AC-2"
                            />
                          ) : row.framework_control_id ? (
                            <Link href={`/dashboard/controls/${row.framework_control_id}`} className="text-purple-700 hover:text-purple-900">
                              {row.control_id}
                            </Link>
                          ) : (
                            <span>{row.control_id}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {canManage ? (
                            <select
                              value={row.mapping_strength}
                              onChange={(e) => updateRow(index, 'mapping_strength', e.target.value as MappingStrength)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md"
                            >
                              <option value="primary">Primary</option>
                              <option value="supporting">Supporting</option>
                              <option value="informative">Informative</option>
                            </select>
                          ) : (
                            <span className="capitalize">{row.mapping_strength}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {canManage ? (
                            <input
                              value={row.mapping_note || ''}
                              onChange={(e) => updateRow(index, 'mapping_note', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded-md"
                              placeholder="Why this mapping applies"
                            />
                          ) : (
                            <span className="text-gray-600">{row.mapping_note || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {canManage ? (
                            <input
                              type="number"
                              value={row.sort_order}
                              onChange={(e) => updateRow(index, 'sort_order', Number(e.target.value))}
                              className="w-20 px-2 py-1 border border-gray-300 rounded-md"
                            />
                          ) : (
                            <span>{row.sort_order}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {canManage && (
                            <button
                              onClick={() => removeRow(index)}
                              className="text-xs text-red-700 hover:text-red-900"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!canManage && (
              <p className="text-xs text-gray-500 mt-2">
                Read-only view. You need <code>frameworks.manage</code> permission to edit mappings.
              </p>
            )}
          </section>

          <section className="bg-white rounded-lg shadow-md p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Control Catalog</h2>
              <p className="text-xs text-gray-600 mt-1">Search controls and add curated mappings.</p>
            </div>

            <div className="space-y-2">
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search control id/title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
              <select
                value={catalogFrameworkCode}
                onChange={(e) => setCatalogFrameworkCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All frameworks</option>
                {frameworkFilterOptions.map((frameworkCode) => (
                  <option key={frameworkCode} value={frameworkCode}>
                    {frameworkCode}
                  </option>
                ))}
              </select>
            </div>

            <div className="border border-gray-200 rounded-lg max-h-[420px] overflow-y-auto">
              {catalogLoading ? (
                <div className="py-6 text-center text-sm text-gray-500">Searching catalog...</div>
              ) : catalogResults.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">No catalog results.</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {catalogResults.map((control) => (
                    <li key={control.framework_control_id} className="p-3">
                      <p className="text-xs font-mono text-gray-600">
                        {control.framework_code}:{control.control_id}
                      </p>
                      <p className="text-sm text-gray-900 mt-1">{control.control_title}</p>
                      {canManage && (
                        <button
                          onClick={() => addCatalogControl(control)}
                          className="mt-2 text-xs text-purple-700 hover:text-purple-900"
                        >
                          Add mapping
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className="bg-white rounded-lg shadow-md p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Suggested Tasks</h2>
          {publication.related_tasks.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks available for this publication.</p>
          ) : (
            <div className="space-y-2">
              {publication.related_tasks.map((task) => (
                <div key={task.task_id} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {task.framework_code}:{task.control_id}
                      {task.source_document ? ` • ${task.source_document}` : ''}
                    </p>
                  </div>
                  <Link
                    href={task.href}
                    className="text-xs px-3 py-1.5 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200"
                  >
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
