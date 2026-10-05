'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';
import { inputClass } from '@/components/financialAudit/auditShared';
import { Tabs } from '@/components/financialAudit/auditShared';
import ReadinessPanel from '@/components/financialAudit/ReadinessPanel';
import RcmPanel, { type RcmEntry } from '@/components/financialAudit/RcmPanel';
import TestingPanel from '@/components/financialAudit/TestingPanel';
import SamplingPanel from '@/components/financialAudit/SamplingPanel';

const TABS = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'rcm', label: 'Risk-Control Matrix' },
  { id: 'testing', label: 'Testing' },
  { id: 'sampling', label: 'Sampling' },
];

export default function FinancialAuditPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'financial_audit.write');
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState('readiness');
  const [fiscalYear, setFiscalYear] = useState<number | null>(currentYear);
  const [planFor, setPlanFor] = useState<RcmEntry | null>(null);

  const planTest = (entry: RcmEntry) => {
    setPlanFor(entry);
    setTab('testing');
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Audit Readiness</h1>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">
              Maintain the risk-control matrix behind a SOX 404 or OMB A-123 assessment, test key controls with defensible
              sample sizes, raise findings as NFRs with corrective action plans, and see where you stand before the auditors arrive.
            </p>
          </div>
          <label className="text-sm text-gray-700">Fiscal year
            <select className={`${inputClass} mt-1`} value={fiscalYear || ''} onChange={(e) => setFiscalYear(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All years</option>
              {[currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((y) => <option key={y} value={y}>FY {y}</option>)}
            </select>
          </label>
        </div>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === 'readiness' && <ReadinessPanel fiscalYear={fiscalYear} />}
        {tab === 'rcm' && <RcmPanel canWrite={canWrite} onPlanTest={planTest} />}
        {tab === 'testing' && (
          <TestingPanel fiscalYear={fiscalYear} canWrite={canWrite} currentUserId={user?.id} planFor={planFor} onPlanClosed={() => setPlanFor(null)} />
        )}
        {tab === 'sampling' && <SamplingPanel />}
      </div>
    </DashboardLayout>
  );
}
