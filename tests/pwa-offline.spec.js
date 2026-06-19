const { test, expect } = require('@playwright/test');
const { siteConfig } = require('../playwright.config');
const ACTIVITY_NOUN = siteConfig.activityNounSingular;    // 'ride' or 'walk'
const ACTIVITY_NOUN_S = siteConfig.activityNounSingular;


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
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(`^\\d+ ${ACTIVITY_NOUN}s?$`));
  await expect(page.locator('.route-card').first()).toBeVisible();

  await waitForServiceWorkerControl(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBeTruthy();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.locator('#resultCount')).toHaveText(new RegExp(`^\\d+ ${ACTIVITY_NOUN}s?$`));
  await expect(page.locator('.route-card').first()).toBeVisible();

  await context.setOffline(false);
});
