'use strict';

const crypto = require('crypto');
const {
  sha384,
  hashToken,
  verifyTokenHash,
  tokenHashCandidates,
  auditEncryptionStrength,
} = require('../src/utils/encrypt');
const { mldsaKeygen, mldsaSign, mldsaVerify } = require('../src/utils/pqc');
const licenseService = require('../src/services/licenseService');

describe('CNSA hashing (SHA-384)', () => {
  test('sha384 returns a 96-hex-char digest', () => {
    expect(sha384('abc')).toHaveLength(96);
    expect(sha384('abc')).toBe(crypto.createHash('sha384').update('abc').digest('hex'));
  });

  test('hashToken uses SHA-384', () => {
    expect(hashToken('tok')).toBe(crypto.createHash('sha384').update('tok').digest('hex'));
  });

  test('verifyTokenHash accepts SHA-384 and legacy SHA-256', () => {
    const t = 'secret-refresh-token';
    expect(verifyTokenHash(t, hashToken(t))).toBe(true);
    const legacy = crypto.createHash('sha256').update(t).digest('hex');
    expect(verifyTokenHash(t, legacy)).toBe(true);
    expect(verifyTokenHash(t, hashToken('different'))).toBe(false);
    expect(verifyTokenHash(t, null)).toBe(false);
  });

  test('tokenHashCandidates returns [sha384, sha256]', () => {
    const t = 'lookup';
    expect(tokenHashCandidates(t)).toEqual([
      crypto.createHash('sha384').update(t).digest('hex'),
      crypto.createHash('sha256').update(t).digest('hex'),
    ]);
  });
});

describe('CNSA 2.0 PQC — ML-DSA-65', () => {
  test('keygen + sign + verify round-trip', () => {
    const { publicKey, secretKey } = mldsaKeygen();
    const sig = mldsaSign('hybrid-license-payload', secretKey);
    expect(mldsaVerify('hybrid-license-payload', sig, publicKey)).toBe(true);
    expect(mldsaVerify('tampered', sig, publicKey)).toBe(false);
    expect(mldsaVerify('hybrid-license-payload', sig, mldsaKeygen().publicKey)).toBe(false);
  });
});

describe('Hybrid license signing (RS256 + ML-DSA-65)', () => {
  test('hybrid license verifies with both classical and PQC public keys', async () => {
    const { licenseKey, publicKey, pqcPublicKey } = await licenseService.generateCommunityKey('test-org');
    const res = licenseService.validateLicenseKey(licenseKey, publicKey, pqcPublicKey);
    expect(res.valid).toBe(true);
    expect(res.tier).toBe('community');
  });

  test('wrong PQC public key fails verification', async () => {
    const { licenseKey, publicKey } = await licenseService.generateCommunityKey('test-org');
    const wrongPqcPub = mldsaKeygen().publicKey;
    const res = licenseService.validateLicenseKey(licenseKey, publicKey, wrongPqcPub);
    expect(res.valid).toBe(false);
  });

  test('legacy classical-only JWT still validates (no envelope)', async () => {
    const { licenseKey, publicKey } = await licenseService.generateCommunityKey('test-org');
    const envelope = JSON.parse(Buffer.from(licenseKey, 'base64').toString('utf8'));
    const res = licenseService.validateLicenseKey(envelope.jwt, publicKey);
    expect(res.valid).toBe(true);
    expect(res.tier).toBe('community');
  });
});

describe('CNSA self-audit', () => {
  test('hash, JWT and PQC checks pass', () => {
    const report = auditEncryptionStrength();
    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c.status]));
    expect(byId['CNSA-1.0-HASH']).toBe('pass');
    expect(byId['CNSA-1.0-JWT']).toBe('pass');
    expect(byId['CNSA-2.0-PQC']).toBe('pass');
  });
});
