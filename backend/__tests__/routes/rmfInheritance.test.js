'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next()
}));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../../src/config/database');
const router = require('../../src/routes/rmfInheritance');
const { normalizeInheritedControls } = router;
const { invokeRoute, makeReq, makeRes } = require('./_testUtils');

function makeClient(queryImpl) {
  return { query: jest.fn(queryImpl), release: jest.fn() };
}

describe('rmfInheritance.normalizeInheritedControls', () => {
  it('rejects a non-array value', () => {
    expect(normalizeInheritedControls('AC-2').error).toBeDefined();
  });

  it('trims, uppercases, and dedupes control identifiers', () => {
    const result = normalizeInheritedControls([' ac-2 ', 'AC-2', 'pe-3']);
    expect(JSON.parse(result.value)).toEqual(['AC-2', 'PE-3']);
  });

  it('rejects more than 500 entries', () => {
    const many = Array.from({ length: 501 }, (_, i) => `AC-${i}`);
    expect(normalizeInheritedControls(many).error).toMatch(/500/);
  });

  it('rejects an identifier longer than 40 characters', () => {
    const tooLong = 'A'.repeat(41);
    expect(normalizeInheritedControls([tooLong]).error).toMatch(/40/);
  });

  it('accepts an empty array', () => {
    expect(JSON.parse(normalizeInheritedControls([]).value)).toEqual([]);
  });

  it('defaults to an empty array when omitted', () => {
    expect(JSON.parse(normalizeInheritedControls(undefined).value)).toEqual([]);
  });
});

describe('POST /packages/:id/leveraged-authorizations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when the package is not in the org', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM rmf_packages')) return { rows: [] };
      return { rows: [] };
    }));

    const req = makeReq({ params: { id: 'pkg-missing' }, body: { cots_product_id: 'cots-1' } });
    const res = makeRes();
    await invokeRoute(router, 'post', '/packages/:id/leveraged-authorizations', req, res);

    expect(res.statusCode).toBe(404);
    expect(res._json.error).toMatch(/RMF package not found/);
  });

  it('returns 404 when the COTS product is not in the org', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM rmf_packages')) return { rows: [{ id: 'pkg-1', current_step: 'implement' }] };
      if (sql.includes('FROM cots_products')) return { rows: [] };
      return { rows: [] };
    }));

    const req = makeReq({ params: { id: 'pkg-1' }, body: { cots_product_id: 'cots-missing' } });
    const res = makeRes();
    await invokeRoute(router, 'post', '/packages/:id/leveraged-authorizations', req, res);

    expect(res.statusCode).toBe(404);
    expect(res._json.error).toMatch(/COTS product not found/);
  });

  it('rejects a retired product with 400', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM rmf_packages')) return { rows: [{ id: 'pkg-1', current_step: 'implement' }] };
      if (sql.includes('FROM cots_products')) {
        return { rows: [{ id: 'cots-1', product_name: 'Old App', lifecycle_status: 'retired' }] };
      }
      return { rows: [] };
    }));

    const req = makeReq({ params: { id: 'pkg-1' }, body: { cots_product_id: 'cots-1' } });
    const res = makeRes();
    await invokeRoute(router, 'post', '/packages/:id/leveraged-authorizations', req, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toMatch(/Retired products/);
  });

  it('rejects an invalid inheritance_type with 400', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM rmf_packages')) return { rows: [{ id: 'pkg-1', current_step: 'implement' }] };
      if (sql.includes('FROM cots_products')) {
        return { rows: [{ id: 'cots-1', product_name: 'App', lifecycle_status: 'active' }] };
      }
      return { rows: [] };
    }));

    const req = makeReq({
      params: { id: 'pkg-1' },
      body: { cots_product_id: 'cots-1', inheritance_type: 'bogus' }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/packages/:id/leveraged-authorizations', req, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.error).toMatch(/inheritance_type/);
  });

  it('maps a unique-violation insert error to 409', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM rmf_packages')) return { rows: [{ id: 'pkg-1', current_step: 'implement' }] };
      if (sql.includes('FROM cots_products')) {
        return { rows: [{ id: 'cots-1', product_name: 'App', lifecycle_status: 'active' }] };
      }
      if (sql.includes('INSERT INTO rmf_leveraged_authorizations')) {
        const err = new Error('duplicate key');
        err.code = '23505';
        throw err;
      }
      return { rows: [] };
    }));

    const req = makeReq({
      params: { id: 'pkg-1' },
      body: { cots_product_id: 'cots-1' }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/packages/:id/leveraged-authorizations', req, res);

    expect(res.statusCode).toBe(409);
  });

  it('creates a link, records a history note, and commits on success', async () => {
    const calls = [];
    pool.connect.mockResolvedValue(makeClient(async (sql, params) => {
      calls.push(sql.trim().split('\n')[0]);
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('FROM rmf_packages')) return { rows: [{ id: 'pkg-1', current_step: 'implement' }] };
      if (sql.includes('FROM cots_products')) {
        return { rows: [{ id: 'cots-1', product_name: 'Acme App', lifecycle_status: 'active' }] };
      }
      if (sql.includes('INSERT INTO rmf_leveraged_authorizations')) {
        return { rows: [{ id: 'la-1', cots_product_id: 'cots-1', inheritance_type: 'partial' }] };
      }
      if (sql.includes('INSERT INTO rmf_step_history')) {
        expect(params[3]).toMatch(/Leveraged authorization added: Acme App/);
        return { rows: [] };
      }
      return { rows: [] };
    }));

    const req = makeReq({
      params: { id: 'pkg-1' },
      body: { cots_product_id: 'cots-1', inherited_controls: ['ac-2'] }
    });
    const res = makeRes();
    await invokeRoute(router, 'post', '/packages/:id/leveraged-authorizations', req, res);

    expect(res.statusCode).toBe(201);
    expect(calls).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
    expect(calls.indexOf('BEGIN')).toBeLessThan(calls.indexOf('COMMIT'));
  });
});

describe('DELETE /packages/:id/leveraged-authorizations/:linkId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when no matching link exists', async () => {
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('DELETE FROM rmf_leveraged_authorizations')) return { rows: [] };
      return { rows: [] };
    }));

    const req = makeReq({ params: { id: 'pkg-1', linkId: 'la-missing' } });
    const res = makeRes();
    await invokeRoute(router, 'delete', '/packages/:id/leveraged-authorizations/:linkId', req, res);

    expect(res.statusCode).toBe(404);
  });

  it('deletes, logs a history note, and commits on success', async () => {
    const calls = [];
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      calls.push(sql.trim().split('\n')[0]);
      if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('DELETE FROM rmf_leveraged_authorizations')) {
        return { rows: [{ product_name: 'Acme App', current_step: 'implement' }] };
      }
      if (sql.includes('INSERT INTO rmf_step_history')) return { rows: [] };
      return { rows: [] };
    }));

    const req = makeReq({ params: { id: 'pkg-1', linkId: 'la-1' } });
    const res = makeRes();
    await invokeRoute(router, 'delete', '/packages/:id/leveraged-authorizations/:linkId', req, res);

    expect(res.statusCode).toBe(200);
    expect(calls).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
  });

  it('rolls back when the delete query throws', async () => {
    const calls = [];
    pool.connect.mockResolvedValue(makeClient(async (sql) => {
      calls.push(sql.trim().split('\n')[0]);
      if (sql.includes('BEGIN') || sql.includes('ROLLBACK')) return {};
      if (sql.includes('DELETE FROM rmf_leveraged_authorizations')) {
        throw new Error('boom');
      }
      return { rows: [] };
    }));

    const req = makeReq({ params: { id: 'pkg-1', linkId: 'la-1' } });
    const res = makeRes();
    await invokeRoute(router, 'delete', '/packages/:id/leveraged-authorizations/:linkId', req, res);

    expect(res.statusCode).toBe(500);
    expect(calls).toContain('ROLLBACK');
  });
});

describe('GET /packages/:id/eligible-cots-products', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes the query by organization and excludes already-linked products', async () => {
    let capturedSql = '';
    let capturedParams = [];
    pool.query.mockImplementation(async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      if (sql.includes('FROM rmf_packages')) return { rows: [{ id: 'pkg-1', system_id: 'sys-1' }] };
      return { rows: [] };
    });

    const req = makeReq({ params: { id: 'pkg-1' }, user: { id: 'user-1', organization_id: 'org-42' } });
    const res = makeRes();
    await invokeRoute(router, 'get', '/packages/:id/eligible-cots-products', req, res);

    expect(res.statusCode).toBe(200);
    expect(capturedSql).toMatch(/NOT EXISTS/);
    expect(capturedSql).toMatch(/organization_id = \$1/);
    expect(capturedParams[0]).toBe('org-42');
  });
});
