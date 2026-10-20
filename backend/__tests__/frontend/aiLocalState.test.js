'use strict';

// frontend/src/lib/aiLocalState.ts has no imports and uses only type syntax
// that Node can strip, so it is loaded in a child process rather than adding a
// TypeScript transform to the backend test setup. Skipped on a Node without
// built-in type stripping.
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const HELPER = path.resolve(__dirname, '../../../frontend/src/lib/aiLocalState.ts');
const canStripTypes = Boolean(process.features && process.features.typescript);
const suite = canStripTypes ? describe : describe.skip;

function runInNode(scriptBody) {
  const script = `
    const m = await import(${JSON.stringify(pathToFileURL(HELPER).href)});
    class FakeStorage {
      constructor() { this.map = new Map(); }
      get length() { return this.map.size; }
      key(i) { return Array.from(this.map.keys())[i] ?? null; }
      setItem(k, v) { this.map.set(k, String(v)); }
      removeItem(k) { this.map.delete(k); }
    }
    ${scriptBody}
  `;
  const out = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', script], { encoding: 'utf8' });
  return JSON.parse(out);
}

suite('frontend AI local state keys', () => {
  jest.setTimeout(30000);

  test('copilot and cache keys differ per user of the same organization', () => {
    const r = runInNode(`
      console.log(JSON.stringify({
        a: m.copilotStorageKey('user-a'),
        b: m.copilotStorageKey('user-b'),
        none: m.copilotStorageKey(''),
        cacheA: m.aiCacheKey('audit-readiness', 'user-a'),
        cacheB: m.aiCacheKey('audit-readiness', 'user-b')
      }));
    `);
    expect(r.a).not.toBe(r.b);
    expect(r.none).toBeNull();
    expect(r.cacheA).not.toBe(r.cacheB);
    expect(r.a).toContain('user-a');
    expect(r.cacheA).toContain('user-a');
  });

  test('clearing removes copilot history, cached answers and legacy org keys, and nothing else', () => {
    const r = runInNode(`
      const s = new FakeStorage();
      s.setItem(m.copilotStorageKey('user-a'), '[]');
      s.setItem(m.aiCacheKey('audit-readiness', 'user-a'), '{}');
      s.setItem('controlweave_copilot_messages_org-1', '[]');
      s.setItem('audit-readiness-org-1', '{}');
      s.setItem('theme', 'dark');
      m.clearAiLocalState(s);
      m.clearAiLocalState(null);
      console.log(JSON.stringify(Array.from(s.map.keys())));
    `);
    expect(r).toEqual(['theme']);
  });

  test('a storage that throws does not break clearing', () => {
    const r = runInNode(`
      const bad = { get length() { throw new Error('blocked'); }, key() { return null; }, removeItem() {} };
      m.clearAiLocalState(bad);
      console.log(JSON.stringify('ok'));
    `);
    expect(r).toBe('ok');
  });
});
