'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

describe('JWT HS256 pin', () => {
  const SECRET = 'test-secret-do-not-use';

  test('accepts HS256 tokens', () => {
    const token = jwt.sign({ sub: 'u1' }, SECRET, { algorithm: 'HS256' });
    const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    expect(decoded.sub).toBe('u1');
  });

  test('rejects "none" algorithm tokens', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    expect(() => jwt.verify(noneToken, SECRET, { algorithms: ['HS256'] })).toThrow();
  });

  test('rejects RS256-claimed tokens when only HS256 is allowed', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    const forged = `${header}.${payload}.AAAA`;
    expect(() => jwt.verify(forged, SECRET, { algorithms: ['HS256'] })).toThrow();
  });
});

describe('bcrypt cost rotation', () => {
  function getBcryptCost(hash) {
    if (typeof hash !== 'string') return null;
    const m = /^\$2[abxy]\$(\d{2})\$/.exec(hash);
    return m ? parseInt(m[1], 10) : null;
  }

  test('extracts cost from a current hash (cost 14)', async () => {
    const hash = await bcrypt.hash('s3cret-passphrase', 14);
    expect(getBcryptCost(hash)).toBe(14);
  }, 30000);

  test('extracts cost from a legacy hash (cost 10) so lazy-upgrade triggers', async () => {
    const hash = await bcrypt.hash('s3cret-passphrase', 10);
    expect(getBcryptCost(hash)).toBe(10);
    expect(getBcryptCost(hash)).toBeLessThan(14);
  });

  test('returns null for unrecognized hash strings', () => {
    expect(getBcryptCost('not-a-hash')).toBeNull();
    expect(getBcryptCost(null)).toBeNull();
    expect(getBcryptCost(undefined)).toBeNull();
  });
});
