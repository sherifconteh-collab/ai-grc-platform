'use client';

import { useState } from 'react';
import { policiesAPI } from '@/lib/api';
import { errorMessage, formatDate, inputClass, Modal, primaryButton, secondaryButton } from './policyShared';

export interface PolicyReview {
  id: string;
  review_type: string;
  review_date: string;
  review_status: string;
  review_notes: string | null;
  changes_made: boolean;
  requires_user_acknowledgment: boolean;
  reviewed_by_email: string | null;
}

type ReviewType = 'annual' | 'triggered' | 'ad_hoc' | 'change_driven';
type ReviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'overdue';

interface ReviewForm {
  review_type: ReviewType;
  review_status: ReviewStatus;
  review_date: string;
  review_notes: string;
  changes_made: boolean;
  requires_user_acknowledgment: boolean;
}

interface PolicyReviewsPanelProps {
  policyId: string;
  reviews: PolicyReview[];
  canWrite: boolean;
  onChanged: () => Promise<void> | void;
}

const REVIEW_TYPES: { value: ReviewType; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'triggered', label: 'Triggered (incident, audit finding)' },
  { value: 'change_driven', label: 'Change-driven (regulation or system change)' },
  { value: 'ad_hoc', label: 'Ad hoc' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PolicyReviewsPanel({ policyId, reviews, canWrite, onChanged }: PolicyReviewsPanelProps) {
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      await policiesAPI.addReview(policyId, { ...form, review_notes: form.review_notes.trim() || undefined });
      setForm(null);
      await onChanged();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not record the review'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4" aria-labelledby="reviews-heading">
      <div className="flex items-center justify-between mb-2">
        <h2 id="reviews-heading" className="text-base font-semibold text-gray-900">Reviews</h2>
        {canWrite && (
          <button
            type="button"
            className="text-sm text-blue-700 hover:underline"
            onClick={() => setForm({ review_type: 'annual', review_status: 'completed', review_date: today(), review_notes: '', changes_made: false, requires_user_acknowledgment: false })}
          >
            Record review
          </button>
        )}
      </div>
      {reviews.length === 0 && <p className="text-sm text-gray-500">No reviews recorded yet.</p>}
      <ul role="list" className="divide-y divide-gray-100">
        {reviews.map((r) => (
          <li role="listitem" key={r.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 capitalize">{r.review_type.replace(/_/g, ' ')} review</span>
              <span className="text-xs text-gray-500">{formatDate(r.review_date)}</span>
            </div>
            <div className="text-xs text-gray-600 capitalize">
              {r.review_status.replace(/_/g, ' ')}{r.changes_made ? ', changes made' : ''}{r.reviewed_by_email ? ` - ${r.reviewed_by_email}` : ''}
            </div>
            {r.review_notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{r.review_notes}</p>}
          </li>
        ))}
      </ul>

      {form && (
        <Modal title="Record policy review" onClose={() => setForm(null)}>
          <div className="space-y-3">
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="review-type" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select id="review-type" className={inputClass} value={form.review_type} onChange={(e) => setForm({ ...form, review_type: e.target.value as ReviewType })}>
                  {REVIEW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="review-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select id="review-status" className={inputClass} value={form.review_status} onChange={(e) => setForm({ ...form, review_status: e.target.value as ReviewStatus })}>
                  <option value="completed">Completed</option>
                  <option value="in_progress">In progress</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="review-date" className="block text-sm font-medium text-gray-700 mb-1">Review date</label>
              <input id="review-date" type="date" className={inputClass} value={form.review_date} onChange={(e) => setForm({ ...form, review_date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="review-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea id="review-notes" rows={3} className={inputClass} value={form.review_notes} onChange={(e) => setForm({ ...form, review_notes: e.target.value })} />
            </div>
            <label htmlFor="review-changes" className="flex items-center gap-2 text-sm">
              <input id="review-changes" type="checkbox" checked={form.changes_made} onChange={(e) => setForm({ ...form, changes_made: e.target.checked })} />
              The review changed the policy
            </label>
            <label htmlFor="review-ack" className="flex items-center gap-2 text-sm">
              <input id="review-ack" type="checkbox" checked={form.requires_user_acknowledgment} onChange={(e) => setForm({ ...form, requires_user_acknowledgment: e.target.checked })} />
              Notify employees to re-acknowledge
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButton} onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className={primaryButton} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save review'}</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
