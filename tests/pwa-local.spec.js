const { test, expect } = require('@playwright/test');
const { siteConfig } = require('../playwright.config');
const SITE_NAME = siteConfig.siteName;
const SITE_SLUG = siteConfig.siteSlug;
const ACTIVITY_NOUN = siteConfig.activityNounSingular;   // 'ride' or 'walk'
const ACTIVITY_NOUN_S = siteConfig.activityNounSingular; // 'ride' or 'walk'
const IS_PEDALSCAPE = SITE_SLUG === 'pedalscape';
const BG_COLOR = siteConfig.bgColor;
const THEME_COLOR = siteConfig.themeColor;
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
  expect(serviceWorkerText).toContain("event.data?.type === 'SKIP_WAITING'");
  expect(serviceWorkerText).not.toContain('self.skipWaiting();\n});\n\nself.addEventListener(\'activate\'');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', THEME_COLOR);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/apple-touch-icon.png');
  if (IS_PEDALSCAPE) {
    await expect(page.locator('#footerMyCadence')).toBeVisible();
  } else {
    await expect(page.locator('#footerMyCadence')).toBeHidden();
  }
});

test('Chinese locales are available from the language switcher', async ({ page, request }) => {
  const traditional = await request.get('/locales/zh-TW.json');
  expect(traditional.ok()).toBeTruthy();
  const traditionalJson = await traditional.json();
  expect(traditionalJson.filter_title).toBe('搜尋與篩選');

  const simplified = await request.get('/locales/zh-CN.json');
  expect(simplified.ok()).toBeTruthy();
  const simplifiedJson = await simplified.json();
  expect(simplifiedJson.filter_title).toBe('搜索与筛选');

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await page.locator('.lang-switcher [data-lang="zh-TW"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.locator('#filterTitle')).toHaveText('搜尋與篩選');
  await expect(page.locator('.lang-switcher')).toHaveAttribute('aria-label', '語言');
  await expect(page.locator('.lang-switcher [data-lang="zh-TW"]')).toHaveClass(/active-lang/);
  await expect(page.locator('.lang-switcher [data-lang="zh-TW"]')).toHaveAttribute('aria-current', 'true');

  await page.locator('.lang-switcher [data-lang="zh-CN"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#filterTitle')).toHaveText('搜索与筛选');
  await expect(page.locator('.lang-switcher')).toHaveAttribute('aria-label', '语言');
  await expect(page.locator('.lang-switcher [data-lang="zh-CN"]')).toHaveClass(/active-lang/);
  await expect(page.locator('.lang-switcher [data-lang="zh-CN"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.lang-switcher [data-lang="zh-TW"]')).not.toHaveAttribute('aria-current', 'true');
});

test('Traditional Chinese browser locale variants with multiple underscores resolve to zh-TW', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['zh_Hant_TW', 'en-US']
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'zh_Hant_TW'
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.locator('#filterTitle')).toHaveText('搜尋與篩選');
});

test('PedalScape can connect a cadence sensor and persist the saved device', async ({ page }) => {
  test.skip(!IS_PEDALSCAPE, 'Bluetooth cadence UI is PedalScape-only for now.');

  await page.addInitScript(() => {
    const characteristicListeners = new Map();
    const cadenceCharacteristic = {
      startNotifications: () => Promise.resolve(cadenceCharacteristic),
      stopNotifications: () => Promise.resolve(),
      addEventListener: (type, listener) => characteristicListeners.set(type, listener),
      removeEventListener: (type) => characteristicListeners.delete(type)
    };
    const cadenceService = {
      getCharacteristic: () => Promise.resolve(cadenceCharacteristic)
    };
    const mockDevice = {
      id: 'mock-cadence-device-1',
      name: 'Mock Cadence Sensor',
      gatt: {
        connected: false,
        connect: function connect() {
          this.connected = true;
          return Promise.resolve({
            getPrimaryService: () => Promise.resolve(cadenceService)
          });
        },
        disconnect: function disconnect() {
          this.connected = false;
        }
      },
      addEventListener() {},
      removeEventListener() {}
    };

    window.__emitCadencePacket = (bytes) => {
      const listener = characteristicListeners.get('characteristicvaluechanged');
      if (!listener) return;
      const buffer = Uint8Array.from(bytes).buffer;
      listener({ target: { value: new DataView(buffer) } });
    };

    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: () => Promise.resolve(mockDevice),
        getDevices: () => Promise.resolve([mockDevice])
      }
    });
  });

  await loadCatalog(page);
  await expect(page.locator('#sensorPanel')).toBeVisible();
  await page.locator('#connectSensorButton').click();
  await expect(page.locator('#sensorConnectionStatus')).toContainText('Connected');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scenicRideCatalog.sensorDeviceId')))
    .toBe('mock-cadence-device-1');

  // First packet only establishes the baseline counters (no RPM yet).
  await page.evaluate(() => window.__emitCadencePacket([0x02, 0x00, 0x00, 0x00, 0x00]));
  await expect(page.locator('#sensorCadenceValue')).toHaveText('-- rpm');
  // flags=0x02 (crank data), +1 crank rev over 1024 ticks (1 second) => 60 rpm.
  await page.evaluate(() => window.__emitCadencePacket([0x02, 0x01, 0x00, 0x00, 0x04]));
  await expect(page.locator('#sensorCadenceValue')).toHaveText('60 rpm');
});

test('PedalScape can simulate a cadence sensor from a debug URL flag', async ({ page }) => {
  test.skip(!IS_PEDALSCAPE, 'Bluetooth cadence UI is PedalScape-only for now.');

  await page.goto('/?debugSensor=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(`^\\d+ ${ACTIVITY_NOUN_S}s?$`));
  await expect(page.locator('#sensorPanel')).toBeVisible();
  await expect(page.locator('#sensorConnectionStatus')).toContainText('Debug cadence sensor connected.');
  await expect(page.locator('#sensorSavedDevice')).toHaveText('Debug cadence sensor');
  await expect(page.locator('#sensorCadenceValue')).toHaveText(/\d+ rpm/);

  const [playerBox, detailBox, sensorBox] = await Promise.all([
    page.locator('#playerShell').boundingBox(),
    page.locator('.route-detail').boundingBox(),
    page.locator('#sensorPanel').boundingBox()
  ]);
  expect(playerBox).not.toBeNull();
  expect(detailBox).not.toBeNull();
  expect(sensorBox).not.toBeNull();
  expect(sensorBox.y).toBeGreaterThanOrEqual(Math.max(playerBox.y + playerBox.height, detailBox.y + detailBox.height) - 1);

  await page.locator('#fullscreenButton').click();
  await expect(page.locator('.selected-layout')).toHaveClass(/sensor-fullscreen-modal/);
  await expect(page.locator('body')).toHaveClass(/sensor-fullscreen-open/);

  await page.keyboard.press('Escape');
  await expect(page.locator('.selected-layout')).not.toHaveClass(/sensor-fullscreen-modal/);
});

test('Simplified Chinese browser locale variants with multiple underscores resolve to zh-CN', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['zh_Hans_CN', 'en-US']
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => 'zh_Hans_CN'
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#filterTitle')).toHaveText('搜索与筛选');
});

test('production route cards show clean media badges without review metadata', async ({ page, request }) => {
  const catalogResponse = await request.get('/routes/catalog.json');
  const catalog = await catalogResponse.json();
  const routeWithReviewMetadata = {
    ...catalog.routes[0],
    title: 'Rallarvegen Norway Virtual Cycling Route',
    location: 'Rallarvegen, Italy, 60 min',
    terrain: 'mountain gravel road and highland cycling route',
    difficulty: 'moderate',
    sceneryTags: ['mountains', 'river', 'gravel'],
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

test('production route cards normalize scenery and terrain into useful badges', async ({ page, request }) => {
  const catalogResponse = await request.get('/routes/catalog.json');
  const catalog = await catalogResponse.json();
  await loadCatalog(page);

  // Pick a long-duration route (60+ min) and verify overlay badges include duration
  const longRoute = catalog.routes.find((r) => r.durationMinutes >= 60);
  expect(longRoute).toBeTruthy();
  const longCard = page.locator('.route-card').filter({ hasText: longRoute.title }).first();
  const longOverlayBadges = await longCard.locator('.route-card-badges li').allTextContents();
  expect(longOverlayBadges).toEqual(expect.arrayContaining(['60+ min']));
  expect(longOverlayBadges.length).toBeLessThanOrEqual(3);

  // Pick a 4K route and verify quality badge
  const hdRoute = catalog.routes.find((r) => /4k|uhd|2160/i.test(r.videoQuality || ''));
  expect(hdRoute).toBeTruthy();
  const hdCard = page.locator('.route-card').filter({ hasText: hdRoute.title }).first();
  const hdOverlayBadges = await hdCard.locator('.route-card-badges li').allTextContents();
  expect(hdOverlayBadges).toEqual(expect.arrayContaining(['4K']));

  // Verify metadata badges are present and capped at 6
  const firstCard = page.locator('.route-card').first();
  const firstMetadataBadges = await firstCard.locator('.route-metadata-badges li').allTextContents();
  expect(firstMetadataBadges.length).toBeGreaterThan(0);
  expect(firstMetadataBadges.length).toBeLessThanOrEqual(6);

  // Verify review-only metadata never leaks into production badges
  const allOverlayText = await page.locator('.route-card-badges').allTextContents();
  for (const text of allOverlayText) {
    expect(text).not.toMatch(/verify|before launch|training video/i);
  }
});

test('scenery filter uses normalized rider-facing categories', async ({ page }) => {
  await loadCatalog(page);

  const sceneryOptions = await page.locator('#sceneryFilter option').allTextContents();
  expect(sceneryOptions[0]).toBe('Any scenery');
  expect(sceneryOptions.length).toBeGreaterThan(2);
  // Normalized categories use title-case labels, never raw sceneryTag values
  const rawTags = ['alps', 'river', 'lake', 'beach', 'woods', 'urban'];
  for (const raw of rawTags) {
    expect(sceneryOptions).not.toContain(raw);
  }
  // Every non-"Any scenery" option should be a known normalized label
  const validLabels = ['Mountains', 'Water/Lakes', 'Coastal', 'Climb', 'Forest', 'Countryside', 'City', 'Flat/Easy', 'Gravel'];
  for (const option of sceneryOptions.slice(1)) {
    expect(validLabels).toContain(option);
  }

  // Pick the first available scenery filter and verify it works
  const filterValue = sceneryOptions[1];
  await page.locator('#sceneryFilter').selectOption(filterValue);
  await expect(page.locator('#sceneryFilter')).toHaveValue(filterValue);
  await expect(page.locator('.route-card').first()).toBeVisible();

  const visibleMetadata = await page.locator('.route-card .route-metadata-badges').allTextContents();
  expect(visibleMetadata.length).toBeGreaterThan(0);
  expect(visibleMetadata.every((text) => text.includes(filterValue))).toBeTruthy();

  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.filterPreferences')));
  expect(preferences).toMatchObject({ scenery: filterValue });
});

test('empty candidate backlog stays hidden until review mode and shows an empty state', async ({ page, request }) => {
  const backlogResponse = await request.get('/routes/candidate-backlog.json');
  expect(backlogResponse.ok()).toBeTruthy();
  const backlog = await backlogResponse.json();
  expect(backlog.schemaVersion).toBe(1);
  expect(Array.isArray(backlog.candidateRoutes)).toBeTruthy();
  expect(backlog.candidateRoutes).toHaveLength(0);

  await loadCatalogStatus(page);
  await expect(page.locator('#candidateBacklog')).toBeHidden();
  await expect(page.locator('.candidate-card')).toHaveCount(0);

  await page.goto('/?review=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#candidateBacklog')).toBeVisible();
  await expect(page.locator('.candidate-disclaimer')).toContainText('?review=1');
  await expect(page.locator('#candidateCount')).toContainText('0 candidates');
  await expect(page.locator('.candidate-card')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toContainText('No candidate backlog entries found.');
});

test('candidate review mode exports local decisions for a non-empty backlog', async ({ page }) => {
  const candidate = {
    id: 'candidate-synthetic-review-route',
    status: 'candidate',
    curationTier: 'backlog',
    promotionReadiness: 'needs-review',
    title: 'Synthetic Review Route',
    sourceUrl: 'https://www.youtube.com/watch?v=abc123review',
    embedUrl: 'https://www.youtube-nocookie.com/embed/abc123review',
    sourcePlatform: 'youtube',
    creator: 'Synthetic Creator',
    location: 'Test Valley, Cascadia',
    durationMinutes: 42,
    difficulty: 'moderate',
    terrain: 'paved riverside path',
    sceneryTags: ['river', 'forest'],
    videoQuality: '4K',
    audio: 'natural sounds, no music',
    cameraStyle: 'first-person POV',
    embeddingAllowed: true,
    license: 'Synthetic Playwright fixture; not production catalog data.',
    curationNotes: 'Synthetic candidate note for exercising review export.'
  };

  await page.route('**/routes/candidate-backlog.json', (route) => route.fulfill({
    json: {
      schemaVersion: 1,
      generatedAt: '2026-06-22',
      statusDefinitions: {
        candidate: 'Discovered public stream; metadata may be inferred and must be reviewed.',
        reviewed: 'Human verified source, embed playback, duration, quality, route/location, and legal stance.',
        featured: 'Top-quality reviewed route appropriate for production catalog/homepage.',
        rejected: 'Failed source, legal, embedding, safety, quality, duplication, or pacing checks.'
      },
      curationTiers: {
        backlog: 'Unreviewed candidates used for research and triage.',
        reviewed: 'Eligible for import into production catalog after product fit check.',
        featured: 'Small hand-picked set exposed prominently in production and retained here for curation traceability.'
      },
      candidateRoutes: [candidate]
    }
  }));

  await page.goto('/?review=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#candidateBacklog')).toBeVisible();
  await expect(page.locator('#candidateCount')).toContainText('1 backlog');
  await expect(page.locator('.candidate-card')).toHaveCount(1);
  await expect(page.locator('.candidate-card').first()).toContainText(candidate.title);
  expect(candidate).toEqual(expect.objectContaining({
    id: expect.any(String),
    title: expect.any(String),
    sourceUrl: expect.any(String)
  }));

  await page.locator('.candidate-card').first().locator('.decision-button--promote').click();
  await page.locator('.candidate-card').first().locator('.candidate-note-input').fill('Looks like a strong fit.');
  await expect(page.locator('.candidate-card').first().locator('.review-decision-badge')).toHaveText('Promote/Yes');
  await expect
    .poll(() => page.evaluate(key => localStorage.getItem(key), `${SITE_NAME}.reviewDecisions`))
    .toContain(candidate.id);

  const exportData = await page.evaluate(() => {
    document.querySelector('#exportReviewDecisionsButton').click();
    return JSON.parse(document.querySelector('#reviewDecisionsOutput').value);
  });
  expect(exportData.reviewDecisions).toEqual([
    expect.objectContaining({
      id: candidate.id,
      title: candidate.title,
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

test('search and select filters update results and persist preferences', async ({ page, request }) => {
  const catalogResponse = await request.get('/routes/catalog.json');
  const catalog = await catalogResponse.json();
  await loadCatalog(page);
  const initialCount = await page.locator('.route-card').count();

  // Use the country from the first route's location as a search term
  const firstLocation = catalog.routes[0].location || '';
  const searchTerm = firstLocation.split(',').pop().trim();

  await page.locator('#searchInput').fill(searchTerm);
  await expect(page.locator('#resultCount')).toHaveText(new RegExp(ACTIVITY_NOUN_S));
  await expect(page.locator('.route-card').first()).toContainText(new RegExp(searchTerm, 'i'));

  await page.locator('#durationFilter').selectOption('long');
  await expect(page.locator('#durationFilter')).toHaveValue('long');

  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.filterPreferences')));
  expect(preferences).toMatchObject({ query: searchTerm.toLowerCase(), duration: 'long' });

  await page.reload();
  await expect(page.locator('#searchInput')).toHaveValue(searchTerm.toLowerCase());
  await expect(page.locator('#durationFilter')).toHaveValue('long');

  await page.locator('#searchInput').fill('no-route-should-match-this-filter');
  await expect(page.locator('.empty-state')).toContainText('No routes match these filters.');
  await expect(page.locator('.clear-filters-button')).toHaveText('Clear filters');
  await page.locator('.clear-filters-button').click();
  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#durationFilter')).toHaveValue('all');
  await expect(page.locator('#favoritesFilter')).not.toBeChecked();
  await expect(page.locator('.route-card')).toHaveCount(initialCount);
});

test('starting a ride stores continue state, recents, hero continue, and loads iframe', async ({ page }) => {
  await loadCatalog(page);

  const firstCard = page.locator('.route-card').first();
  const firstTitle = (await firstCard.locator('h3').textContent()).trim();
  await firstCard.click();
  await expect(page.locator('#selectedTitle')).toHaveText(firstTitle);
  await expect(page.locator('#playerShell iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed/);

  await page.locator('#startRideButton').click();
  await expect(page.locator('#heroLabel')).toContainText(`Continue ${ACTIVITY_NOUN}`);
  await expect(page.locator('#heroRouteButton')).toHaveText(`Continue this ${ACTIVITY_NOUN}`);
  await expect(page.locator('#recentRoutes .recent-route-button').first()).toHaveText(firstTitle);

  const localState = await page.evaluate(() => ({
    selected: localStorage.getItem('scenicRideCatalog.selectedRouteId'),
    recents: JSON.parse(localStorage.getItem('scenicRideCatalog.recentRouteIds'))
  }));
  expect(localState.selected).toBeTruthy();
  expect(localState.recents).toEqual([localState.selected]);

  await page.reload();
  await expect(page.locator('#heroLabel')).toContainText(`Continue ${ACTIVITY_NOUN}`);
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
  await expect(page.locator('#recentRoutes')).toContainText(`Select or start a ${ACTIVITY_NOUN} to build recent routes.`);
  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#durationFilter')).toHaveValue('all');
  await expect(page.locator('#favoritesFilter')).not.toBeChecked();
  await expect(page.locator('.route-card')).toHaveCount(initialCount);

  const localState = await page.evaluate(() => ({
    selected: localStorage.getItem('scenicRideCatalog.selectedRouteId'),
    favorites: localStorage.getItem('scenicRideCatalog.favoriteRouteIds'),
    recents: localStorage.getItem('scenicRideCatalog.recentRouteIds'),
    preferences: localStorage.getItem('scenicRideCatalog.filterPreferences'),
    sensorId: localStorage.getItem('scenicRideCatalog.sensorDeviceId'),
    sensorName: localStorage.getItem('scenicRideCatalog.sensorDeviceName')
  }));
  const expectedState = {
    selected: null,
    favorites: null,
    recents: null,
    preferences: null,
    sensorId: null,
    sensorName: null
  };
  if (!IS_PEDALSCAPE) {
    expectedState.sensorId = null;
    expectedState.sensorName = null;
  }
  expect(localState).toEqual(expectedState);
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

test('PWA update waits for an explicit refresh action and reports connectivity', async ({ page }) => {
  await page.addInitScript(() => {
    const serviceWorkerListeners = {};
    const registrationListeners = {};
    const registration = {
      installing: null,
      waiting: null,
      addEventListener(type, listener) {
        registrationListeners[type] = registrationListeners[type] || [];
        registrationListeners[type].push(listener);
      }
    };

    window.__lastServiceWorkerMessage = null;
    window.__triggerPwaUpdate = () => {
      const workerListeners = {};
      const worker = {
        state: 'installing',
        postMessage(message) {
          window.__lastServiceWorkerMessage = message;
        },
        addEventListener(type, listener) {
          workerListeners[type] = workerListeners[type] || [];
          workerListeners[type].push(listener);
        }
      };

      registration.installing = worker;
      registration.waiting = worker;
      for (const listener of registrationListeners.updatefound || []) listener();
      worker.state = 'installed';
      for (const listener of workerListeners.statechange || []) listener();
    };

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        addEventListener(type, listener) {
          serviceWorkerListeners[type] = serviceWorkerListeners[type] || [];
          serviceWorkerListeners[type].push(listener);
        },
        register() {
          window.__serviceWorkerRegistered = true;
          return Promise.resolve(registration);
        }
      }
    });
  });

  await loadCatalogStatus(page);
  await expect.poll(() => page.evaluate(() => window.__serviceWorkerRegistered)).toBeTruthy();

  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#appStatus')).toHaveText('Offline — cached routes and the app shell remain available.');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#appStatus')).toHaveText('Back online. New route data can load again.');

  await page.evaluate(() => window.__triggerPwaUpdate());
  await expect(page.locator('#appStatus')).toHaveText('Update ready. Refresh when you’re ready.');
  await expect(page.locator('#updateButton')).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#appStatus')).toHaveText('Update ready. Refresh when you’re ready.');

  await page.locator('#updateButton').click();
  await expect(page.locator('#updateButton')).toBeHidden();
  await expect(page.locator('#appStatus')).toHaveText('Applying update…');
  await expect.poll(() => page.evaluate(() => window.__lastServiceWorkerMessage)).toEqual({ type: 'SKIP_WAITING' });
});

test(`exports only ${SITE_NAME} local data and imports a validated backup`, async ({ page }) => {
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
  const expectedBackupKeys = IS_PEDALSCAPE
    ? ['favoriteRouteIds', 'filterPreferences', 'recentRouteIds', 'selectedRouteId', 'sensorDeviceId', 'sensorDeviceName']
    : ['favoriteRouteIds', 'filterPreferences', 'recentRouteIds', 'selectedRouteId'];
  expect(Object.keys(backup.localData).sort()).toEqual(expectedBackupKeys);
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
      filterPreferences: { query: 'bavaria', duration: 'long', scenery: 'all', intensity: 'all', favoritesOnly: true },
      ...(IS_PEDALSCAPE
        ? {
            sensorDeviceId: 'mock-cadence-device-2',
            sensorDeviceName: 'Saved Mock Sensor'
          }
        : {})
    }
  };

  await page.locator('#importDataInput').setInputFiles({
    name: `${SITE_SLUG}-backup.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importBackup))
  });

  await expect(page.locator('#appStatus')).toHaveText('Local backup imported. Stale route IDs were ignored.');
  await expect(page.locator('#favoriteCount')).toHaveText('1 favorite');
  expect(await page.evaluate(() => localStorage.getItem('unrelated.key'))).toBe('leave me alone');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.favoriteRouteIds')))).toEqual([firstRouteId]);
  if (IS_PEDALSCAPE) {
    expect(await page.evaluate(() => localStorage.getItem('scenicRideCatalog.sensorDeviceId'))).toBe('mock-cadence-device-2');
    expect(await page.evaluate(() => localStorage.getItem('scenicRideCatalog.sensorDeviceName'))).toBe('Saved Mock Sensor');
  }
});

test('rejects invalid local backup before writing app data', async ({ page }) => {
  await loadCatalog(page);
  await page.evaluate(() => localStorage.setItem('scenicRideCatalog.favoriteRouteIds', JSON.stringify(['keep-me'])));

  await page.locator('#importDataInput').setInputFiles({
    name: `not-${SITE_SLUG}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'OtherApp', schemaVersion: 1, localData: {} }))
  });

  await expect(page.locator('#appStatus')).toContainText(`Import failed: Backup is not for ${SITE_NAME}.`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scenicRideCatalog.favoriteRouteIds')))).toEqual(['keep-me']);
});
