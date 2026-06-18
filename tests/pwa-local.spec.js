const { test, expect } = require('@playwright/test');

async function loadCatalog(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toHaveText(/^\d+ rides?$/);
  await expect(page.locator('.route-card').first()).toBeVisible();
}

async function loadCatalogStatus(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toHaveText(/^\d+ rides?$/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.name !== 'e2e-local-state-cleared') {
      localStorage.clear();
      sessionStorage.clear();
      window.name = 'e2e-local-state-cleared';
    }
    HTMLElement.prototype.requestFullscreen = () => Promise.resolve();
  });
});

test('loads the production JSON route catalog and exposes PWA assets', async ({ page, request }) => {
  const catalog = await request.get('/routes/catalog.json');
  expect(catalog.ok()).toBeTruthy();
  const { routes } = await catalog.json();
  expect(routes.length).toBeGreaterThan(10);

  await loadCatalogStatus(page);
  await expect(page.locator('#resultCount')).toHaveText(`${routes.length} rides`);
  await expect(page.locator('.route-card')).toHaveCount(routes.length);
  await expect(page.locator('.route-card').first()).toContainText(routes[0].title);

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe('standalone');

  const serviceWorker = await request.get('/service-worker.js');
  expect(serviceWorker.ok()).toBeTruthy();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
});

test('candidate backlog endpoint parses and review section renders when present', async ({ page, request }) => {
  const backlogResponse = await request.get('/routes/candidate-backlog.json');
  expect(backlogResponse.ok()).toBeTruthy();
  const backlog = await backlogResponse.json();
  expect(backlog.schemaVersion).toBe(1);
  expect(Array.isArray(backlog.candidateRoutes)).toBeTruthy();
  expect(backlog.candidateRoutes.length).toBeGreaterThan(0);
  expect(backlog.candidateRoutes[0]).toEqual(expect.objectContaining({
    id: expect.any(String),
    title: expect.any(String),
    sourceUrl: expect.any(String)
  }));

  await loadCatalogStatus(page);
  const candidateSection = page.locator('#candidateBacklog');
  if (await candidateSection.count()) {
    await expect(candidateSection).toBeVisible();
    await expect(page.locator('#candidateCount')).toContainText(`${backlog.candidateRoutes.length} backlog`);
    await page.locator('#candidateBacklog summary').click();
    await expect(page.locator('.candidate-card').first()).toContainText(backlog.candidateRoutes[0].title);
  }
});

test('favorites persist locally and favorites-only filter works', async ({ page }) => {
  await loadCatalog(page);

  const firstCard = page.locator('.route-card').first();
  const firstTitle = (await firstCard.locator('h3').textContent()).trim();
  await firstCard.locator('.favorite-card-button').click();

  await expect(page.locator('#favoriteCount')).toHaveText('1 favorite');
  await expect(firstCard.locator('.favorite-card-button')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scenicRideCatalog.favoriteRouteIds')))
    .toContain('[');

  await page.reload();
  await expect(page.locator('.route-card').filter({ hasText: firstTitle }).locator('.favorite-card-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#favoritesFilter').check();

  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.route-card').first()).toContainText(firstTitle);
});

test('search and select filters update results and persist preferences', async ({ page }) => {
  await loadCatalog(page);

  await page.locator('#searchInput').fill('Bavaria');
  await expect(page.locator('#resultCount')).toHaveText(/ride/);
  await expect(page.locator('.route-card').first()).toContainText(/Bavaria/i);

  await page.locator('#durationFilter').selectOption('long');
  await expect(page.locator('#durationFilter')).toHaveValue('long');

  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.filterPreferences')));
  expect(preferences).toMatchObject({ query: 'bavaria', duration: 'long' });

  await page.reload();
  await expect(page.locator('#searchInput')).toHaveValue('bavaria');
  await expect(page.locator('#durationFilter')).toHaveValue('long');
});

test('starting a ride stores continue state, recents, hero continue, and loads iframe', async ({ page }) => {
  await loadCatalog(page);

  const firstCard = page.locator('.route-card').first();
  const firstTitle = (await firstCard.locator('h3').textContent()).trim();
  await firstCard.click();
  await expect(page.locator('#selectedTitle')).toHaveText(firstTitle);
  await expect(page.locator('#playerShell iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed/);

  await page.locator('#startRideButton').click();
  await expect(page.locator('#heroLabel')).toContainText('Continue ride');
  await expect(page.locator('#heroRouteButton')).toHaveText('Continue this ride');
  await expect(page.locator('#recentRoutes .recent-route-button').first()).toHaveText(firstTitle);

  const localState = await page.evaluate(() => ({
    selected: localStorage.getItem('scenicRideCatalog.selectedRouteId'),
    recents: JSON.parse(localStorage.getItem('scenicRideCatalog.recentRouteIds'))
  }));
  expect(localState.selected).toBeTruthy();
  expect(localState.recents).toEqual([localState.selected]);

  await page.reload();
  await expect(page.locator('#heroLabel')).toContainText('Continue ride');
  await expect(page.locator('#heroSelection')).toHaveText(firstTitle);
});
