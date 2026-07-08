// @tier: enterprise
/**
 * OSCAL Serializer – NIST OSCAL 1.1.2 System Security Plan export.
 *
 * Pure functions only (no DB access): callers fetch the RMF package, its
 * leveraged authorizations, and the active authorization decision, then this
 * module shapes them into an OSCAL SSP JSON document. Inherited controls come
 * from rmf_leveraged_authorizations.inherited_controls (JSONB string arrays).
 */

const { randomUUID } = require('crypto');

const OSCAL_VERSION = '1.1.2';

const IMPACT_LEVELS = new Set(['low', 'moderate', 'high']);

function normalizeImpact(value) {
  const v = String(value || '').toLowerCase();
  return IMPACT_LEVELS.has(v) ? `fips-199-${v}` : undefined;
}

function packageStatusToOscal(overallStatus) {
  switch (String(overallStatus || '').toLowerCase()) {
    case 'authorized': return 'operational';
    case 'denied':
    case 'revoked': return 'disposition';
    case 'not_started': return 'under-development';
    default: return 'under-development';
  }
}

function parseControls(raw) {
  if (Array.isArray(raw)) return raw.map(c => String(c));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(c => String(c)) : [];
    } catch (_err) {
      return [];
    }
  }
  return [];
}

/**
 * Build an OSCAL system-security-plan document.
 *
 * @param {object} pkg            rmf_packages row
 * @param {object[]} leveragedAuths rmf_leveraged_authorizations rows joined
 *                                 with cots_products (product_name, vendor_name,
 *                                 product_type, external_authorization_id)
 * @param {object|null} activeDecision active rmf_authorization_decisions row
 * @returns {object} { 'system-security-plan': {...} }
 */
function buildSystemSecurityPlan(pkg, leveragedAuths = [], activeDecision = null) {
  const now = new Date().toISOString();

  const impactLevel = {};
  const confidentiality = normalizeImpact(pkg.confidentiality_impact);
  const integrity = normalizeImpact(pkg.integrity_impact);
  const availability = normalizeImpact(pkg.availability_impact);
  if (confidentiality) impactLevel['security-objective-confidentiality'] = confidentiality;
  if (integrity) impactLevel['security-objective-integrity'] = integrity;
  if (availability) impactLevel['security-objective-availability'] = availability;

  const leveragedEntries = leveragedAuths.map(la => {
    const entry = {
      uuid: la.id,
      title: `${la.product_name} (${la.vendor_name})`,
      'date-authorized': activeDecision?.decision_date
        ? String(activeDecision.decision_date).slice(0, 10)
        : String(la.created_at).slice(0, 10),
      props: [
        { name: 'inheritance-type', ns: 'https://controlweave.io/ns/oscal', value: la.inheritance_type },
        { name: 'link-status', ns: 'https://controlweave.io/ns/oscal', value: la.status }
      ]
    };
    const reference = la.authorization_reference || la.external_authorization_id;
    if (reference) {
      entry.props.push({ name: 'authorization-reference', ns: 'https://controlweave.io/ns/oscal', value: reference });
    }
    if (la.notes) entry.remarks = la.notes;
    return entry;
  });

  const components = leveragedAuths.map(la => ({
    uuid: la.cots_product_id,
    type: la.product_type === 'saas' ? 'service' : 'software',
    title: la.product_name,
    description: `Leveraged ${la.product_type || 'COTS'} product from ${la.vendor_name}.`,
    props: la.authorization_status
      ? [{ name: 'authorization-status', ns: 'https://controlweave.io/ns/oscal', value: la.authorization_status }]
      : [],
    status: { state: la.status === 'active' ? 'operational' : 'other' }
  }));

  // One implemented-requirement per distinct control, annotated with every
  // providing component and the shared-responsibility statements. Control ids
  // are case-normalized and deduped per leveraged authorization so a product
  // whose control list contains repeats or mixed case doesn't appear twice in
  // the same requirement's by-components.
  const controlMap = new Map();
  leveragedAuths.forEach(la => {
    const controls = new Set(parseControls(la.inherited_controls).map(c => c.toUpperCase()));
    controls.forEach(controlId => {
      if (!controlMap.has(controlId)) controlMap.set(controlId, new Map());
      controlMap.get(controlId).set(la.id, la);
    });
  });

  const implementedRequirements = [...controlMap.entries()].map(([controlId, providersById]) => ({
    // OSCAL requires uuid fields to be RFC 4122 UUIDs (schema validation fails on slug-style ids).
    uuid: randomUUID(),
    'control-id': controlId.toLowerCase(),
    props: [
      { name: 'implementation-status', ns: 'https://controlweave.io/ns/oscal', value: 'inherited' }
    ],
    'by-components': [...providersById.values()].map(la => {
      const byComponent = {
        'component-uuid': la.cots_product_id,
        uuid: randomUUID(),
        description: `Inherited from ${la.product_name} (${la.inheritance_type}).`
      };
      if (la.provider_responsibilities || la.customer_responsibilities) {
        byComponent.props = [];
        if (la.provider_responsibilities) {
          byComponent.props.push({ name: 'provider-responsibility', ns: 'https://controlweave.io/ns/oscal', value: la.provider_responsibilities });
        }
        if (la.customer_responsibilities) {
          byComponent.props.push({ name: 'customer-responsibility', ns: 'https://controlweave.io/ns/oscal', value: la.customer_responsibilities });
        }
      }
      return byComponent;
    })
  }));

  const systemCharacteristics = {
    'system-ids': [{ id: pkg.id, 'identifier-type': 'https://controlweave.io' }],
    'system-name': pkg.system_name,
    description: pkg.system_description || pkg.system_name,
    'security-sensitivity-level': pkg.categorization_level || undefined,
    'security-impact-level': Object.keys(impactLevel).length ? impactLevel : undefined,
    status: { state: packageStatusToOscal(pkg.overall_status) },
    'authorization-boundary': {
      description: pkg.authorization_boundary || 'Authorization boundary not yet documented.'
    }
  };

  return {
    'system-security-plan': {
      uuid: pkg.id,
      metadata: {
        title: `System Security Plan – ${pkg.system_name}`,
        'last-modified': now,
        version: '1.0.0',
        'oscal-version': OSCAL_VERSION
      },
      'import-profile': {
        href: pkg.selected_baseline
          ? `#baseline-${String(pkg.selected_baseline).toLowerCase()}`
          : '#baseline-unspecified'
      },
      'system-characteristics': systemCharacteristics,
      'system-implementation': {
        'leveraged-authorizations': leveragedEntries.length ? leveragedEntries : undefined,
        components,
        remarks: leveragedEntries.length
          ? `${leveragedEntries.length} leveraged authorization(s) inherited from COTS/SaaS products.`
          : 'No leveraged authorizations recorded.'
      },
      'control-implementation': {
        description: 'Control implementations inherited via leveraged authorizations.',
        'implemented-requirements': implementedRequirements
      }
    }
  };
}

module.exports = { buildSystemSecurityPlan, OSCAL_VERSION };
