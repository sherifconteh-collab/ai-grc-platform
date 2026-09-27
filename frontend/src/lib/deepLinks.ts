/**
 * Every link that opens a specific record or action lives here, so there is one
 * place that knows which screen a record belongs on.
 *
 * Contract, checked in CI by scripts/check-ui-links.js:
 *   - each path below resolves to a page under src/app
 *   - each query parameter below is read by that page (searchParams.get('<name>'))
 * A link that points at a missing page, or passes a parameter the page ignores,
 * fails the build instead of dropping the user on the wrong screen.
 *
 * This edition has no ERP module and no Policies frontend page yet, so it has
 * no erpReview/policy record links that ControlWeaver-Pro carries.
 */
import type { MyWorkItem, SearchResult, SearchResultType } from './api';

const enc = encodeURIComponent;

export const recordLinks = {
  control: (id: string) => `/dashboard/controls/${enc(id)}`,
  controlUploadEvidence: (id: string) => `/dashboard/controls/${enc(id)}?action=upload-evidence`,
  risk: (id: string) => `/dashboard/risks/${enc(id)}`,
  riskReassess: (id: string) => `/dashboard/risks/${enc(id)}?action=reassess`,
  poam: (id: string) => `/dashboard/poam/${enc(id)}`,
  poamUpdateStatus: (id: string) => `/dashboard/poam/${enc(id)}?action=update-status`,
  poamReview: (id: string) => `/dashboard/poam/${enc(id)}?action=review`,
  poamList: (status: string) => `/dashboard/poam?status=${enc(status)}`,
  exception: (id: string) => `/dashboard/exceptions?open=${enc(id)}`,
  auditRequest: (id: string) => `/dashboard/requests/${enc(id)}`,
  vendor: (id: string) => `/dashboard/tprm?vendor=${enc(id)}`,
  evidence: (id: string) => `/dashboard/evidence?open=${enc(id)}`,
  asset: (id: string) => `/dashboard/assets/${enc(id)}`,
  incident: (id: string) => `/dashboard/incidents?open=${enc(id)}`,
  settings: (section: string) => `/dashboard/settings/${enc(section)}`,
  complianceOverview: () => '/dashboard/overview',
};

/** Create screens. Each target page opens its create form when it sees `new=1`. */
export const createLinks = {
  risk: () => '/dashboard/risks?new=1',
  poam: () => '/dashboard/poam?new=1',
  poamForControl: (controlId: string) => `/dashboard/poam?new=1&controlId=${enc(controlId)}`,
  poamForRisk: (riskId: string) => `/dashboard/poam?new=1&riskId=${enc(riskId)}`,
  evidence: () => '/dashboard/evidence?new=1',
  exception: () => '/dashboard/exceptions?new=1',
  exceptionForControl: (controlId: string) => `/dashboard/exceptions?new=1&controlId=${enc(controlId)}`,
  vendor: () => '/dashboard/tprm?new=1',
  incident: () => '/dashboard/incidents?new=1',
  asset: () => '/dashboard/assets?new=1',
};

export interface WorkAction {
  href: string;
  label: string;
  typeLabel: string;
}

/** The button on a My Work row: where it goes and what it says. */
export function workItemAction(item: MyWorkItem): WorkAction {
  switch (item.kind) {
    case 'control':
      return { href: recordLinks.controlUploadEvidence(item.record_id), label: 'Upload evidence', typeLabel: 'Control' };
    case 'poam':
      return { href: recordLinks.poamUpdateStatus(item.record_id), label: 'Update status', typeLabel: 'POA&M' };
    case 'poam_approval':
      return { href: recordLinks.poamReview(item.record_id), label: 'Review closure', typeLabel: 'POA&M approval' };
    case 'risk':
      return { href: recordLinks.riskReassess(item.record_id), label: 'Reassess', typeLabel: 'Risk' };
    case 'exception_approval':
      return { href: recordLinks.exception(item.record_id), label: 'Approve or reject', typeLabel: 'Exception' };
    case 'pbc':
      return { href: recordLinks.auditRequest(item.record_id), label: 'Respond', typeLabel: 'Audit request' };
    default: {
      const unreachable: never = item.kind;
      throw new Error(`No link for work item kind ${String(unreachable)}`);
    }
  }
}

const SEARCH_LINKS: Record<SearchResultType, (id: string) => string> = {
  control: recordLinks.control,
  risk: recordLinks.risk,
  poam: recordLinks.poam,
  vendor: recordLinks.vendor,
  evidence: recordLinks.evidence,
  asset: recordLinks.asset,
  incident: recordLinks.incident,
};

export const SEARCH_TYPE_LABELS: Record<SearchResultType, string> = {
  control: 'Control',
  risk: 'Risk',
  poam: 'POA&M',
  vendor: 'Vendor',
  evidence: 'Evidence',
  asset: 'Asset',
  incident: 'Incident',
};

export function searchResultHref(result: SearchResult): string {
  return SEARCH_LINKS[result.type](result.id);
}
