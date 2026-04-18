import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

/**
 * Post-release smoke test: verifies the latest GitHub Release exposes a
 * downloadable Windows `.exe` installer and that the bytes are a real PE
 * binary (MZ magic).
 *
 * Run manually after a release tag is pushed via `workflow_dispatch`:
 *   PLAYWRIGHT_BASE_URL=https://github.com npx playwright test e2e/download.spec.ts
 *
 * The release page requires no auth so this test intentionally bypasses the
 * project `baseURL` and hits github.com directly.
 */
// The repo can be overridden via env (e.g. for forks or staging) — defaults
// to the upstream Community repo. `RELEASES_URL` wins; otherwise fall back to
// `GITHUB_REPOSITORY` (set automatically by GitHub Actions).
const DEFAULT_REPO = 'sherifconteh-collab/ai-grc-platform';
const RELEASES_URL =
  process.env.RELEASES_URL
  || `https://github.com/${process.env.GITHUB_REPOSITORY || DEFAULT_REPO}/releases/latest`;
const FILENAME_PATTERN = /^ControlWeave\.Setup\..*\.exe$/i;

test.describe('release downloads', () => {
  test('Windows .exe asset downloads with valid PE header', async ({ page }) => {
    await page.goto(RELEASES_URL, { waitUntil: 'domcontentloaded' });

    // Find the first link whose text or filename matches our installer.
    const link = page.locator('a[href*="/releases/download/"][href$=".exe"]').first();
    await expect(link, 'No .exe asset link found on the latest release page').toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await link.click();
    const download = await downloadPromise;

    // Filename matches ControlWeave.Setup.<ver>.exe
    const filename = download.suggestedFilename();
    expect(filename, `Unexpected installer filename: ${filename}`).toMatch(FILENAME_PATTERN);

    // Save and validate the bytes
    const path = await download.path();
    expect(path, 'Download did not produce a local file').toBeTruthy();

    const fs = await import('node:fs/promises');
    const stat = await fs.stat(path!);
    expect(stat.size, 'Installer is empty').toBeGreaterThan(1024 * 1024); // >1 MB sanity floor

    // PE files start with 0x4D 0x5A ("MZ")
    const fh = await fs.open(path!, 'r');
    try {
      const head = Buffer.alloc(2);
      await fh.read(head, 0, 2, 0);
      expect(head[0], 'Missing MZ magic byte 0').toBe(0x4d);
      expect(head[1], 'Missing MZ magic byte 1').toBe(0x5a);
    } finally {
      await fh.close();
    }
  });
});
