# PROJECT EXTRACTION — Browser Extension

Manifest V3 browser extension that acts as the **distraction sensor** in the
PROJECT EXTRACTION operational surveillance net. Tracks which domains the
operator visits, classifies them, and relays metadata-only telemetry to the
backend. When the operator is mid-round and lands on a distraction domain, a
stark fullscreen warning overlay is injected.

> Privacy is non-negotiable. This extension collects **metadata only**. We
> never read page contents, form data, or full URLs.

---

## Build

Requires Node.js >= 20.

```bash
cd packages/extension
npm install
npm run build
```

Outputs go to `packages/extension/dist/`:

```
dist/
  manifest.json
  background.js     # bundled service worker
  content.js        # bundled content script
  popup.html
  popup.js
  icons/
    icon-16.png
    icon-32.png
    icon-48.png
    icon-128.png
```

Placeholder PNG icons are auto-generated on first build (operational red on
near-black). Replace `public/icons/*.png` with real artwork later.

For development:

```bash
npm run build:watch
```

To typecheck without emitting:

```bash
npm run typecheck
```

---

## Load in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** (top right) on.
4. Click **Load unpacked**.
5. Select the `packages/extension/dist/` directory.
6. The extension icon should appear in the toolbar.

For Edge: identical procedure at `edge://extensions`.

For Firefox: Manifest V3 is supported but the manifest may need a
`browser_specific_settings.gecko.id` field. Not currently configured.

For Safari: requires conversion via Xcode's
`safari-web-extension-converter`. Not currently configured.

---

## Configure

Open the extension popup. There are two settings:

- **API Base URL** — defaults to `http://localhost:3001/api`. Point this at
  your backend.
- **Auth Token** — paste a bearer token obtained from the mobile app or
  backend `/auth/login` endpoint. Stored locally in `chrome.storage.local`.

Click **Save**. The extension immediately starts using the new credentials.

To stop monitoring temporarily, click **Pause**. Click **Resume** to start
again. Click **Flush** to force an immediate batch upload (useful for
debugging).

---

## What the extension tracks

**Collected:**

- Active tab's **domain name** (e.g. `instagram.com`) — never the full URL,
  query string, fragment, or path.
- Domain classification: `distraction`, `productive`, or `neutral`.
- Approximate dwell time per domain (seconds of focus).
- Tab activation/update events as timestamps.
- Operational round ID at time of capture (so backend can correlate).
- Opaque, randomly-generated device ID stored locally.

**NOT collected:**

- Full URLs, paths, or query parameters.
- Page contents, DOM, or scraped HTML.
- Form data, keystrokes, or clipboard contents.
- Cookies or `localStorage` of visited sites.
- Browser history, bookmarks, or saved passwords.
- Identity beyond the bearer token the operator pastes in themselves.

---

## API contract

The extension sends batches to the backend every 5 minutes (or on manual
flush):

```http
POST {API_BASE_URL}/telemetry/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "batchId": "uuid",
  "deviceId": "uuid",
  "browser": "chrome",
  "events": [
    {
      "id": "uuid",
      "type": "tab_activated" | "tab_updated" | "distraction_detected"
            | "overlay_shown" | "overlay_dismissed" | "domain_dwell",
      "timestamp": 1700000000000,
      "domain": "instagram.com",
      "classification": "distraction",
      "dwellMs": 45000,        // only for domain_dwell
      "tabId": 12345,
      "roundId": "uuid|null"
    }
  ]
}
```

The extension also polls `GET {API_BASE_URL}/rounds/current` every 2 minutes
to learn the operator's current operational status. If status is
`OPERATIONAL` or `CRITICAL` and the operator hits a distraction domain, the
content script injects the warning overlay.

On failure the batch is retained locally with exponential backoff (up to 30
minutes between retries). Queue is capped at 500 events; oldest are dropped
if the cap is exceeded.

---

## Security notes

- All overlay DOM is built with `document.createElement` and `textContent`.
  Never `innerHTML`. CSP-safe; no `eval`, no inline scripts.
- The overlay uses `z-index: 2147483647` and a unique class prefix
  (`extraction-overlay`) to avoid colliding with host-page styles.
- Auth token lives in `chrome.storage.local`, scoped to the extension. It
  is **not** accessible from any web page.
- All API calls use HTTPS in production. The default
  `http://localhost:3001/api` is intended for local development only.
- The service worker uses `chrome.alarms` for periodic work (not
  `setInterval`) because Manifest V3 service workers are aggressively
  terminated.

---

## Known limitations

- The extension cannot inject overlays into Chrome's internal pages
  (`chrome://`, `chrome-extension://`, Web Store).
- Tab activity in incognito windows is not tracked unless the user
  explicitly enables the extension in incognito mode.
- Dwell timing is approximate (1-minute granularity via `chrome.alarms`).
  Sub-minute focus shifts are aggregated.
- Browser detection in the service worker is heuristic
  (`navigator.userAgent` is not reliably available).
