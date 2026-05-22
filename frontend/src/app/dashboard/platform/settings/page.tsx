'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { platformAdminAPI } from '@/lib/api';

const FEATURE_GROUPS: Record<string, string[]> = {
  'Core Features': ['sbom', 'reports', 'evidence', 'assessments'],
  'Advanced Features': ['ai_monitoring', 'data_governance', 'vendor_risk', 'security_posture'],
  'Integrations': ['threat_intel', 'siem', 'regulatory_news'],
};

export default function PlatformSettingsPage() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    try {
      const res = await platformAdminAPI.getFeatureFlags();
      setFlags(res.data?.data || {});
    } catch {
      setMessage('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = (key: string) => {
    setFlags((prev) => {
      const updated = { ...prev };
      if (updated[key] === false) {
        delete updated[key];
      } else {
        updated[key] = false;
      }
      return updated;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await platformAdminAPI.updateFeatureFlags(flags);
      setMessage('Feature flags saved. Changes take effect at next user login.');
    } catch {
      setMessage('Failed to save feature flags');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 text-gray-400">Loading feature flags…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-2">Feature Flags</h1>
        <p className="text-gray-400 mb-6">
          Toggle features globally. Turning a feature OFF here blocks it for all organizations unless they have a per-org override.
        </p>

        {Object.entries(FEATURE_GROUPS).map(([group, features]) => (
          <div key={group} className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3">{group}</h2>
            <div className="space-y-2">
              {features.map((feature) => {
                const isOff = flags[feature] === false;
                return (
                  <div key={feature} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                    <span className="text-white font-medium">{feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                    <button
                      onClick={() => toggleFlag(feature)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        isOff
                          ? 'bg-red-600 text-white hover:bg-red-500'
                          : 'bg-green-600 text-white hover:bg-green-500'
                      }`}
                    >
                      {isOff ? 'OFF (Blocked)' : 'ON (Default)'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Feature Flags'}
          </button>
          {message && <span className="text-sm text-gray-300">{message}</span>}
        </div>
      </div>
    </DashboardLayout>
  );
}
