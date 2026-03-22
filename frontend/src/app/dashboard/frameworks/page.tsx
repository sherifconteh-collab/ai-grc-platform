// @tier: community
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { organizationAPI, frameworkAPI, assessmentsAPI } from '@/lib/api';
import { hasPermission, normalizeTier } from '@/lib/access';
import { APP_POSITIONING_SHORT } from '@/lib/branding';

function getFrameworkLimit(tier: string): number {
  switch (tier) {
    case 'community': return 2;
    case 'pro': return -1;
    default: return -1;
  }
}

interface Framework {
  id: string;
  code: string;
  name: string;
  description: string;
  controlCount: number;
  procedureCount?: number | null;
  category?: string | null;
  tierRequired?: string | null;
  version?: string | null;
  selected?: boolean;
}

interface NistPublication {
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
  related_controls: Array<{
    framework_code: string;
    framework_name: string;
    control_id: string;
    control_title: string;
    framework_control_id: string | null;
    mapping_strength: 'primary' | 'supporting' | 'informative';
    mapping_note: string | null;
  }>;
  related_tasks: Array<{
    task_id: string;
    title: string;
    procedure_type: string;
    depth: string;
    framework_code: string;
    control_id: string;
    framework_control_id: string | null;
    source_document: string | null;
    href: string;
  }>;
}

export default function FrameworksPage() {
  const { user } = useAuth();
  const canManageFrameworks = hasPermission(user, 'frameworks.manage');
  const canReadAssessments = hasPermission(user, 'assessments.read');
  const userTier = normalizeTier(user?.effectiveTier || user?.organizationTier);
  const frameworkLimit = getFrameworkLimit(userTier);
  const isLimitedTier = frameworkLimit !== -1;
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [procedureCountsByCode, setProcedureCountsByCode] = useState<Record<string, number>>({});
  const [nistPublications, setNistPublications] = useState<NistPublication[]>([]);
  const [nistFamilies, setNistFamilies] = useState<Array<{ publication_family: string; count: number }>>([]);
  const [nistTypes, setNistTypes] = useState<Array<{ publication_type: string; count: number }>>([]);
  const [showNistLibrary, setShowNistLibrary] = useState(false);
  const [nistSearch, setNistSearch] = useState('');
  const [nistFamilyFilter, setNistFamilyFilter] = useState('all');
  const [nistTypeFilter, setNistTypeFilter] = useState('all');
  const [complianceProfile, setComplianceProfile] = useState<'private' | 'federal' | 'hybrid'>('private');
  const [nistMode, setNistMode] = useState<'best_practice' | 'mandatory'>('best_practice');
  const [loadingNist, setLoadingNist] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFrameworks = useCallback(async () => {
    try {
      const response = await frameworkAPI.getAll();
      const backendFrameworks = (response.data?.data || []).map((f: any) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        version: f.version || null,
        description: f.description || '',
        category: f.category || null,
        tierRequired: f.tier_required || null,
        controlCount: parseInt(f.control_count) || 0,
        procedureCount: null
      }));
      setFrameworks(backendFrameworks);
    } catch (err) {
      console.error('Failed to load frameworks:', err);
    }
  }, []);

  const loadProcedureCounts = useCallback(async () => {
    if (!canReadAssessments) return;
    try {
      const res = await assessmentsAPI.getFrameworks();
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const next: Record<string, number> = {};
      rows.forEach((row: any) => {
        const code = String(row.code || '').trim();
        if (!code) return;
        const count = Number.parseInt(String(row.procedure_count || '0'), 10) || 0;
        next[code] = count;
      });
      setProcedureCountsByCode(next);
    } catch {
      // Best-effort only; avoid blocking framework selection UX.
    }
  }, [canReadAssessments]);

  const loadSelectedFrameworks = useCallback(async () => {
    if (!user?.organizationId) return;
    try {
      const response = await organizationAPI.getFrameworks(user.organizationId);
      const selected = (response.data?.data || []).map((f: any) => f.id);
      setSelectedFrameworks(selected);
    } catch (err) {
      console.error('Failed to load selected frameworks:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.organizationId]);

  const loadNistProfile = useCallback(async () => {
    try {
      const response = await organizationAPI.getMyProfile();
      const profile = response.data?.data?.profile || {};
      setComplianceProfile((profile.compliance_profile || 'private') as 'private' | 'federal' | 'hybrid');
      setNistMode((profile.nist_adoption_mode || 'best_practice') as 'best_practice' | 'mandatory');
    } catch {
      // Keep defaults if profile fetch fails.
    }
  }, []);

  const loadNistPublications = useCallback(async () => {
    try {
      setLoadingNist(true);
      const response = await frameworkAPI.getNistPublications({
        search: nistSearch || undefined,
        publication_family: nistFamilyFilter !== 'all' ? nistFamilyFilter : undefined,
        publication_type: nistTypeFilter !== 'all' ? nistTypeFilter : undefined,
        private_only: complianceProfile === 'private',
        include_mappings: true
      });

      const payload = response.data?.data || {};
      setNistPublications(
        (payload.publications || []).map((publication: any) => ({
          ...publication,
          related_controls: publication.related_controls || [],
          related_tasks: publication.related_tasks || []
        }))
      );
      setNistFamilies(payload.families || []);
      setNistTypes(payload.types || []);
    } catch {
      setNistPublications([]);
      setNistFamilies([]);
      setNistTypes([]);
    } finally {
      setLoadingNist(false);
    }
  }, [complianceProfile, nistFamilyFilter, nistSearch, nistTypeFilter]);

  useEffect(() => {
    if (user?.organizationId) {
      loadFrameworks();
      loadSelectedFrameworks();
      loadNistProfile();
      loadProcedureCounts();
    }
  }, [loadFrameworks, loadNistProfile, loadProcedureCounts, loadSelectedFrameworks, user?.organizationId]);

  useEffect(() => {
    if (!user?.organizationId) return;

    const timeout = setTimeout(() => {
      loadNistPublications();
    }, 200);

    return () => clearTimeout(timeout);
  }, [loadNistPublications, user?.organizationId]);

  const toggleFramework = (frameworkId: string) => {
    if (!canManageFrameworks) return;
    setSelectedFrameworks((prev) => {
      if (prev.includes(frameworkId)) {
        return prev.filter((id) => id !== frameworkId);
      }
      if (frameworkLimit !== -1 && prev.length >= frameworkLimit) {
        const tierLabel = userTier.charAt(0).toUpperCase() + userTier.slice(1);
        setMessage({
          type: 'error',
          text: `${tierLabel} plan allows up to ${frameworkLimit} framework${frameworkLimit === 1 ? '' : 's'}. Deselect one first, or upgrade to ControlWeave Pro for more.`
        });
        return prev;
      }
      return [...prev, frameworkId];
    });
  };

  const saveFrameworks = async () => {
    if (!canManageFrameworks) return;
    if (!user?.organizationId) return;

    setSaving(true);
    setMessage(null);

    try {
      await organizationAPI.addFrameworks(user.organizationId, {
        frameworkIds: selectedFrameworks,
      });
      setMessage({
        type: 'success',
        text: `Successfully selected ${selectedFrameworks.length} framework(s)`,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to save frameworks',
      });
    } finally {
      setSaving(false);
    }
  };

  const totalControls = frameworks
    .filter((f) => selectedFrameworks.includes(f.id))
    .reduce((sum, f) => sum + f.controlCount, 0);

  const featuredFrameworkOrder = new Map<string, number>([
    ['nist_ai_rmf', 0],
    ['iso_42005', 1],
    ['iso_42001', 2],
    ['eu_ai_act', 3],
  ]);

  const featuredSpotlightCodes = ['nist_ai_rmf', 'iso_42005'];
  const featuredSpotlight = featuredSpotlightCodes
    .map((code) => frameworks.find((framework) => framework.code === code))
    .filter(Boolean) as Framework[];

  const orderedFrameworks = [...frameworks].sort((a, b) => {
    const aPinned = featuredFrameworkOrder.has(a.code) ? featuredFrameworkOrder.get(a.code)! : null;
    const bPinned = featuredFrameworkOrder.has(b.code) ? featuredFrameworkOrder.get(b.code)! : null;
    if (aPinned !== null || bPinned !== null) {
      if (aPinned === null) return 1;
      if (bPinned === null) return -1;
      return aPinned - bPinned;
    }

    const aAiGov = String(a.category || '').toLowerCase() === 'ai governance';
    const bAiGov = String(b.category || '').toLowerCase() === 'ai governance';
    if (aAiGov !== bAiGov) return aAiGov ? -1 : 1;

    return a.name.localeCompare(b.name);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Select Frameworks and Models</h1>
            <p className="text-gray-600 mt-2">{APP_POSITIONING_SHORT}</p>
          </div>
          {canManageFrameworks ? (
            <button
              onClick={saveFrameworks}
              disabled={saving || selectedFrameworks.length === 0}
              className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Selection'}
            </button>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-full">Read-only</span>
          )}
        </div>

        {!canManageFrameworks && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">
            You can review selected frameworks, but only users with
            <code className="mx-1">frameworks.manage</code>
            can change selections.
          </div>
        )}

        {/* AI cross-feature linkage */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/dashboard/ai-analysis"
            className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span>✨</span>
            <div>
              <div className="font-medium text-purple-800">AI Analysis</div>
              <div className="text-purple-600">Gap analysis & crosswalk optimizer</div>
            </div>
          </Link>
          <Link href="/dashboard/controls"
            className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span>✅</span>
            <div>
              <div className="font-medium text-blue-800">Controls</div>
              <div className="text-blue-600">Framework control library</div>
            </div>
          </Link>
          <Link href="/dashboard/regulatory-news"
            className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-xs">
            <span>📰</span>
            <div>
              <div className="font-medium text-green-800">Regulatory News</div>
              <div className="text-green-600">Framework-tagged updates</div>
            </div>
          </Link>
          <Link href="/dashboard/assessments"
            className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors text-xs">
            <span>📋</span>
            <div>
              <div className="font-medium text-orange-800">Assessments</div>
              <div className="text-orange-600">NIST 800-53A procedures</div>
            </div>
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`px-4 py-3 rounded ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tier framework limit banner */}
        {isLimitedTier && canManageFrameworks && (
          <div className={`border rounded-lg p-4 flex items-center justify-between gap-4 ${
            selectedFrameworks.length >= frameworkLimit
              ? 'bg-amber-50 border-amber-300'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <p className={`text-sm font-medium ${
              selectedFrameworks.length >= frameworkLimit ? 'text-amber-900' : 'text-blue-900'
            }`}>
              <span className="font-semibold">{userTier.charAt(0).toUpperCase() + userTier.slice(1)} plan:</span>{' '}
              {selectedFrameworks.length} of {frameworkLimit} framework{frameworkLimit === 1 ? '' : 's'} selected
              {selectedFrameworks.length >= frameworkLimit && ' — limit reached'}
            </p>
            {process.env.NEXT_PUBLIC_PRO_URL && (
              <a
                href={process.env.NEXT_PUBLIC_PRO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium"
              >
                Get ControlWeave Pro
              </a>
            )}
          </div>
        )}

        {/* Selection Summary */}
        {selectedFrameworks.length > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-purple-900 font-medium">
              Selected {selectedFrameworks.length} framework/model item(s) with {totalControls} total controls
            </p>
            <p className="text-purple-700 text-xs mt-1">
              💾 Your control answers and implementation history are always preserved — removing a framework just hides its controls, it never deletes your data.
            </p>
          </div>
        )}

        {/* AI Governance Spotlight */}
        {featuredSpotlight.length > 0 && (
          <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 px-6 py-5 text-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">AI Governance Spotlight</h2>
                  <p className="text-sm text-indigo-100 mt-1">
                    Start with AI risk management and impact assessment. These are prioritized across the app.
                  </p>
                </div>
                <Link
                  href="/dashboard/ai-analysis"
                  className="px-4 py-2 text-sm rounded-md bg-white/10 hover:bg-white/20 border border-white/20"
                >
                  Run AI governance checks
                </Link>
              </div>
            </div>
            <div className="bg-white px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featuredSpotlight.map((framework) => {
                  const isSelected = selectedFrameworks.includes(framework.id);
                  const procedureCount = procedureCountsByCode[framework.code] ?? null;
                  const isAtLimit = frameworkLimit !== -1 && selectedFrameworks.length >= frameworkLimit;
                  const isLocked = canManageFrameworks && !isSelected && isAtLimit;
                  return (
                    <div
                      key={`spotlight-${framework.id}`}
                      onClick={() => toggleFramework(framework.id)}
                      className={`rounded-xl border-2 p-5 transition ${
                        isSelected
                          ? 'border-purple-600 bg-purple-50'
                          : isLocked
                            ? 'border-slate-200 opacity-50 cursor-not-allowed'
                            : canManageFrameworks
                              ? 'border-slate-200 hover:border-purple-400 hover:bg-slate-50 cursor-pointer'
                              : 'border-slate-200'
                      }`}
                      role={canManageFrameworks && !isLocked ? 'button' : undefined}
                      tabIndex={canManageFrameworks && !isLocked ? 0 : -1}
                      onKeyDown={(e) => {
                        if (!canManageFrameworks) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleFramework(framework.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">Featured</div>
                          <h3 className="text-lg font-semibold text-slate-900 mt-1">{framework.name}</h3>
                        </div>
                        {isSelected ? (
                          <span className="text-[11px] px-2 py-1 rounded-full bg-purple-600 text-white">Selected</span>
                        ) : isLocked ? (
                          <span className="text-[11px] px-2 py-1 rounded-full bg-gray-400 text-white">Locked</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-600 mt-2">{framework.description}</p>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                        <span className="inline-flex items-center gap-2">
                          <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-semibold">
                            {framework.controlCount} controls
                          </span>
                          {procedureCount !== null && (
                            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                              {procedureCount} procedures
                            </span>
                          )}
                          {String(framework.category || '').toLowerCase() === 'ai governance' && (
                            <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                              AI Governance
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-3">
                          <Link
                            href={`/dashboard/assessments?tab=procedures&framework_code=${encodeURIComponent(framework.code)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-purple-700 hover:text-purple-800"
                          >
                            View procedures
                          </Link>
                          <span className="font-mono">{framework.code}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            Reference models such as Zero Trust are guidance models, not certifiable audit frameworks.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap gap-3 items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">NIST Publications Library</h2>
              <p className="text-sm text-gray-600 mt-1">
                {nistMode === 'mandatory'
                  ? 'NIST mode: Mandatory baseline for this organization.'
                  : 'NIST mode: Best-practice guidance (optional), suitable for private-sector programs.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/frameworks/mappings"
                className="px-4 py-2 text-sm border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50"
              >
                Coverage Heatmap
              </Link>
              <button
                onClick={() => setShowNistLibrary((prev) => !prev)}
                className="px-4 py-2 text-sm bg-slate-100 text-slate-800 rounded-md hover:bg-slate-200"
              >
                {showNistLibrary ? 'Hide Library' : 'Show Library'}
              </button>
            </div>
          </div>

          {showNistLibrary && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={nistSearch}
                  onChange={(e) => setNistSearch(e.target.value)}
                  placeholder="Search publication code/title"
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                />
                <select
                  value={nistFamilyFilter}
                  onChange={(e) => setNistFamilyFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Families</option>
                  {nistFamilies.map((family) => (
                    <option key={family.publication_family} value={family.publication_family}>
                      {family.publication_family} ({family.count})
                    </option>
                  ))}
                </select>
                <select
                  value={nistTypeFilter}
                  onChange={(e) => setNistTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"
                >
                  <option value="all">All Types</option>
                  {nistTypes.map((type) => (
                    <option key={type.publication_type} value={type.publication_type}>
                      {type.publication_type} ({type.count})
                    </option>
                  ))}
                </select>
              </div>

              {loadingNist ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading NIST publication library...</div>
              ) : nistPublications.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No NIST publications match your filters.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
                  {nistPublications.map((publication) => (
                    <div key={publication.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm">{publication.publication_code}</h3>
                        <div className="flex items-center gap-1">
                          {publication.recommended_for_private && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Private-ready</span>
                          )}
                          {publication.federal_focus && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Federal-focus</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-800 mt-1">{publication.title}</p>
                      <p className="text-xs text-gray-600 mt-2">{publication.summary || 'Guidance reference publication.'}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        Family: {publication.publication_family} | Type: {publication.publication_type}
                      </p>
                      {publication.primary_use_case && (
                        <p className="text-xs text-gray-600 mt-1">Use case: {publication.primary_use_case}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <Link
                          href={`/dashboard/frameworks/publications/${publication.id}`}
                          className="text-purple-700 hover:text-purple-800"
                        >
                          Open workspace
                        </Link>
                        {publication.publication_url && (
                          <a
                            href={publication.publication_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-600 hover:text-slate-800"
                          >
                            View source
                          </a>
                        )}
                        {canManageFrameworks && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            Mapping admin
                          </span>
                        )}
                      </div>

                      {publication.related_controls.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-gray-200">
                          <p className="text-[11px] font-semibold text-gray-700 mb-1">Mapped controls</p>
                          <div className="flex flex-wrap gap-1">
                            {publication.related_controls.slice(0, 5).map((control) =>
                              control.framework_control_id ? (
                                <Link
                                  key={`${publication.id}-${control.framework_code}-${control.control_id}`}
                                  href={`/dashboard/controls/${control.framework_control_id}`}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 hover:bg-purple-200"
                                  title={control.control_title}
                                >
                                  {control.framework_code}:{control.control_id}
                                </Link>
                              ) : (
                                <span
                                  key={`${publication.id}-${control.framework_code}-${control.control_id}`}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700"
                                  title={control.control_title}
                                >
                                  {control.framework_code}:{control.control_id}
                                </span>
                              )
                            )}
                            {publication.related_controls.length > 5 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                                +{publication.related_controls.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {publication.related_tasks.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold text-gray-700 mb-1">Suggested tasks</p>
                          <div className="flex flex-wrap gap-1">
                            {publication.related_tasks.slice(0, 3).map((task) => (
                              <Link
                                key={`${publication.id}-${task.task_id}`}
                                href={task.href}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200"
                                title={`${task.framework_code}:${task.control_id}`}
                              >
                                {task.title}
                              </Link>
                            ))}
                            {publication.related_tasks.length > 3 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                                +{publication.related_tasks.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Framework Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orderedFrameworks.map((framework) => {
              const isSelected = selectedFrameworks.includes(framework.id);
              const procedureCount = procedureCountsByCode[framework.code] ?? null;
              const isAtLimit = frameworkLimit !== -1 && selectedFrameworks.length >= frameworkLimit;
              const isLocked = canManageFrameworks && !isSelected && isAtLimit;
              return (
                <div
                  key={framework.id}
                  onClick={() => toggleFramework(framework.id)}
                  className={`
                    bg-white border-2 rounded-lg p-6 transition-all relative
                    ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                        : isLocked
                          ? 'border-gray-200 opacity-50 cursor-not-allowed'
                          : canManageFrameworks
                            ? 'border-gray-200 hover:border-purple-400 hover:shadow-md cursor-pointer'
                            : 'border-gray-200 cursor-default'
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{framework.name}</h3>
                      {String(framework.category || '').toLowerCase() === 'ai governance' && (
                        <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                          AI Governance
                        </span>
                      )}
                    </div>
                    {isSelected ? (
                      <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                        Selected
                      </span>
                    ) : isLocked ? (
                      <span className="bg-gray-400 text-white text-xs px-2 py-1 rounded-full">
                        Locked
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{framework.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                        {framework.controlCount} controls
                      </span>
                      {procedureCount !== null && (
                        <span className="inline-block px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                          {procedureCount} procedures
                        </span>
                      )}
                      <Link
                        href={`/dashboard/assessments?tab=procedures&framework_code=${encodeURIComponent(framework.code)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-purple-700 hover:text-purple-800"
                      >
                        View procedures
                      </Link>
                    </span>
                    <span className="text-xs text-gray-500">{framework.code}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
