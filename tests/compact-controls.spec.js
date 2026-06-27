const { test, expect } = require('@playwright/test');

// Compact-on-scroll UI polish for the sticky search/filter controls panel.
// The behavior only applies on the desktop sticky layout (>900px), which is
// the default Playwright "Desktop Chrome" viewport (1280x720).

async function loadCatalog(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.route-card').first()).toBeVisible();
}

async function scrollPastHero(page) {
  const heroHeight = await page.locator('.hero').evaluate((el) => el.offsetHeight);
  await page.evaluate((offset) => window.scrollTo(0, offset), heroHeight + 400);
  // Park the pointer over the catalog (not the sticky panel) so the
  // hover-to-expand affordance does not interfere with the compact assertions.
  await page.mouse.move(640, 600);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('controls panel compacts after the hero scrolls out of view', async ({ page }) => {
  await loadCatalog(page);

  const body = page.locator('body');
  const panel = page.locator('.controls-panel');
  const quickLinks = page.locator('.controls-panel .quick-links');
  const eyebrow = page.locator('.controls-panel .filter-heading .eyebrow');

  // Expanded while the hero is in view.
  await expect(body).not.toHaveClass(/controls-compact/);
  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();
  const expandedBox = await panel.boundingBox();

  await scrollPastHero(page);

  // Body state toggles and the panel chrome compacts.
  await expect(body).toHaveClass(/controls-compact/);
  await expect(quickLinks).toBeHidden();
  await expect(eyebrow).toBeHidden();

  const compactBox = await panel.boundingBox();
  expect(compactBox.height).toBeLessThan(expandedBox.height);

  // Search and filters remain fully usable in the compact state.
  await expect(page.locator('#searchInput')).toBeEnabled();
  await expect(page.locator('#durationFilter')).toBeEnabled();
  await page.locator('#searchInput').fill('canyon');
  await expect(page.locator('#searchInput')).toHaveValue('canyon');
});

test('controls panel expands near the top and on keyboard focus', async ({ page }) => {
  await loadCatalog(page);

  const body = page.locator('body');
  const quickLinks = page.locator('.controls-panel .quick-links');
  const searchInput = page.locator('#searchInput');

  await scrollPastHero(page);
  await expect(body).toHaveClass(/controls-compact/);
  await expect(quickLinks).toBeHidden();

  // Keyboard focus on a control re-expands the panel even while scrolled.
  await searchInput.focus();
  await expect(searchInput).toBeFocused();
  await expect(quickLinks).toBeVisible();

  // Removing focus returns it to the compact state (still scrolled).
  await searchInput.blur();
  await page.mouse.move(640, 600);
  await expect(quickLinks).toBeHidden();

  // Scrolling back near the top expands the panel again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(body).not.toHaveClass(/controls-compact/);
  await expect(quickLinks).toBeVisible();
});
