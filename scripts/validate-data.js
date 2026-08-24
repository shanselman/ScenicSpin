#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const errors = [];
const expectedLocaleFiles = ['en.json', 'es.json', 'fr.json', 'it.json', 'tr.json', 'zh-CN.json', 'zh-TW.json'];
const expectedHeartRateProducts = new Map([
  ['CooSpo H808S', 'B0FCY41J5N'],
  ['Polar H9', 'B08GHH4ZKL'],
  ['Polar H10', 'B0F69ZP1D8'],
  ['Polar Verity Sense', 'B0F1HY5HGT']
]);

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

  const missingLocaleFiles = expectedLocaleFiles.filter((file) => !localeFiles.includes(file));
  const unexpectedLocaleFiles = localeFiles.filter((file) => !expectedLocaleFiles.includes(file));
  if (missingLocaleFiles.length > 0) errors.push(`locales: missing required files: ${missingLocaleFiles.join(', ')}`);
  if (unexpectedLocaleFiles.length > 0) errors.push(`locales: unexpected files require validator registration: ${unexpectedLocaleFiles.join(', ')}`);

  for (const fileName of localeFiles) {
    const relativePath = path.join('locales', fileName);
    const locale = readJson(relativePath);
    if (!locale) continue;

    const actualKeys = Object.keys(locale).sort();
    const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
    const extra = actualKeys.filter((key) => !expectedKeys.includes(key));

    if (missing.length > 0) errors.push(`${relativePath}: missing locale keys: ${missing.join(', ')}`);
    if (extra.length > 0) errors.push(`${relativePath}: extra locale keys: ${extra.join(', ')}`);

    for (const key of expectedKeys) {
      if (key in locale && typeof locale[key] !== typeof english[key]) {
        errors.push(`${relativePath}: key ${key} must be ${typeof english[key]}`);
      }
    }
  }
}

function validateHeartRateRecommendations() {
  const file = path.join('data', 'heart-rate-monitors.json');
  const data = readJson(file);
  if (!data) return;

  if (data.schemaVersion !== 1) errors.push(`${file}: schemaVersion must be 1`);
  if (!Array.isArray(data.products)) {
    errors.push(`${file}: products must be an array`);
    return;
  }
  if (data.products.length !== expectedHeartRateProducts.size) {
    errors.push(`${file}: expected exactly ${expectedHeartRateProducts.size} products`);
  }

  const seenNames = new Set();
  for (const [index, product] of data.products.entries()) {
    const label = product?.name || `at index ${index}`;
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      errors.push(`${file}: product ${label} must be an object`);
      continue;
    }

    for (const field of ['name', 'asin', 'formFactorKey', 'connectionKey', 'amazonUrl']) {
      if (!isNonEmptyString(product[field])) errors.push(`${file}: product ${label} must have non-empty ${field}`);
    }

    const expectedAsin = expectedHeartRateProducts.get(product.name);
    if (!expectedAsin) {
      errors.push(`${file}: unexpected product ${product.name}`);
      continue;
    }
    if (seenNames.has(product.name)) errors.push(`${file}: duplicate product ${product.name}`);
    seenNames.add(product.name);
    if (product.asin !== expectedAsin) {
      errors.push(`${file}: ${product.name} ASIN must be ${expectedAsin}`);
    }

    const expectedUrl = `https://www.amazon.com/dp/${expectedAsin}?tag=diabeticbooks`;
    if (product.amazonUrl !== expectedUrl) {
      errors.push(`${file}: ${product.name} amazonUrl must be exactly ${expectedUrl}`);
    }
    if ('price' in product) errors.push(`${file}: ${product.name} must not include a price`);
  }

  for (const name of expectedHeartRateProducts.keys()) {
    if (!seenNames.has(name)) errors.push(`${file}: missing product ${name}`);
  }
}

const routeIds = validateCatalogs();
validateCandidateBacklog(routeIds);
validateLocales();
validateHeartRateRecommendations();

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

console.log('✓ Catalog, candidate backlog, locale, and heart-rate recommendation validation passed');
