#!/usr/bin/env node
/**
 * ScenicSpin multi-site build script
 * Usage: node scripts/build.js <siteSlug>
 * Example: node scripts/build.js pedalscape
 *          node scripts/build.js beltscape
 *
 * Zero npm dependencies — pure Node built-ins only.
 */

const fs = require('fs');
const path = require('path');

const siteSlug = process.argv[2];
if (!siteSlug) {
  console.error('Usage: node scripts/build.js <siteSlug>');
  console.error('Available sites:', fs.readdirSync('sites').map(f => f.replace('.config.json', '')).join(', '));
  process.exit(1);
}

const configPath = path.join('sites', `${siteSlug}.config.json`);
if (!fs.existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const outDir = path.join('dist', siteSlug);

// Token map — order matters: longer tokens before substrings
const tokens = {
  '{{SITE_NAME}}':           config.siteName,
  '{{SITE_SLUG}}':           config.siteSlug,
  '{{SITE_DOMAIN}}':         config.domain,
  '{{SITE_TAGLINE}}':        config.tagline,
  '{{ACCENT_COLOR}}':        config.accentColor,
  '{{ACCENT_STRONG}}':       config.accentStrong,
  '{{ACCENT_RING}}':         config.accentRing,
  '{{ACCENT_RING_STRONG}}':  config.accentRingStrong,
  '{{ACCENT_RING_MED}}':     config.accentRingMed,
  '{{ACCENT_RING_LIGHT}}':   config.accentRingLight,
  '{{ACCENT_RING_FAINT}}':   config.accentRingFaint,
  '{{ACCENT_RING_INSET}}':   config.accentRingInset,
  '{{ACCENT_BRAND_SHADOW}}': config.accentBrandShadow,
  '{{ACCENT_FG}}':           config.accentFg,
  '{{ACCENT_FG_ALT}}':       config.accentFgAlt,
  '{{BG_COLOR}}':            config.bgColor,
  '{{PANEL_COLOR}}':         config.panelColor,
  '{{PANEL_STRONG}}':        config.panelStrong,
  '{{THEME_COLOR}}':         config.themeColor,
  '{{SHELL_VERSION}}':       config.shellVersion,
  '{{CACHE_NAME}}':          config.cacheName,
  '{{CATALOG_FILE}}':        config.catalogFile,
  '{{ACTIVITY_NOUN}}':       config.activityNoun,
  '{{ACTIVITY_NOUN_CAP}}':   config.activityNounCap,
  '{{ACTIVITY_VERB}}':       config.activityVerb,
  '{{ACTIVITY_VERB_CAP}}':   config.activityVerbCap,
  '{{OG_IMAGE_FILE}}':       config.ogImageFile,
  '{{OG_IMAGE_ALT}}':        config.ogImageAlt,
  '{{MANIFEST_DESC}}':       config.manifestDescription,
};

function replaceTokens(str) {
  return Object.entries(tokens).reduce((s, [k, v]) => s.replaceAll(k, v), str);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠ Source dir not found, skipping: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

// Clean and recreate output dir
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Template files — token replacement applied
const templateFiles = [
  'index.html',
  'manifest.webmanifest',
  'service-worker.js',
  'src/styles.css',
  'src/app.js',
];

console.log(`\n🔨 Building ${config.siteName} → ${outDir}/\n`);

for (const file of templateFiles) {
  if (!fs.existsSync(file)) {
    console.warn(`  ⚠ Template file not found, skipping: ${file}`);
    continue;
  }
  const dest = path.join(outDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const processed = replaceTokens(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(dest, processed);
  console.log(`  ✓ ${file}`);
}

// Copy site-specific icons
copyDir(config.iconsFolder, path.join(outDir, 'icons'));
console.log(`  ✓ icons/ (from ${config.iconsFolder})`);

// Copy assets (og-image etc)
copyDir('assets', path.join(outDir, 'assets'));
console.log(`  ✓ assets/`);

// Copy routes — catalog + candidate-backlog
fs.mkdirSync(path.join(outDir, 'routes'), { recursive: true });

const catalogSrc = path.join('routes', config.catalogFile);
if (fs.existsSync(catalogSrc)) {
  // Always output as catalog.json so app.js doesn't need to know the site
  fs.copyFileSync(catalogSrc, path.join(outDir, 'routes', 'catalog.json'));
  console.log(`  ✓ routes/catalog.json (from ${config.catalogFile})`);
} else {
  console.warn(`  ⚠ Catalog not found: ${catalogSrc}`);
}

const backlogSrc = 'routes/candidate-backlog.json';
if (fs.existsSync(backlogSrc)) {
  fs.copyFileSync(backlogSrc, path.join(outDir, 'routes', 'candidate-backlog.json'));
  console.log(`  ✓ routes/candidate-backlog.json`);
}

// Write CNAME for GitHub Pages
fs.writeFileSync(path.join(outDir, 'CNAME'), config.domain + '\n');
console.log(`  ✓ CNAME → ${config.domain}`);

// Write manifest with categories (JSON, not a template)
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
// Apply token replacements to manifest values
const processedManifest = JSON.parse(replaceTokens(JSON.stringify(manifest)));
processedManifest.categories = config.manifestCategories;
fs.writeFileSync(
  path.join(outDir, 'manifest.webmanifest'),
  JSON.stringify(processedManifest, null, 2) + '\n'
);
console.log(`  ✓ manifest.webmanifest (merged)`);

console.log(`\n✅ ${config.siteName} built successfully → ${outDir}/\n`);
