'use strict';

const { buildSystemSecurityPlan, OSCAL_VERSION } = require('../../src/services/oscalService');

function basePkg(overrides = {}) {
  return {
    id: 'pkg-1',
    system_name: 'Test System',
    system_description: 'A test system.',
    categorization_level: 'moderate',
    confidentiality_impact: 'moderate',
    integrity_impact: 'high',
    availability_impact: 'low',
    overall_status: 'authorized',
    authorization_boundary: 'The cloud VPC and its subnets.',
    selected_baseline: 'moderate',
    ...overrides
  };
}

function leveragedAuth(overrides = {}) {
  return {
    id: 'la-1',
    cots_product_id: 'cots-1',
    product_name: 'Acme Cloud CRM',
    vendor_name: 'Acme Inc',
    product_type: 'saas',
    inheritance_type: 'partial',
    status: 'active',
    authorization_reference: 'FR12345678',
    authorization_status: 'fedramp_authorized',
    inherited_controls: ['AC-2', 'pe-3', 'AC-2'],
    provider_responsibilities: 'Acme manages physical and network security.',
    customer_responsibilities: 'Customer manages user provisioning.',
    created_at: '2026-01-01T00:00:00.000Z',
    notes: null,
    ...overrides
  };
}

describe('oscalService.buildSystemSecurityPlan', () => {
  it('produces a valid skeleton for a package with no leveraged authorizations', () => {
    const ssp = buildSystemSecurityPlan(basePkg(), [], null);
    const plan = ssp['system-security-plan'];

    expect(plan.uuid).toBe('pkg-1');
    expect(plan.metadata['oscal-version']).toBe(OSCAL_VERSION);
    expect(plan['system-characteristics']['system-name']).toBe('Test System');
    expect(plan['system-implementation'].components).toEqual([]);
    expect(plan['system-implementation']['leveraged-authorizations']).toBeUndefined();
    expect(plan['control-implementation']['implemented-requirements']).toEqual([]);
  });

  it('maps FIPS-199 CIA impact levels onto security-impact-level', () => {
    const ssp = buildSystemSecurityPlan(basePkg(), [], null);
    const impact = ssp['system-security-plan']['system-characteristics']['security-impact-level'];

    expect(impact['security-objective-confidentiality']).toBe('fips-199-moderate');
    expect(impact['security-objective-integrity']).toBe('fips-199-high');
    expect(impact['security-objective-availability']).toBe('fips-199-low');
  });

  it('emits one leveraged-authorization entry and one component per linked product', () => {
    const ssp = buildSystemSecurityPlan(basePkg(), [leveragedAuth()], null);
    const impl = ssp['system-security-plan']['system-implementation'];

    expect(impl['leveraged-authorizations']).toHaveLength(1);
    expect(impl['leveraged-authorizations'][0].title).toBe('Acme Cloud CRM (Acme Inc)');
    expect(impl.components).toHaveLength(1);
    expect(impl.components[0].type).toBe('service');
  });

  it('deduplicates and normalizes inherited controls into implemented-requirements', () => {
    const ssp = buildSystemSecurityPlan(basePkg(), [leveragedAuth()], null);
    const reqs = ssp['system-security-plan']['control-implementation']['implemented-requirements'];
    const controlIds = reqs.map(r => r['control-id']);

    // "AC-2" appears twice (once duplicated, once different case) in the fixture and
    // must collapse to a single implemented-requirement.
    expect(controlIds).toEqual(expect.arrayContaining(['ac-2', 'pe-3']));
    expect(controlIds).toHaveLength(2);
  });

  it('unions controls across multiple leveraged products under one requirement each', () => {
    const second = leveragedAuth({
      id: 'la-2',
      cots_product_id: 'cots-2',
      product_name: 'Other SaaS',
      vendor_name: 'Other Inc',
      inherited_controls: ['AC-2', 'IA-2']
    });
    const ssp = buildSystemSecurityPlan(basePkg(), [leveragedAuth(), second], null);
    const reqs = ssp['system-security-plan']['control-implementation']['implemented-requirements'];
    const ac2 = reqs.find(r => r['control-id'] === 'ac-2');

    expect(ac2['by-components']).toHaveLength(2);
  });

  it('includes provider/customer responsibility props on by-components', () => {
    const ssp = buildSystemSecurityPlan(basePkg(), [leveragedAuth()], null);
    const reqs = ssp['system-security-plan']['control-implementation']['implemented-requirements'];
    const byComponent = reqs[0]['by-components'][0];
    const propNames = byComponent.props.map(p => p.name);

    expect(propNames).toEqual(expect.arrayContaining(['provider-responsibility', 'customer-responsibility']));
  });
});
