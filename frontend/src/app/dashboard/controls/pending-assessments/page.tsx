// @tier: pro
'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { pendingControlAssessmentsAPI } from '@/lib/api';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/lib/access';

interface PendingControlAssessment {
  id: string;
  control_id: string;
  control_code: string;
  control_title: string;
  framework_code: string;
  framework_name: string;
  source_type: string;
  source_summary: string | null;
  current_status: string;
  ai_suggested_status: string;
  ai_confidence: number;
  ai_reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

type FilterStatus = 'pending' | 'approved' | 'rejected';

const STATUS_ORDER = ['not_started', 'in_progress', 'needs_review', 'implemented', 'satisfied_via_crosswalk', 'verified', 'not_applicable'];

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? 'bg-green-100 text-green-700' :
    pct >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {pct}% confidence
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'approved' ? 'bg-green-100 text-green-700' :
    status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  );
}

function StatusTransition({ from, to }: { from: string; to: string }) {
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  const isRegression = fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded capitalize">{from.replace(/_/g, ' ')}</span>
      <span className={isRegression ? 'text-red-500' : 'text-green-600'}>{isRegression ? '↓' : '→'}</span>
      <span className={`px-1.5 py-0.5 rounded capitalize ${isRegression ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
        {to.replace(/_/g, ' ')}
      </span>
    </span>
  );
}

export default function PendingControlAssessmentsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'implementations.write');

  const [items, setItems] = useState<PendingControlAssessment[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await pendingControlAssessmentsAPI.getAll(filter);
      const fetchedData = res.data?.data ?? res.data;
      setItems(Array.isArray(fetchedData) ? fetchedData : []);
    } catch {
      setError('Failed to load pending control assessments.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleScan = async () => {
    setScanLoading(true);
    setError(null);
    try {
      await pendingControlAssessmentsAPI.scan();
      await loadItems();
    } catch {
      setError('Scan failed. Please try again.');
    } finally {
      setScanLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await pendingControlAssessmentsAPI.approve(id, noteInputs[id] || undefined);
      await loadItems();
    } catch {
      setError('Failed to approve this status change — you may need auditor/admin access if it sets status to Verified.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(`reject-${id}`);
    try {
      await pendingControlAssessmentsAPI.reject(id, noteInputs[id] || undefined);
      await loadItems();
    } catch {
      setError('Failed to reject this suggestion.');
    } finally {
      setActionLoading(null);
    }
  };

  const FILTERS: FilterStatus[] = ['pending', 'approved', 'rejected'];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Control Assessments</h1>
            <p className="text-sm text-gray-500 mt-1">
              Review AI-suggested control status changes from connector evidence before they are applied.
            </p>
          </div>
          {canManage && (
            <button
              onClick={handleScan}
              disabled={scanLoading}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {scanLoading ? 'Scanning…' : 'Run AI Scan'}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                filter === f
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium">No {filter} suggestions</p>
            <p className="text-sm mt-1">
              {filter === 'pending'
                ? 'Run an AI scan to evaluate controls with recent connector evidence.'
                : `No control assessments have been ${filter} yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={item.status} />
                      <ConfidenceBadge score={item.ai_confidence} />
                      <span className="text-xs text-gray-400 capitalize">{item.source_type.replace(/_/g, ' ')}</span>
                    </div>
                    <h3 className="font-medium text-gray-900">
                      <span className="font-mono text-xs text-gray-500 mr-1.5">{item.framework_code}/{item.control_code}</span>
                      {item.control_title}
                    </h3>
                    <div className="mt-1.5">
                      <StatusTransition from={item.current_status} to={item.ai_suggested_status} />
                    </div>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-3">{item.ai_reasoning}</p>
                    {item.source_summary && (
                      <p className="text-xs text-gray-400 mt-1">{item.source_summary}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Created {format(new Date(item.created_at), 'MMM d, yyyy')}
                      {item.reviewed_by_name && ` · Reviewed by ${item.reviewed_by_name}`}
                    </p>
                  </div>

                  {canManage && item.status === 'pending' && (
                    <div className="flex flex-col gap-2 min-w-[220px]">
                      <textarea
                        placeholder="Review notes (optional)"
                        value={noteInputs[item.id] || ''}
                        onChange={e => setNoteInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                        rows={2}
                        className="text-xs border border-gray-200 rounded p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(item.id)}
                          disabled={actionLoading !== null}
                          className="flex-1 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === item.id ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          disabled={actionLoading !== null}
                          className="flex-1 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === `reject-${item.id}` ? '…' : 'Reject'}
                        </button>
                      </div>
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
