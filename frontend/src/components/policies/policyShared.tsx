import type { PolicyStatus } from '@/lib/api';

export interface Policy {
  id: string;
  policy_name: string;
  policy_type: string;
  description: string | null;
  version: string;
  status: PolicyStatus;
  effective_date: string | null;
  review_frequency_days: number;
  next_review_date: string | null;
  created_by: string | null;
  created_by_email?: string | null;
  approved_by_email?: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  section_count?: number;
  mapped_controls_count?: number;
}

export interface FrameworkOption {
  id: string;
  name: string;
  code: string;
}

export const POLICY_TYPES: { value: string; label: string }[] = [
  { value: 'security_policy', label: 'Information security' },
  { value: 'access_control_policy', label: 'Access control' },
  { value: 'acceptable_use_policy', label: 'Acceptable use' },
  { value: 'data_governance_policy', label: 'Data governance and classification' },
  { value: 'privacy_policy', label: 'Privacy' },
  { value: 'hipaa_security_policy', label: 'HIPAA privacy and security' },
  { value: 'incident_response_policy', label: 'Incident response' },
  { value: 'business_continuity_policy', label: 'Business continuity and disaster recovery' },
  { value: 'change_management_policy', label: 'Change management' },
  { value: 'vendor_management_policy', label: 'Vendor and third-party management' },
  { value: 'risk_management_policy', label: 'Risk management' },
  { value: 'ai_governance_policy', label: 'AI governance' },
  { value: 'other_policy', label: 'Other' },
];

export function policyTypeLabel(value: string): string {
  return POLICY_TYPES.find((t) => t.value === value)?.label || value.replace(/_/g, ' ');
}

export const STATUS_META: Record<PolicyStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  under_review: { label: 'Under review', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
  published: { label: 'Published', className: 'bg-green-100 text-green-800' },
  archived: { label: 'Archived', className: 'bg-gray-200 text-gray-500' },
};

interface StatusBadgeProps {
  status: PolicyStatus;
}

export function PolicyStatusBadge({ status }: StatusBadgeProps) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
}

export function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  return new Date(value).getTime() < Date.now();
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white rounded-lg shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputClass = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
export const primaryButton = 'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50';
export const secondaryButton = 'px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50';
