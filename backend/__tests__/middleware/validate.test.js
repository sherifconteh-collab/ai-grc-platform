
describe('sanitizeText', () => {
  const { sanitizeText } = require('../../src/middleware/validate');

  it('restores characters that are not markup-capable', () => {
    // The bug this exists for: names with an ampersand or apostrophe were
    // stored escaped and rendered with the entity visible.
    expect(sanitizeText('Legal & Compliance')).toBe('Legal & Compliance');
    expect(sanitizeText('AT&T')).toBe('AT&T');
    expect(sanitizeText("O'Brien")).toBe("O'Brien");
    expect(sanitizeText('Risk "appetite"')).toBe('Risk "appetite"');
  });

  it('strips raw markup', () => {
    expect(sanitizeText('<script>alert(1)</script>Portal risk')).toBe('Portal risk');
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeText('<b>bold</b> text')).toBe('bold text');
  });

  /**
   * SECURITY REGRESSION (CodeQL js/double-escaping, alert 1460).
   *
   * The first version of this function decoded &lt; and &gt; along with &amp;.
   * sanitize-html parses entities, so escaped input survives its pass intact —
   * and decoding those two turned it straight back into live markup. These
   * assertions fail loudly if anyone re-adds lt/gt to TEXT_ENTITIES.
   */
  it('never reconstructs markup from pre-escaped input', () => {
    const singleEscaped = sanitizeText('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(singleEscaped).not.toContain('<');
    expect(singleEscaped).not.toContain('>');
    expect(singleEscaped).not.toMatch(/<script/i);

    const doubleEscaped = sanitizeText('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
    expect(doubleEscaped).not.toContain('<');
    expect(doubleEscaped).not.toMatch(/<script/i);

    expect(sanitizeText('&lt;img src=x onerror=alert(1)&gt;')).not.toContain('<');
  });

  it('never emits an angle bracket for any entity spelling', () => {
    ['&lt;', '&LT;', '&#60;', '&#x3c;', '&amp;lt;', '&amp;#60;', '&lt&lt;;']
      .forEach((payload) => {
        const out = sanitizeText(`${payload}script${payload}`);
        expect(out).not.toContain('<');
      });
  });

  it('passes non-strings through untouched', () => {
    expect(sanitizeText(null)).toBeNull();
    expect(sanitizeText(42)).toBe(42);
    expect(sanitizeText(undefined)).toBeUndefined();
  });
});
