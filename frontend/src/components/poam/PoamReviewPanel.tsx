'use client';

/**
 * Auditor review decision panel.
 *
 * The whole review workflow -- submit, auditor queue, decision, approval
 * history, per-framework guidance -- has existed on the API since the feature
 * shipped and had no UI at all. POAM.md said so in as many words: "The auditor
 * review workflow is fully implemented on the API and has no UI yet."
 */

import { useCallback, useEffect, useState } from 'react';
import { poamAPI } from '@/lib/api';
import {
  PoamItem, AuditorGuidance, ReviewOutcome, REVIEW_OUTCOMES,
  MIN_REVIEW_COMMENT_LENGTH, errorMessage,
} from '@/lib/poamTypes';

interface PoamReviewPanelProps {
  item: PoamItem;
  /** Current user id, for the separation-of-duties check. */
  currentUserId: string | null;
  canReview: boolean;
  onReviewed: () => void;
}

const OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  approved: 'Approve',
  rejected: 'Reject',
  changes_requested: 'Request changes',
};

export default function PoamReviewPanel({ item, currentUserId, canReview, onReviewed }: PoamReviewPanelProps) {
  const [outcome, setOutcome] = useState<ReviewOutcome>('approved');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [guidance, setGuidance] = useState<AuditorGuidance | null>(null);

  // Separation of duties: the backend refuses a review by the person who
  // submitted the item. Surface that up front rather than letting a reviewer
  // write a decision that will be rejected with a 403.
  const isOwnSubmission = Boolean(
    currentUserId && item.submitted_by && String(item.submitted_by) === String(currentUserId)
  );

  const loadGuidance = useCallback(async () => {
    if (!item.framework_code || !item.framework_specific_type || item.framework_specific_type === 'standard') {
      setGuidance(null);
      return;
    }
    try {
      const res = await poamAPI.getAuditorGuidance(item.framework_code, item.framework_specific_type);
      setGuidance(res.data?.data || null);
    } catch {
      // Guidance is advisory. Its absence must not block a review.
      setGuidance(null);
    }
  }, [item.framework_code, item.framework_specific_type]);

  useEffect(() => { loadGuidance(); }, [loadGuidance]);

  if (item.status !== 'pending_auditor_review') return null;

  const commentsTooShort = comments.trim().length < MIN_REVIEW_COMMENT_LENGTH;

  const handleSubmit = async () => {
    if (commentsTooShort) {
      setError(`Review comments must be at least ${MIN_REVIEW_COMMENT_LENGTH} characters`);
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await poamAPI.review(item.id, { outcome, comments: comments.trim() });
      setComments('');
      onReviewed();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to record review decision'));
    } finally {
      setSubmitting(false);
    }
  };

  const guidanceList = Array.isArray(guidance?.guidance)
    ? guidance?.guidance
    : guidance?.guidance
      ? [String(guidance.guidance)]
      : [];

  return (
    <section className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-purple-900">Auditor review</h2>

      {guidance && (
        <div className="bg-white border border-purple-100 rounded-md p-3 text-xs text-gray-700 space-y-1">
          <p className="font-medium text-gray-900">
            {guidance.type_name || item.framework_specific_type} guidance
          </p>
          {guidanceList.length > 0 && (
            <ul role="list" className="list-disc list-inside space-y-0.5">
              {guidanceList.map((line, index) => (
                <li key={index} role="listitem">{String(line)}</li>
              ))}
            </ul>
          )}
          {guidance.review_levels && guidance.review_levels.length > 0 && (
            <p className="text-gray-500">
              Review chain: {guidance.review_levels.map((level) => String(level).replace(/_/g, ' ')).join(' → ')}
            </p>
          )}
        </div>
      )}

      {!canReview ? (
        <p className="text-sm text-purple-900">
          This item is awaiting auditor review. You do not hold the <code>audit.write</code> permission
          needed to record a decision.
        </p>
      ) : isOwnSubmission ? (
        <p role="note" className="text-sm text-purple-900">
          You submitted this item, so you cannot also review it. Separation of duties requires a
          different reviewer.
        </p>
      ) : (
        <>
          <div>
            <label htmlFor="review-outcome" className="block text-xs font-medium text-gray-700 mb-1">
              Decision
            </label>
            <select
              id="review-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ReviewOutcome)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {REVIEW_OUTCOMES.map((value) => (
                <option key={value} value={value}>{OUTCOME_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="review-comments" className="block text-xs font-medium text-gray-700 mb-1">
              Comments <span className="text-gray-400">(minimum {MIN_REVIEW_COMMENT_LENGTH} characters)</span>
            </label>
            <textarea
              id="review-comments"
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What you examined and why this outcome follows from it."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || commentsTooShort}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {submitting ? 'Recording...' : `Record ${OUTCOME_LABELS[outcome].toLowerCase()}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
