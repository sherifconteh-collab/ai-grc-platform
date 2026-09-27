import type { LucideIcon } from 'lucide-react';
import { ClipboardList, Dices, FileText, Link2, Server, Siren, TriangleAlert } from 'lucide-react';
import { AccessUser, hasPermission } from '@/lib/access';
import { createLinks, recordLinks } from '@/lib/deepLinks';

export interface CreateAction {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
}

/**
 * What "+ New" can create. Each href opens that module's own create form
 * (the page reads `new=1`), so the form, validation and permissions are the
 * ones the module already has. This edition has no Policies frontend page,
 * so there is no "New policy" entry here.
 */
export const CREATE_ACTIONS: CreateAction[] = [
  { label: 'Evidence', href: createLinks.evidence(), icon: FileText, permission: 'evidence.write' },
  { label: 'Risk', href: createLinks.risk(), icon: Dices, permission: 'risks.write' },
  { label: 'POA&M item', href: createLinks.poam(), icon: ClipboardList, permission: 'controls.write' },
  { label: 'Exception', href: createLinks.exception(), icon: TriangleAlert, permission: 'controls.write' },
  { label: 'Vendor', href: createLinks.vendor(), icon: Link2, permission: 'tprm.write' },
  { label: 'Incident', href: createLinks.incident(), icon: Siren, permission: 'incidents.write' },
  { label: 'Asset', href: createLinks.asset(), icon: Server, permission: 'assets.write' },
];

export function visibleCreateActions(user: AccessUser | null | undefined): CreateAction[] {
  return CREATE_ACTIONS.filter((a) => hasPermission(user, a.permission));
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CONTROL_PAGE = new RegExp(`^/dashboard/controls/(${UUID})$`, 'i');
const RISK_PAGE = new RegExp(`^/dashboard/risks/(${UUID})$`, 'i');

/**
 * On a record's own page, "+ New" first offers the things you would create
 * for that record, already linked to it.
 */
export function contextCreateActions(pathname: string, user: AccessUser | null | undefined, recordLabel?: string): CreateAction[] {
  const control = pathname.match(CONTROL_PAGE);
  const label = recordLabel ? ` for ${recordLabel}` : ' for this control';
  if (control) {
    return [
      { label: `Evidence${label}`, href: recordLinks.controlUploadEvidence(control[1]), icon: FileText, permission: 'evidence.write' },
      { label: `POA&M item${label}`, href: createLinks.poamForControl(control[1]), icon: ClipboardList, permission: 'controls.write' },
      { label: `Exception${label}`, href: createLinks.exceptionForControl(control[1]), icon: TriangleAlert, permission: 'controls.write' },
    ].filter((a) => hasPermission(user, a.permission));
  }
  const risk = pathname.match(RISK_PAGE);
  if (risk) {
    return [
      { label: 'POA&M item for this risk', href: createLinks.poamForRisk(risk[1]), icon: ClipboardList, permission: 'controls.write' },
    ].filter((a) => hasPermission(user, a.permission));
  }
  return [];
}
