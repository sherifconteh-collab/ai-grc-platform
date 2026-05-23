// @tier: pro
'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { autoEvidenceAPI } from '@/lib/api';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

type SourceType = 'splunk' | 'microsoft_sentinel' | 'aws_cloudtrail' | 'crowdstrike' | 'jira' | 'servicenow' | 'github' | 'connector'; // ip-hygiene:ignore
type Schedule = 'manual' | 'daily' | 'weekly' | 'monthly';

interface CollectionRule {
  id: string;
  name: string;
  description: string | null;
  source_type: SourceType;
  source_config: Record<string, unknown>;
  schedule: Schedule;
  control_ids: string[];
  tags: string[];
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: 'success' | 'error' | 'running' | null;
  last_run_error: string | null;
  next_run_at: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  splunk: 'Splunk',
  microsoft_sentinel: 'Microsoft Sentinel',
  aws_cloudtrail: 'AWS CloudTrail',
  crowdstrike: 'CrowdStrike',
  jira: 'Jira',
  servicenow: 'ServiceNow', // ip-hygiene:ignore  -- integration display name for user-configured ITSM connector
  github: 'GitHub',
  connector: 'Custom Connector'
};

const SCHEDULE_LABELS: Record<Schedule, string> = {
  manual: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly'
};

function StatusDot({ status }: { status: string | null }) {
  if (!status) return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />;
  const color = status === 'success' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<CollectionRule>;
  onSave: (data: Omit<CollectionRule, 'id' | 'last_run_at' | 'last_run_status' | 'last_run_error' | 'next_run_at' | 'created_at'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [sourceType, setSourceType] = useState<SourceType>(initial?.source_type || 'splunk');
  const [schedule, setSchedule] = useState<Schedule>(initial?.schedule || 'manual');
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        source_type: sourceType,
        source_config: {},
        schedule,
        control_ids: initial?.control_ids || [],
        tags: initial?.tags || [],
        enabled
      });
    } catch {
      setErr('Failed to save rule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <h3 className="font-semibold text-gray-800">{initial?.id ? 'Edit Rule' : 'New Collection Rule'}</h3>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. Splunk daily login events"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
          <select
            value={sourceType}
            onChange={e => setSourceType(e.target.value as SourceType)}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(SOURCE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Schedule</label>
          <select
            value={schedule}
            onChange={e => setSchedule(e.target.value as Schedule)}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(SCHEDULE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="rule-enabled"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <label htmlFor="rule-enabled" className="text-sm text-gray-700">Enabled</label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          placeholder="Optional description"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Rule'}
        </button>
      </div>
    </form>
  );
}

export default function AutoEvidencePage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'evidence.write');

  const [rules, setRules] = useState<CollectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CollectionRule | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await autoEvidenceAPI.getRules();
      setRules(res.data?.data || res.data || []);
    } catch {
      setError('Failed to load collection rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleSave = async (data: Omit<CollectionRule, 'id' | 'last_run_at' | 'last_run_status' | 'last_run_error' | 'next_run_at' | 'created_at'>) => {
    // Normalize `description: string | null` (our CollectionRule shape) to
    // `string | undefined` (autoEvidenceAPI.createRule's accepted shape).
    const payload = {
      ...data,
      description: data.description ?? undefined,
    } as Parameters<typeof autoEvidenceAPI.createRule>[0];
    if (editingRule) {
      await autoEvidenceAPI.updateRule(editingRule.id, payload);
    } else {
      await autoEvidenceAPI.createRule(payload);
    }
    setShowForm(false);
    setEditingRule(null);
    await loadRules();
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await autoEvidenceAPI.runRule(id);
      await loadRules();
    } catch {
      setError('Failed to trigger rule run.');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this collection rule?')) return;
    setDeletingId(id);
    try {
      await autoEvidenceAPI.deleteRule(id);
      await loadRules();
    } catch {
      setError('Failed to delete rule.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auto Evidence Collection</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure automated rules to collect evidence from connected data sources.
            </p>
          </div>
          {canManage && !showForm && (
            <button
              onClick={() => { setEditingRule(null); setShowForm(true); }}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New Rule
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {(showForm || editingRule) && (
          <div className="mb-6">
            <RuleForm
              initial={editingRule || undefined}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingRule(null); }}
            />
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium">No collection rules yet</p>
            <p className="text-sm mt-1">Create a rule to automate evidence collection from your data sources.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusDot status={rule.last_run_status} />
                      <span className="font-medium text-gray-900 truncate">{rule.name}</span>
                      {!rule.enabled && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Disabled</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>{SOURCE_LABELS[rule.source_type] || rule.source_type}</span>
                      <span>Schedule: {SCHEDULE_LABELS[rule.schedule]}</span>
                      {rule.last_run_at && (
                        <span>Last run: {format(new Date(rule.last_run_at), 'MMM d, yyyy HH:mm')}</span>
                      )}
                      {rule.last_run_status === 'error' && rule.last_run_error && (
                        <span className="text-red-500">{rule.last_run_error}</span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRun(rule.id)}
                        disabled={runningId === rule.id}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 transition-colors"
                      >
                        {runningId === rule.id ? 'Running…' : 'Run Now'}
                      </button>
                      <button
                        onClick={() => { setEditingRule(rule); setShowForm(false); }}
                        className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deletingId === rule.id}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === rule.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
