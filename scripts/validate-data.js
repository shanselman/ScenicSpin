#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const errors = [];
const warnings = [];

const catalogFiles = [
  path.join('routes', 'catalog.json'),
  path.join('routes', 'beltscape-catalog.json')
];

const requiredRouteFields = {
  id: 'string',
  title: 'string',
  sourceUrl: 'string',
  embedUrl: 'string',
  sourcePlatform: 'string',
  creator: 'string',
  location: 'string',
  durationMinutes: 'number',
  difficulty: 'string',
  terrain: 'string',
  sceneryTags: 'array',
  videoQuality: 'string',
  audio: 'string',
  cameraStyle: 'string',
  embeddingAllowed: 'boolean',
  license: 'string',
  curationNotes: 'string'
};

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringField(file, route, field) {
  if (!isNonEmptyString(route[field])) {
    errors.push(`${file}: route ${route.id || '<missing id>'} must have non-empty ${field}`);
  }
}

function validateUrlField(file, route, field) {
  validateStringField(file, route, field);
  if (isNonEmptyString(route[field]) && !/^https?:\/\//i.test(route[field])) {
    errors.push(`${file}: route ${route.id || '<missing id>'} ${field} must be an http(s) URL`);
  }
}

function validateRoute(file, route, index) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    errors.push(`${file}: routes[${index}] must be an object`);
    return;
  }

  for (const [field, type] of Object.entries(requiredRouteFields)) {
    if (!(field in route)) {
      errors.push(`${file}: route ${route.id || `at index ${index}`} missing required field ${field}`);
      continue;
    }

    if (type === 'array') {
      if (!Array.isArray(route[field]) || route[field].length === 0 || route[field].some((tag) => !isNonEmptyString(tag))) {
        errors.push(`${file}: route ${route.id || `at index ${index}`} ${field} must be a non-empty string array`);
      }
    } else if (typeof route[field] !== type) {
      errors.push(`${file}: route ${route.id || `at index ${index}`} ${field} must be ${type}`);
    }
  }

  for (const field of ['id', 'title', 'sourcePlatform', 'creator', 'location', 'difficulty', 'terrain', 'videoQuality', 'audio', 'cameraStyle', 'license', 'curationNotes']) {
    if (field in route) validateStringField(file, route, field);
  }

  for (const field of ['sourceUrl', 'embedUrl']) {
    if (field in route) validateUrlField(file, route, field);
  }

  if (typeof route.durationMinutes === 'number' && (!Number.isFinite(route.durationMinutes) || route.durationMinutes <= 0)) {
    errors.push(`${file}: route ${route.id || `at index ${index}`} durationMinutes must be a positive number`);
  }
}

function validateCatalogs() {
  const routeIds = new Map();

  for (const file of catalogFiles) {
    const catalog = readJson(file);
    if (!catalog) continue;

    if (catalog.schemaVersion !== 1) errors.push(`${file}: schemaVersion must be 1`);
    if (!isNonEmptyString(catalog.curatedAt)) errors.push(`${file}: curatedAt must be a non-empty string`);
    if (!isNonEmptyString(catalog.curationPolicy)) errors.push(`${file}: curationPolicy must be a non-empty string`);
    if (!Array.isArray(catalog.routes) || catalog.routes.length === 0) {
      errors.push(`${file}: routes must be a non-empty array`);
      continue;
    }

    catalog.routes.forEach((route, index) => {
      validateRoute(file, route, index);
      if (!isNonEmptyString(route?.id)) return;
      if (routeIds.has(route.id)) {
        errors.push(`${file}: duplicate route id ${route.id} also appears in ${routeIds.get(route.id)}`);
      } else {
        routeIds.set(route.id, file);
      }
    });
  }

  return routeIds;
}

function validateCandidateBacklog(routeIds) {
  const file = path.join('routes', 'candidate-backlog.json');
  const backlog = readJson(file);
  if (!backlog) return;

  if (backlog.schemaVersion !== 1) errors.push(`${file}: schemaVersion must be 1`);
  if (!backlog.statusDefinitions || typeof backlog.statusDefinitions !== 'object' || Array.isArray(backlog.statusDefinitions)) {
    errors.push(`${file}: statusDefinitions must be an object`);
  }
  if (!backlog.curationTiers || typeof backlog.curationTiers !== 'object' || Array.isArray(backlog.curationTiers)) {
    errors.push(`${file}: curationTiers must be an object`);
  }
  if (!Array.isArray(backlog.candidateRoutes)) {
    errors.push(`${file}: candidateRoutes must be an array`);
    return;
  }

  const validStatuses = new Set(Object.keys(backlog.statusDefinitions || {}));
  const validTiers = new Set(Object.keys(backlog.curationTiers || {}));
  const candidateIds = new Map();

  backlog.candidateRoutes.forEach((candidate, index) => {
    const label = candidate?.id || `at index ${index}`;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      errors.push(`${file}: candidateRoutes[${index}] must be an object`);
      return;
    }

    for (const field of ['id', 'status', 'curationTier', 'title', 'sourceUrl']) {
      if (!isNonEmptyString(candidate[field])) errors.push(`${file}: candidate ${label} must have non-empty ${field}`);
    }

    if (isNonEmptyString(candidate.sourceUrl) && !/^https?:\/\//i.test(candidate.sourceUrl)) {
      errors.push(`${file}: candidate ${label} sourceUrl must be an http(s) URL`);
    }

    if (candidateIds.has(candidate.id)) {
      errors.push(`${file}: duplicate candidate id ${candidate.id} also appears at index ${candidateIds.get(candidate.id)}`);
    } else if (isNonEmptyString(candidate.id)) {
      candidateIds.set(candidate.id, index);
    }

    if (isNonEmptyString(candidate.status) && !validStatuses.has(candidate.status)) {
      errors.push(`${file}: candidate ${label} has unknown status ${candidate.status}`);
    }

    if (isNonEmptyString(candidate.curationTier) && !validTiers.has(candidate.curationTier)) {
      errors.push(`${file}: candidate ${label} has unknown curationTier ${candidate.curationTier}`);
    }

    if (candidate.status === 'featured' && candidate.curationTier !== 'featured') {
      errors.push(`${file}: featured candidate ${label} must use curationTier "featured"`);
    }

    if (candidate.promotionReadiness === 'promoted-to-production') {
      if (candidate.status !== 'featured') errors.push(`${file}: promoted candidate ${label} must have status "featured"`);
      if (!isNonEmptyString(candidate.productionCatalogId)) {
        errors.push(`${file}: promoted candidate ${label} must include productionCatalogId`);
      } else if (!routeIds.has(candidate.productionCatalogId)) {
        errors.push(`${file}: promoted candidate ${label} productionCatalogId ${candidate.productionCatalogId} is not in a catalog`);
      }
    }
  });
}

function validateLocales() {
  const localesDir = path.join(root, 'locales');
  const enPath = path.join('locales', 'en.json');
  const english = readJson(enPath);
  if (!english) return;

  const expectedKeys = Object.keys(english).sort();
  const localeFiles = fs.readdirSync(localesDir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  if (!localeFiles.includes('en.json')) errors.push('locales: en.json is required');

  for (const fileName of localeFiles) {
    const relativePath = path.join('locales', fileName);
    const locale = readJson(relativePath);
    if (!locale) continue;

    const actualKeys = Object.keys(locale).sort();
    const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
    const extra = actualKeys.filter((key) => !expectedKeys.includes(key));

    if (missing.length > 0) errors.push(`${relativePath}: missing locale keys: ${missing.join(', ')}`);
    if (extra.length > 0) warnings.push(`${relativePath}: extra locale keys: ${extra.join(', ')}`);

    for (const key of expectedKeys) {
      if (key in locale && typeof locale[key] !== typeof english[key]) {
        errors.push(`${relativePath}: key ${key} must be ${typeof english[key]}`);
      }

      if (key in locale && typeof locale[key] === 'string' && typeof english[key] === 'string') {
        const expectedPlaceholders = [...english[key].matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
        const actualPlaceholders = [...locale[key].matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
        if (JSON.stringify(actualPlaceholders) !== JSON.stringify(expectedPlaceholders)) {
          errors.push(
            `${relativePath}: key ${key} placeholders must match en.json ` +
            `(${expectedPlaceholders.join(', ') || 'none'}; found ${actualPlaceholders.join(', ') || 'none'})`
          );
        }
      }
    }
  }

  const expectedLocales = localeFiles.map((file) => file.replace(/\.json$/, '')).sort();
  const appSource = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const supportedMatch = appSource.match(/const supportedLocales = \[([^\]]*)\]/s);
  if (!supportedMatch) {
    errors.push('src/app.js: supportedLocales list not found');
  }

  const localeSurfaces = [
    {
      label: 'src/app.js supportedLocales',
      locales: supportedMatch ? [...supportedMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]) : []
    },
    {
      label: 'index.html language switcher',
      locales: [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/data-lang="([^"]+)"/g)]
        .map((match) => match[1])
    },
    {
      label: 'service-worker.js locale pre-cache',
      locales: [...fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8').matchAll(/['"]\.\/locales\/([^'"]+)\.json['"]/g)]
        .map((match) => match[1])
    }
  ];

  for (const { label, locales } of localeSurfaces) {
    const actualLocales = [...new Set(locales)].sort();
    const missing = expectedLocales.filter((locale) => !actualLocales.includes(locale));
    const extra = actualLocales.filter((locale) => !expectedLocales.includes(locale));
    if (missing.length > 0) errors.push(`${label}: missing locales: ${missing.join(', ')}`);
    if (extra.length > 0) errors.push(`${label}: unknown locales: ${extra.join(', ')}`);
    if (actualLocales.length !== locales.length) errors.push(`${label}: duplicate locale entries found`);
  }
}

const routeIds = validateCatalogs();
validateCandidateBacklog(routeIds);
validateLocales();

for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

console.log('✓ Catalog, candidate backlog, and locale validation passed');
