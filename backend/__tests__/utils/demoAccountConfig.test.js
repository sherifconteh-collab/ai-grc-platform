'use strict';

const {
  DEFAULT_DEMO_PASSWORD,
  isDemoModeEnabled,
  isDemoEmail,
  resolveDemoAccountPassword
} = require('../../scripts/lib/demo-account-config');

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isDemoModeEnabled', () => {
  it('is off in production unless DEMO_AUTO_SEED=true', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_AUTO_SEED;
    expect(isDemoModeEnabled()).toBe(false);

    process.env.DEMO_AUTO_SEED = 'true';
    expect(isDemoModeEnabled()).toBe(true);
  });

  it('is on outside production unless DEMO_AUTO_SEED=false', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_AUTO_SEED;
    expect(isDemoModeEnabled()).toBe(true);

    process.env.DEMO_AUTO_SEED = 'false';
    expect(isDemoModeEnabled()).toBe(false);
  });
});

describe('isDemoEmail', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_AUTO_SEED;
  });

  it('matches seeded demo addresses', () => {
    expect(isDemoEmail('admin@pro.com')).toBe(true);
    expect(isDemoEmail('ADMIN@Enterprise.com')).toBe(true);
    expect(isDemoEmail('auditor.lead@professional.com')).toBe(true);
  });

  it('does not match real users who merely share a demo domain', () => {
    expect(isDemoEmail('jane.doe@pro.com')).toBe(false);
    expect(isDemoEmail('ciso@enterprise.com')).toBe(false);
    expect(isDemoEmail('admin@example.com')).toBe(false);
  });

  it('matches nothing when demo mode is off', () => {
    process.env.NODE_ENV = 'production';
    expect(isDemoEmail('admin@pro.com')).toBe(false);
  });
});

describe('resolveDemoAccountPassword', () => {
  it('refuses the published default in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveDemoAccountPassword('')).toThrow(/DEMO_ACCOUNT_PASSWORD/);
    // Callers that pass the default explicitly as a fallback are refused too.
    expect(() => resolveDemoAccountPassword('', DEFAULT_DEMO_PASSWORD)).toThrow(/DEMO_ACCOUNT_PASSWORD/);
  });

  it('accepts a configured password in production', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveDemoAccountPassword('a-long-unique-demo-secret-1!')).toBe('a-long-unique-demo-secret-1!');
  });

  it('keeps the development default outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveDemoAccountPassword('')).toBe(DEFAULT_DEMO_PASSWORD);
  });
});
