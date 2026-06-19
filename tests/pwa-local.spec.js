const { test, expect } = require('@playwright/test');
const { siteConfig } = require('../playwright.config');
const SITE_NAME = siteConfig.siteName;
const ACTIVITY_NOUN = siteConfig.activityNounSingular;   // 'ride' or 'walk'
const ACTIVITY_NOUN_S = siteConfig.activityNounSingular; // 'ride' or 'walk'
const BG_COLOR = siteConfig.bgColor;
const CACHE_NAME = siteConfig.cacheName;


async function loadCatalog(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(`^\\d+ ${ACTIVITY_NOUN_S}s?$`));
  await expect(page.locator('.route-card').first()).toBeVisible();
}

async function loadCatalogStatus(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(`^\\d+ ${ACTIVITY_NOUN_S}s?$`));
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
  await expect(page.locator('#resultCount')).toHaveText(`${routes.length} ${ACTIVITY_NOUN_S}s`);
  await expect(page.locator('.route-card')).toHaveCount(routes.length);
  await expect(page.locator('.route-card').first()).toContainText(routes[0].title);

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const manifestJson = await manifest.json();
  expect(manifestJson).toMatchObject({
    name: SITE_NAME,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: BG_COLOR,
    theme_color: BG_COLOR
  });
  expect(manifestJson.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', purpose: expect.stringContaining('maskable') }),
    expect.objectContaining({ sizes: '512x512', purpose: expect.stringContaining('maskable') })
  ]));

  const serviceWorker = await request.get('/service-worker.js');
  expect(serviceWorker.ok()).toBeTruthy();
  const serviceWorkerText = await serviceWorker.text();
  expect(serviceWorkerText).toContain('./routes/catalog.json');
  expect(serviceWorkerText).toContain('./routes/candidate-backlog.json');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#061318');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/apple-touch-icon.png');
});

test('production route cards show clean media badges without review metadata', async ({ page, request }) => {
  const catalogResponse = await request.get('/routes/catalog.json');
  const catalog = await catalogResponse.json();
  const routeWithReviewMetadata = {
    ...catalog.routes[0],
    title: 'Rallarvegen Norway Virtual Cycling Route',
    location: 'Rallarvegen, Italy, 60 min',
    terrain: 'mountain gravel road and highland cycling route',
    videoQuality: 'HD/4K training video; verify playback quality before launch',
    audio: 'creator training video audio; verify before launch'
  };
  await page.route('**/routes/catalog.json', (route) => route.fulfill({
    json: { ...catalog, routes: [routeWithReviewMetadata] }
  }));

  await loadCatalog(page);

  const productionGrid = page.locator('#routeGrid');
  await expect(productionGrid).not.toContainText(/verify playback|before launch|training video; verify|original audio/i);

  const card = page.locator('.route-card').filter({ hasText: routeWithReviewMetadata.title }).first();
  expect(await card.locator('.route-card-badges li').allTextContents()).toEqual(['4K', '60+ min']);
  await expect(card.locator('.route-card-badges')).not.toContainText(/Original audio|verify|before launch|training video audio/i);
  expect(await card.locator('.route-metadata-badges li').allTextContents()).toEqual(expect.arrayContaining(['Italy', 'Moderate', 'Gravel', 'Mountains', 'Water/Lakes']));
  await expect(card.locator('.route-metadata-badges')).not.toContainText(/4K|60\+ min|Original audio|verify|before launch|training video audio/i);

  const thumbnailAlt = await card.locator('img').getAttribute('alt');
  expect(thumbnailAlt).toBe(`Scenic preview for ${routeWithReviewMetadata.title}.`);
  expect(thumbnailAlt).not.toMatch(/4K|HD|verify|before launch/i);
});

test('production route cards normalize scenery and terrain into useful badges', async ({ page }) => {
  await loadCatalog(page);

  const lakeCard = page.locator('.route-card').filter({ hasText: 'Lake Achensee' }).first();
  const lakeOverlayBadges = await lakeCard.locator('.route-card-badges li').allTextContents();
  const lakeMetadataBadges = await lakeCard.locator('.route-metadata-badges li').allTextContents();
  expect(lakeOverlayBadges).toEqual(['4K', '60+ min']);
  expect(lakeMetadataBadges).toEqual(expect.arrayContaining(['Austria', 'Moderate', 'Mountains', 'Water/Lakes']));
  expect(lakeMetadataBadges.length).toBeLessThanOrEqual(6);

  const gravelCard = page.locator('.route-card').filter({ hasText: "Rallarvegen: Norway's Most Beautiful Ride" }).first();
  const gravelOverlayBadges = await gravelCard.locator('.route-card-badges li').allTextContents();
  const gravelMetadataBadges = await gravelCard.locator('.route-metadata-badges li').allTextContents();
  expect(gravelOverlayBadges).toEqual(['4K', '60+ min']);
  expect(gravelMetadataBadges).toEqual(expect.arrayContaining(['Norway', 'Moderate', 'Gravel', 'Mountains']));
  expect(gravelMetadataBadges.length).toBeLessThanOrEqual(6);

  const climbCard = page.locator('.route-card').filter({ hasText: 'Passo di Valparola Dolomites Uphill Ride' }).first();
  const climbOverlayBadges = await climbCard.locator('.route-card-badges li').allTextContents();
  const climbMetadataBadges = await climbCard.locator('.route-metadata-badges li').allTextContents();
  expect(climbOverlayBadges).toEqual(['4K', 'Metrics overlay', '60+ min']);
  expect(climbMetadataBadges).toEqual(expect.arrayContaining(['Italy', 'Challenging', 'Climb', 'Mountains']));
  expect(climbMetadataBadges.length).toBeLessThanOrEqual(6);

  const metricsCard = page.locator('.route-card').filter({ hasText: 'Spain Indoor Cycling Workout with Telemetry' }).first();
  expect(await metricsCard.locator('.route-card-badges li').allTextContents()).toEqual(['4K', 'Metrics overlay']);
  await expect(metricsCard.locator('.route-card-badges')).not.toContainText(/Telemetry\/Gradient overlay|Telemetry$/i);
  await expect(metricsCard.locator('.route-metadata-badges')).not.toContainText('Metrics overlay');
});

test('scenery filter uses normalized rider-facing categories', async ({ page }) => {
  await loadCatalog(page);

  const sceneryOptions = await page.locator('#sceneryFilter option').allTextContents();
  expect(sceneryOptions).toEqual(expect.arrayContaining(['Any scenery', 'Mountains', 'Water/Lakes', 'Climb', 'Gravel']));
  expect(sceneryOptions).not.toEqual(expect.arrayContaining(['alps', 'river', 'lake']));

  await page.locator('#sceneryFilter').selectOption('Water/Lakes');
  await expect(page.locator('#sceneryFilter')).toHaveValue('Water/Lakes');
  await expect(page.locator('.route-card').first()).toBeVisible();

  const visibleMetadata = await page.locator('.route-card .route-metadata-badges').allTextContents();
  expect(visibleMetadata.length).toBeGreaterThan(0);
  expect(visibleMetadata.every((text) => text.includes('Water/Lakes'))).toBeTruthy();

  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.filterPreferences')));
  expect(preferences).toMatchObject({ scenery: 'Water/Lakes' });
});

test('candidate backlog stays hidden until review mode and exports local decisions', async ({ page, request }) => {
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
  await expect(page.locator('#candidateBacklog')).toBeHidden();
  await expect(page.locator('.candidate-card')).toHaveCount(0);

  await page.goto('/?review=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#candidateBacklog')).toBeVisible();
  await expect(page.locator('#candidateCount')).toContainText(`${backlog.candidateRoutes.length} backlog`);
  await expect(page.locator('.candidate-card').first()).toContainText(backlog.candidateRoutes[0].title);
  await expect(page.locator('.candidate-disclaimer')).toContainText('?review=1');

  await page.locator('.candidate-card').first().locator('.decision-button--promote').click();
  await page.locator('.candidate-card').first().locator('.candidate-note-input').fill('Looks like a strong fit.');
  await expect(page.locator('.candidate-card').first().locator('.review-decision-badge')).toHaveText('Promote/Yes');
  await expect
    .poll(() => page.evaluate(key => localStorage.getItem(key), `${SITE_NAME}.reviewDecisions`))
    .toContain(backlog.candidateRoutes[0].id);

  const exportData = await page.evaluate(() => {
    document.querySelector('#exportReviewDecisionsButton').click();
    return JSON.parse(document.querySelector('#reviewDecisionsOutput').value);
  });
  expect(exportData.reviewDecisions).toEqual([
    expect.objectContaining({
      id: backlog.candidateRoutes[0].id,
      title: backlog.candidateRoutes[0].title,
      decision: 'promote',
      note: 'Looks like a strong fit.'
    })
  ]);
});

test('favorites persist locally and favorites-only filter works', async ({ page }) => {
  await loadCatalog(page);

  const favoritesControl = page.locator('label.toggle-field', { has: page.locator('#favoritesFilter') });
  await expect(favoritesControl).toContainText('Favorites only');
  const [controlBox, checkboxBox, durationFilterBox] = await Promise.all([
    favoritesControl.boundingBox(),
    page.locator('#favoritesFilter').boundingBox(),
    page.locator('#durationFilter').boundingBox()
  ]);
  expect(controlBox).not.toBeNull();
  expect(checkboxBox).not.toBeNull();
  expect(durationFilterBox).not.toBeNull();
  expect(Math.abs(controlBox.height - durationFilterBox.height)).toBeLessThanOrEqual(1);
  expect(checkboxBox.height).toBeLessThan(controlBox.height);
  expect(checkboxBox.x).toBeGreaterThanOrEqual(controlBox.x);
  expect(checkboxBox.y).toBeGreaterThanOrEqual(controlBox.y);
  expect(checkboxBox.x + checkboxBox.width).toBeLessThanOrEqual(controlBox.x + controlBox.width);
  expect(checkboxBox.y + checkboxBox.height).toBeLessThanOrEqual(controlBox.y + controlBox.height);

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
  await page.getByLabel('Favorites only').check();

  await expect(page.locator('.route-card')).toHaveCount(1);
  await expect(page.locator('.route-card').first()).toContainText(firstTitle);
});

test('search and select filters update results and persist preferences', async ({ page }) => {
  await loadCatalog(page);

  await page.locator('#searchInput').fill('Bavaria');
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(ACTIVITY_NOUN_S));
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

test('reset local data clears favorites, recents, selected route, and filters', async ({ page }) => {
  await loadCatalog(page);

  const initialCount = await page.locator('.route-card').count();
  const firstCard = page.locator('.route-card').first();
  await firstCard.locator('.favorite-card-button').click();
  await firstCard.click();
  await page.locator('#startRideButton').click();
  await page.locator('#searchInput').fill('Bavaria');
  await page.locator('#durationFilter').selectOption('long');

  await expect(page.locator('#favoriteCount')).toHaveText('1 favorite');
  await expect(page.locator('#recentRoutes .recent-route-button')).toHaveCount(1);

  await page.locator('#resetDataButton').click();

  await expect(page.locator('#appStatus')).toHaveText('Local data reset.');
  await expect(page.locator('#favoriteCount')).toHaveText('0 favorites');
  await expect(page.locator('#recentRoutes')).toContainText('Select or start a ride to build recent routes.');
  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#durationFilter')).toHaveValue('all');
  await expect(page.locator('#favoritesFilter')).not.toBeChecked();
  await expect(page.locator('.route-card')).toHaveCount(initialCount);

  const localState = await page.evaluate(() => ({
    selected: localStorage.getItem('scenicRideCatalog.selectedRouteId'),
    favorites: localStorage.getItem('scenicRideCatalog.favoriteRouteIds'),
    recents: localStorage.getItem('scenicRideCatalog.recentRouteIds'),
    preferences: localStorage.getItem('scenicRideCatalog.filterPreferences')
  }));
  expect(localState).toEqual({
    selected: null,
    favorites: null,
    recents: null,
    preferences: null
  });
});

test('install prompt surfaces install button and handles acceptance', async ({ page }) => {
  await loadCatalogStatus(page);

  const defaultPrevented = await page.evaluate(() => {
    const installEvent = new Event('beforeinstallprompt', { cancelable: true });
    installEvent.prompt = () => Promise.resolve();
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(installEvent);
    return installEvent.defaultPrevented;
  });

  expect(defaultPrevented).toBeTruthy();
  await expect(page.locator('#installButton')).toBeVisible();
  await expect(page.locator('#appStatus')).toHaveText('Install available for offline app shell.');

  await page.locator('#installButton').click();
  await expect(page.locator('#installButton')).toBeHidden();
  await expect(page.locator('#appStatus')).toHaveText(`${SITE_NAME} installed.`);
});

test('exports only PedalScape local data and imports a validated backup', async ({ page }) => {
  await loadCatalog(page);

  await page.evaluate(() => {
    localStorage.setItem('unrelated.key', 'leave me alone');
    localStorage.setItem('scenicRideCatalog.favoriteRouteIds', JSON.stringify(['missing-route']));
  });
  await page.reload();
  await expect(page.locator('#favoriteCount')).toHaveText('0 favorites');

  const backup = await page.evaluate(() => {
    const button = document.querySelector('#copyDataButton');
    button.click();
    return JSON.parse(document.querySelector('#backupJsonOutput').value);
  });
  expect(backup).toMatchObject({ app: SITE_NAME, schemaVersion: 1 });
  expect(Object.keys(backup.localData).sort()).toEqual([
    'favoriteRouteIds',
    'filterPreferences',
    'recentRouteIds',
    'selectedRouteId'
  ]);
  expect(backup.localData.unrelated).toBeUndefined();

  const firstCard = page.locator('.route-card').first();
  await firstCard.click();
  const firstRouteId = await page.evaluate(() => localStorage.getItem('scenicRideCatalog.selectedRouteId'));
  const importBackup = {
    app: SITE_NAME,
    schemaVersion: 1,
    localData: {
      selectedRouteId: firstRouteId,
      favoriteRouteIds: [firstRouteId, 'stale-route'],
      recentRouteIds: [firstRouteId, 'stale-route'],
      filterPreferences: { query: 'bavaria', duration: 'long', scenery: 'all', intensity: 'all', favoritesOnly: true }
    }
  };

  await page.locator('#importDataInput').setInputFiles({
    name: 'pedalscape-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importBackup))
  });

  await expect(page.locator('#appStatus')).toHaveText('Local backup imported. Stale route IDs were ignored.');
  await expect(page.locator('#favoriteCount')).toHaveText('1 favorite');
  expect(await page.evaluate(() => localStorage.getItem('unrelated.key'))).toBe('leave me alone');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.favoriteRouteIds')))).toEqual([firstRouteId]);
});

test('rejects invalid local backup before writing app data', async ({ page }) => {
  await loadCatalog(page);
  await page.evaluate(() => localStorage.setItem('scenicRideCatalog.favoriteRouteIds', JSON.stringify(['keep-me'])));

  await page.locator('#importDataInput').setInputFiles({
    name: 'not-pedalscape.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'OtherApp', schemaVersion: 1, localData: {} }))
  });

  await expect(page.locator('#appStatus')).toContainText(`Import failed: \`Backup is not for ${SITE_NAME}\`.`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.favoriteRouteIds')))).toEqual(['keep-me']);
});
