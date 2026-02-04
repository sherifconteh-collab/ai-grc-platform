'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { organizationAPI, controlsAPI } from '@/lib/api';

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
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFramework, setSelectedFramework] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  useEffect(() => {
    if (user?.organizationId) {
      loadControls();
    }
  }, [user]);

  const loadControls = async () => {
    try {
      const response = await organizationAPI.getControls(user!.organizationId);
      setControls(response.data.data.controls || []);
    } catch (err) {
      console.error('Failed to load controls:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredControls = controls.filter((control) => {
    const matchesSearch =
      control.controlId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.title.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFramework =
      selectedFramework === 'all' || control.frameworkCode === selectedFramework;

    const matchesStatus = selectedStatus === 'all' || control.status === selectedStatus;

    return matchesSearch && matchesFramework && matchesStatus;
  });

  const frameworks = Array.from(new Set(controls.map((c) => c.frameworkCode)));

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
                When you mark a control as "Implemented", the system automatically finds similar controls (90%+ similarity) across other frameworks and marks them as "Auto-Crosswalked" - saving you time!
              </p>
            </div>
          </div>
        </div>

        {/* Controls Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredControls.length > 0 ? (
                    filteredControls.map((control) => (
                      <tr key={control.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/dashboard/controls/${control.id}`)}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-mono font-semibold text-gray-900">
                            {control.controlId}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">{control.title}</span>
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
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <p className="text-gray-500">
                          {searchTerm || selectedFramework !== 'all' || selectedStatus !== 'all'
                            ? 'No controls match your filters'
                            : 'No controls found. Select frameworks to get started.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
