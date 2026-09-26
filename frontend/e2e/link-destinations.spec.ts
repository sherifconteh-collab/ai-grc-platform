import { expect, test, type Page } from '@playwright/test';

/**
 * Click-through check that every link lands on the screen it names: each My
 * Work item, search result, "+ New" entry, merged-page redirect and sidebar link
 * is followed and the destination is asserted (URL plus a visible marker of the
 * exact record or panel).
 *
 * Runs against a live stack with seeded data, so it is opt-in:
 *   E2E_LIVE=1 E2E_EMAIL=... E2E_PASSWORD=... PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *     npx playwright test e2e/link-destinations.spec.ts
 * The static half of the contract (every link resolves to a page that reads its
 * parameters) runs in CI: scripts/check-ui-links.js (npm run check:links).
 */

const LIVE = process.env.E2E_LIVE === '1';
const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const BASE = process.env.PLAYWRIGHT_BASE_URL || '';
const UUID = '[0-9a-f-]{36}';

test.skip(!LIVE || !EMAIL || !PASSWORD || !BASE, 'Set E2E_LIVE=1, E2E_EMAIL, E2E_PASSWORD and PLAYWRIGHT_BASE_URL to run against a live stack.');
test.use({ baseURL: BASE || undefined, viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

async function signIn(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
  // The app shell (and its Ctrl+K listener) is ready once the top bar renders.
  await page.getByRole('button', { name: 'Search (Ctrl+K)' }).waitFor();
  await page.waitForLoadState('networkidle');
}

async function openMyWork(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible();
  await page.locator('li[data-work-kind]').first().waitFor();
}

// What each kind of work item must open: the URL shape and a marker that only
// the right record/panel shows. This edition has no ERP module and no Policies
// frontend page, so there are no erp_review or policy destinations here.
const DESTINATIONS: Record<string, { url: RegExp; marker: (page: Page, title: string) => Promise<void> }> = {
  control: {
    url: new RegExp(`/dashboard/controls/${UUID}\\?action=upload-evidence$`),
    marker: async (page) => { await expect(page.getByRole('dialog', { name: /Link Evidence to/ })).toBeVisible(); },
  },
  poam: {
    url: new RegExp(`/dashboard/poam/${UUID}\\?action=update-status$`),
    marker: async (page, title) => {
      await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
      await expect(page.locator('#poam-status')).toBeFocused();
    },
  },
  poam_approval: {
    url: new RegExp(`/dashboard/poam/${UUID}\\?action=review$`),
    marker: async (page, title) => { await expect(page.getByRole('heading', { name: title }).first()).toBeVisible(); },
  },
  risk: {
    url: new RegExp(`/dashboard/risks/${UUID}\\?action=reassess$`),
    marker: async (page, title) => {
      await expect(page.getByText(title).first()).toBeVisible();
      await expect(page.locator('#review-notes')).toBeFocused();
    },
  },
  exception_approval: {
    url: new RegExp(`/dashboard/exceptions\\?open=${UUID}$`),
    marker: async (page, title) => { await expect(page.locator('li[aria-current="true"]')).toContainText(title); },
  },
  pbc: {
    url: new RegExp(`/dashboard/requests/${UUID}$`),
    marker: async (page, title) => {
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByLabel('Your response')).toBeVisible();
    },
  },
};

test('every My Work item opens its exact record and action', async ({ page }) => {
  await signIn(page);
  await openMyWork(page);
  const rows = page.locator('li[data-work-kind]');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    await openMyWork(page);
    const row = page.locator('li[data-work-kind]').nth(i);
    const kind = String(await row.getAttribute('data-work-kind'));
    const title = String(await row.getAttribute('data-work-title'));
    const heading = (await row.locator('a').first().innerText()).trim();
    const destination = DESTINATIONS[kind];
    expect(destination, `no destination rule for work kind ${kind}`).toBeTruthy();

    await row.getByRole('link').last().click();
    await expect(page, `${kind} "${heading}"`).toHaveURL(destination.url);
    await destination.marker(page, title);
  }
});

test('search results open the record they name', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search records/ }).fill('ac2');
  await expect(page.getByRole('option', { name: /AC-2 Account Management/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/dashboard/controls/${UUID}$`));
  await expect(page.getByText('AC-2').first()).toBeVisible();

  await page.getByRole('button', { name: 'Search (Ctrl+K)' }).waitFor();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: /Search records/ }).fill('sso');
  await page.getByRole('option', { name: 'Settings: Single sign-on' }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/single-sign-on$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Single sign-on' })).toBeVisible();
});

const CREATE_MARKERS: Array<{ label: string; url: RegExp; marker: (page: Page) => Promise<void> }> = [
  { label: 'Evidence', url: /\/dashboard\/evidence\?new=1$/, marker: async (p) => { await expect(p.locator('#evidence-upload')).toBeVisible(); } },
  { label: 'Risk', url: /\/dashboard\/risks\?new=1$/, marker: async (p) => { await expect(p.getByRole('form', { name: 'New risk' })).toBeVisible(); } },
  { label: 'POA&M item', url: /\/dashboard\/poam\?new=1$/, marker: async (p) => { await expect(p.getByRole('form', { name: 'New POA&M item' })).toBeVisible(); } },
  { label: 'Exception', url: /\/dashboard\/exceptions\?new=1$/, marker: async (p) => { await expect(p.getByRole('heading', { name: 'New Exception' })).toBeVisible(); } },
  { label: 'Vendor', url: /\/dashboard\/tprm\?new=1$/, marker: async (p) => { await expect(p.getByRole('dialog', { name: 'Add Vendor' })).toBeVisible(); } },
  { label: 'Incident', url: /\/dashboard\/incidents\?new=1$/, marker: async (p) => { await expect(p.getByRole('form', { name: 'Report an incident' })).toBeVisible(); } },
  { label: 'Asset', url: /\/dashboard\/assets\?new=1$/, marker: async (p) => { await expect(p.getByRole('dialog', { name: 'Add Asset' })).toBeVisible(); } },
];

test('"+ New" entries open the matching create form', async ({ page }) => {
  await signIn(page);
  for (const entry of CREATE_MARKERS) {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /New|Create new/ }).first().click();
    await page.getByRole('menuitem', { name: entry.label, exact: true }).click();
    await expect(page, entry.label).toHaveURL(entry.url);
    await entry.marker(page);
  }
});

test('merged pages redirect to where their content now lives', async ({ page }) => {
  await signIn(page);
  const cases: Array<[string, RegExp, (p: Page) => Promise<void>]> = [
    ['/dashboard/vendor-risk', /\/dashboard\/tprm\?tab=contracts$/, async (p) => { await expect(p.getByRole('heading', { name: 'Vendor contracts', exact: true })).toBeVisible(); }],
    ['/dashboard/evidence/pending', /\/dashboard\/evidence\?tab=pending$/, async (p) => { await expect(p.getByRole('tab', { name: /AI suggestions/, selected: true })).toBeVisible(); }],
    ['/dashboard/evidence/auto', /\/dashboard\/evidence\?tab=auto$/, async (p) => { await expect(p.getByRole('tab', { name: 'Automated collection', selected: true })).toBeVisible(); }],
    ['/dashboard/cmdb', /\/dashboard\/assets(#inventory)?$/, async (p) => { await expect(p.getByRole('heading', { name: /Inventory by type/ })).toBeVisible(); }],
    ['/dashboard/settings/ai-keys', /\/dashboard\/settings\/ai-providers$/, async (p) => { await expect(p.getByRole('heading', { level: 1, name: 'AI providers' })).toBeVisible(); }],
    ['/dashboard/audit', /\/dashboard\/settings\/audit-log$/, async (p) => { await expect(p.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible(); }],
  ];
  for (const [from, to, marker] of cases) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
    await marker(page);
  }
});

test('every sidebar link opens a page (no 404s)', async ({ page }) => {
  await signIn(page);
  await page.goto('/dashboard');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const toggle of await nav.locator('button[aria-expanded="false"]').all()) await toggle.click();
  const hrefs = [...new Set(await nav.locator('a[href^="/dashboard"]').evaluateAll((as) => as.map((a) => a.getAttribute('href') || '')))];
  expect(hrefs.length).toBeGreaterThan(30);
  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page.getByText(/This page could not be found/)).toHaveCount(0);
  }
});
