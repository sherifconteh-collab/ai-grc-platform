'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-min-32-chars-xxxxxxxxxxx';

const mockMiddleware = [];
jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    use: (fn) => mockMiddleware.push(fn),
    on: jest.fn(),
    adapter: jest.fn()
  }))
}));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: (e) => e }));

const jwt = require('jsonwebtoken');
const pool = require('../../src/config/database');
const { JWT_SECRET, JWT_ALGORITHM } = require('../../src/config/security');
const { initializeWebSocket } = require('../../src/services/websocketService');

const sign = (payload) => jwt.sign({ userId: 'user-1', ...payload }, JWT_SECRET, { algorithm: JWT_ALGORITHM, expiresIn: '1h' });

async function handshake(token) {
  const socket = { handshake: { auth: { token }, query: {} } };
  const next = jest.fn();
  await mockMiddleware[0](socket, next);
  return { socket, next };
}

describe('WebSocket handshake token types', () => {
  beforeAll(() => {
    initializeWebSocket({});
  });

  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 'user-1', email: 'a@b.co', organization_id: 'org-1', role: 'user' }] });
  });

  it('refuses a refresh token without touching the database', async () => {
    const { socket, next } = await handshake(sign({ type: 'refresh', jti: 'abc' }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(socket.user).toBeUndefined();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('still refuses a service account token', async () => {
    const { next } = await handshake(sign({ type: 'service_account' }));
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('accepts an ordinary access token', async () => {
    const { socket, next } = await handshake(sign({}));
    expect(next).toHaveBeenCalledWith();
    expect(socket.user).toMatchObject({ id: 'user-1', organization_id: 'org-1' });
  });
});
