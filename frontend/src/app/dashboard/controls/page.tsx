// @tier: community
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { organizationAPI, controlsAPI } from '@/lib/api';
import { groupByControlFamily } from '@/lib/controlFamilies';
import { hasPermission } from '@/lib/access';

interface Control {
  id: string;
  controlId: string;
  title: string;
  description: string;
  frameworkCode: string;
  status: string;
  mappingCount?: number;
}

export default function ControlsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const canExport = hasPermission(user, 'implementations.read');
  const canImport = hasPermission(user, 'implementations.write');
  const canUseAI = hasPermission(user, 'ai.use');
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFramework, setSelectedFramework] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [expandedFamilies, setExpandedFamilies] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importAiAssist, setImportAiAssist] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<any | null>(null);
  const [crosswalkBusy, setCrosswalkBusy] = useState<string | null>(null);
  const [crosswalkMsg, setCrosswalkMsg] = useState('');
  const crosswalkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const canWrite = hasPermission(user, 'implementations.write');

  useEffect(() => {
    return () => { if (crosswalkTimer.current) clearTimeout(crosswalkTimer.current); };
  }, []);

  const triggerCrosswalk = async (controlId: string) => {
    try {
      setCrosswalkBusy(controlId);
      setCrosswalkMsg('');
      if (crosswalkTimer.current) clearTimeout(crosswalkTimer.current);
      const res = await controlsAPI.triggerInherit(controlId);
      const explicitCount =
        res.data?.data?.satisfied_count !== undefined
          ? res.data?.data?.satisfied_count
          : res.data?.satisfied_count;
      let count: number;
      if (typeof explicitCount === 'number') {
        count = explicitCount;
      } else {
        const processed = res.data?.data?.processed ?? res.data?.processed;
        if (Array.isArray(processed)) {
          count = processed.filter((item: any) => !item?.skipped).length;
        } else {
          count = 0;
        }
      }
      setCrosswalkMsg(`Crosswalk complete: ${count} related control${count !== 1 ? 's' : ''} auto-satisfied.`);
      crosswalkTimer.current = setTimeout(() => { loadControls(); setCrosswalkMsg(''); }, 3000);
    } catch (err: any) {
      setCrosswalkMsg(err.response?.data?.error || 'Crosswalk failed');
    } finally {
      setCrosswalkBusy(null);
    }
  };

  const loadControls = useCallback(async () => {
    if (!user?.organizationId) return;
    try {
      const response = await organizationAPI.getControls(user.organizationId);
      const payload = response.data?.data;
      const rawControls = Array.isArray(payload)
        ? payload
        : payload?.controls || payload?.rows || [];

      const mappedControls: Control[] = rawControls.map((control: any) => ({
        id: control.id,
        controlId: control.controlId || control.control_id,
        title: control.title,
        description: control.description,
        frameworkCode: control.frameworkCode || control.framework_code,
        status: control.status || control.implementation_status || 'not_started',
        mappingCount: Number(control.mappingCount ?? control.mapping_count ?? 0),
      }));

      setControls(mappedControls);
    } catch (err) {
      console.error('Failed to load controls:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.organizationId]);

  useEffect(() => {
    if (user?.organizationId) {
      loadControls();
    }
  }, [loadControls, user?.organizationId]);

  const downloadExport = async (format: 'xlsx' | 'csv') => {
    if (!user?.organizationId) return;
    setExporting(format);
    try {
      const response = await organizationAPI.exportControlAnswers(user.organizationId, { format });

      const blob = new Blob([response.data], {
        type: format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv;charset=utf-8'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `control-answers-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export control answers error:', err);
    } finally {
      setExporting(null);
    }
  };

  const runImport = async () => {
    if (!user?.organizationId) return;
    if (!importFile) {
      setImportError('Select a .xlsx or .csv file to import.');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await organizationAPI.importControlAnswers(user.organizationId, formData, {
        mode: importMode,
        ai: importAiAssist && canUseAI ? '1' : '0'
      });

      setImportResult(response.data?.data);
      await loadControls();
    } catch (err: any) {
      setImportError(err.response?.data?.error || 'Import failed. Please verify the file and try again.');
      if (err.response?.data?.ai_column_mapping || err.response?.data?.data) {
        setImportResult(err.response?.data?.data || null);
      }
      console.error('Import control answers error:', err);
    } finally {
      setImporting(false);
    }
  };

  const filteredControls = useMemo(() => (
    controls.filter((control) => {
      const matchesSearch =
        control.controlId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        control.title.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFramework =
        selectedFramework === 'all' || control.frameworkCode === selectedFramework;

      const matchesStatus = selectedStatus === 'all' || control.status === selectedStatus;

      return matchesSearch && matchesFramework && matchesStatus;
    })
  ), [controls, searchTerm, selectedFramework, selectedStatus]);

  const controlFamilies = useMemo(
    () => groupByControlFamily(filteredControls, (control) => control.controlId),
    [filteredControls]
  );

  useEffect(() => {
    if (controlFamilies.length === 0) {
      setExpandedFamilies({});
      return;
    }
    setExpandedFamilies((prev) => {
      const next: Record<string, boolean> = {};
      controlFamilies.forEach((family, index) => {
        next[family.family] = prev[family.family] ?? index === 0;
      });
      return next;
    });
  }, [controlFamilies]);

  const frameworks = Array.from(new Set(controls.map((c) => c.frameworkCode)));

  // Identify parent controls and their sub-controls (enhancements)
  // e.g. AC-2 is parent; AC-2(1), AC-2(2) are enhancements
  // Use unfiltered controls so enhancements always show even when filters are active
  const getSubControls = (parentControlId: string): Control[] => {
    const prefix = parentControlId + '(';
    return controls.filter(c => c.controlId.startsWith(prefix));
  };

  const isSubControl = (controlId: string): boolean => /\(\d+\)$/.test(controlId);

  const updateControlStatus = async (controlId: string, newStatus: string) => {
    if (!user?.organizationId || !canWrite) return;
    setStatusSaving(controlId);
    try {
      await controlsAPI.updateImplementation(controlId, { status: newStatus });
      await loadControls();
    } catch (err: any) {
      console.error('Failed to update status:', err);
    } finally {
      setStatusSaving(null);
    }
  };

  const toggleFamily = (family: string) => {
    setExpandedFamilies((prev) => ({
      ...prev,
      [family]: !prev[family]
    }));
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'implemented':
        return 'bg-green-100 text-green-800';
      case 'satisfied_via_crosswalk':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'implemented':
        return 'Implemented';
      case 'satisfied_via_crosswalk':
        return 'Auto-Crosswalked';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Not Started';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Controls</h1>
          <p className="text-gray-600 mt-2">Manage your compliance controls across all frameworks</p>
        </div>

        {/* AI cross-feature linkage */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/dashboard/ai-analysis"
            className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span>✨</span>
            <div>
              <div className="font-medium text-purple-800">AI Analysis</div>
              <div className="text-purple-600">Gap analysis & crosswalk</div>
            </div>
          </Link>
          <Link href="/dashboard/assessments"
            className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span>📋</span>
            <div>
              <div className="font-medium text-blue-800">Assessments</div>
              <div className="text-blue-600">Test procedures & evidence</div>
            </div>
          </Link>
          <Link href="/dashboard/vulnerabilities"
            className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs">
            <span>🔍</span>
            <div>
              <div className="font-medium text-orange-800">Vulnerabilities</div>
              <div className="text-orange-600">Control-linked findings</div>
            </div>
          </Link>
          <Link href="/dashboard/evidence"
            className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-xs">
            <span>📄</span>
            <div>
              <div className="font-medium text-green-800">Evidence</div>
              <div className="text-green-600">Artifacts & documentation</div>
            </div>
          </Link>
        </div>

        {(canExport || canImport) && (
          <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Import / Export</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Export control answers for offline work, then import updates back into ControlWeave.
                </p>
              </div>

              {canExport && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => downloadExport('xlsx')}
                    disabled={exporting !== null}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {exporting === 'xlsx' ? 'Exporting...' : 'Export XLSX'}
                  </button>
                  <button
                    onClick={() => downloadExport('csv')}
                    disabled={exporting !== null}
                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>
              )}
            </div>

            {canImport && (
              <div className="border-t pt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Import File
                    </label>
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="w-full text-sm"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    >
                      <option value="merge">Merge (Recommended)</option>
                      <option value="replace">Replace</option>
                    </select>
                  </div>

                  <div className="md:col-span-1 flex items-center gap-2 pb-2">
                    <input
                      id="import-ai-assist"
                      type="checkbox"
                      checked={importAiAssist}
                      onChange={(e) => setImportAiAssist(e.target.checked)}
                      disabled={!canUseAI}
                    />
                    <label htmlFor="import-ai-assist" className="text-sm text-gray-700 select-none">
                      AI column mapping
                    </label>
                  </div>

                  <div className="md:col-span-1">
                    <button
                      onClick={runImport}
                      disabled={importing || !importFile}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      {importing ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>

                {importError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                    {importError}
                  </div>
                )}

                {importResult && (
                  <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-2">
                    <div className="text-sm font-semibold text-gray-900">Import summary</div>
                    <div className="text-xs text-gray-700">
                      Rows: {importResult.total_rows ?? '—'} | Processed: {importResult.processed_rows ?? '—'} | Inserted: {importResult.inserted ?? '—'} | Updated: {importResult.updated ?? '—'} | Skipped: {importResult.skipped ?? '—'}
                    </div>

                    {importResult.ai_column_mapping?.attempted && (
                      <div className="text-xs text-gray-700">
                        AI column mapping: {importResult.ai_column_mapping.used ? 'used' : 'not used'}
                        {importResult.ai_column_mapping.provider ? ` (${importResult.ai_column_mapping.provider}${importResult.ai_column_mapping.model ? ` / ${importResult.ai_column_mapping.model}` : ''})` : ''}
                        {importResult.ai_column_mapping.note ? ` | ${importResult.ai_column_mapping.note}` : ''}
                        {importResult.ai_column_mapping.error ? ` | ${importResult.ai_column_mapping.error}` : ''}
                      </div>
                    )}

                    {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                      <div className="text-xs text-red-700">
                        Errors ({importResult.errors.length}): {importResult.errors.slice(0, 3).map((e: any) => `Row ${e.row}: ${e.error}`).join(' | ')}
                        {importResult.errors.length > 3 ? ' | …' : ''}
                      </div>
                    )}

                    {Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
                      <div className="text-xs text-amber-700">
                        Warnings ({importResult.warnings.length}): {importResult.warnings.slice(0, 3).map((w: any) => `Row ${w.row}: ${w.warning}`).join(' | ')}
                        {importResult.warnings.length > 3 ? ' | …' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Controls
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by ID or title..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Framework</label>
              <select
                value={selectedFramework}
                onChange={(e) => setSelectedFramework(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Frameworks</option>
                {frameworks.map((framework) => (
                  <option key={framework} value={framework}>
                    {framework}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="implemented">Implemented</option>
                <option value="satisfied_via_crosswalk">Auto-Crosswalked</option>
                <option value="in_progress">In Progress</option>
                <option value="not_started">Not Started</option>
              </select>
            </div>
          </div>
        </div>

        {/* Auto-Crosswalk Info */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-purple-400 p-4 rounded-lg">
          <div className="flex items-start">
            <span className="text-2xl mr-3">💡</span>
            <div>
              <h3 className="font-bold text-gray-900">How Auto-Crosswalk Works</h3>
              <p className="text-sm text-gray-700 mt-1">
                Crosswalk runs automatically when you change a control to &quot;Implemented&quot; — the system finds similar controls (90%+ similarity) across other frameworks and marks them as &quot;Auto-Crosswalked&quot;. Use the 🔗 Crosswalk button to re-run inheritance manually (e.g. after changing the threshold in Settings).
              </p>
            </div>
          </div>
        </div>

        {/* Crosswalk result banner */}
        {crosswalkMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
            {crosswalkMsg}
          </div>
        )}

        {/* Controls Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {controlFamilies.length > 0 ? (
              controlFamilies.map((family) => {
                const familyOpen = Boolean(expandedFamilies[family.family]);
                return (
                  <div key={family.family} className="bg-white rounded-lg shadow-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleFamily(family.family)}
                      className="w-full px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-left hover:bg-gray-100"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Control Family {family.family}</div>
                        <div className="text-xs text-gray-600">{family.controls.length} controls</div>
                      </div>
                      <span className="text-xs text-gray-700">{familyOpen ? 'Collapse' : 'Expand'}</span>
                    </button>

                    {familyOpen && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-purple-600">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                Control ID
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                Title
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                Framework
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                Crosswalks
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {family.controls.flatMap((controlGroup) => controlGroup.items).map((control) => {
                              const subs = getSubControls(control.controlId);
                              const isExpanded = expandedControl === control.id;
                              const isSub = isSubControl(control.controlId);
                              return (
                              <React.Fragment key={control.id}>
                              <tr className={`hover:bg-gray-50 cursor-pointer ${isSub ? 'bg-gray-50/50' : ''}`} onClick={() => {
                                if (expandedControl === control.id) {
                                  setExpandedControl(null);
                                } else {
                                  setExpandedControl(control.id);
                                }
                              }}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-1">
                                    {isSub && <span className="text-gray-400 text-xs">↳</span>}
                                    <span className={`text-sm font-mono font-semibold ${isSub ? 'text-gray-600' : 'text-gray-900'}`}>
                                      {control.controlId}
                                    </span>
                                    {subs.length > 0 && (
                                      <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{subs.length}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div>
                                    <span className="text-sm text-gray-900">{control.title}</span>
                                    {control.description && (
                                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md" title={control.description}>{control.description}</p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="text-xs font-medium text-gray-600">
                                    {control.frameworkCode}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span
                                    className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(
                                      control.status
                                    )}`}
                                  >
                                    {getStatusLabel(control.status)}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {control.mappingCount ? (
                                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium">
                                      {control.mappingCount} mapped
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  <div className="flex items-center gap-2">
                                    {(control.status === 'implemented' || control.status === 'verified') && control.mappingCount && control.mappingCount > 0 ? (
                                      <button
                                        type="button"
                                        disabled={crosswalkBusy === control.id}
                                        onClick={(e) => { e.stopPropagation(); triggerCrosswalk(control.id); }}
                                        className="px-3 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded hover:bg-purple-200 disabled:opacity-50"
                                      >
                                        {crosswalkBusy === control.id ? 'Running…' : '🔗 Crosswalk'}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/controls/${control.id}`); }}
                                      className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                                    >
                                      Full Detail →
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {/* Inline expanded detail panel */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={6} className="px-6 py-4 bg-purple-50/40 border-l-4 border-purple-400">
                                    <div className="space-y-3">
                                      {/* Description */}
                                      <div>
                                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</div>
                                        <p className="text-sm text-gray-700">{control.description || 'No description available.'}</p>
                                      </div>
                                      {/* Quick Status Update */}
                                      {canWrite && (
                                        <div className="flex items-center gap-3">
                                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status:</div>
                                          <select
                                            value={control.status}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => { e.stopPropagation(); updateControlStatus(control.id, e.target.value); }}
                                            disabled={statusSaving === control.id}
                                            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                          >
                                            <option value="not_started">Not Started</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="implemented">Implemented</option>
                                            <option value="satisfied_via_crosswalk">Auto-Crosswalked</option>
                                          </select>
                                          {statusSaving === control.id && <span className="text-xs text-gray-500">Saving…</span>}
                                        </div>
                                      )}
                                      {/* Sub-controls / Enhancements */}
                                      {subs.length > 0 && (
                                        <div>
                                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Enhancements ({subs.length})</div>
                                          <div className="grid gap-2">
                                            {subs.map(sub => (
                                              <div key={sub.id} className="flex items-center justify-between bg-white rounded-md border border-gray-200 px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs font-mono font-semibold text-gray-700">{sub.controlId}</span>
                                                  <span className="text-xs text-gray-600 truncate max-w-[300px]" title={sub.title}>{sub.title}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadgeClass(sub.status)}`}>
                                                    {getStatusLabel(sub.status)}
                                                  </span>
                                                  {canWrite && (
                                                    <select
                                                      value={sub.status}
                                                      onClick={(e) => e.stopPropagation()}
                                                      onChange={(e) => { e.stopPropagation(); updateControlStatus(sub.id, e.target.value); }}
                                                      disabled={statusSaving === sub.id}
                                                      className="px-1 py-0.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-purple-500"
                                                    >
                                                      <option value="not_started">Not Started</option>
                                                      <option value="in_progress">In Progress</option>
                                                      <option value="implemented">Implemented</option>
                                                      <option value="satisfied_via_crosswalk">Auto-Crosswalked</option>
                                                    </select>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-lg shadow-md p-12 text-center">
                <p className="text-gray-500">
                  {searchTerm || selectedFramework !== 'all' || selectedStatus !== 'all'
                    ? 'No controls match your filters'
                    : 'No controls found. Select frameworks to get started.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Results Count */}
        {!loading && filteredControls.length > 0 && (
          <div className="text-sm text-gray-600 text-center">
            Showing {filteredControls.length} of {controls.length} controls
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
