'use strict';

const { assertSafeUrl, isPrivateAddress } = require('../../src/utils/netGuard');
const serviceNow = require('../../src/services/serviceNowService');
const qualys = require('../../src/services/qualysService');

describe('connector SSRF guard', () => {
  const publicLookup = async () => [{ address: '93.184.216.34' }];

  it('classifies private and public addresses', () => {
    ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fd00::1', '::ffff:10.0.0.1']
      .forEach((ip) => expect(isPrivateAddress(ip)).toBe(true));
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
  });

  it('refuses http, credentials, private literals and names that resolve privately', async () => {
    await expect(assertSafeUrl('http://example.com', { lookup: publicLookup })).rejects.toThrow(/https/);
    await expect(assertSafeUrl('https://u:p@example.com', { lookup: publicLookup })).rejects.toThrow(/credentials/);
    await expect(assertSafeUrl('https://169.254.169.254/latest')).rejects.toThrow(/private/);
    await expect(assertSafeUrl('https://evil.example', { lookup: async () => [{ address: '10.1.2.3' }] })).rejects.toThrow(/private/);
    await expect(assertSafeUrl('https://example.com', { lookup: publicLookup })).resolves.toBeInstanceOf(URL);
  });

  it('ServiceNow and Qualys report an error, not an empty sync, for a private host', async () => {
    const snow = await serviceNow.syncFindings({ instanceUrl: 'https://127.0.0.1', username: 'u', password: 'p' });
    expect(snow.error).toMatch(/private network/);
    const vm = await qualys.syncFindings({ baseUrl: 'https://10.0.0.5', username: 'u', password: 'p' });
    expect(vm.error).toMatch(/private network/);
  });

  it('ServiceNow refuses a table name that could alter the request path', async () => {
    const result = await serviceNow.syncFindings({ instanceUrl: 'https://93.184.216.34', changeTableName: '../x?y', username: 'u', password: 'p' });
    expect(result.error).toMatch(/table name/);
  });
});
