'use strict';

const { runQualityGate } = require('../src/services/aiQualityGate');

describe('aiQualityGate.runQualityGate', () => {
  test('detects HIPAA § citations (the regex bug fix)', () => {
    const text = 'The control aligns with §164.312(b) requiring audit controls.';
    const r = runQualityGate({ output: text, minChars: 10 });
    expect(r.citations.some(c => /§\s*164\.312/.test(c))).toBe(true);
    expect(r.breakdown.citations).toBe(100);
  });

  test('detects GDPR Art. citations (no \\b prefix on Art.)', () => {
    const text = 'Per Art. 32(1)(b) of the GDPR, the controller must ensure encryption.';
    const r = runQualityGate({ output: text, minChars: 10 });
    expect(r.citations.some(c => /Art\.?\s*32/.test(c))).toBe(true);
  });

  test('detects NIST 800-53 family codes', () => {
    const text = 'Implement AC-2(3) and AU-6 to satisfy NIST 800-53 baseline.';
    const r = runQualityGate({ output: text, minChars: 10 });
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations.some(c => /AC-2/.test(c))).toBe(true);
  });

  test('penalizes PII presence', () => {
    const text = 'Contact alice@example.com or 555-12-3456 for SSN handling. ' + 'x'.repeat(200);
    const r = runQualityGate({ output: text, minChars: 100 });
    expect(r.pii.email).toBeGreaterThan(0);
    expect(r.pii.ssn).toBeGreaterThan(0);
    expect(r.breakdown.pii).toBeLessThan(100);
  });

  test('scores length proportionally below threshold', () => {
    const r = runQualityGate({ output: 'short', minChars: 200 });
    expect(r.breakdown.length).toBeLessThan(100);
  });

  test('handles structured (object) output by stringifying', () => {
    const obj = { control: 'AC-2(3)', detail: 'see §164.312(a) for HIPAA mapping' };
    const r = runQualityGate({ output: obj, minChars: 10 });
    expect(r.citations.length).toBeGreaterThan(0);
  });
});
