// @tier: community
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { cmdbAPI } from '@/lib/api';

interface CategorySummary {
  key: string; label: string; icon: string; href: string;
  count: number; description: string; color: string;
}

const CATEGORIES: Omit<CategorySummary, 'count'>[] = [
  { key: 'hardware',         label: 'Hardware',         icon: '🖥️',  href: '/dashboard/cmdb/hardware',         description: 'Servers, laptops, networking gear',        color: 'bg-blue-600' },
  { key: 'software',         label: 'Software',         icon: '💿',  href: '/dashboard/cmdb/software',         description: 'Applications, databases, OS images',      color: 'bg-indigo-600' },
  { key: 'ai-agents',        label: 'AI Agents',        icon: '🤖',  href: '/dashboard/cmdb/ai-agents',        description: 'Models, bots, LLM integrations',        color: 'bg-purple-600' },
  { key: 'service-accounts', label: 'Service Accounts', icon: '🔑',  href: '/dashboard/cmdb/service-accounts', description: 'Non-human accounts and API keys',       color: 'bg-amber-600' },
  { key: 'environments',     label: 'Environments',     icon: '🌐',  href: '/dashboard/cmdb/environments',     description: 'Prod, staging, dev, DR and more',      color: 'bg-teal-600' },
  { key: 'password-vaults',  label: 'Password Vaults',  icon: '🔐',  href: '/dashboard/cmdb/password-vaults',  description: 'Vault instances and credential stores', color: 'bg-rose-600' },
];

const API_MAP: Record<string, () => Promise<any>> = {
  'hardware':         () => cmdbAPI.hardware.getAll(),
  'software':         () => cmdbAPI.software.getAll(),
  'ai-agents':        () => cmdbAPI.aiAgents.getAll(),
  'service-accounts': () => cmdbAPI.serviceAccounts.getAll(),
  'environments':     () => cmdbAPI.environments.getAll(),
  'password-vaults':  () => cmdbAPI.passwordVaults.getAll(),
};

interface AdvancedFeature {
  icon: string;
  label: string;
  description: string;
  href?: string;
}

const ADVANCED_FEATURES: AdvancedFeature[] = [
  { icon: '🎯', label: 'Asset Risk Scoring',        description: 'Composite risk score per asset from linked vulnerabilities and open control gaps' },
  { icon: '📥', label: 'Bulk CSV Import / Export',   description: 'Import asset inventories from spreadsheets; export for offline review and auditors' },
  { icon: '📋', label: 'Asset Change History',       description: '90-day audit trail showing who changed each asset field and when' },
  { icon: '🤖', label: 'AI-Suggested Relationships', description: 'AI recommends likely dependencies based on hostname, IP range, and category patterns' },
  { icon: '🗺️', label: 'Dependency Graph',           description: 'Interactive SVG network map of all assets and their dependency relationships', href: '/dashboard/cmdb/dependency-map' },
  { icon: '🏥', label: 'CMDB Health Dashboard',      description: 'Detects stale assets, unlinked critical systems, missing owners, and upcoming expirations' },
  { icon: '🔌', label: 'Auto-Discovery Webhooks',    description: 'Receive asset events from Nmap, Qualys, Tenable, and custom scanners in real time' },
  { icon: '🧩', label: 'Custom Asset Fields',        description: 'Extend any asset type with org-specific metadata: cost centre, BIA rating, data residency' },
  { icon: '🏦', label: 'Financial Compliance Workspace', description: 'Reg BI alignment, SR 11-7 model inventory, FINRA audit trail, and SEC explainability narratives', href: '/dashboard/cmdb/financial-services-workspace' },
];

export default function CMDBPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => { fetchCounts(); }, []);

  const fetchCounts = async () => {
    const map: Record<string, number> = {};
    await Promise.all(Object.entries(API_MAP).map(async ([key, fn]) => {
      try {
        const res = await fn();
        const data = res.data?.data ?? res.data ?? [];
        map[key] = Array.isArray(data) ? data.length : 0;
      } catch { map[key] = 0; setApiError(true); }
    }));
    setCounts(map);
    setLoading(false);
  };

  const categories: CategorySummary[] = CATEGORIES.map(c => ({ ...c, count: counts[c.key] ?? 0 }));
  const totalAssets = categories.reduce((s, c) => s + c.count, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">CMDB</h1>
          <p className="text-gray-600 mt-1">Configuration Management Database – track every asset, its owner, and its relationships</p>
        </div>

        {apiError && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded text-sm">
            Some counts could not be fetched – backend CMDB endpoints may not be running yet. You can still add records on each sub-page.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg shadow-lg p-5 text-white col-span-2 md:col-span-1">
            <p className="text-sm opacity-80">Total Assets</p>
            <p className="text-4xl font-bold mt-1">{loading ? '…' : totalAssets}</p>
            <p className="text-xs opacity-60 mt-1">across all categories</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-lg p-5 text-white">
            <p className="text-sm opacity-80">Service Accounts</p>
            <p className="text-4xl font-bold mt-1">{loading ? '…' : (counts['service-accounts'] ?? 0)}</p>
            <p className="text-xs opacity-60 mt-1">review ownership regularly</p>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-lg shadow-lg p-5 text-white">
            <p className="text-sm opacity-80">AI Agents</p>
            <p className="text-4xl font-bold mt-1">{loading ? '…' : (counts['ai-agents'] ?? 0)}</p>
            <p className="text-xs opacity-60 mt-1">EU AI Act governance</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-purple-500 p-5 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h3 className="font-bold text-gray-900">Why the CMDB matters for GRC</h3>
              <ul className="text-sm text-gray-700 mt-2 list-disc list-inside space-y-1">
                <li>Controls often target specific assets – <em>encrypt all databases</em></li>
                <li>Evidence must reference real systems – <em>MFA enabled on production Okta</em></li>
                <li>Auditors ask <em>show me every system processing PII</em></li>
                <li>Track <em>which service account accesses which vault in which environment</em></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map(cat => (
            <Link key={cat.key} href={cat.href} className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-purple-400 transition-all p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cat.color + ' text-white rounded-lg w-11 h-11 flex items-center justify-center text-xl shadow'}>
                    {cat.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{cat.label}</h3>
                    <p className="text-xs text-gray-500">{cat.description}</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-gray-800">{loading ? '…' : cat.count}</span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-purple-600 font-semibold">
                <span>View all →</span>
                <span className="text-gray-400 font-normal">click to manage</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Advanced CMDB Features */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-gray-900">Advanced CMDB Features</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ADVANCED_FEATURES.map(f => {
              const inner = (
                <div className="flex items-start gap-4 p-4 rounded-lg border transition-all bg-white border-gray-200 hover:border-purple-400 hover:shadow-md">
                  <span className="text-2xl flex-shrink-0">{f.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{f.label}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">Available</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{f.description}</p>
                    {f.href && (
                      <span className="text-xs text-purple-600 font-semibold mt-1 block">Open →</span>
                    )}
                  </div>
                </div>
              );

              return f.href
                ? <Link key={f.label} href={f.href}>{inner}</Link>
                : <div key={f.label}>{inner}</div>;
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
