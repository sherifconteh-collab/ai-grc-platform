'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { dashboardAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { APP_POSITIONING_SHORT } from '@/lib/branding';

const FRAMEWORK_PROGRESS_COLLAPSED_COUNT = 4;
const STATUS_FILTER_MAP: Record<string, string> = {
  Implemented: 'implemented',
  Crosswalked: 'satisfied_via_crosswalk',
  'Not Started': 'not_started',
};
const DASHBOARD_SECTIONS = [
  'stats',
  'maturity',
  'controlHealth',
  'charts',
  'trend',
  'crosswalk',
  'frameworkProgress',
  'complianceSummary',
  'recentActivity',
] as const;
type DashboardSectionKey = typeof DASHBOARD_SECTIONS[number];

const DASHBOARD_SECTION_LABELS: Record<DashboardSectionKey, string> = {
  stats: 'Top KPI Cards',
  maturity: 'Maturity Score',
  controlHealth: 'Control Health Overview',
  charts: 'Status & Framework Charts',
  trend: 'Compliance Trend',
  crosswalk: 'Auto-Crosswalk Highlight',
  frameworkProgress: 'Framework Progress',
  complianceSummary: 'Per-Framework Compliance Summary',
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

interface ControlHealthSummary {
  total: number;
  strong: number;
  good: number;
  watch: number;
  weak: number;
  averageScore: number;
}

interface ComplianceSummaryFramework {
  frameworkId: string;
  frameworkName: string;
  frameworkCode: string;
  totalControls: number;
  implemented: number;
  inProgress: number;
  crosswalked: number;
  notApplicable: number;
  notStarted: number;
  compliancePercentage: number;
  statusDistribution: Record<string, number>;
}

interface ComplianceSummaryData {
  overallCompliancePercentage: number;
  totalFrameworks: number;
  totalControls: number;
  totalCompliant: number;
  frameworks: ComplianceSummaryFramework[];
}

type ApiError = Error & { response?: { data?: { error?: string } } };

interface TrendDataPoint {
  date: string;
  implemented: number;
  total_changes: number;
}

interface MaturityDimension {
  name: string;
  score: number;
  weight: number;
  description: string;
}

interface MaturityRecommendation {
  dimension: string;
  priority: 'critical' | 'medium';
  message: string;
}

interface MaturityData {
  overallScore: number;
  overallPercentage: number;
  level: number;
  label: string;
  dimensions: MaturityDimension[];
  recommendations: MaturityRecommendation[];
}

interface BackendFramework {
  id: string;
  code: string;
  name: string;
  totalControls: number;
  implemented: number;
  compliancePercentage: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState<{ id?: string; changed_by_name: string; control_code: string; control_title: string; old_status: string; new_status: string; changed_at: string; notes?: string }[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [maturity, setMaturity] = useState<MaturityData | null>(null);
  const [showAllFrameworkProgress, setShowAllFrameworkProgress] = useState(false);
  const [showDashboardCustomizer, setShowDashboardCustomizer] = useState(false);
  const [hiddenSections, setHiddenSections] = useState<DashboardSectionKey[]>([]);
  const [dashboardPrefsReady, setDashboardPrefsReady] = useState(false);
  const [showCrosswalkModal, setShowCrosswalkModal] = useState(false);
  const [crosswalkedControls, setCrosswalkedControls] = useState<CrosswalkedControl[]>([]);
  const [crosswalkLoading, setCrosswalkLoading] = useState(false);
  const [crosswalkError, setCrosswalkError] = useState('');
  const [controlHealthSummary, setControlHealthSummary] = useState<ControlHealthSummary | null>(null);
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummaryData | null>(null);

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

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError('');

      // Parallel loading: fetch overview + supplementary data simultaneously
      const [overviewResult, healthResult, summaryResult] = await Promise.allSettled([
        dashboardAPI.getOverview({ period: '30d' }),
        dashboardAPI.getControlHealthSummary(),
        dashboardAPI.getComplianceSummary()
      ]);

      // Process main overview data
      if (overviewResult.status === 'fulfilled') {
        const payload = overviewResult.value.data?.data || {};
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
          frameworks: backendData.frameworks.map((fw: BackendFramework) => ({
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
      } else {
        throw overviewResult.reason;
      }

      // Process control health summary (non-blocking)
      if (healthResult.status === 'fulfilled') {
        setControlHealthSummary(healthResult.value.data?.data || null);
      }

      // Process compliance summary (non-blocking)
      if (summaryResult.status === 'fulfilled') {
        setComplianceSummary(summaryResult.value.data?.data || null);
      }
    } catch (err: unknown) {
      const axiosErr = err as ApiError;
      setError(axiosErr.response?.data?.error || 'Failed to load dashboard');
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
                      .then((res) => setCrosswalkedControls(res.data?.data || []))
                      .catch((err: ApiError) => {
                        console.error('Failed to load crosswalked controls:', err);
                        setCrosswalkedControls([]);
                        setCrosswalkError(err?.response?.data?.error || 'Unable to load crosswalked controls. This may happen if no controls have been auto-crosswalked yet.');
                      })
                      .finally(() => setCrosswalkLoading(false));
                  }}
                />
              </div>
            )}

            {/* Control Health Overview */}
            {isSectionVisible('controlHealth') && controlHealthSummary && controlHealthSummary.total > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Control Health Overview</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{controlHealthSummary.total}</div>
                    <div className="text-xs text-gray-500">Total Controls</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{controlHealthSummary.strong}</div>
                    <div className="text-xs text-gray-500">Strong (≥80)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{controlHealthSummary.good}</div>
                    <div className="text-xs text-gray-500">Good (60–79)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{controlHealthSummary.watch}</div>
                    <div className="text-xs text-gray-500">Watch (40–59)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{controlHealthSummary.weak}</div>
                    <div className="text-xs text-gray-500">Weak (&lt;40)</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-200">
                    {controlHealthSummary.strong > 0 && (
                      <div
                        className="bg-green-500 transition-all duration-500"
                        style={{ width: `${(controlHealthSummary.strong / controlHealthSummary.total) * 100}%` }}
                        title={`Strong: ${controlHealthSummary.strong}`}
                      />
                    )}
                    {controlHealthSummary.good > 0 && (
                      <div
                        className="bg-blue-500 transition-all duration-500"
                        style={{ width: `${(controlHealthSummary.good / controlHealthSummary.total) * 100}%` }}
                        title={`Good: ${controlHealthSummary.good}`}
                      />
                    )}
                    {controlHealthSummary.watch > 0 && (
                      <div
                        className="bg-yellow-500 transition-all duration-500"
                        style={{ width: `${(controlHealthSummary.watch / controlHealthSummary.total) * 100}%` }}
                        title={`Watch: ${controlHealthSummary.watch}`}
                      />
                    )}
                    {controlHealthSummary.weak > 0 && (
                      <div
                        className="bg-red-500 transition-all duration-500"
                        style={{ width: `${(controlHealthSummary.weak / controlHealthSummary.total) * 100}%` }}
                        title={`Weak: ${controlHealthSummary.weak}`}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">Average Health Score: <span className="font-semibold text-gray-700">{controlHealthSummary.averageScore}/100</span></span>
                    <button
                      type="button"
                      onClick={() => router.push('/dashboard/security-posture')}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      View Details →
                    </button>
                  </div>
                </div>
              </div>
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
                  {maturity.dimensions?.map((dim: MaturityDimension) => (
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
                    {maturity.recommendations.slice(0, 3).map((rec: MaturityRecommendation, i: number) => (
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

            {/* Per-Framework Compliance Summary */}
            {isSectionVisible('complianceSummary') && complianceSummary && complianceSummary.frameworks.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Per-Framework Compliance Summary</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase border-b">
                        <th className="pb-2 pr-4">Framework</th>
                        <th className="pb-2 pr-4 text-right">Total</th>
                        <th className="pb-2 pr-4 text-right">Implemented</th>
                        <th className="pb-2 pr-4 text-right">In Progress</th>
                        <th className="pb-2 pr-4 text-right">Crosswalked</th>
                        <th className="pb-2 pr-4 text-right">Not Started</th>
                        <th className="pb-2 text-right">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complianceSummary.frameworks.map((fw) => (
                        <tr key={fw.frameworkId} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 pr-4">
                            <span className="font-medium text-gray-900">{fw.frameworkCode}</span>
                            <span className="text-xs text-gray-400 ml-1">{fw.frameworkName}</span>
                          </td>
                          <td className="py-2 pr-4 text-right text-gray-700">{fw.totalControls}</td>
                          <td className="py-2 pr-4 text-right text-green-600 font-medium">{fw.implemented}</td>
                          <td className="py-2 pr-4 text-right text-blue-600">{fw.inProgress}</td>
                          <td className="py-2 pr-4 text-right text-orange-600">{fw.crosswalked}</td>
                          <td className="py-2 pr-4 text-right text-gray-400">{fw.notStarted}</td>
                          <td className="py-2 text-right">
                            <span className={`font-bold ${
                              fw.compliancePercentage >= 80 ? 'text-green-600' :
                              fw.compliancePercentage >= 50 ? 'text-blue-600' :
                              fw.compliancePercentage >= 25 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {fw.compliancePercentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 font-semibold">
                        <td className="pt-2 pr-4 text-gray-900">Overall</td>
                        <td className="pt-2 pr-4 text-right text-gray-900">{complianceSummary.totalControls}</td>
                        <td className="pt-2 pr-4 text-right text-green-600">{complianceSummary.totalCompliant}</td>
                        <td className="pt-2 pr-4 text-right">—</td>
                        <td className="pt-2 pr-4 text-right">—</td>
                        <td className="pt-2 pr-4 text-right">—</td>
                        <td className="pt-2 text-right">
                          <span className={`font-bold ${
                            complianceSummary.overallCompliancePercentage >= 80 ? 'text-green-600' :
                            complianceSummary.overallCompliancePercentage >= 50 ? 'text-blue-600' : 'text-yellow-600'
                          }`}>
                            {complianceSummary.overallCompliancePercentage}%
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
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
