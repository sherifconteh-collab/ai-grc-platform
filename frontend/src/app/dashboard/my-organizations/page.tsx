// @tier: community
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { authAPI, organizationAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface OrgEntry {
  id: string;
  name: string;
  tier: string;
  billing_status: string;
  role: string;
  joined_at: string;
  is_active: boolean;
}

export default function MyOrganizationsPage() {
  const router = useRouter();
  const { user, switchOrganization } = useAuth();
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Create-new state
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [cloneFrameworks, setCloneFrameworks] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadOrgs = useCallback(async () => {
    try {
      const res = await authAPI.getMyOrganizations();
      setOrgs(res.data.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const handleSwitch = async (orgId: string) => {
    if (orgId === user?.organizationId) return;
    setSwitching(orgId);
    setError('');
    try {
      await switchOrganization(orgId);
      setMessage('Switched organization — reloading…');
      router.replace('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to switch organization');
      setSwitching(null);
    }
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    setError('');
    try {
      if (cloneFrameworks) {
        await organizationAPI.cloneFromTemplate({ name: newOrgName.trim() });
        setMessage(`Organization "${newOrgName.trim()}" created with your current framework selections.`);
      } else {
        await organizationAPI.createNew({ name: newOrgName.trim() });
        setMessage(`Organization "${newOrgName.trim()}" created.`);
      }
      setNewOrgName('');
      setShowCreate(false);
      setCloneFrameworks(false);
      await loadOrgs();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const tierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      community: 'bg-gray-600',
      pro: 'bg-blue-600',
      enterprise: 'bg-purple-600',
      govcloud: 'bg-amber-600',
    };
    return colors[tier] || 'bg-gray-600';
  };

  const canWrite = hasPermission(user, 'organizations.write');

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">My Organizations</h1>
            <p className="text-gray-400 text-sm mt-1">
              Switch between organizations or create a new one.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => { setShowCreate(!showCreate); setError(''); setMessage(''); }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + New Organization
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 px-4 py-3 bg-green-900/40 border border-green-700 text-green-300 rounded-lg text-sm">
            {message}
          </div>
        )}

        {/* Create new org panel */}
        {canWrite && showCreate && (
          <div className="mb-6 p-5 bg-gray-800 border border-gray-700 rounded-xl">
            <h2 className="text-white font-semibold mb-3">Create New Organization</h2>
            <div className="mb-3">
              <label className="block text-gray-400 text-sm mb-1">Organization Name</label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={255}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={cloneFrameworks}
                onChange={(e) => setCloneFrameworks(e.target.checked)}
                className="rounded"
              />
              Copy my current framework selections into the new organization (template clone)
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newOrgName.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewOrgName(''); setCloneFrameworks(false); }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Organization list */}
        {loading ? (
          <div className="text-gray-400 text-sm">Loading organizations…</div>
        ) : orgs.length === 0 ? (
          <div className="text-gray-400 text-sm">No organizations found.</div>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => (
              <div
                key={org.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  org.is_active
                    ? 'bg-purple-900/30 border-purple-600'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium truncate">{org.name}</span>
                    {org.is_active && (
                      <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full">Active</span>
                    )}
                    <span className={`text-xs text-white px-2 py-0.5 rounded-full capitalize ${tierBadge(org.tier)}`}>
                      {org.tier}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Your role: <span className="capitalize">{org.role}</span>
                    {' · '}Joined {new Date(org.joined_at).toLocaleDateString()}
                  </p>
                </div>
                {!org.is_active && (
                  <button
                    onClick={() => handleSwitch(org.id)}
                    disabled={switching === org.id}
                    className="ml-4 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    {switching === org.id ? 'Switching…' : 'Switch'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
