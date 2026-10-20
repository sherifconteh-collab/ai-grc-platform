'use strict';

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const { assertSafeUrl, isPrivateAddress } = require('../../src/utils/netGuard');
const { validateWebhookTargetUrl } = require('../../src/services/webhookService');

const noLookup = async () => { throw new Error('literal addresses must not be resolved'); };
const strict = { lookup: noLookup, allowPrivateHosts: false, allowHttp: false };

describe('netGuard IPv6 literals that embed an IPv4 address', () => {
  const blocked = [
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    '::7f00:1',
    '64:ff9b::7f00:1',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b:1::1',
    '2002:7f00:1::',
    '2002:a9fe:a9fe::1',
    '0:0:0:0:0:ffff:127.0.0.1',
    '::ffff:0:0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    'not-an-address:::1'
  ];
  const allowed = [
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '64:ff9b::808:808',
    '2002:808:808::',
    '2606:4700:4700::1111',
    '2001:db8::1'
  ];

  it.each(blocked)('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(allowed)('treats public %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it.each([
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:a9fe:a9fe]/latest/meta-data',
    'https://[::127.0.0.1]/',
    'https://[64:ff9b::7f00:1]/'
  ])('assertSafeUrl refuses %s', async (url) => {
    await expect(assertSafeUrl(url, strict)).rejects.toThrow('private network host');
  });

  it('assertSafeUrl still accepts a public IPv4-mapped literal', async () => {
    await expect(assertSafeUrl('https://[::ffff:8.8.8.8]/', strict)).resolves.toBeInstanceOf(URL);
  });
});

describe('webhook target validation shares the same guard', () => {
  const saved = process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS;
  beforeEach(() => { delete process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS; });
  afterAll(() => {
    if (saved === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS;
    else process.env.WEBHOOK_ALLOW_PRIVATE_HOSTS = saved;
  });

  it.each([
    'https://[::1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://[::ffff:a9fe:a9fe]/hook',
    'https://[64:ff9b::7f00:1]/hook',
    'https://127.0.0.1/hook'
  ])('rejects %s', (url) => {
    expect(() => validateWebhookTargetUrl(url)).toThrow(/private network/);
  });

  it('accepts a public https target', () => {
    expect(validateWebhookTargetUrl('https://hooks.example.com/in')).toBe('https://hooks.example.com/in');
  });
});
