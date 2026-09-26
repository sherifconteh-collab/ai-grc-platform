'use strict';

const dns = require('dns');
const http = require('http');
const { safeFetch, guardedLookup } = require('../../src/utils/netGuard');

describe('netGuard connection pinning (DNS rebinding)', () => {
  const saved = process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS;
  afterEach(() => {
    jest.restoreAllMocks();
    if (saved === undefined) delete process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS;
    else process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS = saved;
  });

  it('refuses a name that passes the check but resolves privately when connecting', async () => {
    delete process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS;
    // First answer (the check): public. Second answer (the socket): metadata endpoint.
    jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    jest.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => cb(null, [{ address: '169.254.169.254', family: 4 }]));
    await expect(safeFetch('https://rebind.example.com/latest/meta-data')).rejects.toMatchObject({ code: 'EPRIVATEHOST' });
  });

  it('guardedLookup returns the checked public address in the form the socket asked for', (done) => {
    delete process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS;
    jest.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]));
    guardedLookup('example.com', { family: 0 }, (error, address, family) => {
      expect(error).toBeNull();
      expect(address).toBe('93.184.216.34');
      expect(family).toBe(4);
      done();
    });
  });

  describe('against a local server (private hosts allowed)', () => {
    let server;
    let base;
    beforeAll(async () => {
      server = http.createServer((req, res) => {
        if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://169.254.169.254/' }); return res.end(); }
        if (req.url === '/slow') { setTimeout(() => res.end('late'), 2000).unref(); return undefined; }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          res.writeHead(201, { 'Content-Type': 'application/json', 'X-Test': 'yes' });
          res.end(JSON.stringify({ method: req.method, body, auth: req.headers.authorization || null }));
        });
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
    beforeEach(() => { process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS = 'true'; });

    it('returns a fetch-compatible response with status, headers and body', async () => {
      const response = await safeFetch(`${base}/echo`, { method: 'POST', headers: { Authorization: 'Bearer x' }, body: 'hello' });
      expect(response.status).toBe(201);
      expect(response.ok).toBe(true);
      expect(response.headers.get('x-test')).toBe('yes');
      expect(await response.json()).toEqual({ method: 'POST', body: 'hello', auth: 'Bearer x' });
    });

    it('never follows a redirect', async () => {
      await expect(safeFetch(`${base}/redirect`)).rejects.toThrow(/redirect/);
    });

    it('honors an abort signal as a timeout', async () => {
      await expect(safeFetch(`${base}/slow`, { signal: AbortSignal.timeout(100) })).rejects.toMatchObject({ name: 'TimeoutError' });
    });

    it('refuses the private server when private hosts are not allowed', async () => {
      delete process.env.CONNECTOR_ALLOW_PRIVATE_HOSTS;
      await expect(safeFetch(`${base}/echo`)).rejects.toThrow(/https|private/);
      await expect(safeFetch(`${base}/echo`, {}, { allowPrivateHosts: true })).resolves.toMatchObject({ status: 201 });
    });
  });
});
