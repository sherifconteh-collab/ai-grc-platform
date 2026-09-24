/**
 * Shapes returned by the POA&M routes.
 *
 * Declared once and shared by the list, detail, control and risk screens.
 * TypeScript strict is on and `any` is banned by .claude/rules/coding-style.md,
 * so these exist to keep the screens honest about what the API actually sends.
 */

export interface PoamItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source_type: string;
  source_id: string | null;
  control_id: string | null;
  vulnerability_id: string | null;
  treatment_id: string | null;
  owner_id: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
  due_date: string | null;
  scheduled_completion_date: string | null;
  resources_required: string | null;
  remediation_plan: string | null;
  closure_notes: string | null;
  risk_acceptance_expires_at: string | null;
  framework_specific_type?: string | null;
  submitted_by?: string | null;
  submitted_for_review_at?: string | null;
  review_status?: string | null;
  review_notes?: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at?: string | null;

  // Joined by the list and detail queries.
  control_code?: string | null;
  control_title?: string | null;
  framework_code?: string | null;
  vulnerability_severity?: string | null;
  created_by_email?: string | null;

  // Aggregates from the list query's LATERAL block.
  control_count?: number | null;
  risk_count?: number | null;
  milestone_count?: number | null;
  next_milestone_date?: string | null;
}

export interface PoamUpdate {
  id: string;
  update_type: string;
  note: string | null;
  previous_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  changed_by_email: string | null;
  created_at: string;
}

export interface PoamLinkedControl {
  control_id: string;
  notes: string | null;
  control_code: string;
  control_title: string;
  framework_code: string | null;
  framework_name: string | null;
}

export interface PoamLinkedRisk {
  risk_id: string;
  risk_reference: string | null;
  risk_title: string;
  risk_status: string;
  residual_score: number | null;
}

export interface PoamMilestone {
  id: string;
  poam_item_id: string;
  description: string;
  target_date: string | null;
  status: string;
  completed_date: string | null;
  sort_order: number;
  created_at: string;
}

export interface PoamApprovalRequest {
  id: string;
  poam_item_id: string;
  control_id: string | null;
  control_code: string | null;
  control_title: string | null;
  previous_control_status: string | null;
  new_control_status: string | null;
  justification: string | null;
  framework_specific_type: string | null;
  review_status: string | null;
  review_comments: string | null;
  submitted_by: string | null;
  submitted_by_email: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
}

/** One entry of the per-framework vocabulary from GET /poam/framework-types. */
export interface FrameworkPoamType {
  framework_code?: string;
  code: string;
  name: string;
  description: string;
  required_fields: string[];
  review_levels: string[];
}

export interface AuditorGuidance {
  framework_code?: string;
  type_code?: string;
  type_name?: string;
  review_levels?: string[];
  required_fields?: string[];
  guidance?: string[] | string;
  [key: string]: unknown;
}

/** Statuses that mean the item is still live. Mirrors OPEN_POAM_STATUSES. */
export const OPEN_POAM_STATUSES = ['open', 'in_progress', 'pending_review', 'pending_auditor_review'];

export const POAM_STATUSES = [
  'open', 'in_progress', 'pending_review', 'pending_auditor_review',
  'auditor_approved', 'auditor_rejected', 'closed', 'risk_accepted',
];

export const POAM_PRIORITIES = ['low', 'medium', 'high', 'critical'];

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'delayed', 'cancelled'];

export const REVIEW_OUTCOMES = ['approved', 'rejected', 'changes_requested'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/** The backend rejects review comments under this length. */
export const MIN_REVIEW_COMMENT_LENGTH = 10;

/**
 * Narrow an unknown thrown value to a message. Axios errors carry the API's
 * message at response.data.error; everything else falls back to a generic
 * string rather than leaking a stack trace into the UI.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response;
    const apiError = response?.data?.error;
    if (typeof apiError === 'string' && apiError.trim().length > 0) return apiError;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Does this error mean the compliance gate wants a justification?
 *
 * The backend answers 400 with `requires_poam_submission: true` -- a published
 * response contract -- so the UI can prompt for the justification and retry
 * rather than showing a dead-end error.
 */
export function requiresPoamJustification(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('response' in err)) return false;
  const response = (err as { response?: { data?: { requires_poam_submission?: unknown } } }).response;
  return response?.data?.requires_poam_submission === true;
}
