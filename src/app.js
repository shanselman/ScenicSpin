let routes = [];
let candidateRoutes = [];
let deferredInstallPrompt = null;
let pendingServiceWorker = null;
let applyingServiceWorkerUpdate = false;

const catalogUrl = 'routes/catalog.json';
const candidateBacklogUrl = 'routes/candidate-backlog.json';
const selectedRouteStorageKey = 'scenicRideCatalog.selectedRouteId';
const favoriteRoutesStorageKey = 'scenicRideCatalog.favoriteRouteIds';
const recentRoutesStorageKey = 'scenicRideCatalog.recentRouteIds';
const filterPreferencesStorageKey = 'scenicRideCatalog.filterPreferences';
const sensorDeviceIdStorageKey = 'scenicRideCatalog.sensorDeviceId';
const sensorDeviceNameStorageKey = 'scenicRideCatalog.sensorDeviceName';
const candidateReviewDecisionsStorageKey = '{{SITE_NAME}}.reviewDecisions';
const localBackupSchemaVersion = 1;
const localBackupAppName = '{{SITE_NAME}}';
const siteSlug = '{{SITE_SLUG}}';
const isPedalScape = siteSlug === 'pedalscape';
const localStorageKeys = [
  selectedRouteStorageKey,
  favoriteRoutesStorageKey,
  recentRoutesStorageKey,
  filterPreferencesStorageKey,
  ...(isPedalScape ? [sensorDeviceIdStorageKey, sensorDeviceNameStorageKey] : [])
];
const cadenceServiceUuid = '00001816-0000-1000-8000-00805f9b34fb';
const cadenceMeasurementUuid = '00002a5b-0000-1000-8000-00805f9b34fb';
const defaultCadenceStalenessLimit = 4;
const minValidCadenceRpm = 0;
const maxValidCadenceRpm = 200;
const debugSensorQueryKeys = ['debugSensor', 'sensorDebug', 'debugCadence'];
const debugSensorDeviceId = 'debug-cadence-sensor';
const debugSensorDeviceName = 'Debug cadence sensor';
const defaultRecommendationId = 'bavarian-countryside-90-minute-4k';
const maxRecentRoutes = 5;
const maxRouteOverlayBadges = 4;
const maxRouteMetadataBadges = 6;
const normalizedSceneryCategories = [
  { label: 'Mountains', pattern: /\b(alps?|alpine|dolomites?|rockies|rocky mountains?|mountains?|highlands?|mesa)\b/ },
  { label: 'Water/Lakes', pattern: /\b(lakes?|rivers?|riverside|waterfront|lakeside|fjord|canal|loch|reservoir)\b/ },
  { label: 'Coastal', pattern: /\b(coasts?|coastal|islands?|ocean|seaside|shoreline|beach|mediterranean)\b/ },
  { label: 'Climb', pattern: /\b(climbs?|climbing|ascent|uphill|passes?|passo|summit|switchback)\b/ },
  { label: 'Forest', pattern: /\b(forests?|woodlands?|woods)\b/ },
  { label: 'Countryside', pattern: /\b(countryside|rural|farmland|pastoral|valleys?|vineyards?|villages?)\b/ },
  { label: 'City', pattern: /\b(city|urban|historic town)\b/ },
  { label: 'Flat/Easy', pattern: /\b(flat|easy|gentle|relaxed|river paths?|riverside paths?)\b/ },
  { label: 'Gravel', pattern: /\bgravel\b/ }
];
const candidateDecisionLabels = {
  promote: 'Promote/Yes',
  reject: 'Reject/No',
  defer: 'Defer/Maybe'
};

let i18n = {};

const supportedLocales = ['en', 'es', 'fr', 'it', 'tr', 'zh-TW', 'zh-CN'];

function resolveLocale(preferredLocales) {
  for (const locale of preferredLocales) {
    if (!locale) continue;

    const normalized = locale.replaceAll('_', '-').toLowerCase();
    const exactMatch = supportedLocales.find((supported) => supported.toLowerCase() === normalized);
    if (exactMatch) return exactMatch;

    if (normalized === 'zh' || normalized.startsWith('zh-hant') || normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo')) {
      return 'zh-TW';
    }

    if (normalized.startsWith('zh-hans') || normalized.startsWith('zh-cn') || normalized.startsWith('zh-sg')) {
      return 'zh-CN';
    }

    const primary = normalized.split('-')[0];
    const primaryMatch = supportedLocales.find((supported) => supported === primary);
    if (primaryMatch) return primaryMatch;
  }

  return 'en';
}

async function loadLocale() {
  const stored = localStorage.getItem('lang');
  const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  const target = resolveLocale([stored, ...browserLocales]);
  try {
    const res = await fetch(`locales/${target}.json`);
    i18n = await res.json();
  } catch {
    // fallback silently — strings stay as hardcoded English
  }
  document.documentElement.lang = target;
  applyStaticI18n();
  applyLangSwitcherActive(target);
}

function t(key, vars = {}) {
  let str = i18n[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{{${k}}}`, v);
  }
  // Auto-resolve remaining {{key}} references from the i18n dictionary (one level)
  str = str.replace(/\{\{(\w+)\}\}/g, (match, ref) => i18n[ref] ?? match);
  return str;
}

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const varsAttr = el.getAttribute('data-i18n-vars');
    const vars = varsAttr ? JSON.parse(varsAttr) : {};
    el.textContent = t(key, vars);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    el.innerHTML = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    el.setAttribute('aria-label', t(key));
  });
}

function applyLangSwitcherActive(lang) {
  document.querySelectorAll('.lang-switcher a').forEach((el) => {
    const active = el.dataset.lang === lang;
    el.classList.toggle('active-lang', active);
    if (active) {
      el.setAttribute('aria-current', 'true');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}

function bindLangSwitcher() {
  document.querySelectorAll('.lang-switcher a').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      const lang = el.dataset.lang;
      localStorage.setItem('lang', lang);
      window.location.reload();
    });
  });
}

const state = {
  selectedRoute: null,
  featuredRoute: null,
  favoriteRouteIds: new Set(),
  recentRouteIds: [],
  heroMode: 'recommended',
  query: '',
  duration: 'all',
  scenery: 'all',
  intensity: 'all',
  favoritesOnly: false,
  catalogStatus: 'loading',
  candidateStatus: 'idle',
  reviewMode: false,
  candidateCopyMessage: '',
  candidateReviewDecisions: {},
  reviewDecisionStatus: '',
  sensorStatus: 'idle',
  sensorStatusDetail: '',
  sensorDeviceId: null,
  sensorDeviceName: '',
  sensorCurrentRpm: null,
  sensorAutoReconnectAttempted: false,
  sensorDebugActive: false
};

const elements = {
  heroImage: document.querySelector('#heroImage'),
  heroImageFallback: document.querySelector('#heroImageFallback'),
  heroLabel: document.querySelector('#heroLabel'),
  heroSelection: document.querySelector('#heroSelection'),
  heroMetadata: document.querySelector('#heroMetadata'),
  heroRouteButton: document.querySelector('#heroRouteButton'),
  searchInput: document.querySelector('#searchInput'),
  durationFilter: document.querySelector('#durationFilter'),
  sceneryFilter: document.querySelector('#sceneryFilter'),
  intensityFilter: document.querySelector('#intensityFilter'),
  favoritesFilter: document.querySelector('#favoritesFilter'),
  favoriteCount: document.querySelector('#favoriteCount'),
  recentRoutes: document.querySelector('#recentRoutes'),
  resultCount: document.querySelector('#resultCount'),
  routeGrid: document.querySelector('#routeGrid'),
  candidateBacklog: document.querySelector('#candidateBacklog'),
  candidateCount: document.querySelector('#candidateCount'),
  candidateGrid: document.querySelector('#candidateGrid'),
  exportReviewDecisionsButton: document.querySelector('#exportReviewDecisionsButton'),
  reviewDecisionStatus: document.querySelector('#reviewDecisionStatus'),
  reviewDecisionsOutput: document.querySelector('#reviewDecisionsOutput'),
  selectedLayout: document.querySelector('.selected-layout'),
  playerShell: document.querySelector('#playerShell'),
  sensorPanel: document.querySelector('#sensorPanel'),
  footerMyCadence: document.querySelector('#footerMyCadence'),
  sensorConnectionStatus: document.querySelector('#sensorConnectionStatus'),
  sensorSavedDevice: document.querySelector('#sensorSavedDevice'),
  sensorCadenceValue: document.querySelector('#sensorCadenceValue'),
  connectSensorButton: document.querySelector('#connectSensorButton'),
  reconnectSensorButton: document.querySelector('#reconnectSensorButton'),
  disconnectSensorButton: document.querySelector('#disconnectSensorButton'),
  forgetSensorButton: document.querySelector('#forgetSensorButton'),
  selectedTitle: document.querySelector('#selectedTitle'),
  selectedDescription: document.querySelector('#selectedDescription'),
  selectedMetadata: document.querySelector('#selectedMetadata'),
  startRideButton: document.querySelector('#startRideButton'),
  favoriteRouteButton: document.querySelector('#favoriteRouteButton'),
  fullscreenButton: document.querySelector('#fullscreenButton'),
  sourceLink: document.querySelector('#sourceLink'),
  installButton: document.querySelector('#installButton'),
  updateButton: document.querySelector('#updateButton'),
  exportDataButton: document.querySelector('#exportDataButton'),
  copyDataButton: document.querySelector('#copyDataButton'),
  importDataInput: document.querySelector('#importDataInput'),
  resetDataButton: document.querySelector('#resetDataButton'),
  appStatus: document.querySelector('#appStatus'),
  backupJsonOutput: document.querySelector('#backupJsonOutput')
};

let bluetoothDevice = null;
let cadenceCharacteristic = null;
let debugSensorTimer = null;
const cadenceParser = createCadenceParser(defaultCadenceStalenessLimit);

function isDebugSensorRequested() {
  if (!isPedalScape) return false;
  const params = new URLSearchParams(window.location.search);
  return debugSensorQueryKeys.some((key) => {
    const value = params.get(key);
    if (key === 'debugCadence' && Number.isFinite(Number.parseInt(value || '', 10))) return true;
    return value === '' || value === '1' || value === 'true' || value === 'yes';
  });
}

function isSensorConnected() {
  return state.sensorDebugActive || Boolean(bluetoothDevice?.gatt?.connected);
}

function createCadenceParser(stalenessLimit = defaultCadenceStalenessLimit) {
  let prevCumCrankRev = 0;
  let prevCrankTime = 0;
  let prevRpm = 0;
  let prevStaleness = 0;
  let hasBaseline = false;
  let currentStalenessLimit = Math.max(2, stalenessLimit);

  const readUInt16LE = (bytes, index) => {
    if (index + 1 >= bytes.length) return null;
    return bytes[index] | (bytes[index + 1] << 8);
  };

  return {
    reset(nextLimit = currentStalenessLimit) {
      prevCumCrankRev = 0;
      prevCrankTime = 0;
      prevRpm = 0;
      prevStaleness = 0;
      hasBaseline = false;
      currentStalenessLimit = Math.max(2, nextLimit);
    },
    parse(bytes) {
      if (!Array.isArray(bytes) || bytes.length === 0) return null;
      const flags = bytes[0];
      const hasWheel = (flags & 0b00000001) !== 0;
      const hasCrank = (flags & 0b00000010) !== 0;
      if (!hasCrank) return null;

      let crankRevIndex = hasWheel ? 7 : 1;
      let crankTimeIndex = hasWheel ? 9 : 3;

      let cumCrankRev = readUInt16LE(bytes, crankRevIndex);
      let lastCrankTime = readUInt16LE(bytes, crankTimeIndex);

      if (cumCrankRev === null || lastCrankTime === null) {
        crankRevIndex = 1;
        crankTimeIndex = 3;
        cumCrankRev = readUInt16LE(bytes, crankRevIndex);
        lastCrankTime = readUInt16LE(bytes, crankTimeIndex);
      }

      if (cumCrankRev === null || lastCrankTime === null) return null;

      if (!hasBaseline) {
        prevCumCrankRev = cumCrankRev;
        prevCrankTime = lastCrankTime;
        hasBaseline = true;
        return null;
      }

      let deltaRotations = cumCrankRev - prevCumCrankRev;
      if (deltaRotations < 0) deltaRotations += 65536;

      let timeDelta = lastCrankTime - prevCrankTime;
      if (timeDelta < 0) timeDelta += 65536;

      let rpm = 0;
      if (timeDelta !== 0) {
        prevStaleness = 0;
        const timeMinutes = timeDelta / 1024 / 60;
        rpm = timeMinutes > 0 ? deltaRotations / timeMinutes : 0;
        prevRpm = rpm;
      } else if (prevStaleness < currentStalenessLimit) {
        rpm = prevRpm;
        prevStaleness += 1;
      }

      prevCumCrankRev = cumCrankRev;
      prevCrankTime = lastCrankTime;
      hasBaseline = true;
      return Math.round(Math.max(0, rpm));
    }
  };
}

function titleCase(value) {
  if (typeof value !== 'string') return '';

  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return entities[character];
  });
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return t('duration_unknown');
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return t('duration_minutes', { minutes });
  if (remainingMinutes === 0) return t('duration_hours', { hours });
  return t('duration_hours_minutes', { hours, minutes: remainingMinutes });
}

function extractYouTubeId(route) {
  const embedMatch = route.embedUrl?.match(/embed\/([^?]+)/);
  if (embedMatch) return embedMatch[1];

  try {
    const source = new URL(route.sourceUrl);
    return source.searchParams.get('v') || source.pathname.split('/').filter(Boolean).pop();
  } catch {
    return null;
  }
}

function getYouTubeThumbnail(videoId, quality = 'hqdefault') {
  if (!videoId) return '';
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${quality}.jpg`;
}


function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripReviewerOnlyText(value) {
  const text = normalizeWhitespace(value);
  if (!text) return '';

  return text
    .split(/(?<=[.;])\s+|\s*[;|]\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !/(?:verify|reviewer|candidate backlog|promoted from candidate|aggressively promoted|before launch|oembed resolved|do not download|do not rehost|licensing\/platform playback)/i.test(part))
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function cleanPublicText(value, fallback = '') {
  return stripReviewerOnlyText(value) || fallback;
}

function cleanQualityBadges(route) {
  const text = `${route.videoQuality || ''} ${route.title || ''} ${Array.isArray(route.sceneryTags) ? route.sceneryTags.join(' ') : ''}`.toLowerCase();

  if (/\b4k\b|2160p|uhd/.test(text)) return ['4K'];
  if (/1080p|full\s*hd/.test(text)) return ['1080p'];
  if (/\bhd\b|720p/.test(text)) return ['HD'];
  return [];
}

function cleanAudioBadge(route) {
  const audio = cleanPublicText(route.audio).toLowerCase();

  if (!audio || /creator|original|video audio|training video audio|tour video audio|indoor cycling video audio/.test(audio)) return '';
  if (/natural|ambient|soundscape/.test(audio)) return 'Natural audio';
  if (/no music|music-free|without music/.test(audio)) return 'No music';
  if (/music/.test(audio)) return 'Music';
  if (/narrat|voice|spoken|commentary/.test(audio)) return 'Narration';
  if (/unknown|verify|review|tbd/.test(audio)) return '';
  return audio ? titleCase(audio.split(/[;,]/)[0].trim()) : '';
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanDurationBadge(route) {
  const minutes = route.durationMinutes;
  if (!Number.isFinite(minutes)) return '';
  if (minutes >= 60) return '60+ min';
  if (minutes < 30) return `${minutes} min`;
  return '';
}

function isDurationBadge(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return false;

  return /^(?:about|approx\.?|around)?\s*\d+\+?\s*(?:min|mins|minutes?|hr|hrs|hours?)$/.test(text) ||
    /^\d+\s*(?:hr|hrs|hours?)\s+\d+\s*(?:min|mins|minutes?)$/.test(text) ||
    /^\d+\s*[- ]\s*(?:min|mins|minutes?|hr|hrs|hours?)$/.test(text);
}

function cleanMetricsOverlayBadge(route) {
  const tags = Array.isArray(route.sceneryTags) ? route.sceneryTags.join(' ') : '';
  const text = [
    route.title,
    route.terrain,
    route.cameraStyle,
    route.videoQuality,
    tags
  ].map((value) => cleanPublicText(value).toLowerCase()).join(' ');

  return /\b(telemetry|garmin|gradient|speed graphics?|training overlays?|metrics overlay|data overlay|overlays?)\b/.test(text)
    ? 'Metrics overlay'
    : '';
}

function routeBadgeText(route) {
  const tags = Array.isArray(route.sceneryTags) ? route.sceneryTags.join(' ') : '';
  return [
    route.title,
    route.location,
    route.terrain,
    route.cameraStyle,
    route.difficulty,
    tags
  ].map((value) => cleanPublicText(value).toLowerCase()).join(' ');
}

function getNormalizedSceneryCategories(route) {
  const text = routeBadgeText(route);
  return normalizedSceneryCategories
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

function cleanLocationBadge(location) {
  const parts = cleanPublicText(location)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !isDurationBadge(part));
  return parts[parts.length - 1] || '';
}

function getRouteOverlayBadges(route) {
  return uniqueList([
    ...cleanQualityBadges(route),
    cleanMetricsOverlayBadge(route),
    cleanDurationBadge(route)
  ]).slice(0, maxRouteOverlayBadges);
}

function prioritizeSceneryBadges(categories) {
  const priority = ['Gravel', 'Climb', 'Flat/Easy', 'Mountains', 'Water/Lakes', 'Coastal', 'Forest', 'Countryside', 'City'];
  return [...categories].sort((left, right) => priority.indexOf(left) - priority.indexOf(right));
}

function getRouteMetadataBadges(route) {
  return uniqueList([
    cleanLocationBadge(route.location),
    route.intensity,
    ...prioritizeSceneryBadges(route.normalizedSceneryCategories || getNormalizedSceneryCategories(route)),
    cleanAudioBadge(route)
  ])
    .filter((badge) => !isDurationBadge(badge))
    .slice(0, maxRouteMetadataBadges);
}

function getThumbnailAltText(route) {
  return t('thumbnail_alt', { title: route.title });
}

function readStoredRouteId() {
  const storages = [sessionStorage, localStorage];

  for (const storage of storages) {
    try {
      const routeId = storage.getItem(selectedRouteStorageKey);
      if (routeId) return routeId;
    } catch {
      // Storage can be disabled; selection still works for the current page.
    }
  }

  return null;
}

function removeStoredRouteId() {
  try {
    sessionStorage.removeItem(selectedRouteStorageKey);
  } catch {
    // Storage can be disabled; selection still works for the current page.
  }

  try {
    localStorage.removeItem(selectedRouteStorageKey);
  } catch {
    // Storage can be disabled; selection still works for the current page.
  }
}

function saveSelectedRouteId(routeId) {
  try {
    sessionStorage.setItem(selectedRouteStorageKey, routeId);
  } catch {
    // Storage can be disabled; selection still works for the current page.
  }

  try {
    localStorage.setItem(selectedRouteStorageKey, routeId);
  } catch {
    // Storage can be disabled; selection still works for the current page.
  }
}

function isWebBluetoothSupported() {
  if (isDebugSensorRequested()) return true;
  return Boolean(navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

function canReconnectSavedSensor() {
  if (isDebugSensorRequested()) return true;
  return Boolean(navigator.bluetooth && typeof navigator.bluetooth.getDevices === 'function');
}

function readStoredSensorDeviceId() {
  if (!isPedalScape) return null;
  try {
    const value = localStorage.getItem(sensorDeviceIdStorageKey);
    return typeof value === 'string' && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function readStoredSensorDeviceName() {
  if (!isPedalScape) return '';
  try {
    return localStorage.getItem(sensorDeviceNameStorageKey) || '';
  } catch {
    return '';
  }
}

function saveStoredSensor(deviceId, deviceName = '') {
  if (!isPedalScape || !deviceId) return;
  try {
    localStorage.setItem(sensorDeviceIdStorageKey, deviceId);
    if (deviceName) {
      localStorage.setItem(sensorDeviceNameStorageKey, deviceName);
    } else {
      localStorage.removeItem(sensorDeviceNameStorageKey);
    }
  } catch {
    // Local app features gracefully degrade when storage is disabled.
  }
  state.sensorDeviceId = deviceId;
  state.sensorDeviceName = deviceName || '';
}

function clearStoredSensor() {
  if (!isPedalScape) return;
  try {
    localStorage.removeItem(sensorDeviceIdStorageKey);
    localStorage.removeItem(sensorDeviceNameStorageKey);
  } catch {
    // Local app features gracefully degrade when storage is disabled.
  }
  state.sensorDeviceId = null;
  state.sensorDeviceName = '';
}

function readLocalJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Local app features gracefully degrade when storage is disabled.
    }
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local app features gracefully degrade when storage is disabled.
  }
}

function normalizeCandidateReviewDecisions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((decisions, [candidateId, review]) => {
    if (typeof candidateId !== 'string' || !review || typeof review !== 'object' || Array.isArray(review)) {
      return decisions;
    }

    const decision = ['promote', 'reject', 'defer'].includes(review.decision) ? review.decision : '';
    const note = typeof review.note === 'string' ? review.note : '';
    if (decision || note.trim()) decisions[candidateId] = { decision, note };
    return decisions;
  }, {});
}

function loadLocalState() {
  const favoriteRouteIds = readLocalJson(favoriteRoutesStorageKey, []);
  const recentRouteIds = readLocalJson(recentRoutesStorageKey, []);
  state.favoriteRouteIds = new Set(Array.isArray(favoriteRouteIds) ? favoriteRouteIds.filter((id) => typeof id === 'string') : []);
  state.recentRouteIds = Array.isArray(recentRouteIds) ? recentRouteIds.filter((id) => typeof id === 'string') : [];
  state.candidateReviewDecisions = normalizeCandidateReviewDecisions(readLocalJson(candidateReviewDecisionsStorageKey, {}));
  if (isPedalScape) {
    state.sensorDeviceId = readStoredSensorDeviceId();
    state.sensorDeviceName = readStoredSensorDeviceName();
    state.sensorStatus = isWebBluetoothSupported() ? 'disconnected' : 'unsupported';
    state.sensorStatusDetail = '';
    state.sensorCurrentRpm = null;
  }
}

function routeExists(routeId) {
  return routes.some((route) => route.id === routeId);
}

function cleanupLocalRouteIds() {
  if (routes.length === 0) return;

  state.favoriteRouteIds = new Set([...state.favoriteRouteIds].filter(routeExists));
  state.recentRouteIds = state.recentRouteIds.filter(routeExists).slice(0, maxRecentRoutes);
  const storedRouteId = readStoredRouteId();
  if (storedRouteId && !routeExists(storedRouteId)) removeStoredRouteId();
  saveFavorites();
  saveRecentRoutes();
}

function isFavorite(routeId) {
  return state.favoriteRouteIds.has(routeId);
}

function saveFavorites() {
  writeLocalJson(favoriteRoutesStorageKey, [...state.favoriteRouteIds]);
}

function saveRecentRoutes() {
  writeLocalJson(recentRoutesStorageKey, state.recentRouteIds);
}

function addRecentRoute(routeId) {
  state.recentRouteIds = [
    routeId,
    ...state.recentRouteIds.filter((id) => id !== routeId)
  ].slice(0, maxRecentRoutes);
  saveRecentRoutes();
}

function saveFilterPreferences() {
  writeLocalJson(filterPreferencesStorageKey, {
    query: state.query,
    duration: state.duration,
    scenery: state.scenery,
    intensity: state.intensity,
    favoritesOnly: state.favoritesOnly
  });
}

function saveCandidateReviewDecisions() {
  writeLocalJson(candidateReviewDecisionsStorageKey, state.candidateReviewDecisions);
}

function getCandidateReview(candidateId) {
  return state.candidateReviewDecisions[candidateId] || { decision: '', note: '' };
}

function getCandidateReviewLabel(decision) {
  return candidateDecisionLabels[decision] || t('candidate_decision_unreviewed');
}

function setCandidateReviewDecision(candidateId, decision) {
  const currentReview = getCandidateReview(candidateId);
  const nextDecision = currentReview.decision === decision ? '' : decision;
  const nextReview = {
    decision: nextDecision,
    note: currentReview.note || ''
  };

  if (!nextReview.decision && !nextReview.note.trim()) {
    delete state.candidateReviewDecisions[candidateId];
  } else {
    state.candidateReviewDecisions[candidateId] = nextReview;
  }

  state.reviewDecisionStatus = t('candidate_decision_saved', { label: getCandidateReviewLabel(nextDecision) });
  saveCandidateReviewDecisions();
  renderCandidates();
}

function setCandidateReviewNote(candidateId, note) {
  const currentReview = getCandidateReview(candidateId);
  const nextReview = {
    decision: currentReview.decision || '',
    note
  };

  if (!nextReview.decision && !nextReview.note.trim()) {
    delete state.candidateReviewDecisions[candidateId];
  } else {
    state.candidateReviewDecisions[candidateId] = nextReview;
  }

  saveCandidateReviewDecisions();
}

function applyFilterPreferences() {
  const preferences = readLocalJson(filterPreferencesStorageKey, {});
  state.query = typeof preferences.query === 'string' ? preferences.query : '';
  state.duration = preferences.duration || 'all';
  state.scenery = preferences.scenery || 'all';
  state.intensity = preferences.intensity || 'all';
  state.favoritesOnly = Boolean(preferences.favoritesOnly);

  elements.searchInput.value = state.query;
  elements.durationFilter.value = state.duration;
  elements.sceneryFilter.value = state.scenery;
  elements.intensityFilter.value = state.intensity;
  elements.favoritesFilter.checked = state.favoritesOnly;

  if (elements.durationFilter.value !== state.duration) state.duration = 'all';
  if (elements.sceneryFilter.value !== state.scenery) state.scenery = 'all';
  if (elements.intensityFilter.value !== state.intensity) state.intensity = 'all';
  elements.durationFilter.value = state.duration;
  elements.sceneryFilter.value = state.scenery;
  elements.intensityFilter.value = state.intensity;
}

function getLocalBackupData() {
  const backup = {
    selectedRouteId: readStoredRouteId() || null,
    favoriteRouteIds: [...state.favoriteRouteIds],
    recentRouteIds: state.recentRouteIds,
    filterPreferences: {
      query: state.query,
      duration: state.duration,
      scenery: state.scenery,
      intensity: state.intensity,
      favoritesOnly: state.favoritesOnly
    }
  };

  if (isPedalScape) {
    backup.sensorDeviceId = state.sensorDeviceId || null;
    backup.sensorDeviceName = state.sensorDeviceName || null;
  }

  return backup;
}

function buildLocalBackup() {
  return {
    app: localBackupAppName,
    schemaVersion: localBackupSchemaVersion,
    exportedAt: new Date().toISOString(),
    localData: getLocalBackupData()
  };
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);
  const seen = new Set();

  return value.filter((item) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${fieldName} must contain only route ID strings.`);
    }
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function normalizeFilterPreferences(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('filterPreferences must be an object.');
  }

  return {
    query: typeof value.query === 'string' ? value.query.trim().toLowerCase() : '',
    duration: typeof value.duration === 'string' ? value.duration : 'all',
    scenery: typeof value.scenery === 'string' ? value.scenery : 'all',
    intensity: typeof value.intensity === 'string' ? value.intensity : 'all',
    favoritesOnly: Boolean(value.favoritesOnly)
  };
}

function validateLocalBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    throw new Error('Backup must be a JSON object.');
  }
  if (backup.app !== localBackupAppName) {
    throw new Error('Backup is not for {{SITE_NAME}}.');
  }
  if (backup.schemaVersion !== localBackupSchemaVersion) {
    throw new Error(`Unsupported backup version: ${backup.schemaVersion ?? 'missing'}.`);
  }
  if (!backup.localData || typeof backup.localData !== 'object' || Array.isArray(backup.localData)) {
    throw new Error('Backup is missing localData.');
  }

  const data = backup.localData;
  const selectedRouteId = data.selectedRouteId == null ? null : data.selectedRouteId;
  if (selectedRouteId !== null && typeof selectedRouteId !== 'string') {
    throw new Error('selectedRouteId must be a string or null.');
  }

  return {
    selectedRouteId,
    favoriteRouteIds: normalizeStringArray(data.favoriteRouteIds ?? [], 'favoriteRouteIds'),
    recentRouteIds: normalizeStringArray(data.recentRouteIds ?? [], 'recentRouteIds').slice(0, maxRecentRoutes),
    filterPreferences: normalizeFilterPreferences(data.filterPreferences),
    sensorDeviceId:
      data.sensorDeviceId == null
        ? null
        : typeof data.sensorDeviceId === 'string'
          ? data.sensorDeviceId
          : (() => { throw new Error('sensorDeviceId must be a string or null.'); })(),
    sensorDeviceName:
      data.sensorDeviceName == null
        ? null
        : typeof data.sensorDeviceName === 'string'
          ? data.sensorDeviceName
          : (() => { throw new Error('sensorDeviceName must be a string or null.'); })()
  };
}

function downloadLocalBackup() {
  const blob = new Blob([`${JSON.stringify(buildLocalBackup(), null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `pedalscape-local-backup-${dateStamp}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setAppStatus(t('export_success'));
}

async function copyLocalBackup() {
  const backupJson = JSON.stringify(buildLocalBackup(), null, 2);
  elements.backupJsonOutput.hidden = false;
  elements.backupJsonOutput.value = backupJson;

  try {
    await navigator.clipboard.writeText(backupJson);
    setAppStatus(t('copy_success'));
  } catch {
    setAppStatus(t('copy_fallback'));
  }
}

function applyImportedLocalData(data) {
  localStorageKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Local app features gracefully degrade when storage is disabled.
    }
  });
  removeStoredRouteId();

  if (data.selectedRouteId) saveSelectedRouteId(data.selectedRouteId);
  writeLocalJson(favoriteRoutesStorageKey, data.favoriteRouteIds);
  writeLocalJson(recentRoutesStorageKey, data.recentRouteIds);
  writeLocalJson(filterPreferencesStorageKey, data.filterPreferences);
  if (isPedalScape) {
    if (typeof data.sensorDeviceId === 'string' && data.sensorDeviceId) {
      saveStoredSensor(data.sensorDeviceId, data.sensorDeviceName || '');
    } else {
      clearStoredSensor();
    }
  }

  loadLocalState();
  state.sensorAutoReconnectAttempted = false;
  renderSensorPanel();
  cleanupLocalRouteIds();
  applyFilterPreferences();
  autoReconnectSavedSensor().catch(() => {
    // Import should succeed even if reconnect is unavailable.
  });

  const featured = routes.length > 0 ? chooseFeaturedRoute() : { route: null, mode: 'recommended' };
  setFeaturedRoute(featured.route, featured.mode);
  if (featured.route) {
    selectRoute(featured.route.id, false, { persist: featured.mode === 'continue', updateHero: false });
  } else {
    clearSelectedRoute();
    renderCatalog();
  }
}

async function importLocalBackup(file) {
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());
    const data = validateLocalBackup(backup);
    applyImportedLocalData(data);
    setAppStatus(t('import_success'));
  } catch (error) {
    setAppStatus(t('import_failed', { message: error.message }));
  } finally {
    elements.importDataInput.value = '';
  }
}

function isYouTubeRoute(route) {
  return route.sourcePlatform === 'youtube' || /youtu\.?be|youtube(-nocookie)?\.com/.test(`${route.sourceUrl || ''} ${route.embedUrl || ''}`);
}

function normalizeRoute(route) {
  const sceneryTags = Array.isArray(route.sceneryTags)
    ? route.sceneryTags.map((tag) => cleanPublicText(tag)).filter(Boolean)
    : [];
  const difficulty = route.difficulty ? titleCase(cleanPublicText(route.difficulty, route.difficulty)) : 'Unrated';
  const youtubeRoute = isYouTubeRoute(route);
  const videoId = youtubeRoute ? extractYouTubeId(route) : null;
  const thumbnailUrl = route.thumbnailUrl || route.imageUrl || getYouTubeThumbnail(videoId, 'hqdefault');
  const thumbnailFallbackUrl = youtubeRoute && videoId ? getYouTubeThumbnail(videoId, 'mqdefault') : '';
  const title = cleanPublicText(route.title, `Untitled ${t('activity_noun_singular')}`);
  const location = cleanPublicText(route.location, 'Location to be announced');
  const terrain = cleanPublicText(route.terrain, 'Scenic cycling route');
  const creator = cleanPublicText(route.creator, 'Public video source');
  const routeForBadges = { ...route, title, location, sceneryTags };
  const normalizedScenery = getNormalizedSceneryCategories(routeForBadges);
  const overlayBadges = getRouteOverlayBadges(routeForBadges);
  const metadataBadges = getRouteMetadataBadges({ ...routeForBadges, intensity: difficulty, normalizedSceneryCategories: normalizedScenery });

  return {
    ...route,
    title,
    location,
    terrain,
    creator,
    durationLabel: formatDuration(route.durationMinutes),
    scenery: sceneryTags[0] ? titleCase(sceneryTags[0]) : 'Scenic',
    sceneryTags,
    intensity: difficulty,
    sourceType: route.sourcePlatform || 'external',
    videoId,
    thumbnailUrl,
    thumbnailFallbackUrl,
    normalizedSceneryCategories: normalizedScenery,
    overlayBadges,
    metadataBadges,
    mediaBadges: overlayBadges,
    videoQualityBadge: overlayBadges.find((badge) => /^(?:4K|1080p|HD)$/.test(badge)) || '',
    audioBadge: metadataBadges.find((badge) => /audio|music|narration/i.test(badge)) || '',
    description: `${terrain} • ${creator}`
  };
}


function normalizeCandidateRoute(route) {
  const normalizedRoute = normalizeRoute(route);
  const reviewChecklist = Array.isArray(route.verification?.reviewChecklist) ? route.verification.reviewChecklist : [];

  return {
    ...normalizedRoute,
    status: route.status || 'candidate',
    curationTier: route.curationTier || 'backlog',
    promotionReadiness: route.promotionReadiness || 'needs-review',
    reviewChecklist,
    reviewNotes: route.reviewNotes || route.curationNotes || 'No review notes yet.',
    productionCatalogId: route.productionCatalogId || '',
    promotedToCatalogAt: route.promotedToCatalogAt || ''
  };
}

function formatCandidateStatus(candidate) {
  const status = titleCase(String(candidate.status || 'candidate').replace(/-/g, ' '));
  const readiness = titleCase(String(candidate.promotionReadiness || 'needs-review').replace(/-/g, ' '));
  return `${status} · ${readiness}`;
}

function cleanCandidateQualityBadge(candidate) {
  const text = `${candidate.videoQuality || ''} ${candidate.title || ''}`.toLowerCase();
  if (/\b4k\b|2160p/.test(text)) return '4K';
  if (/1080p/.test(text)) return '1080p';
  if (/\bhd\b|720p/.test(text)) return 'HD';
  return '';
}

function cleanCandidateAudioBadge(candidate) {
  const audio = String(candidate.audio || '').toLowerCase();
  if (!audio || /verify|review|unknown|tbd/.test(audio)) return '';
  if (/natural|ambient|soundscape|road|trail|no music/.test(audio)) return 'Natural audio';
  if (/music/.test(audio)) return 'Music';
  if (/narrat|voice|spoken|commentary/.test(audio)) return 'Narration';
  return titleCase(audio.split(/[;,]/)[0].trim());
}

function getCandidateBadges(candidate) {
  return [
    cleanCandidateQualityBadge(candidate),
    cleanCandidateAudioBadge(candidate),
    candidate.embeddingAllowed || candidate.embedUrl ? t('candidate_badge_embed_ok') : '',
    candidate.promotionReadiness === 'promoted-to-production' ? t('candidate_badge_promoted') : t('candidate_badge_needs_review')
  ].filter(Boolean);
}

function isReviewModeUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('review') === '1' || window.location.hash === '#review';
}

function applyReviewModeFromUrl() {
  const reviewMode = isReviewModeUrl();
  state.reviewMode = reviewMode;
  elements.candidateBacklog.hidden = !reviewMode;

  if (reviewMode && window.location.hash === '#review') {
    window.requestAnimationFrame(() => elements.candidateBacklog.scrollIntoView({ block: 'start' }));
  }

  if (reviewMode && state.candidateStatus === 'idle') {
    loadCandidateBacklog();
    return;
  }

  renderCandidates();
}

function buildReviewDecisionExport() {
  return candidateRoutes
    .map((candidate) => {
      const review = getCandidateReview(candidate.id);
      if (!review.decision && !review.note.trim()) return null;

      const exportedReview = {
        id: candidate.id,
        title: candidate.title,
        decision: review.decision || 'note-only'
      };
      if (review.note.trim()) exportedReview.note = review.note.trim();
      return exportedReview;
    })
    .filter(Boolean);
}

async function copyReviewDecisions() {
  const decisions = buildReviewDecisionExport();
  const exportText = JSON.stringify({
    app: '{{SITE_NAME}}',
    exportedAt: new Date().toISOString(),
    reviewDecisions: decisions
  }, null, 2);

  elements.reviewDecisionsOutput.hidden = false;
  elements.reviewDecisionsOutput.value = exportText;

  try {
    await navigator.clipboard.writeText(exportText);
    state.reviewDecisionStatus = t('candidate_copy_success', { count: decisions.length, decision_label: decisions.length === 1 ? t('candidate_decisions_one') : t('candidate_decisions_other') });
  } catch {
    state.reviewDecisionStatus = t('candidate_copy_fallback', { count: decisions.length, decision_label: decisions.length === 1 ? t('candidate_decisions_one') : t('candidate_decisions_other') });
  }

  renderCandidates();
}

function setControlsDisabled(disabled) {
  [
    elements.searchInput,
    elements.durationFilter,
    elements.sceneryFilter,
    elements.intensityFilter,
    elements.favoritesFilter,
    elements.fullscreenButton
  ].forEach((element) => {
    element.disabled = disabled;
  });
}

function uniqueValues(key) {
  return [...new Set(routes.map((route) => route[key]).filter(Boolean))].sort();
}

function uniqueSceneryTags() {
  const available = new Set(routes.flatMap((route) => route.normalizedSceneryCategories || []).filter(Boolean));
  return normalizedSceneryCategories
    .map(({ label }) => label)
    .filter((label) => available.has(label));
}

function resetFilter(select, label) {
  select.innerHTML = `<option value="all">${label}</option>`;
}

function translateSceneryLabel(label) {
  const keyMap = {
    Mountains: 'scenery_mountains',
    'Water/Lakes': 'scenery_water_lakes',
    Coastal: 'scenery_coastal',
    Climb: 'scenery_climb',
    Forest: 'scenery_forest',
    Countryside: 'scenery_countryside',
    City: 'scenery_city',
    'Flat/Easy': 'scenery_flat_easy',
    Gravel: 'scenery_gravel'
  };
  const key = keyMap[label];
  return key && i18n[key] ? t(key) : label;
}

function translateIntensityLabel(label) {
  const key = `intensity_${label.toLowerCase()}`;
  return i18n[key] || titleCase(label);
}

function populateFilter(select, values, formatLabel = titleCase) {
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = formatLabel(value);
    select.append(option);
  });
}

function populateFilters() {
  resetFilter(elements.sceneryFilter, t('filter_scenery_any'));
  resetFilter(elements.intensityFilter, t('filter_intensity_any'));
  populateFilter(elements.sceneryFilter, uniqueSceneryTags(), translateSceneryLabel);
  populateFilter(elements.intensityFilter, uniqueValues('intensity'), translateIntensityLabel);
}

function durationMatches(route) {
  if (state.duration === 'short') return route.durationMinutes < 20;
  if (state.duration === 'standard') return route.durationMinutes >= 20 && route.durationMinutes < 60;
  if (state.duration === 'long') return route.durationMinutes >= 60;
  return true;
}

function routeMatches(route) {
  const haystack = [
    route.title,
    route.description,
    route.location,
    route.terrain,
    route.creator,
    route.overlayBadges.join(' '),
    route.metadataBadges.join(' '),
    cleanPublicText(route.cameraStyle),
    route.sceneryTags.join(' '),
    route.normalizedSceneryCategories.join(' '),
    route.intensity
  ]
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes(state.query) &&
    durationMatches(route) &&
    (state.scenery === 'all' || route.normalizedSceneryCategories.includes(state.scenery)) &&
    (state.intensity === 'all' || route.intensity === state.intensity) &&
    (!state.favoritesOnly || isFavorite(route.id))
  );
}

function renderLocalPanel() {
  const favoriteCount = state.favoriteRouteIds.size;
  elements.favoriteCount.textContent = favoriteCount === 1 ? t('favorite_count_one') : t('favorite_count_other', { count: favoriteCount });
  elements.recentRoutes.innerHTML = '';

  const recentRoutes = state.recentRouteIds
    .map((routeId) => routes.find((route) => route.id === routeId))
    .filter(Boolean);

  if (recentRoutes.length === 0) {
    elements.recentRoutes.innerHTML = `<span class="local-empty">${escapeHtml(t('recent_empty'))}</span>`;
    return;
  }

  recentRoutes.forEach((route) => {
    const button = document.createElement('button');
    button.className = 'recent-route-button';
    button.type = 'button';
    button.textContent = route.title;
    button.addEventListener('click', () => selectRoute(route.id, true));
    elements.recentRoutes.append(button);
  });
}

function renderStatus(message, detail = '') {
  elements.routeGrid.innerHTML = `
    <div class="empty-state">
      <strong>${escapeHtml(message)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
    </div>
  `;
}

function clearCatalogFilters() {
  state.query = '';
  state.duration = 'all';
  state.scenery = 'all';
  state.intensity = 'all';
  state.favoritesOnly = false;
  elements.searchInput.value = '';
  elements.durationFilter.value = 'all';
  elements.sceneryFilter.value = 'all';
  elements.intensityFilter.value = 'all';
  elements.favoritesFilter.checked = false;
  saveFilterPreferences();
  renderCatalog();
  elements.searchInput.focus();
}

function renderNoMatchStatus() {
  elements.routeGrid.innerHTML = `
    <div class="empty-state">
      <strong>${escapeHtml(t('catalog_no_match'))}</strong>
      <span>${escapeHtml(t('catalog_no_match_detail'))}</span>
      <button class="secondary-button compact-button clear-filters-button" type="button">${escapeHtml(t('catalog_clear_filters'))}</button>
    </div>
  `;
  elements.routeGrid.querySelector('.clear-filters-button')?.addEventListener('click', clearCatalogFilters);
}

function setHeroImage(route) {
  const image = elements.heroImage;
  const fallback = elements.heroImageFallback;
  image.hidden = !route.thumbnailUrl;
  fallback.hidden = Boolean(route.thumbnailUrl);
  fallback.textContent = route.scenery || t('activity_noun_singular_cap');

  if (!route.thumbnailUrl) {
    image.removeAttribute('src');
    image.removeAttribute('data-fallback');
    image.alt = '';
    return;
  }

  image.src = route.thumbnailUrl;
  image.dataset.fallback = route.thumbnailFallbackUrl;
  image.alt = t('preview_alt', { title: route.title });
}

function renderHeroRoute() {
  const route = state.featuredRoute;

  if (!route) {
    elements.heroLabel.innerHTML = `<span class="status-dot" aria-hidden="true"></span> ${escapeHtml(t('hero_label_loading'))}`;
    elements.heroSelection.textContent = t('hero_selection_default');
    elements.heroMetadata.textContent = '';
    elements.heroRouteButton.disabled = true;
    elements.heroRouteButton.textContent = t('hero_start_button');
    elements.heroRouteButton.removeAttribute('aria-label');
    elements.heroImage.hidden = true;
    elements.heroImageFallback.hidden = false;
    elements.heroImageFallback.textContent = t('activity_noun_singular_cap');
    return;
  }

  const isContinue = state.heroMode === 'continue';
  elements.heroLabel.innerHTML = `<span class="status-dot" aria-hidden="true"></span> ${escapeHtml(isContinue ? t('hero_label_continue') : t('hero_label_recommended'))}`;
  elements.heroSelection.textContent = route.title;
  elements.heroMetadata.textContent = t('hero_metadata', { location: route.location, duration: route.durationLabel, intensity: route.intensity });
  elements.heroRouteButton.disabled = false;
  elements.heroRouteButton.textContent = isContinue ? t('hero_button_continue') : t('hero_button_recommended');
  elements.heroRouteButton.setAttribute('aria-label', `${elements.heroRouteButton.textContent}: ${route.title}`);
  setHeroImage(route);
}

function chooseFeaturedRoute() {
  const storedRouteId = readStoredRouteId();
  const storedRoute = routes.find((route) => route.id === storedRouteId);
  if (storedRoute) {
    return { route: storedRoute, mode: 'continue' };
  }
  if (storedRouteId) removeStoredRouteId();

  const recommendedRoute =
    routes.find((route) => route.id === defaultRecommendationId) ||
    routes.find((route) => route.embeddingAllowed && route.sourceType === 'youtube') ||
    routes[0];

  return { route: recommendedRoute, mode: 'recommended' };
}

function setFeaturedRoute(route, mode = 'recommended') {
  state.featuredRoute = route;
  state.heroMode = mode;
  renderHeroRoute();
}

function setAppStatus(message = '') {
  elements.appStatus.textContent = message;
}

function setConnectivityStatus(message = '') {
  if (pendingServiceWorker && !applyingServiceWorkerUpdate) return;
  setAppStatus(message);
}

function applySiteSpecificContent() {
  if (elements.footerMyCadence) {
    elements.footerMyCadence.hidden = !isPedalScape;
  }
}

function setSensorStatus(status, detail = '') {
  state.sensorStatus = status;
  state.sensorStatusDetail = detail;
  renderSensorPanel();
}

function getDebugSensorBaseRpm() {
  const value = new URLSearchParams(window.location.search).get('debugCadence');
  const rpm = Number.parseInt(value || '', 10);
  if (!Number.isFinite(rpm)) return 86;
  return Math.min(maxValidCadenceRpm, Math.max(minValidCadenceRpm, rpm));
}

function stopDebugSensor({ keepStatus = false } = {}) {
  if (debugSensorTimer) {
    window.clearInterval(debugSensorTimer);
    debugSensorTimer = null;
  }
  if (!state.sensorDebugActive) return;
  state.sensorDebugActive = false;
  state.sensorCurrentRpm = null;
  if (state.sensorDeviceId === debugSensorDeviceId) {
    state.sensorDeviceId = readStoredSensorDeviceId();
    state.sensorDeviceName = readStoredSensorDeviceName();
  }
  if (!keepStatus) setSensorStatus('disconnected');
}

function startDebugSensor() {
  if (!isDebugSensorRequested() || state.sensorDebugActive) return;

  stopDebugSensor({ keepStatus: true });
  const baseRpm = getDebugSensorBaseRpm();
  state.sensorDebugActive = true;
  state.sensorDeviceId = debugSensorDeviceId;
  state.sensorDeviceName = debugSensorDeviceName;
  state.sensorCurrentRpm = baseRpm;
  state.sensorAutoReconnectAttempted = true;
  setSensorStatus('connected', 'Debug cadence sensor connected.');

  let tick = 0;
  debugSensorTimer = window.setInterval(() => {
    tick += 1;
    const nextRpm = Math.round(baseRpm + Math.sin(tick / 2) * 8 + Math.cos(tick / 5) * 3);
    state.sensorCurrentRpm = Math.min(maxValidCadenceRpm, Math.max(minValidCadenceRpm, nextRpm));
    renderSensorPanel();
  }, 1400);
}

function getSensorStatusLabel() {
  if (!isPedalScape) return '';

  if (state.sensorStatusDetail) return state.sensorStatusDetail;

  switch (state.sensorStatus) {
    case 'unsupported':
      return t('sensor_status_unsupported');
    case 'scanning':
      return t('sensor_status_scanning');
    case 'connecting':
      return t('sensor_status_connecting');
    case 'reconnecting':
      return t('sensor_status_reconnecting');
    case 'connected':
      return state.sensorDeviceName
        ? t('sensor_status_connected_named', { name: state.sensorDeviceName })
        : t('sensor_status_connected');
    case 'error':
      return t('sensor_status_error');
    case 'disconnected':
      return t('sensor_status_disconnected');
    default:
      return t('sensor_status_idle');
  }
}

function renderSensorPanel() {
  if (!elements.sensorPanel) return;

  if (!isPedalScape) {
    elements.sensorPanel.hidden = true;
    return;
  }

  elements.sensorPanel.hidden = false;
  const supported = isWebBluetoothSupported();
  const connected = isSensorConnected();
  const busy = ['scanning', 'connecting', 'reconnecting'].includes(state.sensorStatus);
  const canReconnect = canReconnectSavedSensor() && Boolean(state.sensorDeviceId);

  if (!supported && state.sensorStatus !== 'unsupported') {
    state.sensorStatus = 'unsupported';
    state.sensorStatusDetail = '';
  }

  elements.sensorConnectionStatus.textContent = getSensorStatusLabel();
  elements.sensorSavedDevice.textContent = state.sensorDeviceName || t('sensor_saved_none');
  elements.sensorCadenceValue.textContent = Number.isFinite(state.sensorCurrentRpm)
    ? t('sensor_cadence_value', { rpm: state.sensorCurrentRpm })
    : t('sensor_cadence_placeholder');

  if (!connected && elements.selectedLayout?.classList.contains('sensor-fullscreen-modal')) {
    exitPwaFullscreen();
  }

  elements.connectSensorButton.disabled = !supported || busy;
  elements.reconnectSensorButton.disabled = !supported || busy || !canReconnect;
  elements.disconnectSensorButton.disabled = !supported || busy || !connected;
  elements.forgetSensorButton.disabled = !state.sensorDeviceId;
  elements.selectedLayout?.classList.toggle('sensor-focus-active', connected);
  renderPlayerSensorOverlay();
}

function renderPlayerSensorOverlay() {
  const existingOverlay = elements.playerShell.querySelector('.player-sensor-overlay');
  if (existingOverlay) existingOverlay.remove();
  if (!isPedalScape || !state.selectedRoute) return;
  if (!isSensorConnected()) return;

  const overlay = document.createElement('div');
  overlay.className = 'player-sensor-overlay';
  overlay.innerHTML = `
    <span class="player-sensor-overlay__label">${escapeHtml(t('sensor_title'))}</span>
    <strong class="player-sensor-overlay__value">${escapeHtml(Number.isFinite(state.sensorCurrentRpm) ? t('sensor_cadence_value', { rpm: state.sensorCurrentRpm }) : t('sensor_cadence_placeholder'))}</strong>
  `;
  elements.playerShell.append(overlay);
}

function handleCadenceMeasurementChanged(event) {
  const characteristic = event?.target;
  const value = characteristic?.value;
  if (!value) return;

  const bytes = Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  const rpm = cadenceParser.parse(bytes);
  if (!Number.isFinite(rpm) || rpm < minValidCadenceRpm || rpm > maxValidCadenceRpm) {
    state.sensorCurrentRpm = null;
    renderSensorPanel();
    return;
  }
  state.sensorCurrentRpm = rpm;
  renderSensorPanel();
}

async function disconnectSensor(options = {}) {
  const { clearSaved = false, keepStatus = false } = options;
  const previousDevice = bluetoothDevice;

  if (state.sensorDebugActive) {
    stopDebugSensor({ keepStatus: true });
  }

  if (cadenceCharacteristic) {
    cadenceCharacteristic.removeEventListener('characteristicvaluechanged', handleCadenceMeasurementChanged);
    try {
      await cadenceCharacteristic.stopNotifications();
    } catch {
      // Ignore stop notification errors while tearing down connection state.
    }
    cadenceCharacteristic = null;
  }

  if (previousDevice) {
    previousDevice.removeEventListener('gattserverdisconnected', handleSensorDisconnected);
    try {
      if (previousDevice.gatt?.connected) previousDevice.gatt.disconnect();
    } catch {
      // Ignore disconnect errors while tearing down connection state.
    }
  }

  bluetoothDevice = null;
  cadenceParser.reset();
  state.sensorCurrentRpm = null;

  if (clearSaved) clearStoredSensor();
  if (!keepStatus) setSensorStatus('disconnected');
}

function handleSensorDisconnected() {
  cadenceCharacteristic = null;
  bluetoothDevice = null;
  state.sensorCurrentRpm = null;
  setSensorStatus('disconnected');
}

async function connectToSensorDevice(device, { status = 'connecting' } = {}) {
  if (!device) {
    setSensorStatus('error', t('sensor_status_error'));
    return;
  }

  await disconnectSensor({ keepStatus: true });
  setSensorStatus(status);

  try {
    if (!device.gatt) throw new Error(t('sensor_status_gatt_unavailable'));
    bluetoothDevice = device;
    bluetoothDevice.addEventListener('gattserverdisconnected', handleSensorDisconnected);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(cadenceServiceUuid);
    const characteristic = await service.getCharacteristic(cadenceMeasurementUuid);
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleCadenceMeasurementChanged);
    cadenceCharacteristic = characteristic;
    cadenceParser.reset();
    state.sensorCurrentRpm = null;

    const deviceName = device.name || state.sensorDeviceName || '';
    saveStoredSensor(device.id, deviceName);
    setSensorStatus('connected');
  } catch (error) {
    const message = error?.message ? t('sensor_status_error_with_detail', { message: error.message }) : t('sensor_status_error');
    await disconnectSensor({ keepStatus: true });
    setSensorStatus('error', message);
  }
}

async function connectSensorFromPicker() {
  if (!isPedalScape) return;
  if (isDebugSensorRequested()) {
    startDebugSensor();
    return;
  }
  if (!isWebBluetoothSupported()) {
    setSensorStatus('unsupported');
    return;
  }

  setSensorStatus('scanning');
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [cadenceServiceUuid] }],
      optionalServices: [cadenceServiceUuid]
    });
    if (!device) {
      setSensorStatus('disconnected');
      return;
    }
    await connectToSensorDevice(device, { status: 'connecting' });
  } catch (error) {
    if (error?.name === 'NotFoundError') {
      setSensorStatus('disconnected', t('sensor_status_cancelled'));
      return;
    }
    const message = error?.message ? t('sensor_status_error_with_detail', { message: error.message }) : t('sensor_status_error');
    setSensorStatus('error', message);
  }
}

async function reconnectSavedSensor() {
  if (!isPedalScape || !state.sensorDeviceId) return;
  if (isDebugSensorRequested()) {
    startDebugSensor();
    return;
  }

  if (!isWebBluetoothSupported()) {
    setSensorStatus('unsupported');
    return;
  }

  if (!canReconnectSavedSensor()) {
    setSensorStatus('error', t('sensor_status_reconnect_unavailable'));
    return;
  }

  setSensorStatus('reconnecting');
  try {
    const devices = await navigator.bluetooth.getDevices();
    const saved = devices.find((device) => device.id === state.sensorDeviceId);
    if (!saved) {
      setSensorStatus('disconnected', t('sensor_status_saved_not_found'));
      return;
    }
    await connectToSensorDevice(saved, { status: 'reconnecting' });
  } catch (error) {
    const message = error?.message ? t('sensor_status_error_with_detail', { message: error.message }) : t('sensor_status_error');
    setSensorStatus('error', message);
  }
}

async function autoReconnectSavedSensor() {
  if (!isPedalScape || state.sensorAutoReconnectAttempted) return;
  state.sensorAutoReconnectAttempted = true;
  if (!state.sensorDeviceId || !isWebBluetoothSupported() || !canReconnectSavedSensor()) {
    renderSensorPanel();
    return;
  }
  await reconnectSavedSensor();
}

function showUpdateReady(worker) {
  pendingServiceWorker = worker;
  applyingServiceWorkerUpdate = false;
  elements.updateButton.hidden = false;
  setAppStatus(t('update_ready'));
}

function applyPendingServiceWorkerUpdate() {
  if (!pendingServiceWorker) return;

  applyingServiceWorkerUpdate = true;
  elements.updateButton.hidden = true;
  setAppStatus(t('update_applying'));

  if (typeof pendingServiceWorker.postMessage === 'function') {
    pendingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload();
  }
}

function renderCatalog() {
  elements.routeGrid.innerHTML = '';
  renderLocalPanel();

  if (state.catalogStatus === 'loading') {
    elements.resultCount.textContent = t('catalog_loading_count');
    renderStatus(t('catalog_loading'));
    return;
  }

  if (state.catalogStatus === 'error') {
    elements.resultCount.textContent = t('catalog_error_title');
    renderStatus(t('catalog_error'), t('catalog_error_detail'));
    return;
  }

  if (routes.length === 0) {
    elements.resultCount.textContent = t('catalog_empty_count');
    renderStatus(t('catalog_empty'), t('catalog_empty_detail'));
    return;
  }

  const visibleRoutes = routes.filter(routeMatches);
  elements.resultCount.textContent = visibleRoutes.length === 1 ? t('catalog_result_count_one') : t('catalog_result_count_other', { count: visibleRoutes.length });

  if (visibleRoutes.length === 0) {
    renderNoMatchStatus();
    return;
  }

  visibleRoutes.forEach((route) => {
    const card = document.createElement('article');
    const overlayBadges = (route.overlayBadges?.length ? route.overlayBadges : [t('badge_video')])
      .map((badge) => `<li>${escapeHtml(badge)}</li>`)
      .join('');
    const metadataBadges = (route.metadataBadges?.length ? route.metadataBadges : [route.intensity])
      .map((badge) => `<li>${escapeHtml(badge)}</li>`)
      .join('');
    card.className = `route-card ${state.selectedRoute?.id === route.id ? 'selected-card' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', state.selectedRoute?.id === route.id ? 'true' : 'false');
    card.setAttribute('aria-label', `Select ${route.title}, ${route.durationLabel}, ${route.location}`);
    card.innerHTML = `
      <div class="card-art">
        ${
          route.thumbnailUrl
            ? `<img src="${escapeHtml(route.thumbnailUrl)}" alt="${escapeHtml(getThumbnailAltText(route))}" loading="lazy" data-fallback="${escapeHtml(route.thumbnailFallbackUrl)}">`
            : `<span aria-hidden="true">${escapeHtml(route.scenery)}</span>`
        }
        <ul class="route-card-badges" aria-label="Media badges">${overlayBadges}</ul>
        <button class="favorite-card-button ${isFavorite(route.id) ? 'is-favorite' : ''}" type="button" aria-pressed="${isFavorite(route.id) ? 'true' : 'false'}" aria-label="${isFavorite(route.id) ? t('card_favorite_remove') : t('card_favorite_save')}: ${escapeHtml(route.title)}">
          ${isFavorite(route.id) ? '★' : '☆'}
        </button>
      </div>
      <div class="card-body">
        <p class="route-location">${escapeHtml(route.location)}</p>
        <h3>${escapeHtml(route.title)}</h3>
        <ul class="pill-list route-metadata-badges" aria-label="Route decision metadata">${metadataBadges}</ul>
        <span class="card-cta" aria-hidden="true">${escapeHtml(t('card_cta_preview'))}</span>
      </div>
    `;

    card.querySelector('img')?.addEventListener('error', (event) => {
      const fallback = event.currentTarget.dataset.fallback;
      if (fallback && event.currentTarget.src !== fallback) {
        event.currentTarget.src = fallback;
      }
    });
    const favoriteButton = card.querySelector('.favorite-card-button');
    favoriteButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavorite(route.id);
    });
    favoriteButton?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(route.id);
      }
    });
    favoriteButton?.addEventListener('keyup', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    card.addEventListener('click', () => selectRoute(route.id, true));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRoute(route.id, true);
      }
    });
    elements.routeGrid.append(card);
  });
}

function renderCandidateStatus(message, detail = '') {
  elements.candidateGrid.innerHTML = `
    <div class="empty-state">
      <strong>${escapeHtml(message)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
    </div>
  `;
}

function renderCandidates() {
  if (!state.reviewMode) {
    elements.candidateGrid.innerHTML = '';
    elements.candidateCount.textContent = '';
    elements.reviewDecisionStatus.textContent = '';
    return;
  }

  elements.candidateGrid.innerHTML = '';
  elements.reviewDecisionStatus.textContent = state.reviewDecisionStatus;

  if (state.candidateStatus === 'loading') {
    elements.candidateCount.textContent = t('candidate_count_loading');
    renderCandidateStatus(t('candidate_status_loading'));
    return;
  }

  if (state.candidateStatus === 'error') {
    elements.candidateCount.textContent = t('candidate_status_error_title');
    renderCandidateStatus(t('candidate_error'), t('candidate_error_detail'));
    return;
  }

  if (candidateRoutes.length === 0) {
    elements.candidateCount.textContent = t('candidate_empty_count');
    renderCandidateStatus(t('candidate_empty'), t('candidate_empty_detail'));
    return;
  }

  const needsReviewCount = candidateRoutes.filter((candidate) => candidate.promotionReadiness !== 'promoted-to-production').length;
  const localDecisionCount = candidateRoutes.filter((candidate) => state.candidateReviewDecisions[candidate.id]).length;
  elements.candidateCount.textContent = t('candidate_count', {
    total: candidateRoutes.length,
    entries: candidateRoutes.length === 1 ? t('candidate_entries_one') : t('candidate_entries_other'),
    needs_review: needsReviewCount,
    decisions: localDecisionCount,
    decision_label: localDecisionCount === 1 ? t('candidate_decisions_one') : t('candidate_decisions_other')
  });

  candidateRoutes.forEach((candidate) => {
    const card = document.createElement('article');
    const review = getCandidateReview(candidate.id);
    const reviewLabel = getCandidateReviewLabel(review.decision);
    const tags = candidate.sceneryTags
      .slice(0, 4)
      .map((tag) => `<li>${escapeHtml(titleCase(tag))}</li>`)
      .join('');
    const checklist = candidate.reviewChecklist
      .slice(0, 2)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    const badges = getCandidateBadges(candidate)
      .map((badge) => `<li>${escapeHtml(badge)}</li>`)
      .join('');
    const promotedNote = candidate.productionCatalogId
      ? `<p class="candidate-promoted">Promoted as <code>${escapeHtml(candidate.productionCatalogId)}</code>${candidate.promotedToCatalogAt ? ` on ${escapeHtml(candidate.promotedToCatalogAt)}` : ''}.</p>`
      : '';

    card.className = `candidate-card ${review.decision ? `candidate-card--${review.decision}` : ''}`;
    card.innerHTML = `
      <div class="candidate-art">
        ${
          candidate.thumbnailUrl
            ? `<img src="${escapeHtml(candidate.thumbnailUrl)}" alt="Scenic preview for ${escapeHtml(candidate.title)}" loading="lazy" data-fallback="${escapeHtml(candidate.thumbnailFallbackUrl)}">`
            : `<span aria-hidden="true">${escapeHtml(candidate.scenery)}</span>`
        }
        <span class="candidate-status">${escapeHtml(formatCandidateStatus(candidate))}</span>
      </div>
      <div class="candidate-body">
        <div class="candidate-card-header">
          <span>${escapeHtml(candidate.durationLabel)} · ${escapeHtml(candidate.intensity)}</span>
          <span>${escapeHtml(candidate.sourceType)}</span>
        </div>
        <span class="review-decision-badge review-decision-badge--${escapeHtml(review.decision || 'none')}">${escapeHtml(reviewLabel)}</span>
        <h3>${escapeHtml(candidate.title)}</h3>
        <dl class="candidate-meta">
          <div><dt>${escapeHtml(t('candidate_meta_creator'))}</dt><dd>${escapeHtml(candidate.creator || t('candidate_meta_creator_empty'))}</dd></div>
          <div><dt>${escapeHtml(t('candidate_meta_location'))}</dt><dd>${escapeHtml(candidate.location || t('candidate_meta_location_empty'))}</dd></div>
        </dl>
        <ul class="candidate-badges" aria-label="Candidate review badges">${badges}</ul>
        <ul class="pill-list" aria-label="Candidate tags">${tags || '<li>Needs tags</li>'}</ul>
        ${promotedNote}
        <div class="candidate-review-notes">
          <button class="candidate-review-toggle" type="button" aria-expanded="false">${escapeHtml(t('candidate_review_toggle'))}</button>
          <div class="candidate-review-content" hidden>
          <p>${escapeHtml(candidate.reviewNotes)}</p>
          ${checklist ? `<ul class="candidate-checklist" aria-label="Review checklist">${checklist}</ul>` : ''}
          </div>
        </div>
        <div class="candidate-actions">
          <a class="secondary-button compact-button" href="${escapeHtml(candidate.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(t('candidate_action_open_source'))}</a>
          ${
            candidate.embedUrl
              ? `<a class="secondary-button compact-button" href="${escapeHtml(candidate.embedUrl)}" target="_blank" rel="noopener">${escapeHtml(t('candidate_action_open_embed'))}</a>`
              : ''
          }
          <button class="secondary-button compact-button copy-source-button" type="button" data-source-url="${escapeHtml(candidate.sourceUrl)}">${escapeHtml(t('candidate_action_copy_url'))}</button>
        </div>
        <div class="candidate-decision-controls" role="group" aria-label="Review decision for ${escapeHtml(candidate.title)}">
          <button class="secondary-button compact-button decision-button decision-button--promote" type="button" data-candidate-id="${escapeHtml(candidate.id)}" data-decision="promote" aria-pressed="${review.decision === 'promote' ? 'true' : 'false'}">${escapeHtml(t('candidate_decision_promote'))}</button>
          <button class="secondary-button compact-button decision-button decision-button--reject" type="button" data-candidate-id="${escapeHtml(candidate.id)}" data-decision="reject" aria-pressed="${review.decision === 'reject' ? 'true' : 'false'}">${escapeHtml(t('candidate_decision_reject'))}</button>
          <button class="secondary-button compact-button decision-button decision-button--defer" type="button" data-candidate-id="${escapeHtml(candidate.id)}" data-decision="defer" aria-pressed="${review.decision === 'defer' ? 'true' : 'false'}">${escapeHtml(t('candidate_decision_defer'))}</button>
        </div>
        <label class="candidate-note-field">
          <span>${escapeHtml(t('candidate_note_label'))}</span>
          <textarea class="candidate-note-input" data-candidate-id="${escapeHtml(candidate.id)}" rows="2" placeholder="${escapeHtml(t('candidate_note_placeholder'))}">${escapeHtml(review.note || '')}</textarea>
        </label>
      </div>
    `;

    card.querySelector('img')?.addEventListener('error', (event) => {
      const fallback = event.currentTarget.dataset.fallback;
      if (fallback && event.currentTarget.src !== fallback) {
        event.currentTarget.src = fallback;
      }
    });
    elements.candidateGrid.append(card);
  });

  if (state.candidateCopyMessage) {
    const status = document.createElement('p');
    status.className = 'candidate-copy-status';
    status.setAttribute('role', 'status');
    status.textContent = state.candidateCopyMessage;
    elements.candidateGrid.prepend(status);
  }
}

function clearSelectedRoute(message) {
  if (!message) message = t('selected_description_default');
  state.selectedRoute = null;
  elements.selectedTitle.textContent = t('selected_title_empty');
  elements.selectedDescription.textContent = message;
  elements.selectedMetadata.innerHTML = '';
  elements.startRideButton.disabled = true;
  elements.favoriteRouteButton.disabled = true;
  elements.favoriteRouteButton.textContent = t('favorite_button_save');
  elements.favoriteRouteButton.removeAttribute('aria-pressed');
  elements.sourceLink.href = '#';
  elements.sourceLink.classList.add('disabled-link');
  elements.sourceLink.removeAttribute('aria-label');
  elements.playerShell.innerHTML = `
    <div class="player-placeholder">
      <span aria-hidden="true">▶</span>
      <p>${escapeHtml(t('player_placeholder'))}</p>
    </div>
  `;
  renderSensorPanel();
}

function renderSelectedRoute() {
  const route = state.selectedRoute;

  if (!route) {
    clearSelectedRoute();
    return;
  }

  elements.selectedTitle.textContent = route.title;
  elements.selectedDescription.textContent = route.description;
  elements.selectedMetadata.innerHTML = `
    <div><dt>${escapeHtml(t('metadata_duration'))}</dt><dd>${escapeHtml(route.durationLabel)}</dd></div>
    <div><dt>${escapeHtml(t('metadata_difficulty'))}</dt><dd>${escapeHtml(route.intensity)}</dd></div>
    <div><dt>${escapeHtml(t('metadata_terrain'))}</dt><dd>${escapeHtml(route.terrain || t('metadata_terrain_empty'))}</dd></div>
    <div><dt>${escapeHtml(t('metadata_location'))}</dt><dd>${escapeHtml(route.location)}</dd></div>
    <div><dt>${escapeHtml(t('metadata_creator'))}</dt><dd>${escapeHtml(route.creator || t('metadata_creator_empty'))}</dd></div>
    <div><dt>${escapeHtml(t('metadata_video'))}</dt><dd>${escapeHtml((route.overlayBadges?.length ? route.overlayBadges : [t('badge_video')]).join(' · '))}</dd></div>
  `;
  elements.startRideButton.disabled = !route.embeddingAllowed;
  elements.favoriteRouteButton.disabled = false;
  elements.favoriteRouteButton.textContent = isFavorite(route.id) ? t('favorite_button_active') : t('favorite_button_save');
  elements.favoriteRouteButton.setAttribute('aria-pressed', isFavorite(route.id) ? 'true' : 'false');
  elements.sourceLink.href = route.sourceUrl;
  elements.sourceLink.classList.remove('disabled-link');
  elements.sourceLink.setAttribute('aria-label', t('source_link_aria', { title: route.title }));
  renderSensorPanel();
}

function toggleFavorite(routeId) {
  if (isFavorite(routeId)) {
    state.favoriteRouteIds.delete(routeId);
  } else {
    state.favoriteRouteIds.add(routeId);
  }

  saveFavorites();
  renderSelectedRoute();
  renderCatalog();
}

function buildEmbedUrl(route, autoplay) {
  const fallbackUrl = `https://www.youtube-nocookie.com/embed/${route.videoId}`;
  const url = new URL(route.embedUrl || fallbackUrl, window.location.href);
  url.searchParams.set('rel', '0');
  url.searchParams.set('modestbranding', '1');
  url.searchParams.set('playsinline', '1');
  if (autoplay) url.searchParams.set('autoplay', '1');
  return url.toString();
}

function loadPlayer(route, autoplay = false) {
  elements.playerShell.innerHTML = '';

  if (!route.embeddingAllowed) {
    elements.playerShell.innerHTML = `<p class="player-message">${escapeHtml(t('player_embed_not_allowed'))}</p>`;
    renderPlayerSensorOverlay();
    return;
  }

  if (route.sourceType === 'youtube' && route.videoId) {
    const iframe = document.createElement('iframe');
    iframe.title = t('player_iframe_title', { title: route.title });
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.src = buildEmbedUrl(route, autoplay);
    elements.playerShell.append(iframe);
    renderPlayerSensorOverlay();
    return;
  }

  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.src = route.sourceUrl;
  elements.playerShell.append(video);
  renderPlayerSensorOverlay();
}

function selectRoute(routeId, moveToPlayer = false, options = {}) {
  const { persist = true, updateHero = true } = options;
  const selectedRoute = routes.find((route) => route.id === routeId);
  if (!selectedRoute) {
    if (routeId === readStoredRouteId()) removeStoredRouteId();
    return;
  }

  state.selectedRoute = selectedRoute;
  if (persist) saveSelectedRouteId(selectedRoute.id);
  if (updateHero) setFeaturedRoute(selectedRoute, 'continue');
  renderSelectedRoute();
  loadPlayer(state.selectedRoute);
  renderCatalog();

  if (moveToPlayer) {
    document.querySelector('#player').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function exitPwaFullscreen() {
  elements.selectedLayout?.classList.remove('pwa-fullscreen');
  elements.selectedLayout?.classList.remove('sensor-fullscreen-modal');
  elements.playerShell.classList.remove('pwa-fullscreen');
  document.body.classList.remove('sensor-fullscreen-open');
  removePwaFullscreenCloseButton();
  updateFullscreenButton();
}

function createPwaFullscreenCloseButton() {
  const target = elements.selectedLayout?.classList.contains('sensor-fullscreen-modal') ? elements.selectedLayout : elements.playerShell;
  if (!target) return;
  let btn = document.querySelector('#pwaFullscreenClose');
  if (btn) return;
  btn = document.createElement('button');
  btn.id = 'pwaFullscreenClose';
  btn.type = 'button';
  btn.setAttribute('aria-label', t('fullscreen_close_aria'));
  btn.textContent = '\u2715';
  btn.addEventListener('click', exitPwaFullscreen);
  target.appendChild(btn);
}

function removePwaFullscreenCloseButton() {
  const btn = document.querySelector('#pwaFullscreenClose');
  if (btn) btn.remove();
}

async function requestFullscreen() {
  if (isSensorConnected() && elements.selectedLayout) {
    if (elements.selectedLayout.classList.contains('sensor-fullscreen-modal')) {
      exitPwaFullscreen();
      return;
    }

    elements.selectedLayout.classList.add('sensor-fullscreen-modal');
    document.body.classList.add('sensor-fullscreen-open');
    createPwaFullscreenCloseButton();
    updateFullscreenButton();
    return;
  }

  const target = elements.playerShell;
  if (!target) return;

  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    return;
  }

  if (target.classList.contains('pwa-fullscreen')) {
    exitPwaFullscreen();
    return;
  }

  if (target.requestFullscreen) {
    await target.requestFullscreen();
  } else if (target.webkitRequestFullscreen) {
    target.webkitRequestFullscreen();
  } else {
    // iOS PWA fallback — fake fullscreen via CSS
    target.classList.add('pwa-fullscreen');
    createPwaFullscreenCloseButton();
    updateFullscreenButton();
  }
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    elements.selectedLayout?.classList.contains('sensor-fullscreen-modal') ||
    elements.selectedLayout?.classList.contains('pwa-fullscreen') ||
    elements.playerShell.classList.contains('pwa-fullscreen')
  );
  elements.fullscreenButton.textContent = isFullscreen ? t('fullscreen_exit') : t('fullscreen_enter');
  elements.fullscreenButton.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
}

function startRide() {
  if (!state.selectedRoute) return;
  saveSelectedRouteId(state.selectedRoute.id);
  addRecentRoute(state.selectedRoute.id);
  renderLocalPanel();
  setFeaturedRoute(state.selectedRoute, 'continue');
  loadPlayer(state.selectedRoute, true);
  requestFullscreen().catch(() => {
    elements.sourceLink.focus();
  });
}

async function copyCandidateSource(sourceUrl) {
  if (!sourceUrl) return;

  try {
    await navigator.clipboard.writeText(sourceUrl);
    state.candidateCopyMessage = t('candidate_url_copied');
  } catch {
    state.candidateCopyMessage = sourceUrl;
  }

  renderCandidates();
}

function resetLocalData() {
  localStorageKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Local app features gracefully degrade when storage is disabled.
    }
  });
  try {
    localStorage.removeItem(candidateReviewDecisionsStorageKey);
  } catch {
    // Local app features gracefully degrade when storage is disabled.
  }
  removeStoredRouteId();

  state.favoriteRouteIds = new Set();
  state.recentRouteIds = [];
  state.candidateReviewDecisions = {};
  state.reviewDecisionStatus = '';
  state.query = '';
  state.duration = 'all';
  state.scenery = 'all';
  state.intensity = 'all';
  state.favoritesOnly = false;
  state.sensorAutoReconnectAttempted = false;

  elements.searchInput.value = '';
  elements.durationFilter.value = 'all';
  elements.sceneryFilter.value = 'all';
  elements.intensityFilter.value = 'all';
  elements.favoritesFilter.checked = false;

  if (routes.length > 0) {
    const featured = chooseFeaturedRoute();
    setFeaturedRoute(featured.route, 'recommended');
    selectRoute(featured.route.id, false, { persist: false, updateHero: false });
  } else {
    clearSelectedRoute();
    renderCatalog();
  }

  disconnectSensor({ clearSaved: true }).catch(() => {
    // Errors while disconnecting should not block local reset feedback.
  });
  renderSensorPanel();
  setAppStatus(t('reset_success'));
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') {
    elements.installButton.hidden = true;
    setAppStatus(t('app_installed'));
  }
  deferredInstallPrompt = null;
}

function startHeroRoute() {
  if (!state.featuredRoute) return;
  selectRoute(state.featuredRoute.id, true);
}

function bindEvents() {
  elements.heroImage.addEventListener('error', (event) => {
    const fallback = event.currentTarget.dataset.fallback;
    if (fallback && event.currentTarget.src !== fallback) {
      event.currentTarget.src = fallback;
      return;
    }

    event.currentTarget.hidden = true;
    elements.heroImageFallback.hidden = false;
  });
  elements.heroRouteButton.addEventListener('click', startHeroRoute);

  elements.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    saveFilterPreferences();
    renderCatalog();
  });

  elements.durationFilter.addEventListener('change', (event) => {
    state.duration = event.target.value;
    saveFilterPreferences();
    renderCatalog();
  });

  elements.sceneryFilter.addEventListener('change', (event) => {
    state.scenery = event.target.value;
    saveFilterPreferences();
    renderCatalog();
  });

  elements.intensityFilter.addEventListener('change', (event) => {
    state.intensity = event.target.value;
    saveFilterPreferences();
    renderCatalog();
  });

  elements.favoritesFilter.addEventListener('change', (event) => {
    state.favoritesOnly = event.target.checked;
    saveFilterPreferences();
    renderCatalog();
  });

  elements.startRideButton.addEventListener('click', startRide);
  elements.connectSensorButton?.addEventListener('click', () => {
    connectSensorFromPicker();
  });
  elements.reconnectSensorButton?.addEventListener('click', () => {
    reconnectSavedSensor();
  });
  elements.disconnectSensorButton?.addEventListener('click', () => {
    disconnectSensor().catch(() => {
      setSensorStatus('error', t('sensor_status_error'));
    });
  });
  elements.forgetSensorButton?.addEventListener('click', () => {
    disconnectSensor({ clearSaved: true }).catch(() => {
      clearStoredSensor();
      setSensorStatus('disconnected');
    });
  });
  elements.installButton.addEventListener('click', installApp);
  elements.exportDataButton.addEventListener('click', downloadLocalBackup);
  elements.copyDataButton.addEventListener('click', copyLocalBackup);
  elements.exportReviewDecisionsButton.addEventListener('click', copyReviewDecisions);
  elements.importDataInput.addEventListener('change', (event) => importLocalBackup(event.target.files[0]));
  elements.resetDataButton.addEventListener('click', resetLocalData);
  elements.favoriteRouteButton.addEventListener('click', () => {
    if (state.selectedRoute) toggleFavorite(state.selectedRoute.id);
  });
  elements.candidateGrid.addEventListener('click', (event) => {
    const decisionButton = event.target.closest('.decision-button');
    if (decisionButton) {
      setCandidateReviewDecision(decisionButton.dataset.candidateId, decisionButton.dataset.decision);
      return;
    }

    const copyButton = event.target.closest('.copy-source-button');
    if (copyButton) {
      copyCandidateSource(copyButton.dataset.sourceUrl);
      return;
    }

    const reviewButton = event.target.closest('.candidate-review-toggle');
    if (!reviewButton) return;
    const reviewContent = reviewButton.nextElementSibling;
    const expanded = reviewButton.getAttribute('aria-expanded') === 'true';
    reviewButton.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    if (reviewContent) reviewContent.hidden = expanded;
  });
  elements.candidateGrid.addEventListener('input', (event) => {
    if (!event.target.classList.contains('candidate-note-input')) return;
    setCandidateReviewNote(event.target.dataset.candidateId, event.target.value);
    state.reviewDecisionStatus = t('candidate_note_saved');
    elements.reviewDecisionStatus.textContent = state.reviewDecisionStatus;
  });
  elements.fullscreenButton.addEventListener('click', () => {
    if (!state.selectedRoute && routes.length > 0) selectRoute(routes[0].id);
    if (!state.selectedRoute) return;

    requestFullscreen().catch(() => {
      elements.sourceLink.focus();
    });
  });
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.selectedLayout?.classList.contains('sensor-fullscreen-modal')) {
      exitPwaFullscreen();
    }
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
    setAppStatus(t('install_available'));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    setAppStatus(t('app_installed'));
  });
  elements.updateButton.addEventListener('click', applyPendingServiceWorkerUpdate);
  window.addEventListener('offline', () => setConnectivityStatus(t('offline_ready')));
  window.addEventListener('online', () => setConnectivityStatus(t('online_ready')));
  window.addEventListener('hashchange', applyReviewModeFromUrl);
}

async function loadCatalog() {
  state.catalogStatus = 'loading';
  setControlsDisabled(true);
  clearSelectedRoute(t('catalog_loading_detail'));
  renderCatalog();

  try {
    const response = await fetch(catalogUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);

    const catalog = await response.json();
    routes = Array.isArray(catalog.routes) ? catalog.routes.map(normalizeRoute) : [];
    state.catalogStatus = 'ready';
    cleanupLocalRouteIds();
    populateFilters();
    applyFilterPreferences();
    setControlsDisabled(routes.length === 0);
    renderCatalog();

    if (routes.length > 0) {
      const featured = chooseFeaturedRoute();
      setFeaturedRoute(featured.route, featured.mode);
      selectRoute(featured.route.id, false, { persist: featured.mode === 'continue', updateHero: false });
    } else {
      setFeaturedRoute(null);
      clearSelectedRoute(t('catalog_loaded_empty'));
    }
  } catch (error) {
    console.error(error);
    routes = [];
    state.catalogStatus = 'error';
    setControlsDisabled(true);
    setFeaturedRoute(null);
    clearSelectedRoute(t('catalog_load_error'));
    renderCatalog();
  }
}

async function loadCandidateBacklog() {
  if (!state.reviewMode) return;
  state.candidateStatus = 'loading';
  renderCandidates();

  try {
    const response = await fetch(candidateBacklogUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Candidate backlog request failed: ${response.status}`);

    const backlog = await response.json();
    candidateRoutes = Array.isArray(backlog.candidateRoutes) ? backlog.candidateRoutes.map(normalizeCandidateRoute) : [];
    state.candidateStatus = 'ready';
    renderCandidates();
  } catch (error) {
    console.error(error);
    candidateRoutes = [];
    state.candidateStatus = 'error';
    renderCandidates();
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;

  const register = () => {
    let serviceWorkerRefreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!applyingServiceWorkerUpdate || serviceWorkerRefreshing) return;
      serviceWorkerRefreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('service-worker.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateReady(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateReady(worker);
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Service worker registration skipped.', error);
      });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

function setupCompactControls() {
  const hero = document.querySelector('.hero');
  const controlsPanel = document.querySelector('.controls-panel');
  if (!hero || !controlsPanel) return;

  // Fallback: without IntersectionObserver, leave the panel in its default
  // (expanded) state so search and filters stay fully usable.
  if (typeof IntersectionObserver !== 'function') return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // Compact the sticky controls only once the hero has scrolled out of
        // view; expand again as soon as any part of the hero is visible.
        document.body.classList.toggle('controls-compact', !entry.isIntersecting);
      }
    },
    { threshold: 0 }
  );

  observer.observe(hero);
}

async function init() {
  await loadLocale();
  applySiteSpecificContent();
  bindLangSwitcher();
  loadLocalState();
  bindEvents();
  startDebugSensor();
  renderSensorPanel();
  setupCompactControls();
  if (navigator.onLine === false) setConnectivityStatus(t('offline_ready'));
  loadCatalog();
  autoReconnectSavedSensor().catch((error) => {
    const message = error?.message ? t('sensor_status_error_with_detail', { message: error.message }) : t('sensor_status_error');
    setSensorStatus('error', message);
  });
  applyReviewModeFromUrl();
  registerServiceWorker();
}

init();
