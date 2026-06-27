const { test, expect } = require('@playwright/test');

// Desktop viewport assertions for the sticky search/filter controls panel.

async function loadCatalog(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.route-card').first()).toBeVisible();
}

async function scrollPastHero(page) {
  const stickyTriggerOffset = await page.locator('.controls-panel').evaluate((el) => el.offsetTop + 400);
  await page.evaluate((offset) => window.scrollTo(0, offset), stickyTriggerOffset);
  await page.mouse.move(640, 600);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('controls panel stays sticky without shrinking or hiding content', async ({ page }) => {
  await loadCatalog(page);

  const panel = page.locator('.controls-panel');
  const quickLinks = page.locator('.controls-panel .quick-links');
  const eyebrow = page.locator('.controls-panel .filter-heading .eyebrow');
  const title = page.locator('.controls-panel .filter-heading h2');
  const searchInput = page.locator('#searchInput');
  const durationFilter = page.locator('#durationFilter');

  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();
  await expect(title).toBeVisible();
  const [expandedBox, expandedTitleFontSize, expandedSearchHeight, expandedFilterHeight] = await Promise.all([
    panel.boundingBox(),
    title.evaluate((el) => window.getComputedStyle(el).fontSize),
    searchInput.evaluate((el) => el.getBoundingClientRect().height),
    durationFilter.evaluate((el) => el.getBoundingClientRect().height)
  ]);

  await scrollPastHero(page);

  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();
  await expect(title).toBeVisible();
  await expect(searchInput).toBeEnabled();
  await expect(durationFilter).toBeEnabled();

  const [stickyBox, stickyTitleFontSize, stickySearchHeight, stickyFilterHeight] = await Promise.all([
    panel.boundingBox(),
    title.evaluate((el) => window.getComputedStyle(el).fontSize),
    searchInput.evaluate((el) => el.getBoundingClientRect().height),
    durationFilter.evaluate((el) => el.getBoundingClientRect().height)
  ]);

  expect(Math.abs(stickyBox.height - expandedBox.height)).toBeLessThanOrEqual(2);
  expect(stickyTitleFontSize).toBe(expandedTitleFontSize);
  expect(Math.abs(stickySearchHeight - expandedSearchHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(stickyFilterHeight - expandedFilterHeight)).toBeLessThanOrEqual(1);

  await searchInput.fill('canyon');
  await expect(searchInput).toHaveValue('canyon');
});

test('controls panel keeps its content visible after focus and scrolling back up', async ({ page }) => {
  await loadCatalog(page);

  const quickLinks = page.locator('.controls-panel .quick-links');
  const searchInput = page.locator('#searchInput');
  const eyebrow = page.locator('.controls-panel .filter-heading .eyebrow');

  await scrollPastHero(page);
  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();

  await searchInput.focus();
  await expect(searchInput).toBeFocused();
  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();

  await searchInput.blur();
  await page.mouse.move(640, 600);
  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(quickLinks).toBeVisible();
  await expect(eyebrow).toBeVisible();
});
