// @tier: community
export interface ControlGroup<T> {
  controlId: string;
  items: T[];
}

export interface ControlFamilyGroup<T> {
  family: string;
  totalItems: number;
  controls: ControlGroup<T>[];
}

function normalizeForMatch(value: string) {
  return String(value || '').trim().toUpperCase();
}

export function deriveControlFamily(controlId: string) {
  const normalized = normalizeForMatch(controlId);
  if (!normalized) return 'UNMAPPED';

  const nistStyle = normalized.match(/^([A-Z]{1,6})-/);
  if (nistStyle) return nistStyle[1];

  const isoStyle = normalized.match(/^([A-Z]\.\d+)/);
  if (isoStyle) return isoStyle[1];

  const socStyle = normalized.match(/^([A-Z]{1,6}\d+)\./);
  if (socStyle) return socStyle[1];

  const genericSplit = normalized.split(/[.\-_\s:/]+/).filter(Boolean);
  return genericSplit[0] || 'UNMAPPED';
}

export function sameControlRef(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeForMatch(String(a || ''));
  const right = normalizeForMatch(String(b || ''));
  if (!left || !right) return false;
  return left === right;
}

export function groupByControlFamily<T>(
  items: T[],
  getControlId: (item: T) => string | null | undefined
): ControlFamilyGroup<T>[] {
  const familyMap = new Map<string, Map<string, T[]>>();

  for (const item of items) {
    const rawControlId = String(getControlId(item) || '').trim();
    const controlId = rawControlId || 'UNMAPPED';
    const family = deriveControlFamily(controlId);
    if (!familyMap.has(family)) {
      familyMap.set(family, new Map<string, T[]>());
    }
    const controlMap = familyMap.get(family)!;
    if (!controlMap.has(controlId)) {
      controlMap.set(controlId, []);
    }
    controlMap.get(controlId)!.push(item);
  }

  return Array.from(familyMap.entries())
    .map(([family, controlMap]) => {
      const controls = Array.from(controlMap.entries())
        .map(([controlId, groupedItems]) => ({
          controlId,
          items: groupedItems
        }))
        .sort((a, b) => a.controlId.localeCompare(b.controlId, undefined, { numeric: true, sensitivity: 'base' }));

      const totalItems = controls.reduce((sum, control) => sum + control.items.length, 0);
      return { family, controls, totalItems };
    })
    .sort((a, b) => a.family.localeCompare(b.family, undefined, { numeric: true, sensitivity: 'base' }));
}
