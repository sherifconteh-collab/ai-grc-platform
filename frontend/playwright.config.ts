import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for ControlWeave Community frontend.
 *
 * Wired as a manual `workflow_dispatch` job in CI to keep minute spend low
 * until the e2e suite stabilizes (see PR-8 sequencing in RELEASE_NOTES).
 *
 * Most specs target the local dev server (`baseURL`); `download.spec.ts` is
 * a post-release smoke that hits github.com/.../releases/latest directly and
 * does NOT need the dev server.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
