'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { dashboardAPI, aiAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { APP_POSITIONING_SHORT } from '@/lib/branding';
import { useAutoAIResult } from '@/lib/useAutoAI';

const FRAMEWORK_PROGRESS_COLLAPSED_COUNT = 4;
const STATUS_FILTER_MAP: Record<string, string> = {
  Implemented: 'implemented',
  Crosswalked: 'satisfied_via_crosswalk',
  'Not Started': 'not_started',
};
const DASHBOARD_SECTIONS = [
  'stats',
  'maturity',
  'charts',
  'trend',
  'crosswalk',
  'frameworkProgress',
  'recentActivity',
] as const;
type DashboardSectionKey = typeof DASHBOARD_SECTIONS[number];

const DASHBOARD_SECTION_LABELS: Record<DashboardSectionKey, string> = {
  stats: 'Top KPI Cards',
  maturity: 'Maturity Score',
  charts: 'Status & Framework Charts',
  trend: 'Compliance Trend',
  crosswalk: 'Auto-Crosswalk Highlight',
  frameworkProgress: 'Framework Progress',
  recentActivity: 'Recent Activity Feed',
};

function isDashboardSectionKey(value: string): value is DashboardSectionKey {
  return (DASHBOARD_SECTIONS as readonly string[]).includes(value);
}

// Dynamically import chart components to avoid SSR issues with Recharts
const StatusPieChart = dynamic(() => import('@/components/DashboardCharts').then(m => m.StatusPieChart), { ssr: false });
const FrameworkBarChart = dynamic(() => import('@/components/DashboardCharts').then(m => m.FrameworkBarChart), { ssr: false });
const ComplianceTrendChart = dynamic(() => import('@/components/DashboardCharts').then(m => m.ComplianceTrendChart), { ssr: false });

interface Stats {
  overallCompliance: number;
  totalControls: number;
  implementedControls: number;
  satisfiedViaAutoCrosswalk: number;
  applicableControls: number;
  frameworks: Array<{
    id: string;
    code: string;
    name: string;
    totalControls: number;
    implementedControls: number;
    compliancePercentage: number;
  }>;
}

interface CrosswalkedControl {
  id: string;
  control_id: string;
  title: string;
  description: string | null;
  framework_name: string;
  framework_code: string;
  status: string;
  notes: string | null;
  updated_at: string | null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<{ id?: string; changed_by_name: string; control_code: string; control_title: string; old_status: string; new_status: string; changed_at: string; notes?: string }[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [maturity, setMaturity] = useState<any>(null);
  const [showAllFrameworkProgress, setShowAllFrameworkProgress] = useState(false);
  const [showDashboardCustomizer, setShowDashboardCustomizer] = useState(false);
  const [hiddenSections, setHiddenSections] = useState<DashboardSectionKey[]>([]);
  const [dashboardPrefsReady, setDashboardPrefsReady] = useState(false);
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(false);
  const [showCrosswalkModal, setShowCrosswalkModal] = useState(false);
  const [crosswalkedControls, setCrosswalkedControls] = useState<CrosswalkedControl[]>([]);
  const [crosswalkLoading, setCrosswalkLoading] = useState(false);
  const [crosswalkError, setCrosswalkError] = useState('');

  const gapSig = stats ? `${stats.implementedControls}-${stats.totalControls}-${stats.frameworks?.length}` : '';
  const gapAnalysis = useAutoAIResult({
    cacheKey: `dashboard-gap-${user?.organizationId}`,
    signature: gapSig,
    enabled: aiInsightsEnabled && !!stats && (stats.frameworks?.length ?? 0) > 0,
    ttlMs: 6 * 60 * 60 * 1000,
    run: async () => {
      const res = await aiAPI.gapAnalysis();
      return res.data?.data?.result;
    }
  });

  const forecastSig = stats ? `forecast-${stats.overallCompliance}-${stats.frameworks?.length}` : '';
  const forecast = useAutoAIResult({
    cacheKey: `dashboard-forecast-${user?.organizationId}`,
    signature: forecastSig,
    enabled: aiInsightsEnabled && !!stats && (stats.frameworks?.length ?? 0) > 0,
    ttlMs: 6 * 60 * 60 * 1000,
    run: async () => {
      const res = await aiAPI.complianceForecast();
      return res.data?.data?.result;
    }
  });

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `dashboardPrefs:${user.id}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setHiddenSections([]);
      } else {
        const parsed = JSON.parse(raw);
        const parsedHidden = Array.isArray(parsed?.hiddenSections)
          ? parsed.hiddenSections.filter((value: string) => isDashboardSectionKey(value))
          : [];
        setHiddenSections(Array.from(new Set(parsedHidden)));
      }
    } catch (err) {
      console.error('Failed to load dashboard preferences:', err);
      setHiddenSections([]);
    } finally {
      setDashboardPrefsReady(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!dashboardPrefsReady || !user?.id) return;
    const storageKey = `dashboardPrefs:${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify({ hiddenSections }));
  }, [dashboardPrefsReady, user?.id, hiddenSections]);

  useEffect(() => {
    if (!user?.id) return;
    const storageKey = `dashboardAiInsights:${user.id}`;
    try {
      const raw = localStorage.getItem(storageKey);
      setAiInsightsEnabled(raw === 'true');
    } catch (err) {
      console.error('Failed to load dashboard AI preference:', err);
      setAiInsightsEnabled(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const storageKey = `dashboardAiInsights:${user.id}`;
    localStorage.setItem(storageKey, aiInsightsEnabled ? 'true' : 'false');
  }, [user?.id, aiInsightsEnabled]);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await dashboardAPI.getOverview({ period: '30d' });
      const payload = response.data?.data || {};
      const backendData = payload.stats || null;

      if (!backendData) {
        throw new Error('Dashboard overview returned empty stats payload');
      }

      setStats({
        overallCompliance: backendData.overall.compliancePercentage,
        totalControls: backendData.overall.totalControls,
        implementedControls: backendData.overall.implemented,
        satisfiedViaAutoCrosswalk: backendData.overall.satisfiedViaCrosswalk,
        applicableControls: backendData.overall.totalApplicable,
        frameworks: backendData.frameworks.map((fw: any) => ({
          id: fw.id,
          code: fw.code,
          name: fw.name,
          totalControls: fw.totalControls,
          implementedControls: fw.implemented,
          compliancePercentage: fw.compliancePercentage
        }))
      });

      setActivity(Array.isArray(payload.activity) ? payload.activity : []);
      setTrendData(Array.isArray(payload.trend) ? payload.trend : []);
      setMaturity(payload.maturity || null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Compute status distribution for pie chart
  const statusData = stats ? [
    { name: 'Implemented', value: stats.implementedControls, color: '#7c3aed' },
    { name: 'Crosswalked', value: stats.satisfiedViaAutoCrosswalk, color: '#3b82f6' },
    { name: 'Not Started', value: Math.max(0, stats.totalControls - stats.implementedControls - stats.satisfiedViaAutoCrosswalk), color: '#e5e7eb' },
  ].filter(d => d.value > 0) : [];

  // Framework bar chart data
  const frameworkChartData = stats?.frameworks.map(fw => ({
    name: fw.code.length > 12 ? fw.code.substring(0, 12) : fw.code,
    code: fw.code,
    fullName: fw.name,
    compliance: fw.compliancePercentage,
    implemented: fw.implementedControls,
    total: fw.totalControls,
    remaining: fw.totalControls - fw.implementedControls,
  })) || [];
  const frameworkProgressItems = stats?.frameworks || [];
  const hasFrameworkOverflow = frameworkProgressItems.length > FRAMEWORK_PROGRESS_COLLAPSED_COUNT;
  const displayedFrameworks = showAllFrameworkProgress || !hasFrameworkOverflow
    ? frameworkProgressItems
    : frameworkProgressItems.slice(0, FRAMEWORK_PROGRESS_COLLAPSED_COUNT);
  const isSectionVisible = (section: DashboardSectionKey) => !hiddenSections.includes(section);
  const showFrameworkSection = isSectionVisible('frameworkProgress');
  const showActivitySection = isSectionVisible('recentActivity');

  const toggleSectionVisibility = (section: DashboardSectionKey) => {
    setHiddenSections((prev) =>
      prev.includes(section) ? prev.filter((item) => item !== section) : [...prev, section]
    );
  };

  const resetDashboard = () => {
    setHiddenSections([]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compliance Dashboard</h1>
            <p className="text-gray-600 mt-2">{APP_POSITIONING_SHORT}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAiInsightsEnabled((prev) => !prev)}
              className={`px-4 py-2 border font-medium rounded-lg transition ${
                aiInsightsEnabled
                  ? 'border-purple-700 bg-purple-700 text-white hover:bg-purple-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {aiInsightsEnabled ? 'AI Insights: On' : 'AI Insights: Off'}
            </button>
            <button
              type="button"
              onClick={() => setShowDashboardCustomizer((prev) => !prev)}
              className="px-4 py-2 border border-purple-600 text-purple-700 font-medium rounded-lg hover:bg-purple-50 transition"
            >
              {showDashboardCustomizer ? 'Close Customizer' : 'Customize Dashboard'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {showDashboardCustomizer && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Your Dashboard Layout</h2>
              <button
                type="button"
                onClick={resetDashboard}
                className="text-sm text-purple-700 hover:text-purple-900 font-medium"
              >
                Reset to default
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Choose which sections are visible for your account.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DASHBOARD_SECTIONS.map((section) => {
                const checked = isSectionVisible(section);
                return (
                  <label
                    key={section}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSectionVisibility(section)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm font-medium text-gray-800">{DASHBOARD_SECTION_LABELS[section]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : stats ? (
          <>
            {/* Stats Grid */}
            {isSectionVisible('stats') && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="Overall Compliance"
                  value={`${stats.overallCompliance || 0}%`}
                  subtitle="Across all frameworks"
                  gradient="from-purple-600 to-indigo-600"
                />
                <StatCard
                  title="Total Controls"
                  value={(stats.totalControls || 0).toString()}
                  subtitle={`${stats.implementedControls || 0} implemented`}
                  gradient="from-blue-600 to-cyan-600"
                />
                <StatCard
                  title="Active Frameworks"
                  value={(stats.frameworks?.length || 0).toString()}
                  subtitle="Selected by your organization"
                  gradient="from-green-600 to-teal-600"
                />
                <StatCard
                  title="Auto-Crosswalked"
                  value={(stats.satisfiedViaAutoCrosswalk || 0).toString()}
                  subtitle="Controls satisfied automatically"
                  gradient="from-orange-600 to-pink-600"
                  onClick={() => {
                    setShowCrosswalkModal(true);
                    setCrosswalkLoading(true);
                    setCrosswalkError('');
                    dashboardAPI.getCrosswalkedControls()
                      .then((res: any) => setCrosswalkedControls(res.data?.data || []))
                      .catch((err: any) => {
                        console.error('Failed to load crosswalked controls:', err);
                        setCrosswalkedControls([]);
                        setCrosswalkError(err?.response?.data?.error || 'Unable to load crosswalked controls. This may happen if no controls have been auto-crosswalked yet.');
                      })
                      .finally(() => setCrosswalkLoading(false));
                  }}
                />
              </div>
            )}

            {/* AI Gap Analysis Panel */}
            {aiInsightsEnabled && (stats?.frameworks?.length ?? 0) > 0 && (
              <AIInsightPanel title="AI Gap Analysis" ai={gapAnalysis} />
            )}

            {/* Maturity Score */}
            {isSectionVisible('maturity') && maturity && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Compliance Maturity Score</h2>
                  <div className="flex items-center gap-2">
                    <span className={`text-3xl font-bold ${
                      maturity.level >= 4 ? 'text-green-600' :
                      maturity.level >= 3 ? 'text-blue-600' :
                      maturity.level >= 2 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {maturity.overallScore}/5
                    </span>
                    <span className={`text-sm font-medium px-2 py-1 rounded ${
                      maturity.level >= 4 ? 'bg-green-100 text-green-700' :
                      maturity.level >= 3 ? 'bg-blue-100 text-blue-700' :
                      maturity.level >= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {maturity.label}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {maturity.dimensions?.map((dim: any) => (
                    <div key={dim.name} className="text-center">
                      <div className="text-xs text-gray-500 mb-1">{dim.name}</div>
                      <div className="relative w-full bg-gray-200 rounded-full h-2 mb-1">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            dim.score >= 70 ? 'bg-green-500' :
                            dim.score >= 40 ? 'bg-blue-500' :
                            dim.score >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${dim.score}%` }}
                        ></div>
                      </div>
                      <div className="text-sm font-semibold text-gray-700">{dim.score}%</div>
                    </div>
                  ))}
                </div>
                {maturity.recommendations?.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">RECOMMENDATIONS</p>
                    {maturity.recommendations.slice(0, 3).map((rec: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                          rec.priority === 'critical' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {rec.priority}
                        </span>
                        <span className="text-xs text-gray-600">{rec.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Charts Row */}
            {isSectionVisible('charts') && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Compliance Distribution Pie Chart */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Control Status Distribution</h2>
                  <StatusPieChart data={statusData} onSliceClick={(status) => {
                    router.push(`/dashboard/controls?status=${encodeURIComponent(STATUS_FILTER_MAP[status] || status)}`);
                  }} />
                </div>

                {/* Framework Compliance Bar Chart */}
                <div className="bg-white rounded-lg shadow-md p-6 lg:col-span-2">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Framework Compliance</h2>
                  <FrameworkBarChart data={frameworkChartData} />
                </div>
              </div>
            )}

            {/* Compliance Trend */}
            {isSectionVisible('trend') && trendData.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Compliance Trend (Last 30 Days)</h2>
                <ComplianceTrendChart data={trendData} />
              </div>
            )}

            {/* Auto-Crosswalk Feature Highlight */}
            {isSectionVisible('crosswalk') && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-orange-400 p-6 rounded-lg">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="text-3xl">&#x1F680;</span>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-bold text-gray-900">
                      KEY FEATURE: Auto-Crosswalk
                    </h3>
                    <p className="mt-2 text-gray-700">
                      <strong>When you implement ONE control, we automatically satisfy similar controls across other frameworks!</strong>
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      Example: Implement NIST CSF &quot;GV.OC-01&quot; &rarr; Automatically satisfies ISO 27001 &quot;A.5.1.1&quot; and SOC 2 &quot;CC1.1&quot; (90%+ similarity)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Framework Progress Bars + Activity Feed Row */}
            {(showFrameworkSection || showActivitySection) && (
              <div className={`grid grid-cols-1 gap-6 ${showFrameworkSection && showActivitySection ? 'lg:grid-cols-2' : ''}`}>
              {/* Framework Progress Bars */}
              {showFrameworkSection && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <h2 className="text-xl font-bold text-gray-900">Framework Progress</h2>
                    {hasFrameworkOverflow && (
                      <button
                        type="button"
                        onClick={() => setShowAllFrameworkProgress(prev => !prev)}
                        className="text-sm font-medium text-purple-700 hover:text-purple-900"
                      >
                        {showAllFrameworkProgress ? 'Show less' : `Show all (${frameworkProgressItems.length})`}
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {frameworkProgressItems.length > 0 ? (
                      displayedFrameworks.map((framework) => (
                        <FrameworkProgress
                          key={framework.id}
                          name={framework.name}
                          code={framework.code}
                          percentage={framework.compliancePercentage}
                          implemented={framework.implementedControls}
                          total={framework.totalControls}
                        />
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <p className="text-lg font-medium">No frameworks selected yet</p>
                        <p className="mt-2">Open Organization Profile to select frameworks</p>
                      </div>
                    )}
                  </div>
                  {hasFrameworkOverflow && !showAllFrameworkProgress && (
                    <p className="text-xs text-gray-500 mt-3">
                      Showing {displayedFrameworks.length} of {frameworkProgressItems.length} frameworks
                    </p>
                  )}
                </div>
              )}

              {/* Recent Activity Feed */}
              {showActivitySection && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
                  {activity.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {activity.map((item, i) => (
                        <div key={item.id || i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-bold flex-shrink-0">
                            {(item.changed_by_name || '?').charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900">{item.changed_by_name}</span>
                              <span className="text-xs font-mono text-purple-600">{item.control_code}</span>
                            </div>
                            <p className="text-xs text-gray-400 truncate">{item.control_title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{item.old_status || 'new'}</span>
                              <span className="text-gray-400 text-xs">&rarr;</span>
                              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{item.new_status}</span>
                              <span className="text-xs text-gray-400 ml-auto">
                                {new Date(item.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {item.notes && <p className="text-xs text-gray-500 italic mt-0.5">{item.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">No recent activity. Start by implementing controls!</p>
                  )}
                </div>
              )}
              </div>
            )}

            {/* AI Compliance Forecast Panel */}
            {aiInsightsEnabled && (stats?.frameworks?.length ?? 0) > 0 && (
              <AIInsightPanel title="AI Compliance Forecast" ai={forecast} />
            )}
          </>
        ) : null}
      </div>

      {/* Crosswalked Controls Drill-Down Modal */}
      {showCrosswalkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">🔗 Auto-Crosswalked Controls</h2>
                <p className="text-sm text-gray-500">{crosswalkedControls.length} controls satisfied automatically via crosswalk</p>
              </div>
              <button
                onClick={() => setShowCrosswalkModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close"
              >×</button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              {crosswalkLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                </div>
              ) : crosswalkError ? (
                <p className="text-center text-red-500 py-16">{crosswalkError}</p>
              ) : crosswalkedControls.length === 0 ? (
                <p className="text-center text-gray-400 py-16">No crosswalked controls found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase border-b">
                      <th className="pb-2 pr-3">Control ID</th>
                      <th className="pb-2 pr-3">Title</th>
                      <th className="pb-2 pr-3">Framework</th>
                      <th className="pb-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crosswalkedControls.map((c) => (
                      <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-mono text-purple-700 font-medium">{c.control_id}</td>
                        <td className="py-2 pr-3 text-gray-800">{c.title}</td>
                        <td className="py-2 pr-3">
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded">
                            {c.framework_code}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-gray-500 max-w-xs truncate">{c.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowCrosswalkModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function AIInsightPanel({ title, ai }: { title: string; ai: ReturnType<typeof useAutoAIResult> }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <span className="text-purple-600">✨</span>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {ai.fromCache && ai.lastUpdatedAt && (
            <span className="text-xs text-gray-400">
              · cached {new Date(ai.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {ai.status === 'running' && (
            <span className="text-xs text-purple-500 animate-pulse">· analyzing…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); ai.refresh(); }}
            className="text-xs text-gray-400 hover:text-purple-600 px-2 py-0.5 rounded hover:bg-purple-50"
          >
            Refresh
          </button>
          <span className="text-gray-400 text-xs">{collapsed ? '▶' : '▼'}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="p-4">
          {ai.status === 'running' && !ai.result && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-5/6" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          )}
          {ai.status === 'error' && (
            <p className="text-sm text-red-500">{ai.error}</p>
          )}
          {ai.result && (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">{ai.result}</pre>
          )}
          {ai.status === 'idle' && !ai.result && (
            <p className="text-xs text-gray-400">AI analysis will run automatically when data is available.</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  gradient,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  gradient: string;
  onClick?: () => void;
}) {
  const classes = `bg-gradient-to-br ${gradient} rounded-lg shadow-lg p-6 text-white text-left w-full ${onClick ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all' : ''}`;
  const content = (
    <>
      <h3 className="text-sm font-medium opacity-90">{title}</h3>
      <p className="text-4xl font-bold mt-2">{value}</p>
      <p className="text-sm opacity-80 mt-1">{subtitle}</p>
      {onClick && <p className="text-xs opacity-70 mt-2">Click to view details →</p>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

function FrameworkProgress({
  name,
  code,
  percentage,
  implemented,
  total,
}: {
  name: string;
  code: string;
  percentage: number;
  implemented: number;
  total: number;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex justify-between items-center mb-1">
        <div className="min-w-0">
          <span className="font-semibold text-gray-900 text-sm">{name}</span>
          <span className="text-xs text-gray-500 ml-1">({code})</span>
        </div>
        <span className="text-sm font-bold text-purple-600 ml-2">{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
        <div
          className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-xs text-gray-600">
        {implemented} of {total} controls
      </p>
    </div>
  );
}
