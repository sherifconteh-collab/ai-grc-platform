// mcp:logout must revoke the session server side (POST /auth/logout) before
// deleting the local session file, and say so clearly when the API is down.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { logout } = require('../../scripts/mcp-auth-logout');

function jwt(expSeconds) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS384' })}.${enc({ exp: expSeconds })}.sig`;
}

describe('mcp-auth-logout', () => {
  let dir;
  let file;
  let env;
  let lines;
  const out = (line) => lines.push(line);
  const realFetch = global.fetch;

  const freshToken = () => jwt(Math.floor(Date.now() / 1000) + 3600);
  const writeSession = (extra = {}) =>
    fs.writeFileSync(file, JSON.stringify({
      accessToken: freshToken(),
      refreshToken: 'refresh-token-value',
      email: 'user@example.com',
      apiBaseUrl: 'http://api.test/api/v1',
      ...extra
    }));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-logout-'));
    file = path.join(dir, 'mcp-session.json');
    env = { MCP_SESSION_FILE: file };
    lines = [];
  });
  afterEach(() => {
    global.fetch = realFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('calls POST /auth/logout with the stored token, then deletes the file', async () => {
    writeSession();
    const token = JSON.parse(fs.readFileSync(file, 'utf8')).accessToken;
    let fileExistedAtCall = null;
    global.fetch = jest.fn(async () => {
      fileExistedAtCall = fs.existsSync(file);
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    expect(await logout({ env, argv: [], out })).toBe(0);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/auth/logout');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(`Bearer ${token}`);
    expect(JSON.parse(opts.body)).toEqual({ refreshToken: 'refresh-token-value' });
    expect(fileExistedAtCall).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(lines.join('\n')).toMatch(/Server session: Server session revoked/);
  });

  test('refreshes an expired access token before calling logout', async () => {
    writeSession({ accessToken: jwt(Math.floor(Date.now() / 1000) - 60) });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { accessToken: 'renewed-token' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });

    expect(await logout({ env, argv: [], out })).toBe(0);

    expect(global.fetch.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/refresh');
    expect(global.fetch.mock.calls[1][0]).toBe('http://api.test/api/v1/auth/logout');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer renewed-token');
    expect(fs.existsSync(file)).toBe(false);
  });

  test('API unreachable: keeps the file, exits 1 and says the session was not revoked', async () => {
    writeSession();
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); });

    expect(await logout({ env, argv: [], out })).toBe(1);

    expect(fs.existsSync(file)).toBe(true);
    const text = lines.join('\n');
    expect(text).toMatch(/Logout NOT completed/);
    expect(text).toMatch(/Could not reach API at http:\/\/api\.test\/api\/v1/);
    expect(text).toMatch(/kept so you can retry/);
  });

  test('API server error: keeps the file and exits 1', async () => {
    writeSession();
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));

    expect(await logout({ env, argv: [], out })).toBe(1);
    expect(fs.existsSync(file)).toBe(true);
    expect(lines.join('\n')).toMatch(/HTTP 503/);
  });

  test('--force removes the file when the API is unreachable but still exits 1 with a warning', async () => {
    writeSession();
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); });

    expect(await logout({ env, argv: ['--force'], out })).toBe(1);

    expect(fs.existsSync(file)).toBe(false);
    expect(lines.join('\n')).toMatch(/Server session NOT revoked/);
  });

  test('401 means the server already rejects the token: file is removed, exit 0', async () => {
    writeSession();
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));

    expect(await logout({ env, argv: [], out })).toBe(0);
    expect(fs.existsSync(file)).toBe(false);
  });

  test('no session file: no API call', async () => {
    global.fetch = jest.fn();
    expect(await logout({ env, argv: [], out })).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/No active MCP session found/);
  });
});
