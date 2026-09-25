const { test, expect } = require('@playwright/test');
const { siteConfig } = require('../playwright.config');
const DANISH_ACTIVITY_NOUN_PLURAL = siteConfig.siteSlug === 'pedalscape' ? 'ture' : 'gåture';


test.use({ serviceWorkers: 'allow' });

async function waitForServiceWorkerControl(page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return true;

    await Promise.race([
      new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      }),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);

    return Boolean(navigator.serviceWorker.controller);
  });

  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)))) {
    await page.reload({ waitUntil: 'networkidle' });
  }
}

test('service worker keeps the app shell and route data usable offline', async ({ page, context }) => {
  test.skip(!!process.env.CI, 'SW offline lifecycle unreliable in headless CI — tested locally only');
  await page.addInitScript(() => localStorage.setItem('lang', 'da'));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(`^\\d+ ${DANISH_ACTIVITY_NOUN_PLURAL}$`));
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('#filterTitle')).toHaveText('Søg og filtrer');

  await waitForServiceWorkerControl(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBeTruthy();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Wait for app JS to hydrate from SW cache — poll until non-empty, then assert format
  await expect.poll(
    () => page.locator('#resultCount').textContent(),
    { timeout: 20000, intervals: [500, 1000, 2000] }
  ).toMatch(new RegExp(`^\\d+ ${DANISH_ACTIVITY_NOUN_PLURAL}$`));
  await expect(page.locator('.route-card').first()).toBeVisible();
  await expect(page.locator('#filterTitle')).toHaveText('Søg og filtrer');

  await context.setOffline(false);
});
