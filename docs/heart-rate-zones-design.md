# Heart Rate Zones — Testing-Branch Design

Status: implemented on the testing branch; automated validation complete, real-device follow-up pending
Branch: `feature/heart-rate-zones-testing`  
Recorded: 2026-08-24

## Product intent

Add optional live heart-rate monitoring and user-defined heart-rate zones to both generated ScenicSpin experiences:

- **PedalScape:** heart rate plus the existing cadence sensor, including simultaneous BLE connections.
- **BeltScape:** heart rate for walking, running, and treadmill sessions. Cadence remains PedalScape-only.

The experience must remain useful without any sensor, purchase, profile, or zone configuration.

## Agreed principles

1. **No age-derived maximum heart rate.** People differ; the app must not infer a maximum from age, sex, gender, body type, or another demographic.
2. **User-controlled zones.** A user explicitly enters a known maximum heart rate before zones are shown. Zone display is informational, not medical advice.
3. **Inclusive and accessible.** Every zone is represented by text/number as well as color. Copy avoids assumptions about ability, fitness, identity, goals, or equipment.
4. **Local and private.** Sensor choices and zone settings stay in browser-local storage. Live readings are not uploaded or added to third-party URLs.
5. **Optional commerce.** Hardware recommendations are secondary help, never required or presented as the only path. Free/existing-device choices are listed first where appropriate.
6. **Transparent affiliate links.** Amazon recommendations use Scott's existing associate tag, `diabeticbooks`, with a clear nearby disclosure and `rel="sponsored nofollow noopener"`.
7. **Progressive enhancement.** Unsupported browsers retain the normal ScenicSpin experience and receive clear compatibility help.

## Bluetooth architecture

Use two independent, typed sensor sessions rather than a single generic active device:

- **Cadence**
  - PedalScape only
  - Cycling Speed and Cadence Service: `0x1816`
  - CSC Measurement: `0x2A5B`
- **Heart rate**
  - PedalScape and BeltScape
  - Heart Rate Service: `0x180D`
  - Heart Rate Measurement: `0x2A37`

Each session owns its device, GATT server, characteristic, status, parser, saved device metadata, notification handler, freshness timestamp, reconnect state, and teardown path. Connecting, disconnecting, or forgetting one sensor must never disturb the other.

Device chooser and GATT setup are sequential user actions; once connected, cadence and heart-rate notifications may run concurrently. Do not initialize both connections with `Promise.all()`.

The HRS parser must support both 8-bit and 16-bit BPM values from the characteristic flags and safely reject truncated packets. Optional contact, energy-expended, and RR-interval fields may be parsed but are not required for the initial UI.

## Apple Watch and hardware paths

- Apple Watch does not directly advertise the standard BLE Heart Rate Service to a web browser.
- **HeartCast** is the free bridge option: Watch → iPhone → standard BLE HRS → PedalScape/BeltScape on a different computer/tablet device.
- HeartCast cannot feed a web app on the same iPhone.
- Native iOS/iPadOS Safari and installed PWAs do not support Web Bluetooth; this limitation must be explained without implying user error.
- Optional chest/arm-strap examples use the user-verified products and ASINs listed below.

## Zone model

Initial mode: percentage of an explicitly entered maximum heart rate.

Default five-zone bands:

- Zone 1: 50–59% of configured maximum
- Zone 2: 60–69%
- Zone 3: 70–79%
- Zone 4: 80–89%
- Zone 5: 90–100%

Below 50% is shown as **Below Zone 1**, not silently labeled Zone 1. Above the configured maximum is shown as **Above configured maximum**, not clipped or treated as an error.

The UI must state that zone systems vary and that users should enter values appropriate to their own plan. A future user-configurable boundary editor or optional heart-rate-reserve/Karvonen mode may be considered, but neither is required for the first implementation. No age-based fallback is allowed.

Validation:

- Maximum HR is required only to enable zones, not to connect or display BPM.
- Accept a plausible broad integer range without pretending to validate a person's physiology.
- Invalid or missing configuration shows BPM without a zone.
- Stale/disconnected readings clear promptly rather than leaving an apparently live value.

## Experience and accessibility

Both sites receive a heart-rate card with independent controls for connect, reconnect where supported, disconnect, and forget.

Fullscreen overlay:

- PedalScape: cadence and heart rate can appear together.
- BeltScape: heart rate only.
- Example: `82 rpm · 146 bpm · Zone 3`.

Requirements:

- Zone number/name and BPM are always textual; color is supplemental.
- Maintain WCAG contrast for text, controls, focus, and zone indicators.
- Live-region announcements must be restrained; do not announce every beat/update.
- Keyboard operation, visible focus, reduced-motion support, and screen-reader labels are required.
- Use locale-aware number and percentage formatting.
- Add complete keys to `en`, `es`, `fr`, `it`, `tr`, `zh-TW`, and `zh-CN`; do not assemble translated sentences from English-order fragments.

Help should cover:

- What heart-rate zones are and why systems differ.
- How to enter or change a known maximum.
- How to use BPM without enabling zones.
- How to connect a standard BLE monitor.
- Apple Watch/HeartCast setup and same-device limitation.
- Browser/platform compatibility.
- Privacy/local storage.
- Affiliate disclosure and the fact that purchases are optional.

## Affiliate recommendations

Recommendations must live in shared source data so both generated sites render the same verified list. Each entry should include product name, form factor, concise neutral rationale, verified Amazon URL/ASIN, affiliate eligibility, and any material connection limitations.

Disclosure near the links:

> As an Amazon Associate I earn from qualifying purchases. The links are paid affiliate links, and a monitor is optional.

Every Amazon link opens in a new tab with `rel="sponsored nofollow noopener"`. Do not use price claims that can become stale unless fetched dynamically through an approved Amazon API. Do not claim medical accuracy, universal compatibility, or endorsement by Amazon/manufacturers.

Verified US Amazon examples:

- CooSpo H808S — `B0FCY41J5N`; standard BLE chest strap, with dual-BLE capability not confirmed.
- Polar H9 — `B08GHH4ZKL`; manufacturer specifies one Bluetooth connection at a time.
- Polar H10 — `B0F69ZP1D8`; manufacturer confirms two simultaneous Bluetooth connections.
- Polar Verity Sense — `B0F1HY5HGT`; manufacturer confirms two simultaneous Bluetooth connections.

## Storage and backup

Use distinct keys for cadence device, heart-rate device, maximum HR, and zone preferences. Preserve/migrate the existing cadence keys. Include preferences and saved device references in local backup/export where appropriate, but never export live measurement history because none should be retained.

Reset/forget operations must be scoped and must not remove unrelated origin storage.

## Test plan

At minimum:

- Pure HRS parser tests for 8-bit, 16-bit, optional fields, and malformed/truncated packets.
- Mocked Playwright tests for heart-rate connect, notification updates, disconnect, reconnect capability detection, and forget.
- Simultaneous cadence + heart-rate test proving one connection does not replace or disconnect the other.
- BeltScape heart-rate test and assertion that cadence remains hidden there.
- Zone-boundary tests, including below Zone 1 and above configured maximum.
- Missing/invalid max-HR behavior: BPM remains usable, zones disabled.
- Local backup/reset tests for new keys and migration of existing cadence storage.
- Accessibility checks for labels, status semantics, keyboard operation, and non-color zone identification.
- Build and locale validation for both sites.
- Service-worker shell/cache update so new source assets are deployed.
- Real-device smoke test with one standard BLE chest strap and, separately, HeartCast if available.

## Delivery gate

Before reporting complete:

1. `npm run check`
2. `npm run build:all`
3. `npm run test:all`
4. Full Playwright suite for both generated sites
5. Inspect generated PedalScape and BeltScape output
6. Review branch diff for privacy, disclosure, and accidental main-branch changes
7. Commit everything only on `feature/heart-rate-zones-testing`

## Implementation notes

- `src/heart-rate.js` owns the pure standard-HRS parser and percentage-zone classifier used by both generated sites.
- `src/app.js` keeps cadence and heart-rate device, characteristic, notification, freshness, debug, reconnect, and teardown paths independent. PedalScape can run both sessions together; BeltScape exposes only heart rate.
- `data/heart-rate-monitors.json` is the shared recommendation source for both builds.
- Heart-rate device metadata, the user-entered maximum, and the zone-display preference are local and backup-compatible. Live BPM and measurement history are neither stored nor exported.
- Debug heart rate is available on both builds with `?debugHeartRate=150`; PedalScape can combine it with `?debugSensor=1`.
- Shell caches were advanced to PedalScape v14 and BeltScape v10.

## Manual real-device follow-up

Validate one standard BLE chest strap and the HeartCast Watch → iPhone → different-device bridge on supported browsers, including simultaneous cadence plus heart rate on PedalScape. This implementation has not been claimed as real-hardware validated.

## Primary references

- Bluetooth SIG Heart Rate Service: https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
- Web Bluetooth specification: https://webbluetoothcg.github.io/web-bluetooth/
- Chromium multiple-device confirmation: https://github.com/WebBluetoothCG/web-bluetooth/issues/195
- Chrome Web Bluetooth guidance: https://developer.chrome.com/docs/capabilities/bluetooth
- Browser implementation status: https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
- HeartCast limitations/setup: https://www.heartcast.app/faq-help-support-issues/
- WCAG use of color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
