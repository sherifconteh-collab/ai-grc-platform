'use strict';

const crypto = require('crypto');
const { EventEmitter: MockEmitter } = require('events');

const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const mockPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const mockQuery = jest.fn();
const mockRequest = jest.fn();

jest.mock('../../src/config/database', () => ({ query: (...args) => mockQuery(...args) }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn() }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), readFileSync: jest.fn(() => mockPem) }));
jest.mock('http2', () => ({
  constants: { NGHTTP2_CANCEL: 8 },
  connect: jest.fn(() => {
    const session = new MockEmitter();
    session.closed = false;
    session.destroyed = false;
    session.unref = jest.fn();
    session.request = (headers) => mockRequest(headers);
    return session;
  })
}));

function fakeStream(status, body) {
  const stream = new MockEmitter();
  stream.setEncoding = jest.fn();
  stream.setTimeout = jest.fn();
  stream.close = jest.fn();
  stream.end = jest.fn(() => {
    setImmediate(() => {
      stream.emit('response', { ':status': status });
      if (body) stream.emit('data', JSON.stringify(body));
      stream.emit('close');
    });
  });
  return stream;
}

describe('pushService APNs (native HTTP/2, no apn package)', () => {
  let pushService;

  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
    mockRequest.mockReset();
    Object.assign(process.env, {
      APNS_KEY_ID: 'ABC1234567',
      APNS_TEAM_ID: 'TEAM123456',
      APNS_KEY_PATH: '/tmp/key.p8',
      APNS_BUNDLE_ID: 'com.example.app',
      APNS_PRODUCTION: 'false'
    });
    pushService = require('../../src/services/pushService');
  });

  it('posts an alert with a bearer ES256 provider token to the sandbox host', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ token: 'devtoken1', platform: 'ios' }] });
    mockRequest.mockImplementation(() => fakeStream(200));

    await pushService.sendPush('user-1', 'Title', 'Body', { controlId: 'AC-2' });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const headers = mockRequest.mock.calls[0][0];
    expect(headers[':path']).toBe('/3/device/devtoken1');
    expect(headers['apns-topic']).toBe('com.example.app');
    expect(headers['apns-push-type']).toBe('alert');
    expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const header = JSON.parse(Buffer.from(headers.authorization.split('.')[0].replace('bearer ', ''), 'base64url').toString());
    expect(header).toMatchObject({ alg: 'ES256', kid: 'ABC1234567' });
  });

  it('prunes tokens APNs reports as BadDeviceToken or gone', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ token: 'bad', platform: 'ios' }, { token: 'gone', platform: 'ios' }] })
      .mockResolvedValue({ rows: [] });
    mockRequest
      .mockImplementationOnce(() => fakeStream(400, { reason: 'BadDeviceToken' }))
      .mockImplementationOnce(() => fakeStream(410, { reason: 'Unregistered' }));

    await pushService.sendPush('user-1', 'T', 'B');

    const prune = mockQuery.mock.calls.find((c) => /DELETE FROM device_push_tokens/i.test(c[0]));
    expect(prune).toBeDefined();
    expect(prune[1][0].sort()).toEqual(['bad', 'gone']);
  });

  it('does nothing when APNs is not configured', async () => {
    delete process.env.APNS_KEY_ID;
    jest.resetModules();
    pushService = require('../../src/services/pushService');
    mockQuery.mockResolvedValueOnce({ rows: [{ token: 'x', platform: 'ios' }] });

    await pushService.sendPush('user-1', 'T', 'B');

    expect(mockRequest).not.toHaveBeenCalled();
  });
});
