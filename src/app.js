let routes = [];
let candidateRoutes = [];
let deferredInstallPrompt = null;

const catalogUrl = 'routes/catalog.json';
const candidateBacklogUrl = 'routes/candidate-backlog.json';
const selectedRouteStorageKey = 'scenicRideCatalog.selectedRouteId';
const favoriteRoutesStorageKey = 'scenicRideCatalog.favoriteRouteIds';
const recentRoutesStorageKey = 'scenicRideCatalog.recentRouteIds';
const filterPreferencesStorageKey = 'scenicRideCatalog.filterPreferences';
const candidateReviewDecisionsStorageKey = 'PedalScape.reviewDecisions';
const localBackupSchemaVersion = 1;
const localBackupAppName = 'PedalScape';
const localStorageKeys = [
  selectedRouteStorageKey,
  favoriteRoutesStorageKey,
  recentRoutesStorageKey,
  filterPreferencesStorageKey
];
const defaultRecommendationId = 'bavarian-countryside-90-minute-4k';
const maxRecentRoutes = 5;
const candidateDecisionLabels = {
  promote: 'Promote/Yes',
  reject: 'Reject/No',
  defer: 'Defer/Maybe'
};

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
  reviewDecisionStatus: ''
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
  playerShell: document.querySelector('#playerShell'),
  selectedTitle: document.querySelector('#selectedTitle'),
  selectedDescription: document.querySelector('#selectedDescription'),
  selectedMetadata: document.querySelector('#selectedMetadata'),
  startRideButton: document.querySelector('#startRideButton'),
  favoriteRouteButton: document.querySelector('#favoriteRouteButton'),
  fullscreenButton: document.querySelector('#fullscreenButton'),
  sourceLink: document.querySelector('#sourceLink'),
  installButton: document.querySelector('#installButton'),
  exportDataButton: document.querySelector('#exportDataButton'),
  copyDataButton: document.querySelector('#copyDataButton'),
  importDataInput: document.querySelector('#importDataInput'),
  resetDataButton: document.querySelector('#resetDataButton'),
  appStatus: document.querySelector('#appStatus'),
  backupJsonOutput: document.querySelector('#backupJsonOutput')
};

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
  if (!Number.isFinite(minutes)) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
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
  const combined = `${route.audio || ''} ${route.title || ''}`.toLowerCase();

  if (/natural|ambient|soundscape|road|trail|no music/.test(combined)) return 'Natural audio';
  if (/music/.test(audio)) return 'Music';
  if (/narrat|voice|spoken|commentary/.test(audio)) return 'Narration';
  if (/creator|original|video audio|training video audio|tour video audio|indoor cycling video audio/.test(combined)) return 'Original audio';
  return audio ? titleCase(audio.split(/[;,]/)[0].trim()) : '';
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function getRouteMediaBadges(route) {
  return uniqueList([
    ...cleanQualityBadges(route),
    cleanAudioBadge(route)
  ]);
}

function getThumbnailAltText(route) {
  return `Scenic preview for ${route.title}.`;
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

    const decision = Object.prototype.hasOwnProperty.call(candidateDecisionLabels, review.decision) ? review.decision : '';
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
  return candidateDecisionLabels[decision] || 'Unreviewed';
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

  state.reviewDecisionStatus = `${getCandidateReviewLabel(nextDecision)} saved locally. Export decisions to send them back to Copilot.`;
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
  return {
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
    throw new Error('Backup is not for PedalScape.');
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
    filterPreferences: normalizeFilterPreferences(data.filterPreferences)
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
  setAppStatus('Local backup downloaded. No account or cloud sync needed.');
}

async function copyLocalBackup() {
  const backupJson = JSON.stringify(buildLocalBackup(), null, 2);
  elements.backupJsonOutput.hidden = false;
  elements.backupJsonOutput.value = backupJson;

  try {
    await navigator.clipboard.writeText(backupJson);
    setAppStatus('Backup JSON copied to clipboard and shown below.');
  } catch {
    setAppStatus('Backup JSON shown below. Select and copy it to save a manual backup.');
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

  loadLocalState();
  cleanupLocalRouteIds();
  applyFilterPreferences();

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
    setAppStatus('Local backup imported. Stale route IDs were ignored.');
  } catch (error) {
    setAppStatus(`Import failed: ${error.message}`);
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
  const title = cleanPublicText(route.title, 'Untitled ride');
  const location = cleanPublicText(route.location, 'Location to be announced');
  const terrain = cleanPublicText(route.terrain, 'Scenic cycling route');
  const creator = cleanPublicText(route.creator, 'Public video source');
  const mediaBadges = getRouteMediaBadges({ ...route, title, sceneryTags });

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
    mediaBadges,
    videoQualityBadge: mediaBadges.find((badge) => /^(?:4K|1080p|HD)$/.test(badge)) || '',
    audioBadge: mediaBadges.find((badge) => /audio|music|narration/i.test(badge)) || '',
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
    candidate.embeddingAllowed || candidate.embedUrl ? 'Embed OK' : '',
    candidate.promotionReadiness === 'promoted-to-production' ? 'Promoted' : 'Needs review'
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
    app: 'PedalScape',
    exportedAt: new Date().toISOString(),
    reviewDecisions: decisions
  }, null, 2);

  elements.reviewDecisionsOutput.hidden = false;
  elements.reviewDecisionsOutput.value = exportText;

  try {
    await navigator.clipboard.writeText(exportText);
    state.reviewDecisionStatus = `${decisions.length} review decision${decisions.length === 1 ? '' : 's'} copied. Paste this back to Copilot.`;
  } catch {
    state.reviewDecisionStatus = `${decisions.length} review decision${decisions.length === 1 ? '' : 's'} shown below. Select and copy it back to Copilot.`;
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
  return [...new Set(routes.flatMap((route) => route.sceneryTags).filter(Boolean))].sort();
}

function resetFilter(select, label) {
  select.innerHTML = `<option value="all">${label}</option>`;
}

function populateFilter(select, values) {
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = titleCase(value);
    select.append(option);
  });
}

function populateFilters() {
  resetFilter(elements.sceneryFilter, 'Any scenery');
  resetFilter(elements.intensityFilter, 'Any intensity');
  populateFilter(elements.sceneryFilter, uniqueSceneryTags());
  populateFilter(elements.intensityFilter, uniqueValues('intensity'));
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
    route.mediaBadges.join(' '),
    cleanPublicText(route.cameraStyle),
    route.sceneryTags.join(' '),
    route.intensity
  ]
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes(state.query) &&
    durationMatches(route) &&
    (state.scenery === 'all' || route.sceneryTags.includes(state.scenery)) &&
    (state.intensity === 'all' || route.intensity === state.intensity) &&
    (!state.favoritesOnly || isFavorite(route.id))
  );
}

function renderLocalPanel() {
  const favoriteCount = state.favoriteRouteIds.size;
  elements.favoriteCount.textContent = `${favoriteCount} favorite${favoriteCount === 1 ? '' : 's'}`;
  elements.recentRoutes.innerHTML = '';

  const recentRoutes = state.recentRouteIds
    .map((routeId) => routes.find((route) => route.id === routeId))
    .filter(Boolean);

  if (recentRoutes.length === 0) {
    elements.recentRoutes.innerHTML = '<span class="local-empty">Select or start a ride to build recent routes.</span>';
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

function setHeroImage(route) {
  const image = elements.heroImage;
  const fallback = elements.heroImageFallback;
  image.hidden = !route.thumbnailUrl;
  fallback.hidden = Boolean(route.thumbnailUrl);
  fallback.textContent = route.scenery || 'Ride';

  if (!route.thumbnailUrl) {
    image.removeAttribute('src');
    image.removeAttribute('data-fallback');
    image.alt = '';
    return;
  }

  image.src = route.thumbnailUrl;
  image.dataset.fallback = route.thumbnailFallbackUrl;
  image.alt = `Preview image for ${route.title}`;
}

function renderHeroRoute() {
  const route = state.featuredRoute;

  if (!route) {
    elements.heroLabel.innerHTML = '<span class="status-dot" aria-hidden="true"></span> Loading catalog ride';
    elements.heroSelection.textContent = 'Choose a route below';
    elements.heroMetadata.textContent = '';
    elements.heroRouteButton.disabled = true;
    elements.heroRouteButton.textContent = 'Start this ride';
    elements.heroRouteButton.removeAttribute('aria-label');
    elements.heroImage.hidden = true;
    elements.heroImageFallback.hidden = false;
    elements.heroImageFallback.textContent = 'Ride';
    return;
  }

  const isContinue = state.heroMode === 'continue';
  elements.heroLabel.innerHTML = `<span class="status-dot" aria-hidden="true"></span> ${isContinue ? 'Continue ride' : 'Recommended first ride'}`;
  elements.heroSelection.textContent = route.title;
  elements.heroMetadata.textContent = `${route.location} · ${route.durationLabel} · ${route.intensity} · from routes/catalog.json`;
  elements.heroRouteButton.disabled = false;
  elements.heroRouteButton.textContent = isContinue ? 'Continue this ride' : 'Start recommended ride';
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

function renderCatalog() {
  elements.routeGrid.innerHTML = '';
  renderLocalPanel();

  if (state.catalogStatus === 'loading') {
    elements.resultCount.textContent = 'Loading…';
    renderStatus('Loading curated routes…');
    return;
  }

  if (state.catalogStatus === 'error') {
    elements.resultCount.textContent = 'Catalog unavailable';
    renderStatus('Could not load routes/catalog.json.', 'Run the app through the local server and try again.');
    return;
  }

  if (routes.length === 0) {
    elements.resultCount.textContent = '0 rides';
    renderStatus('No routes are available yet.', 'Add entries to routes/catalog.json to populate the catalog.');
    return;
  }

  const visibleRoutes = routes.filter(routeMatches);
  elements.resultCount.textContent = `${visibleRoutes.length} ride${visibleRoutes.length === 1 ? '' : 's'}`;

  if (visibleRoutes.length === 0) {
    renderStatus('No routes match these filters.', 'Try a different duration, scenery, intensity, or search term.');
    return;
  }

  visibleRoutes.forEach((route) => {
    const card = document.createElement('article');
    const tags = route.sceneryTags
      .slice(0, 2)
      .map((tag) => `<li>${escapeHtml(titleCase(tag))}</li>`)
      .join('');
    const mediaBadges = (route.mediaBadges?.length ? route.mediaBadges : ['Video'])
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
        <ul class="route-card-badges" aria-label="Video and audio badges">${mediaBadges}</ul>
        <button class="favorite-card-button ${isFavorite(route.id) ? 'is-favorite' : ''}" type="button" aria-pressed="${isFavorite(route.id) ? 'true' : 'false'}" aria-label="${isFavorite(route.id) ? 'Remove favorite' : 'Save favorite'}: ${escapeHtml(route.title)}">
          ${isFavorite(route.id) ? '★' : '☆'}
        </button>
      </div>
      <div class="card-body">
        <p class="route-location">${escapeHtml(route.location)}</p>
        <h3>${escapeHtml(route.title)}</h3>
        <ul class="pill-list" aria-label="Route metadata">
          <li>${escapeHtml(route.durationLabel)}</li>
          <li>${escapeHtml(route.intensity)}</li>
          ${tags}
        </ul>
        <span class="card-cta" aria-hidden="true">Preview ride →</span>
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
    elements.candidateCount.textContent = 'Loading…';
    renderCandidateStatus('Loading review backlog…');
    return;
  }

  if (state.candidateStatus === 'error') {
    elements.candidateCount.textContent = 'Backlog unavailable';
    renderCandidateStatus('Could not load routes/candidate-backlog.json.', 'The featured catalog is unaffected.');
    return;
  }

  if (candidateRoutes.length === 0) {
    elements.candidateCount.textContent = '0 candidates';
    renderCandidateStatus('No candidate backlog entries found.', 'Add entries to routes/candidate-backlog.json for review.');
    return;
  }

  const needsReviewCount = candidateRoutes.filter((candidate) => candidate.promotionReadiness !== 'promoted-to-production').length;
  const localDecisionCount = candidateRoutes.filter((candidate) => state.candidateReviewDecisions[candidate.id]).length;
  elements.candidateCount.textContent = `${candidateRoutes.length} backlog entr${candidateRoutes.length === 1 ? 'y' : 'ies'} · ${needsReviewCount} to review · ${localDecisionCount} local decision${localDecisionCount === 1 ? '' : 's'}`;

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
          <div><dt>Creator</dt><dd>${escapeHtml(candidate.creator || 'Unknown')}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(candidate.location || 'Needs review')}</dd></div>
        </dl>
        <ul class="candidate-badges" aria-label="Candidate review badges">${badges}</ul>
        <ul class="pill-list" aria-label="Candidate tags">${tags || '<li>Needs tags</li>'}</ul>
        ${promotedNote}
        <div class="candidate-review-notes">
          <button class="candidate-review-toggle" type="button" aria-expanded="false">Review notes</button>
          <div class="candidate-review-content" hidden>
          <p>${escapeHtml(candidate.reviewNotes)}</p>
          ${checklist ? `<ul class="candidate-checklist" aria-label="Review checklist">${checklist}</ul>` : ''}
          </div>
        </div>
        <div class="candidate-actions">
          <a class="secondary-button compact-button" href="${escapeHtml(candidate.sourceUrl)}" target="_blank" rel="noopener">Open source</a>
          ${
            candidate.embedUrl
              ? `<a class="secondary-button compact-button" href="${escapeHtml(candidate.embedUrl)}" target="_blank" rel="noopener">Open embed</a>`
              : ''
          }
          <button class="secondary-button compact-button copy-source-button" type="button" data-source-url="${escapeHtml(candidate.sourceUrl)}">Copy URL</button>
        </div>
        <div class="candidate-decision-controls" role="group" aria-label="Review decision for ${escapeHtml(candidate.title)}">
          <button class="secondary-button compact-button decision-button decision-button--promote" type="button" data-candidate-id="${escapeHtml(candidate.id)}" data-decision="promote" aria-pressed="${review.decision === 'promote' ? 'true' : 'false'}">Promote/Yes</button>
          <button class="secondary-button compact-button decision-button decision-button--reject" type="button" data-candidate-id="${escapeHtml(candidate.id)}" data-decision="reject" aria-pressed="${review.decision === 'reject' ? 'true' : 'false'}">Reject/No</button>
          <button class="secondary-button compact-button decision-button decision-button--defer" type="button" data-candidate-id="${escapeHtml(candidate.id)}" data-decision="defer" aria-pressed="${review.decision === 'defer' ? 'true' : 'false'}">Defer/Maybe</button>
        </div>
        <label class="candidate-note-field">
          <span>Optional note for Copilot</span>
          <textarea class="candidate-note-input" data-candidate-id="${escapeHtml(candidate.id)}" rows="2" placeholder="Why yes/no/maybe?">${escapeHtml(review.note || '')}</textarea>
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

function clearSelectedRoute(message = 'Choose a scenic ride card above. The player supports YouTube embeds, fullscreen mode, and source links for browser fallback.') {
  state.selectedRoute = null;
  elements.selectedTitle.textContent = 'No route selected';
  elements.selectedDescription.textContent = message;
  elements.selectedMetadata.innerHTML = '';
  elements.startRideButton.disabled = true;
  elements.favoriteRouteButton.disabled = true;
  elements.favoriteRouteButton.textContent = 'Save favorite';
  elements.favoriteRouteButton.removeAttribute('aria-pressed');
  elements.sourceLink.href = '#';
  elements.sourceLink.classList.add('disabled-link');
  elements.sourceLink.removeAttribute('aria-label');
  elements.playerShell.innerHTML = `
    <div class="player-placeholder">
      <span aria-hidden="true">▶</span>
      <p>Select a route to load the ride video.</p>
    </div>
  `;
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
    <div><dt>Duration</dt><dd>${escapeHtml(route.durationLabel)}</dd></div>
    <div><dt>Difficulty</dt><dd>${escapeHtml(route.intensity)}</dd></div>
    <div><dt>Terrain</dt><dd>${escapeHtml(route.terrain || 'Not specified')}</dd></div>
    <div><dt>Location</dt><dd>${escapeHtml(route.location)}</dd></div>
    <div><dt>Creator</dt><dd>${escapeHtml(route.creator || 'Unknown')}</dd></div>
    <div><dt>Video</dt><dd>${escapeHtml((route.mediaBadges?.length ? route.mediaBadges : ['Video']).join(' · '))}</dd></div>
  `;
  elements.startRideButton.disabled = !route.embeddingAllowed;
  elements.favoriteRouteButton.disabled = false;
  elements.favoriteRouteButton.textContent = isFavorite(route.id) ? 'Favorited ★' : 'Save favorite ☆';
  elements.favoriteRouteButton.setAttribute('aria-pressed', isFavorite(route.id) ? 'true' : 'false');
  elements.sourceLink.href = route.sourceUrl;
  elements.sourceLink.classList.remove('disabled-link');
  elements.sourceLink.setAttribute('aria-label', `Open source video for ${route.title}`);
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
    elements.playerShell.innerHTML = '<p class="player-message">Embedding is not marked as allowed for this route. Use Open source instead.</p>';
    return;
  }

  if (route.sourceType === 'youtube' && route.videoId) {
    const iframe = document.createElement('iframe');
    iframe.title = `${route.title} ride video`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.src = buildEmbedUrl(route, autoplay);
    elements.playerShell.append(iframe);
    return;
  }

  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.src = route.sourceUrl;
  elements.playerShell.append(video);
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

async function requestFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    return;
  }

  const target = elements.playerShell;
  if (target.requestFullscreen) {
    await target.requestFullscreen();
  } else if (target.webkitRequestFullscreen) {
    target.webkitRequestFullscreen();
  }
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  elements.fullscreenButton.textContent = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
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
    state.candidateCopyMessage = 'Source URL copied.';
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

  setAppStatus('Local data reset.');
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') {
    elements.installButton.hidden = true;
    setAppStatus('PedalScape installed.');
  }
  deferredInstallPrompt = null;
}

function startHeroRoute() {
  if (!state.featuredRoute) return;
  selectRoute(state.featuredRoute.id, true);
  startRide();
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
    state.reviewDecisionStatus = 'Note saved locally. Export decisions to send them back to Copilot.';
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
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
    setAppStatus('Install available for offline app shell.');
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    setAppStatus('PedalScape installed.');
  });
  window.addEventListener('hashchange', applyReviewModeFromUrl);
}

async function loadCatalog() {
  state.catalogStatus = 'loading';
  setControlsDisabled(true);
  clearSelectedRoute('Loading curated routes from routes/catalog.json…');
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
      clearSelectedRoute('routes/catalog.json loaded, but it does not contain any routes yet.');
    }
  } catch (error) {
    console.error(error);
    routes = [];
    state.catalogStatus = 'error';
    setControlsDisabled(true);
    setFeaturedRoute(null);
    clearSelectedRoute('The route catalog could not be loaded. Start the static server and refresh.');
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

  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let serviceWorkerRefreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || serviceWorkerRefreshing) return;
      serviceWorkerRefreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('service-worker.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setAppStatus('Update ready. Refreshing PedalScape…');
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Service worker registration skipped.', error);
      });
  });
}

function init() {
  loadLocalState();
  bindEvents();
  loadCatalog();
  applyReviewModeFromUrl();
  registerServiceWorker();
}

init();
