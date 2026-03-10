// @tier: free
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { issueReportAPI } from '@/lib/api';

type Category = 'bug' | 'feature_request' | 'usability' | 'documentation' | 'security' | 'performance' | 'other';
type Severity = 'low' | 'medium' | 'high' | 'critical';

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: '🐛' },
  { value: 'feature_request', label: 'Feature Request', icon: '💡' },
  { value: 'usability', label: 'Usability Issue', icon: '🎨' },
  { value: 'documentation', label: 'Documentation', icon: '📖' },
  { value: 'security', label: 'Security Concern', icon: '🔒' },
  { value: 'performance', label: 'Performance', icon: '⚡' },
  { value: 'other', label: 'Other', icon: '📝' },
];

const SEVERITIES: { value: Severity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
];

interface MyReport {
  id: string;
  title: string;
  category: string;
  severity: string;
  created_at: string;
}

export default function ReportIssuePage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('bug');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [myReports, setMyReports] = useState<MyReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    loadMyReports();
  }, []);

  const loadMyReports = async () => {
    setReportsLoading(true);
    try {
      const res = await issueReportAPI.getMyReports();
      setMyReports(res.data?.data || []);
    } catch {
      // Non-fatal
    } finally {
      setReportsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || title.trim().length < 3) {
      setErrorMsg('Title must be at least 3 characters.');
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setErrorMsg('Description must be at least 10 characters.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    setGithubUrl('');
    try {
      const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
      const browserInfo = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const res = await issueReportAPI.submit({
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        page_url: pageUrl,
        browser_info: browserInfo,
        steps_to_reproduce: stepsToReproduce.trim() || undefined,
        expected_behavior: expectedBehavior.trim() || undefined,
        actual_behavior: actualBehavior.trim() || undefined,
      });
      const data = res.data?.data;
      setSuccessMsg(data?.message || 'Issue reported successfully.');
      if (data?.github_issue_url) {
        setGithubUrl(data.github_issue_url);
      }
      setTitle('');
      setDescription('');
      setStepsToReproduce('');
      setExpectedBehavior('');
      setActualBehavior('');
      setCategory('bug');
      setSeverity('medium');
      loadMyReports();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setErrorMsg(e.response?.data?.error || 'Failed to submit issue report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const categoryIcon = CATEGORIES.find(c => c.value === category)?.icon || '📝';

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Report an Issue</h1>
            <span className="text-2xl">🐛</span>
          </div>
          <p className="text-gray-600 mt-1">
            Found a bug, have a feature request, or experiencing an issue? Let us know and we&apos;ll look into it.
          </p>
        </div>

        {/* Success Banner */}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">{successMsg}</p>
            {githubUrl && (
              <p className="text-sm text-green-600 mt-1">
                Track the issue on GitHub:{' '}
                <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  {githubUrl}
                </a>
              </p>
            )}
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        {/* Issue Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of the issue..."
              maxLength={200}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <div className="flex gap-2">
                {SEVERITIES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setSeverity(s.value)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      severity === s.value
                        ? `${s.color} border-current ring-2 ring-purple-300`
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Describe the issue in detail. What happened? What were you trying to do?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <p className="text-xs text-gray-400 mt-1">{description.length}/5000</p>
          </div>

          {(category === 'bug' || category === 'usability' || category === 'performance') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Steps to Reproduce</label>
                <textarea
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  rows={3}
                  placeholder="1. Go to...\n2. Click on...\n3. Observe..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Behavior</label>
                  <textarea
                    value={expectedBehavior}
                    onChange={(e) => setExpectedBehavior(e.target.value)}
                    rows={2}
                    placeholder="What should have happened?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actual Behavior</label>
                  <textarea
                    value={actualBehavior}
                    onChange={(e) => setActualBehavior(e.target.value)}
                    rows={2}
                    placeholder="What actually happened?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-400">
              {categoryIcon} Your report will be reviewed by our team. Browser info is collected automatically.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !description.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {submitting ? '⏳ Submitting…' : '📨 Submit Report'}
            </button>
          </div>
        </div>

        {/* My Previous Reports */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700">My Previous Reports</h2>
          </div>
          {reportsLoading ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">Loading…</div>
          ) : myReports.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">No issue reports submitted yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Title</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Severity</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {myReports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{report.title}</td>
                    <td className="px-4 py-2 text-gray-600 capitalize">{report.category?.replace('_', ' ')}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        report.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        report.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        report.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {report.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(report.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Help tip */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> For general questions, try the{' '}
            <Link href="/dashboard/help" className="underline font-medium">Help Center</Link> or the{' '}
            <span className="font-medium">AI Copilot</span> (bottom-right corner). Issue reports are forwarded to our development team for review.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
