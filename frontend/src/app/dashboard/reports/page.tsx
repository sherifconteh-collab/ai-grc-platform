// @tier: pro
'use client';

import { useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { reportsAPI } from '@/lib/api';

type ReportType = 'compliance-pdf' | 'compliance-excel' | 'ssp-pdf' | 'ssp-json';

export default function ReportsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState('');

  const downloadReport = async (reportType: ReportType) => {
    setGenerating(reportType);
    setError('');
    try {
      let response;
      let contentType = 'application/octet-stream';
      let fileName = 'report';

      switch (reportType) {
        case 'compliance-pdf':
          response = await reportsAPI.downloadPDF();
          contentType = 'application/pdf';
          fileName = `compliance-report-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        case 'compliance-excel':
          response = await reportsAPI.downloadExcel();
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          fileName = `compliance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
        case 'ssp-pdf':
          response = await reportsAPI.downloadSspPdf();
          contentType = 'application/pdf';
          fileName = `ssp-${new Date().toISOString().split('T')[0]}.pdf`;
          break;
        case 'ssp-json':
          response = await reportsAPI.downloadSspJson();
          contentType = 'application/json';
          fileName = `ssp-${new Date().toISOString().split('T')[0]}.json`;
          break;
        default:
          throw new Error('Unsupported report type');
      }

      const blob = new Blob([response.data], { type: contentType });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('Report generation requires Starter tier or higher. Please upgrade your plan.');
      } else {
        setError('Failed to generate report. Please try again.');
      }
      console.error('Report download error:', err);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-2">Generate and download compliance reports for auditors and stakeholders.</p>
        </div>

        {/* Cross-feature linkage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/ai-insights"
            className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors text-xs">
            <span className="text-lg">✨</span>
            <div><div className="font-medium text-purple-800">AI Insights</div><div className="text-purple-600">Gap analysis &amp; executive report</div></div>
          </Link>
          <Link href="/dashboard/frameworks"
            className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs">
            <span className="text-lg">📐</span>
            <div><div className="font-medium text-blue-800">Frameworks</div><div className="text-blue-600">Active framework progress</div></div>
          </Link>
          <Link href="/dashboard/auditor-workspace"
            className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-xs">
            <span className="text-lg">🔍</span>
            <div><div className="font-medium text-green-800">Auditor Workspace</div><div className="text-green-600">Engagements, workpapers &amp; findings</div></div>
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PDF Report Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                &#x1F4C4;
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">Compliance Report (PDF)</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Full compliance status report with executive summary, framework breakdown, and detailed control listing. Ideal for board presentations and auditor submissions.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Executive Summary</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Framework Breakdown</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Control Details</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Status Color-Coding</span>
                </div>
                <button
                  onClick={() => downloadReport('compliance-pdf')}
                  disabled={generating !== null}
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'compliance-pdf' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download PDF Report'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Excel Report Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                &#x1F4CA;
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">Compliance Report (Excel)</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Multi-sheet spreadsheet with summary metrics, per-framework compliance, and all controls with filtering. Ideal for data analysis and custom reporting.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Summary Sheet</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Frameworks Sheet</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Controls Sheet</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Filterable</span>
                </div>
                <button
                  onClick={() => downloadReport('compliance-excel')}
                  disabled={generating !== null}
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'compliance-excel' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download Excel Report'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SSP PDF Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-600">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                🛡️
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">System Security Plan (SSP) PDF</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Narrative SSP covering organization/system context, CIA baseline, compliance posture, asset inventory, vulnerabilities, evidence, and POA&amp;M.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Whole Picture</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Audit Narrative</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Regenerable</span>
                </div>
                <button
                  onClick={() => downloadReport('ssp-pdf')}
                  disabled={generating !== null}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'ssp-pdf' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download SSP PDF'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* SSP JSON Card */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-slate-600">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                🧾
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">System Security Plan (SSP) JSON</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Structured SSP snapshot for integrations, version control, and external automation workflows.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Machine Readable</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">API Friendly</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Regenerable</span>
                </div>
                <button
                  onClick={() => downloadReport('ssp-json')}
                  disabled={generating !== null}
                  className="mt-4 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {generating === 'ssp-json' ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Generating...
                    </span>
                  ) : (
                    'Download SSP JSON'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tier info */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-800">
            <strong>Starter tier required.</strong> Report generation is available on Starter ($49/mo) and above. Free tier users can view compliance data on the dashboard.
          </p>
          <p className="text-xs text-purple-700 mt-2">
            Keep SSP content current by updating organization and system details at <code>/dashboard/organization</code>, then regenerate.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
