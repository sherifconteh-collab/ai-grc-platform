'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { dashboardAPI } from '@/lib/api';

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

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await dashboardAPI.getStats();
      setStats(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load dashboard');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compliance Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome back! Here's your compliance overview.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : stats ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Overall Compliance"
                value={`${stats.overallCompliance}%`}
                subtitle="Across all frameworks"
                gradient="from-purple-600 to-indigo-600"
              />
              <StatCard
                title="Total Controls"
                value={stats.totalControls.toString()}
                subtitle={`${stats.implementedControls} implemented`}
                gradient="from-blue-600 to-cyan-600"
              />
              <StatCard
                title="Active Frameworks"
                value={stats.frameworks.length.toString()}
                subtitle="Selected by your organization"
                gradient="from-green-600 to-teal-600"
              />
              <StatCard
                title="Auto-Crosswalked"
                value={stats.satisfiedViaAutoCrosswalk.toString()}
                subtitle="Controls satisfied automatically"
                gradient="from-orange-600 to-pink-600"
              />
            </div>

            {/* Auto-Crosswalk Feature Highlight */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-orange-400 p-6 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-3xl">🚀</span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    KEY FEATURE: Auto-Crosswalk
                  </h3>
                  <p className="mt-2 text-gray-700">
                    <strong>When you implement ONE control, we automatically satisfy similar controls across other frameworks!</strong>
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Example: Implement NIST CSF "GV.OC-01" → Automatically satisfies ISO 27001 "A.5.1.1" and SOC 2 "CC1.1" (90%+ similarity)
                  </p>
                </div>
              </div>
            </div>

            {/* Framework Compliance */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Framework Compliance</h2>
              <div className="space-y-4">
                {stats.frameworks.length > 0 ? (
                  stats.frameworks.map((framework) => (
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
                    <p className="mt-2">Visit the Frameworks page to get started</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  gradient,
}: {
  title: string;
  value: string;
  subtitle: string;
  gradient: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-lg shadow-lg p-6 text-white`}>
      <h3 className="text-sm font-medium opacity-90">{title}</h3>
      <p className="text-4xl font-bold mt-2">{value}</p>
      <p className="text-sm opacity-80 mt-1">{subtitle}</p>
    </div>
  );
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
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="font-semibold text-gray-900">{name}</span>
          <span className="text-sm text-gray-500 ml-2">({code})</span>
        </div>
        <span className="text-lg font-bold text-purple-600">{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-xs text-gray-600">
        {implemented} of {total} controls implemented
      </p>
    </div>
  );
}
