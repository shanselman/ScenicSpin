# ScenicSpin

> One source. Two scenic worlds. Pedal a mountain pass or walk a coastal boardwalk — all from your living room.

**ScenicSpin** is a monorepo that builds two sister Progressive Web Apps from a single shared codebase. Each site turns curated, full‑screen scenic YouTube routes into a calm, distraction‑free way to move indoors — no account, no backend, no tracking.

<p>
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white">
  <img alt="Vanilla JS" src="https://img.shields.io/badge/Vanilla-JS%20%2B%20CSS-f7df1e?logo=javascript&logoColor=black">
  <img alt="No backend" src="https://img.shields.io/badge/Backend-none-555">
  <img alt="Local first" src="https://img.shields.io/badge/Storage-localStorage-2d7fc1">
  <img alt="Build" src="https://img.shields.io/badge/Build-Node.js%20(zero%20deps)-339933?logo=node.js&logoColor=white">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-7%20languages-38e8a4?labelColor=062017">
  <img alt="Tests" src="https://img.shields.io/badge/Tested%20with-Playwright-2EAD33?logo=playwright&logoColor=white">
  <img alt="Deploy" src="https://img.shields.io/badge/Deploy-GitHub%20Pages-222?logo=githubpages&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue">
</p>

---

## 🌐 The Sister Sites

ScenicSpin ships as two independent, white‑labeled sites built from the same templates. They share everything except brand identity, accent color, activity vocabulary, and route catalog.

| | 🚴 **PedalScape** | 🚶 **BeltScape** |
|---|---|---|
| **Live site** | [pedalscape.com](https://pedalscape.com) | [beltscape.com](https://beltscape.com) |
| **Activity** | Indoor cycling | Treadmill walking |
| **Device** | Any bike + screen | Any treadmill + screen |
| **Accent color** | `#38e8a4` 🟢 | `#4d9de0` 🔵 |
| **Tagline** | *Any bike. Any screen. Beautiful rides from home.* | *Any treadmill. Any screen. Beautiful walks from home.* |
| **Routes** | ~40 curated rides | ~24 curated walks |
| **Config** | [`sites/pedalscape.config.json`](sites/pedalscape.config.json) | [`sites/beltscape.config.json`](sites/beltscape.config.json) |
| **Catalog** | [`routes/catalog.json`](routes/catalog.json) | [`routes/beltscape-catalog.json`](routes/beltscape-catalog.json) |

---

## ✨ Features

- **Curated scenic routes** — Hand‑picked, embeddable YouTube videos of bike rides, city walks, and nature trails, tagged with location, terrain, difficulty, duration, scenery, and camera style.
- **Full‑screen player** — Pick a route and launch it full‑screen on a laptop, tablet, or TV. No distractions, no chrome.
- **Local‑first, serverless** — No accounts, no database, no API. Everything runs in the browser.
- **Favorites & history** — Star routes and resume recent activity. Stored in `localStorage` on your device only.
- **Installable PWA** — Add to your home screen; the app shell works offline thanks to a service worker.
- **Privacy‑friendly embeds** — Videos use `youtube-nocookie.com` and link/embed official public streams only (never downloaded or rehosted).
- **7 languages** — English, Spanish, French, Italian, Turkish, Traditional Chinese, and Simplified Chinese, with runtime `{{token}}` substitution.
- **Filter & search** — Browse routes by scenery, terrain, difficulty, and duration.

---

## 🧠 How It Works

ScenicSpin is a **template + token** system. The repo root holds shared source templates with `{{TOKEN}}` placeholders. A small Node.js build script reads a per‑site config, substitutes the tokens, injects localized vocabulary, copies the right catalog and icons, and emits a fully static site into `dist/<site>/`.

```
                 sites/pedalscape.config.json ─┐
                 sites/beltscape.config.json  ─┤
                                               ▼
  index.html ─┐                       ┌──────────────────┐         dist/pedalscape/  ──▶ pedalscape.com
  src/app.js  ├─ {{TOKENS}} ─────────▶│  scripts/build.js │──────▶
  styles.css  │                       │  (token inject +  │         dist/beltscape/   ──▶ beltscape.com
  service-    │                       │   locale merge +  │
   worker.js  │                       │   asset copy)     │
  manifest    ┘                       └──────────────────┘
  locales/*.json
  routes/*catalog.json
  icons/<site>/
```

Because there is no runtime backend, the build's only job is to produce static files. GitHub Actions then pushes each `dist/<site>/` into its own deploy repo, which serves via GitHub Pages.

---

## 📁 Repository Structure

```
ScenicSpin/
├── index.html                 # Shared app shell template (with {{TOKENS}})
├── manifest.webmanifest       # PWA manifest template
├── service-worker.js          # Service worker template (offline shell, cache busting)
├── src/
│   ├── app.js                 # Main app logic (catalog, player, favorites, i18n, filters)
│   └── styles.css             # Styles (accent color driven by tokens)
├── locales/                   # i18n source files (~164 keys each)
│   ├── en.json                #   English (source of truth)
│   ├── es.json  fr.json
│   ├── it.json  tr.json
│   ├── zh-TW.json  zh-CN.json
├── sites/                     # Per-site configuration
│   ├── pedalscape.config.json
│   └── beltscape.config.json
├── routes/
│   ├── catalog.json           # PedalScape route catalog
│   ├── beltscape-catalog.json # BeltScape route catalog
│   └── candidate-backlog.json # Routes under review / not yet curated
├── icons/
│   ├── pedalscape/            # PedalScape icon set
│   ├── beltscape/             # BeltScape icon set
│   └── *.svg / *.png          # Shared / source icons
├── assets/                    # OG images and shared static assets
├── scripts/
│   ├── build.js               # The build script (zero npm deps, pure Node)
│   └── generate-og-image.ps1  # OG image generator
├── tests/
│   ├── pwa-local.spec.js      # Catalog, player, favorites behavior
│   └── pwa-offline.spec.js    # Service worker / offline shell
├── playwright.config.js       # Test runner (reads SITE env to pick config)
├── .github/workflows/
│   └── deploy.yml             # CI: build → test → deploy both sites
├── docs/                      # Team / contributor guides
└── dist/                      # Build output (gitignored)
```

---

## 🚀 Local Development

### Prerequisites

- **Node.js 20+** (build script uses only built‑ins — no `node_modules` required to build)
- **Python 3** (for the static preview server) *or* any static file server
- **npm** (only needed to install Playwright for tests)

### Quick start

```bash
# 1. Clone
git clone https://github.com/shanselman/ScenicSpin.git
cd ScenicSpin

# 2. Build a site into dist/<site>/
node scripts/build.js pedalscape      # or: npm run build:pedalscape
node scripts/build.js beltscape       # or: npm run build:beltscape
npm run build:all                     # both at once

# 3. Preview the built site
npm run preview:pedalscape            # serves dist/pedalscape at http://127.0.0.1:5173
npm run preview:beltscape             # serves dist/beltscape at http://127.0.0.1:5174
```

> ⚠️ **Always preview the built `dist/` output, not the repo root.** The root files contain raw `{{TOKENS}}` and won't render correctly until the build substitutes them.

### Handy scripts

| Command | What it does |
|---|---|
| `npm run build:pedalscape` | Build PedalScape into `dist/pedalscape/` |
| `npm run build:beltscape` | Build BeltScape into `dist/beltscape/` |
| `npm run build:all` | Build both sites |
| `npm run preview:pedalscape` | Static‑serve PedalScape on port `5173` |
| `npm run preview:beltscape` | Static‑serve BeltScape on port `5174` |
| `npm run check` | `node --check` syntax‑validate `src/app.js` |
| `npm run test:pedalscape` | Build + run Playwright tests for PedalScape |
| `npm run test:beltscape` | Build + run Playwright tests for BeltScape |
| `npm run test:all` | Test both sites |

---

## 🐳 Docker

You can also build, preview, and test with Docker without installing Node or Python locally.

### Build the image

```bash
docker build -t scenicspin .
```

The image installs dependencies, builds the default PedalScape site into `dist/pedalscape/`, and configures the container to serve it.

### Run a preview

```bash
docker run --rm -p 5173:5173 scenicspin
```

Open http://localhost:5173 to view the built PedalScape site.

### Run tests

> Note: the Dockerfile has Playwright browser installation commented out by default. To run end‑to‑end tests, uncomment the following line in the `Dockerfile` before building:
>
> ```dockerfile
> RUN npx playwright install --with-deps || true
> ```

Then build and run the tests:

```bash
docker build -t scenicspin .
docker run --rm --shm-size=1g scenicspin npm run test:e2e
```

---

## 🎬 Adding a Route

Routes live in each site's catalog: `routes/catalog.json` (PedalScape) or `routes/beltscape-catalog.json` (BeltScape). Add an entry to the `routes` array:

```json
{
  "id": "isar-river-bavaria-autumn-4k",
  "title": "Bavaria in Full Autumn Glory along the Isar River",
  "sourceUrl": "https://www.youtube.com/watch?v=mbfR4p_-tGE",
  "embedUrl": "https://www.youtube-nocookie.com/embed/mbfR4p_-tGE",
  "sourcePlatform": "youtube",
  "creator": "Virtual Cycling Workouts",
  "location": "Isar River, Bavaria, Germany",
  "durationMinutes": 109,
  "difficulty": "easy",
  "terrain": "paved cycle path, river valley",
  "sceneryTags": ["river", "autumn", "countryside", "bavaria"],
  "videoQuality": "4K",
  "audio": "natural sounds, no music",
  "cameraStyle": "handlebar-mounted first-person POV",
  "embeddingAllowed": true,
  "license": "Platform-hosted public stream; reuse governed by YouTube terms.",
  "curationNotes": "Official public video; oEmbed resolved. Do not download or rehost."
}
```

**Curation rules (please honor these):**

- ✅ Link/embed **official public streams only**. Use the `youtube-nocookie.com/embed/<id>` form for `embedUrl`.
- ✅ Confirm the video allows embedding (`embeddingAllowed: true`) and re‑check before launch — platform settings change.
- ❌ Never download, proxy, mirror, or rehost a creator's video files.
- Give each route a unique, descriptive kebab‑case `id`.
- Not ready yet? Park candidates in [`routes/candidate-backlog.json`](routes/candidate-backlog.json).

After editing, rebuild and the new route appears in the catalog automatically (`build.js` copies the site's catalog to `dist/<site>/routes/catalog.json`).

---

## 🌍 Internationalization

Each locale file in [`locales/`](locales/) holds ~164 keys. `en.json` is the **source of truth**. Strings support runtime `{{token}}` substitution so the same phrase reads correctly per site:

```json
"hero_copy": "Jump into curated scenic {{activity_verb}} routes, then launch a fullscreen {{activity_noun_singular}} on your laptop, tablet, or TV."
```

### How the build localizes per site

`build.js` post‑processes every locale on its way into `dist/`:

1. **Always‑overwrite keys** — brand/URL keys (`site_name`, `sister_site_name`, `sister_site_url`, …) are forced from the site config so they're never accidentally translated.
2. **Fallback activity keys** — `activity_noun_singular`, `activity_verb`, `activity_device`, etc. are injected **only as fallbacks**. A translator‑provided value always wins; English stubs get replaced with the site's word (e.g. `ride` → `walk`).
3. **Per‑language overrides** — `beltscape.config.json` carries a `localeOverrides` block with proper walking vocabulary for each language (Spanish *caminata*, French *marche*, Italian *passeggiata*, Turkish *yürüyüş*, Chinese walking terms…), applied last.

This is why one set of locale files produces both "ride / cycling / bike" and "walk / walking / treadmill" copy across seven languages.

### Adding a new language

1. Copy `locales/en.json` to `locales/<lang>.json` (e.g. `de.json`).
2. Translate every value. Leave `{{tokens}}` intact — they're substituted at runtime.
3. Leave brand keys (`site_name`, `sister_site_*`) as‑is; the build overwrites them.
4. For BeltScape, add a matching block to `localeOverrides.<lang>` in `sites/beltscape.config.json` with the walking vocabulary for that language.
5. Register the language wherever the locale list is wired in `src/app.js` (the language picker).
6. Rebuild and verify: `npm run build:all`, then preview and switch languages.

---

## 🛠 Build System

`scripts/build.js` is a single, dependency‑free Node script. Run it with a site slug:

```bash
node scripts/build.js <pedalscape|beltscape>
```

What it does, in order:

1. **Loads** `sites/<slug>.config.json`.
2. **Cleans** `dist/<slug>/`.
3. **Token‑substitutes** the template files — `index.html`, `manifest.webmanifest`, `service-worker.js`, `src/styles.css`, `src/app.js` — replacing placeholders like `{{SITE_NAME}}`, `{{ACCENT_COLOR}}`, `{{SHELL_VERSION}}`, `{{CACHE_NAME}}`, `{{ACTIVITY_NOUN}}`, and more.
4. **Copies** the site's icon set (`icons/<slug>/` → `dist/<slug>/icons/`) and shared `assets/`.
5. **Localizes** every file in `locales/` (brand overwrite + activity fallbacks + per‑language overrides).
6. **Copies the catalog** — the site's catalog is always emitted as `routes/catalog.json` so `app.js` is site‑agnostic — plus `candidate-backlog.json`.
7. **Writes** a `CNAME` (the site domain) and a merged `manifest.webmanifest` (with site categories).

### Cache busting

The service worker cache is named by `cacheName` (e.g. `pedalscape-shell-v7`), derived from `shellVersion`. **Bump `shellVersion` in the site config whenever you ship shell changes** — it changes the cache name, so returning visitors fetch the fresh shell instead of a stale cached one.

### A few key tokens

| Token | Source field | Example |
|---|---|---|
| `{{SITE_NAME}}` | `siteName` | `PedalScape` |
| `{{ACCENT_COLOR}}` | `accentColor` | `#38e8a4` |
| `{{SHELL_VERSION}}` | `shellVersion` | `7` |
| `{{CACHE_NAME}}` | `cacheName` | `pedalscape-shell-v7` |
| `{{CATALOG_FILE}}` | `catalogFile` | `catalog.json` |
| `{{ACTIVITY_NOUN}}` | `activityNoun` | `rides` / `walks` |
| `{{ACTIVITY_DEVICE}}` | `activityDevice` | `bike` / `treadmill` |
| `{{SISTER_SITE_URL}}` | `sisterSiteUrl` | `https://beltscape.com` |

---

## 🧪 Testing

End‑to‑end tests run in **Playwright** (Chromium). The runner reads the `SITE` env var to pick the right config and serves the built `dist/<site>/`.

```bash
npm run test:pedalscape     # build + test PedalScape
npm run test:beltscape      # build + test BeltScape
npm run test:all            # both

# Or directly against an already-built site:
SITE=beltscape npx playwright test
```

Coverage includes catalog loading and result counts, the full‑screen player, favorites, and the offline service‑worker shell.

---

## 📦 Deployment

Deployment is automated by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to `main`:

```
push to main
   │
   ├─ test  (matrix: pedalscape, beltscape)
   │     build each site → run Playwright tests
   │
   └─ deploy  (needs: test)  (matrix: pedalscape, beltscape)
         build dist/<site>/  →  force-push to shanselman/<site>  →  GitHub Pages
```

- Each site is **built and tested independently** in a matrix job; a failing site blocks its own deploy.
- The built `dist/<site>/` is force‑pushed to a **separate deploy repo** (`shanselman/pedalscape`, `shanselman/beltscape`) using a `DEPLOY_TOKEN` secret.
- Each deploy repo serves via **GitHub Pages**, with the `CNAME` file (written by the build) mapping it to its custom domain.

You can also trigger the workflow manually via **workflow_dispatch**.

---

## 🤝 Contributing

Contributions are welcome — new routes, translations, fixes, and shell improvements.

- **Add a route** → follow [Adding a Route](#-adding-a-route) and honor the curation rules (official embeds only).
- **Add/fix a translation** → see [Internationalization](#-internationalization). Keep `{{tokens}}` intact.
- **Change the app shell** → edit the templates at the repo root / `src/`, then **bump `shellVersion`** in the affected site config(s) so caches refresh.
- **Before opening a PR** → run `npm run check` and `npm run test:all`, and preview both built sites.

Please keep the projects local‑first and privacy‑friendly: no analytics, no accounts, no rehosted video.

---

## 👏 Credits

- **Author & maintainer:** Scott Hanselman ([@shanselman](https://github.com/shanselman))
- **Translations:**
  - Serdar Cevher — 🇪🇸 Spanish, 🇫🇷 French, 🇮🇹 Italian, 🇹🇷 Turkish
  - Will 保哥 ([@doggy8088](https://github.com/doggy8088)) — 🇹🇼 Traditional Chinese, 🇨🇳 Simplified Chinese
- **Scenic routes:** the original YouTube creators, whose public streams are embedded with attribution. Please support them directly.

---

## 📄 License

The ScenicSpin source code is released under the **MIT License**. Embedded videos remain the property of their respective creators and are governed by YouTube's terms — ScenicSpin links and embeds them but never hosts, downloads, or redistributes them.
