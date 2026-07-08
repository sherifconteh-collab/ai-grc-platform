// @tier: pro
'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { integrationsHubAPI, organizationAPI, complianceGateAPI } from '@/lib/api';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface OrgFramework {
  id: string;
  name: string;
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (err instanceof Error) return err.message;
  return 'Failed to generate export snippet.';
}

interface ConnectorTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon_url?: string | null;
  config_schema?: Record<string, unknown>;
}

interface Connector {
  id: string;
  template_id: string | null;
  name: string;
  description: string | null;
  category: string;
  status: 'active' | 'inactive' | 'error' | 'pending';
  last_run_at: string | null;
  last_run_status: 'success' | 'error' | 'running' | null;
  created_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  siem:       'bg-red-50 text-red-700 border-red-200',
  cloud:      'bg-sky-50 text-sky-700 border-sky-200',
  devops:     'bg-amber-50 text-amber-700 border-amber-200',
  itsm:       'bg-violet-50 text-violet-700 border-violet-200',
  identity:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  compliance: 'bg-blue-50 text-blue-700 border-blue-200',
  default:    'bg-gray-50 text-gray-700 border-gray-200'
};

const STATIC_TEMPLATES: ConnectorTemplate[] = [
  { id: 'splunk', name: 'Splunk',            description: 'Import SIEM events as evidence',             category: 'siem' },
  { id: 'sentinel', name: 'Microsoft Sentinel', description: 'Pull alerts and incidents from Sentinel', category: 'siem' },
  { id: 'aws_cloudtrail', name: 'AWS CloudTrail', description: 'Collect CloudTrail audit logs',         category: 'cloud' },
  { id: 'aws_config', name: 'AWS Config',     description: 'Import AWS Config compliance findings',      category: 'cloud' },
  { id: 'github', name: 'GitHub',             description: 'Collect code-scanning and dependency alerts', category: 'devops' },
  { id: 'jira', name: 'Jira',                description: 'Link Jira tickets to controls as evidence',   category: 'itsm' },
  { id: 'servicenow', name: 'ServiceNow',    description: 'Import change/incident records as evidence',  category: 'itsm' }, // ip-hygiene:ignore  -- third-party ITSM integration template
  { id: 'okta', name: 'Okta',               description: 'Identity event logs and policy exports',       category: 'identity' },
  { id: 'crowdstrike', name: 'CrowdStrike', description: 'Endpoint detection & prevention reports',      category: 'siem' },
  { id: 'qualys', name: 'Qualys',           description: 'Vulnerability scan reports and certificates',  category: 'compliance' }
];

function StatusPill({ status }: { status: Connector['status'] }) {
  const colors: Record<string, string> = {
    active:   'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-500',
    error:    'bg-red-100 text-red-700',
    pending:  'bg-amber-100 text-amber-700'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${colors[status] || colors.inactive}`}>
      {status}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize border ${cls}`}>
      {category}
    </span>
  );
}

type ExportFormat = 'curl' | 'github_actions' | 'gitlab_ci';

const DEFAULT_SNIPPET = `curl --fail -H "Authorization: Bearer $SERVICE_ACCOUNT_TOKEN" \\
  "https://your-instance/api/v1/compliance/gate?framework_id=<id>&min_pct=80"`;

function ComplianceAsCodeCard({ organizationId }: { organizationId: string }) {
  const [frameworks, setFrameworks] = useState<OrgFramework[]>([]);
  const [frameworkId, setFrameworkId] = useState('');
  const [minPct, setMinPct] = useState(80);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('curl');
  const [snippet, setSnippet] = useState(DEFAULT_SNIPPET);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    organizationAPI.getFrameworks(organizationId)
      .then(res => setFrameworks(res.data?.data || res.data || []))
      .catch(() => { /* framework dropdown is optional; card still works without it */ });
  }, [organizationId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setExportError(null);
    setCopied(false);
    try {
      const res = await complianceGateAPI.exportSnippet({
        framework_id: frameworkId || undefined,
        min_pct: minPct,
        format: exportFormat
      });
      setSnippet(res.data?.data?.snippet || DEFAULT_SNIPPET);
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError('Could not copy to clipboard.');
    }
  };

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-semibold text-gray-900">Compliance as Code</h2>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
          CI/CD
        </span>
      </div>
      <p className="text-sm text-gray-500">
        Gate your CI/CD pipeline on live compliance status. Call{' '}
        <code className="text-xs bg-gray-100 text-gray-800 px-1 py-0.5 rounded">
          GET /api/v1/compliance/gate?framework_id=&lt;id&gt;&amp;min_pct=&lt;threshold&gt;
        </code>{' '}
        with a service-account token — it returns HTTP 200 when every evaluated framework meets the threshold, or HTTP
        412 otherwise, so <code className="text-xs bg-gray-100 text-gray-800 px-1 py-0.5 rounded">curl --fail</code>{' '}
        breaks the build automatically.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cac-framework" className="block text-xs font-medium text-gray-600 mb-1">Framework</label>
          <select
            id="cac-framework"
            value={frameworkId}
            onChange={e => setFrameworkId(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 min-w-[10rem]"
          >
            <option value="">All selected frameworks</option>
            {frameworks.map(fw => (
              <option key={fw.id} value={fw.id}>{fw.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cac-min-pct" className="block text-xs font-medium text-gray-600 mb-1">Threshold (%)</label>
          <input
            id="cac-min-pct"
            type="number"
            min={0}
            max={100}
            value={minPct}
            onChange={e => setMinPct(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 w-24"
          />
        </div>
        <div>
          <label htmlFor="cac-format" className="block text-xs font-medium text-gray-600 mb-1">Format</label>
          <select
            id="cac-format"
            value={exportFormat}
            onChange={e => setExportFormat(e.target.value as ExportFormat)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="curl">curl</option>
            <option value="github_actions">GitHub Actions</option>
            <option value="gitlab_ci">GitLab CI</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? 'Generating…' : 'Generate snippet'}
        </button>
      </div>
      {exportError && <p className="text-xs text-red-600 mt-2">{exportError}</p>}

      <div className="mt-3 bg-gray-900 rounded-lg p-4 overflow-x-auto relative">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <pre className="text-xs text-green-400 font-mono leading-relaxed whitespace-pre-wrap">
          <code>{snippet}</code>
        </pre>
      </div>
      <p className="text-xs text-gray-400 mt-2">See docs/COMPLIANCE_AS_CODE.md for the full integration guide.</p>
    </div>
  );
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'settings.manage');

  const [templates, setTemplates] = useState<ConnectorTemplate[]>(STATIC_TEMPLATES);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'installed'>('marketplace');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tmplRes, connRes] = await Promise.allSettled([
        integrationsHubAPI.getTemplates(),
        integrationsHubAPI.getConnectors()
      ]);
      if (tmplRes.status === 'fulfilled') {
        const fetched: ConnectorTemplate[] = tmplRes.value.data?.data || tmplRes.value.data || [];
        if (fetched.length > 0) setTemplates(fetched);
      }
      if (connRes.status === 'fulfilled') {
        setConnectors(connRes.value.data?.data || connRes.value.data || []);
      }
    } catch {
      setError('Failed to load integrations data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInstall = async (templateId: string, name: string) => {
    setInstallingId(templateId);
    try {
      await integrationsHubAPI.createConnector({ template_id: templateId, name });
      setActiveTab('installed');
      await load();
    } catch {
      setError('Failed to install connector. Please try again.');
    } finally {
      setInstallingId(null);
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await integrationsHubAPI.runConnector(id);
      await load();
    } catch {
      setError('Failed to trigger connector run.');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this connector? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await integrationsHubAPI.deleteConnector(id);
      await load();
    } catch {
      setError('Failed to remove connector.');
    } finally {
      setDeletingId(null);
    }
  };

  const installedTemplateIds = new Set(connectors.map(c => c.template_id).filter(Boolean));

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Integrations Hub</h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect your tools and data sources to automate evidence collection and compliance monitoring.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <ComplianceAsCodeCard organizationId={user?.organizationId || ''} />

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-200 mb-6">
          {(['marketplace', 'installed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'installed' ? `Installed (${connectors.length})` : 'Marketplace'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : activeTab === 'marketplace' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => {
              const isInstalled = installedTemplateIds.has(t.id);
              return (
                <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{t.name}</h3>
                        <CategoryBadge category={t.category} />
                      </div>
                      <p className="text-sm text-gray-500">{t.description}</p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleInstall(t.id, t.name)}
                      disabled={isInstalled || installingId === t.id}
                      className={`mt-auto w-full py-1.5 text-sm font-medium rounded transition-colors ${
                        isInstalled
                          ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                      }`}
                    >
                      {isInstalled ? 'Installed' : installingId === t.id ? 'Installing…' : 'Install'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : connectors.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium">No connectors installed</p>
            <p className="text-sm mt-1">Browse the Marketplace tab to install connectors.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connectors.map(conn => (
              <div key={conn.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 truncate">{conn.name}</span>
                      <StatusPill status={conn.status} />
                      <CategoryBadge category={conn.category} />
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {conn.last_run_at && (
                        <span>Last run: {format(new Date(conn.last_run_at), 'MMM d, yyyy HH:mm')}</span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRun(conn.id)}
                        disabled={runningId === conn.id}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 transition-colors"
                      >
                        {runningId === conn.id ? 'Running…' : 'Run Now'}
                      </button>
                      <button
                        onClick={() => handleDelete(conn.id)}
                        disabled={deletingId === conn.id}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === conn.id ? '…' : 'Remove'}
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
