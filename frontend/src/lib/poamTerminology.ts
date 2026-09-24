/**
 * Framework-appropriate names for remediation records.
 *
 * "POA&M" is NIST/FedRAMP vernacular. An ISO 27001 shop raises a Corrective
 * Action Request, a SOC 2 shop records a Deficiency, a FISCAM audit produces a
 * Corrective Action Plan. The backend has shipped all seven vocabularies in
 * services/frameworkPoamService.js since the feature was built, but the
 * endpoint that serves them (GET /poam/framework-types) was unreachable behind
 * a route-ordering bug, so nothing ever used them and the NIST label leaked
 * into every screen.
 *
 * Labels only. URLs, route paths, table names and API paths stay `poam`
 * everywhere -- renaming those would break existing links, bookmarks and every
 * screenshot in the docs for no user benefit.
 */

export interface RemediationTerms {
  /** Singular, title case: "POA&M Item", "Corrective Action Request". */
  singular: string;
  /** Plural, title case: "POA&M Items". */
  plural: string;
  /** Short form for tabs and nav: "POA&M", "CARs". */
  short: string;
  /** Lowercase mid-sentence form: "POA&M item", "corrective action request". */
  lower: string;
}

const GENERIC: RemediationTerms = {
  singular: 'Corrective Action Item',
  plural: 'Corrective Action Items',
  short: 'Corrective Actions',
  lower: 'corrective action item',
};

/**
 * Keyed by `frameworks.code` as seeded, which is also how
 * FRAMEWORK_POAM_TYPES is keyed in the backend service -- the two sides line up
 * without a translation table.
 */
const BY_FRAMEWORK: Record<string, RemediationTerms> = {
  nist_800_53: { singular: 'POA&M Item', plural: 'POA&M Items', short: 'POA&M', lower: 'POA&M item' },
  nist_800_171: { singular: 'POA&M Item', plural: 'POA&M Items', short: 'POA&M', lower: 'POA&M item' },
  nist_csf_2: { singular: 'POA&M Item', plural: 'POA&M Items', short: 'POA&M', lower: 'POA&M item' },
  fedramp: { singular: 'POA&M Item', plural: 'POA&M Items', short: 'POA&M', lower: 'POA&M item' },
  cmmc_2: { singular: 'POA&M Item', plural: 'POA&M Items', short: 'POA&M', lower: 'POA&M item' },
  fiscam: {
    singular: 'Corrective Action Plan',
    plural: 'Corrective Action Plans',
    short: 'CAPs',
    lower: 'corrective action plan',
  },
  iso_27001: {
    singular: 'Corrective Action Request',
    plural: 'Corrective Action Requests',
    short: 'CARs',
    lower: 'corrective action request',
  },
  iso_42001: {
    singular: 'Corrective Action Request',
    plural: 'Corrective Action Requests',
    short: 'CARs',
    lower: 'corrective action request',
  },
  soc2: { singular: 'Deficiency', plural: 'Deficiencies', short: 'Deficiencies', lower: 'deficiency' },
  hipaa: {
    singular: 'Corrective Action Plan',
    plural: 'Corrective Action Plans',
    short: 'CAPs',
    lower: 'corrective action plan',
  },
  pci_dss: {
    singular: 'Risk Assessment & Validation',
    plural: 'Risk Assessments & Validations',
    short: 'RAVs',
    lower: 'risk assessment and validation item',
  },
};

/**
 * Framework-specific type codes (as stored in
 * poam_approval_requests.framework_specific_type) to their vocabulary. Checked
 * first, because an item that declares its own type is more specific than
 * whatever the organization's primary framework happens to be.
 */
const BY_TYPE_CODE: Record<string, keyof typeof BY_FRAMEWORK> = {
  fiscam_cap: 'fiscam',
  fiscam_nfr: 'fiscam',
  iso_car: 'iso_27001',
  iso_ofi: 'iso_27001',
  soc2_exception: 'soc2',
  soc2_deficiency: 'soc2',
  hipaa_cap: 'hipaa',
  pci_rav: 'pci_dss',
  nist_poam: 'nist_800_53',
  fedramp_poam: 'fedramp',
};

function normalize(code: string | null | undefined): string {
  // Seeded codes use dots in places ('nist_csf_2.0', 'cmmc_2.0'); the map keys
  // do not, so strip everything after the major version.
  return String(code || '').toLowerCase().replace(/\.\d+$/, '');
}

/**
 * Resolve the terms to display.
 *
 * Order matters and is deliberate:
 *   1. the item's own `framework_specific_type`, when it has one;
 *   2. the framework its controls belong to;
 *   3. the organization's primary active framework;
 *   4. the framework-neutral fallback.
 *
 * Never throws and never returns undefined -- a screen must always have a word
 * for the thing it is showing.
 */
export function remediationTerms(options?: {
  frameworkSpecificType?: string | null;
  frameworkCode?: string | null;
  activeFrameworkCodes?: (string | null | undefined)[];
}): RemediationTerms {
  const typeCode = String(options?.frameworkSpecificType || '').toLowerCase();
  if (typeCode && typeCode !== 'standard' && BY_TYPE_CODE[typeCode]) {
    return BY_FRAMEWORK[BY_TYPE_CODE[typeCode]] || GENERIC;
  }

  const direct = BY_FRAMEWORK[normalize(options?.frameworkCode)];
  if (direct) return direct;

  for (const code of options?.activeFrameworkCodes || []) {
    const match = BY_FRAMEWORK[normalize(code)];
    if (match) return match;
  }

  return GENERIC;
}

/** The neutral default, for screens with no framework context at all. */
export const genericRemediationTerms = GENERIC;
