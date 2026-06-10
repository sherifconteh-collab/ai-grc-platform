'use strict';

/**
 * Regression tests for the monolith split (4.1).
 *
 * These tests lock in the public contracts of the extracted helper/config
 * modules so future refactors cannot silently drop exports or change return
 * shapes. They do NOT require a database — only the pure-function parts of
 * the modules are exercised here.
 */

describe('monolith-split: services/ai/providerConfig', () => {
  const providerConfig = require('../../src/services/ai/providerConfig');

  test('exports the expected symbols', () => {
    expect(Object.keys(providerConfig).sort()).toEqual([
      'FEATURE_TASK_PROFILE',
      'PROVIDERS',
      'TASK_PROFILES',
      'resolveTaskModel',
    ]);
  });

  test('PROVIDERS has all six supported providers', () => {
    expect(Object.keys(providerConfig.PROVIDERS).sort())
      .toEqual(['claude', 'gemini', 'grok', 'groq', 'ollama', 'openai']);
  });

  test('resolveTaskModel returns profile temperature when no override', () => {
    const res = providerConfig.resolveTaskModel('claude', 'evidence_suggestion');
    expect(res.temperature).toBe(0.2);
    expect(typeof res.model).toBe('string');
  });

  test('resolveTaskModel preserves profile temperature with callerModel override', () => {
    const res = providerConfig.resolveTaskModel('claude', 'gap_analysis', 'custom-model');
    expect(res.model).toBe('custom-model');
    expect(res.temperature).toBe(0.4);
  });
});

describe('monolith-split: services/ai/prompts', () => {
  const prompts = require('../../src/services/ai/prompts');

  test('exports the expected symbols', () => {
    expect(Object.keys(prompts).sort()).toEqual([
      'GRC_CORE',
      'GRC_MODULES',
      'GRC_SYSTEM',
      'PROMPT_PROFILES',
      'buildGrcSystem',
    ]);
  });

  test('buildGrcSystem("full") includes all modules', () => {
    const out = prompts.buildGrcSystem('full');
    expect(out).toContain('GRC (Governance, Risk, and Compliance)');
    expect(out).toContain('NIST Publications');
    expect(out).toContain('MITRE ATT&CK');
    expect(out).toContain('MAESTRO');
  });

  test('buildGrcSystem("lean") returns only the core prompt', () => {
    const out = prompts.buildGrcSystem('lean');
    expect(out).toContain('GRC (Governance, Risk, and Compliance)');
    expect(out).not.toContain('NIST Publications');
  });

  test('GRC_SYSTEM equals buildGrcSystem("full")', () => {
    expect(prompts.GRC_SYSTEM).toBe(prompts.buildGrcSystem('full'));
  });
});

describe('monolith-split: llmService public API is preserved', () => {
  const llm = require('../../src/services/llmService');

  test('re-exports providerConfig symbols on the public module', () => {
    const providerConfig = require('../../src/services/ai/providerConfig');
    expect(llm.PROVIDERS).toBe(providerConfig.PROVIDERS);
    expect(llm.TASK_PROFILES).toBe(providerConfig.TASK_PROFILES);
    expect(llm.FEATURE_TASK_PROFILE).toBe(providerConfig.FEATURE_TASK_PROFILE);
    expect(llm.resolveTaskModel).toBe(providerConfig.resolveTaskModel);
  });

  test('re-exports prompts symbols on the public module', () => {
    const prompts = require('../../src/services/ai/prompts');
    expect(llm.PROMPT_PROFILES).toBe(prompts.PROMPT_PROFILES);
    expect(llm.buildGrcSystem).toBe(prompts.buildGrcSystem);
  });
});

describe('monolith-split: routes/assessments/_shared', () => {
  const shared = require('../../src/routes/assessments/_shared');

  test('exports the expected constants', () => {
    expect(shared.VALID_ENGAGEMENT_TYPES).toEqual(['internal_audit', 'external_audit', 'readiness', 'assessment']);
    expect(shared.VALID_FINDING_SEVERITIES).toContain('critical');
    expect(shared.TEMPLATE_MAX_CHARS).toBe(250000);
    expect(Array.isArray(shared.SIGNOFF_ROLE_CONFIG)).toBe(true);
  });

  test('pure helpers behave identically to original definitions', () => {
    expect(shared.toInt('42', 0)).toBe(42);
    expect(shared.toInt('nope', 7)).toBe(7);
    expect(shared.parseFrameworkCodes('nist, iso_27001,soc2')).toEqual(['nist', 'iso_27001', 'soc2']);
    expect(shared.truncateText('hello world', 5)).toEqual({ value: 'hello', truncated: true });
    expect(shared.normalizeNullableText('  ')).toBeNull();
    expect(shared.normalizeNullableText('  a  ')).toBe('a');
    expect(shared.parseBooleanFlag('true', false)).toBe(true);
    expect(shared.parseBooleanFlag('no', true)).toBe(false);
    expect(shared.parseBooleanFlag(undefined, true)).toBe(true);
  });

  test('assertEngagementChildAccess helper is present and is a function', () => {
    expect(typeof shared.assertEngagementChildAccess).toBe('function');
  });
});

describe('monolith-split: routes/organizations/_helpers', () => {
  const helpers = require('../../src/routes/organizations/_helpers');

  test('exports every constant referenced from organizations.js', () => {
    // Regression for PR review feedback: the original split omitted these
    // exports and would have ReferenceError'd at request time. Lock them in.
    const REQUIRED = [
      'RMF_FRAMEWORK_CODES',
      'VALID_DEPLOYMENT_MODELS',
      'VALID_DATA_SENSITIVITY_TYPES',
      'NIST_800_53_REQUIRED_INFORMATION_TYPE_CODES',
      'VALID_CONTROL_IMPLEMENTATION_STATUSES',
      'VALID_CRITICALITY_LEVELS',
      'VALID_COTS_PRODUCT_TYPES',
      'VALID_COTS_LIFECYCLE_STATUSES',
      'VALID_COTS_DEPLOYMENT_MODELS',
      'VALID_COTS_DATA_ACCESS_LEVELS',
      'VALID_CONTRACT_TYPES',
      'VALID_CONTRACT_STATUSES',
    ];
    for (const name of REQUIRED) {
      expect(helpers[name]).toBeInstanceOf(Set);
    }
  });

  test('exports the expected constants', () => {
    expect(helpers.VALID_CIA_LEVELS.has('low')).toBe(true);
    expect(helpers.VALID_RMF_STAGES.has('authorize')).toBe(true);
    expect(helpers.VALID_COMPLIANCE_PROFILES.has('federal')).toBe(true);
    expect(helpers.STRICT_CROSSWALK_MAPPING_TYPES).toEqual(['equivalent', 'exact']);
  });

  test('escapeIlike escapes %, _ and backslash', () => {
    expect(helpers.escapeIlike('100%_test\\data')).toBe('100\\%\\_test\\\\data');
  });

  test('toBoolean coerces common truthy/falsy representations', () => {
    expect(helpers.toBoolean('true')).toBe(true);
    expect(helpers.toBoolean('false')).toBe(false);
    expect(helpers.toBoolean('yes')).toBe(true);
    expect(helpers.toBoolean('no')).toBe(false);
    expect(helpers.toBoolean(undefined, true)).toBe(true);
  });

  test('toNullableString trims and returns null for empty', () => {
    expect(helpers.toNullableString('  hi  ')).toBe('hi');
    expect(helpers.toNullableString('   ')).toBeNull();
    expect(helpers.toNullableString(null)).toBeNull();
  });

  test('verifyOrgAccess returns orgId when it matches the user org', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const ok = helpers.verifyOrgAccess(
      { params: { orgId: 'abc' }, user: { organization_id: 'abc' } },
      res
    );
    expect(ok).toBe('abc');
    expect(res.status).not.toHaveBeenCalled();
  });

  test('verifyOrgAccess returns null and sends 403 when org mismatches', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const bad = helpers.verifyOrgAccess(
      { params: { orgId: 'abc' }, user: { organization_id: 'xyz' } },
      res
    );
    expect(bad).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

describe('monolith-split: router modules still load and preserve stack size', () => {
  // routes/assessments.js is now a thin aggregator mounting sub-routers.
  // Pin each sub-router's route count so accidental route loss is caught.
  // The original monolith registered exactly 43 routes
  // (router.get/post/put/patch/delete occurrences) before the split.
  const ASSESSMENT_SUBROUTER_ROUTE_COUNTS = {
    procedures: 8, // procedures x3, results, stats, frameworks, plans x2
    templates: 5,
    engagements: 6,
    pbc: 5,
    workpapers: 4,
    findings: 4,
    signoffs: 5,
    links: 6,
  };
  const ORIGINAL_MONOLITH_ROUTE_COUNT = 43;

  function countRoutes(router) {
    return router.stack.filter((layer) => layer.route).length;
  }

  test('routes/assessments exports an Express router (aggregator)', () => {
    const router = require('../../src/routes/assessments');
    expect(typeof router).toBe('function');
    expect(Array.isArray(router.stack)).toBe(true);
    // authenticate + 8 mounted sub-routers + multer error handler = 10 layers.
    expect(router.stack.length).toBe(10);
  });

  test.each(Object.entries(ASSESSMENT_SUBROUTER_ROUTE_COUNTS))(
    'routes/assessments/%s exposes the pinned number of routes',
    (name, expectedCount) => {
      const subRouter = require(`../../src/routes/assessments/${name}`);
      expect(typeof subRouter).toBe('function');
      expect(countRoutes(subRouter)).toBe(expectedCount);
    }
  );

  test('sub-router route totals equal the original monolith route count', () => {
    const total = Object.keys(ASSESSMENT_SUBROUTER_ROUTE_COUNTS)
      .map((name) => require(`../../src/routes/assessments/${name}`))
      .reduce((sum, subRouter) => sum + countRoutes(subRouter), 0);
    expect(total).toBe(ORIGINAL_MONOLITH_ROUTE_COUNT);
  });

  test('every route in the assessments tree still has at least one auth/permission middleware plus handler', () => {
    for (const name of Object.keys(ASSESSMENT_SUBROUTER_ROUTE_COUNTS)) {
      const subRouter = require(`../../src/routes/assessments/${name}`);
      for (const layer of subRouter.stack) {
        if (!layer.route) continue;
        // Each route was registered with requirePermission(...) + handler
        // (some also carry extra middleware such as multer or ai.use).
        expect(layer.route.stack.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // routes/organizations.js is now a thin aggregator mounting sub-routers.
  // Pin each sub-router's route count so accidental route loss is caught.
  // The original monolith registered exactly 27 routes
  // (router.get/post/put/patch/delete occurrences) before the split.
  const ORGANIZATION_SUBROUTER_ROUTE_COUNTS = {
    profile: 2, // me/profile GET + PUT
    systems: 4,
    cotsProducts: 4,
    contracts: 4,
    frameworks: 3,
    controls: 3, // list, export, import
    multiOrg: 2, // me/new, me/clone
    children: 5,
  };
  const ORIGINAL_ORGANIZATIONS_ROUTE_COUNT = 27;

  test('routes/organizations exports an Express router (aggregator)', () => {
    // exceljs ships ESM internals Jest's CommonJS runtime cannot parse; the
    // router only needs it at request time, so stub it for the load test.
    jest.mock('exceljs', () => ({}));
    const router = require('../../src/routes/organizations');
    expect(typeof router).toBe('function');
    expect(Array.isArray(router.stack)).toBe(true);
    // authenticate + 8 mounted sub-routers = 9 layers.
    expect(router.stack.length).toBe(9);
  });

  test.each(Object.entries(ORGANIZATION_SUBROUTER_ROUTE_COUNTS))(
    'routes/organizations/%s exposes the pinned number of routes',
    (name, expectedCount) => {
      jest.mock('exceljs', () => ({}));
      const subRouter = require(`../../src/routes/organizations/${name}`);
      expect(typeof subRouter).toBe('function');
      expect(countRoutes(subRouter)).toBe(expectedCount);
    }
  );

  test('organizations sub-router route totals equal the original monolith route count', () => {
    jest.mock('exceljs', () => ({}));
    const total = Object.keys(ORGANIZATION_SUBROUTER_ROUTE_COUNTS)
      .map((name) => require(`../../src/routes/organizations/${name}`))
      .reduce((sum, subRouter) => sum + countRoutes(subRouter), 0);
    expect(total).toBe(ORIGINAL_ORGANIZATIONS_ROUTE_COUNT);
  });
});
