'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { organizationAPI } from '@/lib/api';

interface Framework {
  id: string;
  code: string;
  name: string;
  description: string;
  controlCount: number;
  selected?: boolean;
}

const AVAILABLE_FRAMEWORKS: Framework[] = [
  {
    id: '1',
    code: 'NIST-CSF-2.0',
    name: 'NIST Cybersecurity Framework 2.0',
    description: 'Comprehensive cybersecurity framework with 6 functions',
    controlCount: 106,
  },
  {
    id: '2',
    code: 'ISO-27001',
    name: 'ISO 27001:2022',
    description: 'International standard for information security management',
    controlCount: 93,
  },
  {
    id: '3',
    code: 'NIST-800-53',
    name: 'NIST 800-53 (Moderate)',
    description: 'Security and privacy controls for federal systems',
    controlCount: 208,
  },
  {
    id: '4',
    code: 'SOC2',
    name: 'SOC 2 Type II',
    description: 'Trust service criteria for service organizations',
    controlCount: 64,
  },
  {
    id: '5',
    code: 'NIST-AI-RMF',
    name: 'NIST AI Risk Management Framework',
    description: 'Framework for managing AI risks',
    controlCount: 47,
  },
  {
    id: '6',
    code: 'NIST-800-171',
    name: 'NIST 800-171',
    description: 'Protecting Controlled Unclassified Information',
    controlCount: 110,
  },
  {
    id: '7',
    code: 'FISCAM',
    name: 'FISCAM',
    description: 'Federal Information System Controls Audit Manual',
    controlCount: 60,
  },
  {
    id: '8',
    code: 'FFIEC',
    name: 'FFIEC',
    description: 'Federal Financial Institutions Examination Council',
    controlCount: 72,
  },
];

export default function FrameworksPage() {
  const { user } = useAuth();
  const [frameworks, setFrameworks] = useState<Framework[]>(AVAILABLE_FRAMEWORKS);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.organizationId) {
      loadSelectedFrameworks();
    }
  }, [user]);

  const loadSelectedFrameworks = async () => {
    try {
      const response = await organizationAPI.getFrameworks(user!.organizationId);
      const selected = response.data.data.frameworks.map((f: any) => f.id);
      setSelectedFrameworks(selected);
    } catch (err) {
      console.error('Failed to load frameworks:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFramework = (frameworkId: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(frameworkId)
        ? prev.filter((id) => id !== frameworkId)
        : [...prev, frameworkId]
    );
  };

  const saveFrameworks = async () => {
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Select Your Frameworks</h1>
            <p className="text-gray-600 mt-2">
              Choose the compliance frameworks your organization needs to meet
            </p>
          </div>
          <button
            onClick={saveFrameworks}
            disabled={saving || selectedFrameworks.length === 0}
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Selection'}
          </button>
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

        {/* Selection Summary */}
        {selectedFrameworks.length > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-purple-900 font-medium">
              Selected {selectedFrameworks.length} framework(s) with {totalControls} total controls
            </p>
          </div>
        )}

        {/* Framework Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {frameworks.map((framework) => {
              const isSelected = selectedFrameworks.includes(framework.id);
              return (
                <div
                  key={framework.id}
                  onClick={() => toggleFramework(framework.id)}
                  className={`
                    bg-white border-2 rounded-lg p-6 cursor-pointer transition-all
                    ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 shadow-lg scale-105'
                        : 'border-gray-200 hover:border-purple-400 hover:shadow-md'
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900 text-lg">{framework.name}</h3>
                    {isSelected && (
                      <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{framework.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                      {framework.controlCount} controls
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
