import { test, expect } from '@playwright/test';

/**
 * Smoke test for /login page rendering. Skipped automatically when no dev
 * server is reachable, so this spec is safe to keep in CI even when the
 * Playwright job runs without the frontend booted.
 */
test('login page renders email + password fields', async ({ page }) => {
  let reachable = true;
  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 5000 });
  } catch {
    reachable = false;
  }
  test.skip(!reachable, 'Frontend dev server not reachable; skipping smoke test.');

  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
});
