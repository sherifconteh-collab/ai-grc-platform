'use strict';

const { EventEmitter } = require('events');

jest.mock('../../src/services/auditService', () => ({ createAuditLog: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));
jest.mock('../../src/services/geolocationService', () => ({ extractIpFromRequest: () => '10.0.0.1' }));

const auditService = require('../../src/services/auditService');
const { markRequestAudited } = require('../../src/utils/auditContext');
const { auditBaseline, redactSensitive } = require('../../src/middleware/auditLog');

const ID = '123e4567-e89b-12d3-a456-426614174000';

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    originalUrl: '/api/v1/environments',
    baseUrl: '/api/v1/environments',
    path: '/',
    route: { path: '/' },
    params: {},
    headers: { 'user-agent': 'jest' },
    requestId: 'req-1',
    user: { id: 'user-1', organization_id: 'org-1', email: 'a@example.com' },
    ...overrides
  };
}

function run(req, { status = 201, handler } = {}) {
  const res = new EventEmitter();
  res.statusCode = status;
  auditBaseline(req, res, () => {
    if (handler) handler();
  });
  res.emit('finish');
}

describe('auditBaseline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auditService.createAuditLog.mockResolvedValue();
  });

  it('records a successful state-changing request without the body', () => {
    run(makeReq({ method: 'PUT', params: { id: ID }, route: { path: '/:id' }, body: { password: 'x' } }), { status: 200 });
    expect(auditService.createAuditLog).toHaveBeenCalledTimes(1);
    const entry = auditService.createAuditLog.mock.calls[0][0];
    expect(entry).toEqual(expect.objectContaining({
      organizationId: 'org-1',
      eventType: 'environments.update',
      resourceType: 'environments',
      resourceId: ID,
      success: true
    }));
    expect(JSON.stringify(entry.details)).not.toContain('password');
  });

  it('records a permission denial as a failed event', () => {
    run(makeReq(), { status: 403 });
    expect(auditService.createAuditLog.mock.calls[0][0]).toEqual(expect.objectContaining({
      eventType: 'environments.create.denied',
      success: false
    }));
  });

  it('does not duplicate a request the handler already audited', () => {
    run(makeReq(), { handler: () => markRequestAudited() });
    expect(auditService.createAuditLog).not.toHaveBeenCalled();
  });

  it('ignores reads, validation errors, unauthenticated calls and excluded paths', () => {
    run(makeReq({ method: 'GET' }), { status: 200 });
    run(makeReq(), { status: 400 });
    run(makeReq({ user: undefined }), { status: 201 });
    run(makeReq({ originalUrl: '/api/v1/auth/login', baseUrl: '/api/v1/auth' }), { status: 200 });
    expect(auditService.createAuditLog).not.toHaveBeenCalled();
  });
});

describe('redactSensitive', () => {
  it('masks secrets at any depth and keeps other fields', () => {
    const out = redactSensitive({ name: 'n', apiKey: 'k', nested: { newPassword: 'p', list: [{ token: 't', ok: 1 }] } });
    expect(out).toEqual({ name: 'n', apiKey: '[REDACTED]', nested: { newPassword: '[REDACTED]', list: [{ token: '[REDACTED]', ok: 1 }] } });
  });
});
