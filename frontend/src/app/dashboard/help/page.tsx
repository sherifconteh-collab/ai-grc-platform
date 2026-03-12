// @tier: free
'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { helpAPI, issueReportAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasTierAtLeast } from '@/lib/access';

interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  locked: boolean;
  minTierRequired: string;
}

interface HelpCategories {
  [category: string]: HelpArticle[];
}

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
  utilities: 'Utilities',
};

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
  utilities: 'bg-amber-100 text-amber-700',
};

// Allowed HTML tags produced by renderMarkdown — strip any others before rendering
const ALLOWED_TAGS = new Set([
  'h1','h2','h3','h4','p','pre','code','strong','em','li','blockquote',
  'a','br','hr','div','span'
]);

function sanitizeHtml(html: string): string {
  // Remove any tags not in the allow-list (regex-based, matches opening and closing tags)
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? match : '';
  });
}

// Simple Markdown renderer — handles headings, bold, code blocks, bullet lists,
// and horizontal rules. No external dependency needed.
function renderMarkdown(md: string): string {
  const html = md
    // Fenced code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-gray-800 text-green-300 rounded p-4 overflow-x-auto text-sm my-4"><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-purple-700 rounded px-1 py-0.5 text-sm font-mono">$1</code>')
    // Headings
    .replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold text-gray-800 mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-gray-900 mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3 border-b pb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-gray-900 mt-6 mb-4">$1</h1>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="my-6 border-gray-200" />')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-purple-400 pl-4 italic text-gray-600 my-2">$1</blockquote>')
    // Unordered lists (simple)
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc text-gray-700">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-gray-700">$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-purple-600 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>')
    // Paragraphs: double newlines become paragraph breaks
    .replace(/\n\n/g, '</p><p class="mb-3 text-gray-700">')
    .replace(/\n/g, '<br />');
  return sanitizeHtml(html);
}

export default function HelpPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'articles' | 'issues'>('articles');
  const [categories, setCategories] = useState<HelpCategories>({});
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [articleContent, setArticleContent] = useState<string>('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articleIcon, setArticleIcon] = useState('');
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Issue form state
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueCategory, setIssueCategory] = useState<string>('bug');
  const [issueSeverity, setIssueSeverity] = useState<string>('medium');
  const [issueSteps, setIssueSteps] = useState('');
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState('');
  const [issueError, setIssueError] = useState('');
  const [issueGithubUrl, setIssueGithubUrl] = useState('');
  const [myReports, setMyReports] = useState<Array<{ id: string; title: string; category: string; severity: string; created_at: string }>>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    helpAPI.getIndex()
      .then((res: any) => setCategories(res.data?.data?.categories || {}))
      .catch(() => setCategories({}))
      .finally(() => setLoading(false));
  }, []);

  const openArticle = useCallback(async (slug: string, title: string, icon: string) => {
    setSelectedSlug(slug);
    setArticleTitle(title);
    setArticleIcon(icon);
    setArticleContent('');
    setArticleError('');
    setArticleLoading(true);
    try {
      const res = await helpAPI.getArticle(slug);
      setArticleContent(res.data?.data?.content || '');
    } catch (err: any) {
      setArticleError(err?.response?.data?.error || 'Failed to load article');
    } finally {
      setArticleLoading(false);
    }
  }, []);

  const loadMyReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await issueReportAPI.getMyReports();
      setMyReports(res.data?.data || []);
    } catch {
      // Non-fatal
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'issues') {
      loadMyReports();
    }
  }, [activeTab, loadMyReports]);

  const handleSubmitIssue = async () => {
    if (!issueTitle.trim() || issueTitle.trim().length < 3) {
      setIssueError('Title must be at least 3 characters.');
      return;
    }
    if (!issueDescription.trim() || issueDescription.trim().length < 10) {
      setIssueError('Description must be at least 10 characters.');
      return;
    }
    setIssueSubmitting(true);
    setIssueError('');
    setIssueSuccess('');
    setIssueGithubUrl('');
    try {
      const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
      const browserInfo = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const res = await issueReportAPI.submit({
        title: issueTitle.trim(),
        description: issueDescription.trim(),
        category: issueCategory as 'bug' | 'feature_request' | 'usability' | 'documentation' | 'security' | 'performance' | 'other',
        severity: issueSeverity as 'low' | 'medium' | 'high' | 'critical',
        page_url: pageUrl,
        browser_info: browserInfo,
        steps_to_reproduce: issueSteps.trim() || undefined,
      });
      const data = res.data?.data;
      setIssueSuccess(data?.message || 'Issue reported successfully.');
      if (data?.github_issue_url) {
        setIssueGithubUrl(data.github_issue_url);
      }
      setIssueTitle('');
      setIssueDescription('');
      setIssueSteps('');
      setIssueCategory('bug');
      setIssueSeverity('medium');
      loadMyReports();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setIssueError(e.response?.data?.error || 'Failed to submit issue report.');
    } finally {
      setIssueSubmitting(false);
    }
  };

  const filteredCategories: HelpCategories = searchQuery.trim()
    ? Object.fromEntries(
        (Object.entries(categories) as [string, HelpArticle[]][])
          .map(([cat, articles]) => [
            cat,
            articles.filter(
              (a) =>
                a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                a.description.toLowerCase().includes(searchQuery.toLowerCase())
            ),
          ])
          .filter(([, articles]) => (articles as HelpArticle[]).length > 0)
      )
    : categories;

  const currentTierLabel = TIER_LABELS[user?.effectiveTier || user?.organizationTier || 'community'] || 'Community';

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📖 Help Center</h1>
              <p className="text-gray-500 mt-1">
                Guides, how-tos, and reference documentation for ControlWeave.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
              {currentTierLabel} tier
            </span>
          </div>

          {/* Tabs */}
          <div className="mt-4 border-b border-gray-200">
            <nav className="flex gap-6 -mb-px">
              <button
                onClick={() => { setActiveTab('articles'); setSelectedSlug(null); }}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'articles'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                📚 Articles
              </button>
              <button
                onClick={() => setActiveTab('issues')}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'issues'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                🐛 Report Issue
              </button>
            </nav>
          </div>
        </div>

        {/* ── Issues Tab ── */}
        {activeTab === 'issues' && (
          <div className="space-y-6">
            {issueSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700 font-medium">{issueSuccess}</p>
                {issueGithubUrl && (
                  <p className="text-sm text-green-600 mt-1">
                    Track on GitHub:{' '}
                    <a href={issueGithubUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">{issueGithubUrl}</a>
                  </p>
                )}
              </div>
            )}
            {issueError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">{issueError}</p>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Report an Issue</h2>
                <p className="text-sm text-gray-500">Found a bug, need a feature, or have feedback? Submit it here and it will be sent to our development team for review.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="Brief summary of the issue..."
                  maxLength={200}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={issueCategory}
                    onChange={(e) => setIssueCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="bug">🐛 Bug Report</option>
                    <option value="feature_request">💡 Feature Request</option>
                    <option value="usability">🎨 Usability Issue</option>
                    <option value="documentation">📖 Documentation</option>
                    <option value="security">🔒 Security Concern</option>
                    <option value="performance">⚡ Performance</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select
                    value={issueSeverity}
                    onChange={(e) => setIssueSeverity(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                <textarea
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Describe the issue in detail. What happened? What were you trying to do?"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <p className="text-xs text-gray-400 mt-1">{issueDescription.length}/5000</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Steps to Reproduce (optional)</label>
                <textarea
                  value={issueSteps}
                  onChange={(e) => setIssueSteps(e.target.value)}
                  rows={3}
                  placeholder="1. Go to...\n2. Click on...\n3. Observe..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-gray-400">Your browser info is collected automatically for debugging.</p>
                <button
                  onClick={handleSubmitIssue}
                  disabled={issueSubmitting || !issueTitle.trim() || !issueDescription.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {issueSubmitting ? '⏳ Submitting…' : '📨 Submit Report'}
                </button>
              </div>
            </div>

            {/* Previous Reports */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">My Previous Reports</h3>
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
          </div>
        )}

        {/* ── Articles Tab ── */}
        {activeTab === 'articles' && (
          <>
            {/* Search */}
            <div className="mb-6">
              <input
                type="text"
                placeholder="Search help articles…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
              </div>
            ) : selectedSlug ? (
              /* ── Article Viewer ── */
              <div>
                <button
                  onClick={() => { setSelectedSlug(null); setArticleContent(''); setArticleError(''); }}
                  className="mb-6 flex items-center text-sm text-purple-600 hover:text-purple-800 font-medium"
                >
                  ← Back to Help Center
                </button>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-4xl">{articleIcon}</span>
                    <h2 className="text-2xl font-bold text-gray-900">{articleTitle}</h2>
                  </div>

                  {articleLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                    </div>
                  ) : articleError ? (
                    <div className="text-center py-16">
                      <p className="text-3xl mb-3">🔒</p>
                      <p className="text-gray-600">{articleError}</p>
                      <p className="text-sm text-gray-400 mt-2">Upgrade your plan to access this content.</p>
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: `<div>${renderMarkdown(articleContent)}</div>` }}
                    />
                  )}
                </div>
              </div>
            ) : (
              /* ── Article Index ── */
              <div className="space-y-10">
                {Object.keys(filteredCategories).length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <p className="text-4xl mb-4">🔍</p>
                    <p>No articles match your search.</p>
                  </div>
                ) : (
                  Object.entries(filteredCategories).map(([category, articles]) => (
                    <div key={category}>
                      <h2 className="text-lg font-semibold text-gray-700 mb-4 uppercase tracking-wide text-sm">
                        {category}
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {articles.map((article) => (
                          <div
                            key={article.slug}
                            onClick={() =>
                              !article.locked && openArticle(article.slug, article.title, article.icon)
                            }
                            className={`relative bg-white border rounded-xl p-5 transition-all ${
                              article.locked
                                ? 'opacity-60 cursor-not-allowed border-gray-200'
                                : 'cursor-pointer border-gray-200 hover:border-purple-400 hover:shadow-md'
                            }`}
                          >
                            {article.locked && (
                              <div className="absolute top-3 right-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[article.minTierRequired] || 'bg-gray-100 text-gray-600'}`}
                                >
                                  🔒 {TIER_LABELS[article.minTierRequired] || article.minTierRequired}+
                                </span>
                              </div>
                            )}
                            <div className="text-3xl mb-3">{article.icon}</div>
                            <h3 className="text-base font-semibold text-gray-900 mb-1">{article.title}</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">{article.description}</p>
                            {!article.locked && (
                              <p className="text-xs text-purple-500 font-medium mt-3">Read guide →</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
