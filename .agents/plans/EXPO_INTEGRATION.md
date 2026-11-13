# Expo Integration Plan

Serve over-the-air updates to Expo apps from **OTACenter**, using the stock **`expo-updates`**
module as the device engine, and add the missing features with a **JS-only Expo package**,
**`expo-ota-client`** (this repo). The plan also adds **demo releases**: versions and bundles that only
members of selected domains can install, until they are promoted to everyone.

Status (2026-11-13): **phases 1–5 and 7 implemented; device testing pending.** OTACenter server and
dashboard, plus this package (plugin, runtime, CLI), are done. Not done: phase 0 on a real device, phase 6
(`linkDevice` in the bare RN `ota-client`), OTACenter MDX docs, npm publish.

### Where the build differs from this plan

- Routes live under the existing prefix: `/ota-client/v1/expo/{package}/manifest`.
- The spec check found that expo-updates sends **no** stable install id to custom servers. The package
  stores its own id with `Updates.setExtraParamAsync('did', …)`, and the server reads it from
  `Expo-Extra-Params`. The device is optional on the manifest route: unknown devices get public updates.
- Asset URLs are **temporary signed URLs** (no API key on asset requests).
- Downgrades (withdrawn demo, lost access, public pointer moved back) go through `rollBackToEmbedded`
  first; the next check serves the older bundle.
- The store and download links never serve demos, even to eligible users (demos reach testers in-app only).
- Admins get no implicit demo access (open question 7: decided **no**). Anyone may create a link code for
  themselves; `device.link` (super-admin, admin) creates codes for others (question 8). A device has one
  user; relinking replaces it (question 9).
- Server-side reference: `OTACenter/.agents/context/backend/EXPO-DEMO.md`.
- **No longer JS-only.** New native builds (APKs) install inside the app, as in OTAStore: the package
  ships one Android Expo module, `ExpoOtaInstaller` (download with progress/cancel, SHA-256 + "PK" check,
  `FileProvider` → system installer, "install unknown apps" handling). Plugin option
  `inAppNativeUpdates: false` drops `REQUEST_INSTALL_PACKAGES` for Google Play apps. The bare RN
  `ota-client` got the same change (1.5.0, `com.otaclient.ota.ApkInstaller`).

---

## 1. Context

| Project | Path | Role |
| --- | --- | --- |
| OTACenter | `E:\OTA\OTACenter` | Laravel 13 + React 19 platform. Apps → Versions (native builds) → Bundles (JS updates). Device API under `/ota-client/v1/*` (`routes/ota_client.php`, `app/Http/Controllers/OTAClient/AppController.php`). |
| react-ota-client | `E:\OTA\react-ota-client` | npm `ota-client` v1.4.0: Kotlin engine + JS API + CLI for **bare React Native, Android only**. Ships a `.tar.gz` (bundle + `manifest.json`). |
| exo-ota-client | `E:\OTA\exo-ota-client` | **This repo.** The new Expo package `expo-ota-client`. |

### Existing device API

| Route | Purpose |
| --- | --- |
| `GET /ota-client/v1/health` | Reachability |
| `POST /ota-client/v1/app/info` | `{package, version, bundle}` → `availableUpdates.{version,bundle}` (+ `updateType`, `checksum`), session token |
| `POST /ota-client/v1/app/event` | Telemetry (`update.available`, `update.refused`, `update.downloaded`, `update.installed`, `update.failed`, `update.rollback`, `bundle.launch_confirmed`, `bundle.launch_failed`) |
| `GET /ota-client/v1/app/update/bundle/{bundle}` | Bundle archive |
| `GET /ota-client/v1/app/update/version/{version}` | APK (also accepts `?api_key=` for browser downloads) |

Auth: `ota.api_key` (`OtaApiKeyMiddleware`, `API-KEY` header matched against the **version's**
`api_key`), then `device` (`DeviceMiddleware`, parses `X-Device-Info: did=…;mf=…;br=…;mdl=…;av=…;sdv=…`).

### Facts the plan builds on

- **Publishing is a pointer.** `apps.latest_id` → the served Version, `versions.latest_id` → the
  served Bundle. `BundleController::activate` just sets `versions.latest_id`.
- **Devices are anonymous today.** `DeviceMiddleware` sets `devices.user_id` only when the request
  is authenticated, which the API-key-only device API never is. `Device::firstOrCreate` also never
  updates `user_id` later. Demo access (section 5) therefore needs a **device → user link**.
- **Domains already join users and apps**: `user_domains` (`User::domains`, `Domain::users`) and
  `app_domains` (`App::domains`, `Domain::apps`). Domains also carry `is_public` (the public store).

---

## 2. Decisions

1. **Engine = `expo-updates`**, pointed at OTACenter through `updates.url`. We do **not** port the
   Kotlin engine to Expo. Reasons: it works on iOS and Android, ships Hermes bytecode, handles
   updated assets/fonts, has rollback on a crash at launch, supports code signing, and Expo maintains it.
2. **OTACenter implements the Expo Updates protocol** on new routes. The existing `ota-client`
   routes stay as they are for bare React Native apps.
3. **`expo-ota-client` is JS-only** (no native code), so it works with any Expo SDK that
   `expo-updates` supports. It covers what `expo-updates` lacks: a config plugin, update UI,
   forced updates, telemetry, APK update prompts, demo enrolment and a release CLI.
4. **Debug builds are unaffected**: Metro serves JS in development and `expo-updates` stands down,
   so Fast Refresh keeps working.
5. Bare RN apps keep using `ota-client`. Both kinds of client share the same Apps / Versions /
   Domains / statistics in the dashboard.
6. **The package is identified by a URL path segment**: `/ota-client/expo/{package}/manifest`.
7. **One `Bundle` row covers both platforms.** Its files are grouped by `platform` in `bundle_assets`,
   so activating or promoting a bundle publishes Android and iOS together.
8. **Demo releases are decided on the server** (section 5) and apply to **both clients**. They are
   gated by domain membership (`domains.allow_demo`), **not** by `expo-channel-name`.

---

## 3. Expo Updates protocol: what OTACenter must speak

> ⚠️ This is written from memory. **Phase 0 verifies every item below** against the current spec
> (docs.expo.dev → "Expo Updates protocol") and the reference server
> `github.com/expo/custom-expo-updates-server` before any production code is written.

### Request (device → `updates.url` = `{server}/ota-client/expo/{package}/manifest`)

| Header | Meaning | OTACenter mapping |
| --- | --- | --- |
| `expo-protocol-version` | `1` | Reject other values |
| `expo-platform` | `android` / `ios` | `bundle_assets.platform` |
| `expo-runtime-version` | Native runtime key | `versions.name` |
| `expo-current-update-id` | UUID of the running update | `bundles.expo_update_id` |
| `expo-embedded-update-id` | UUID of the update embedded in the binary | Treat as "no OTA installed" |
| `expo-channel-name` | Optional channel | **Ignored.** Demo targeting is done by device → user → domain (section 5) |
| `eas-client-id` (verify name) | Stable per-install ID | `devices.did` |
| custom `updates.requestHeaders` | Set in `app.json` | `API-KEY` |

### Response

- `200` + `multipart/mixed` with:
  - a `manifest` part:
    `{ id (UUID), createdAt, runtimeVersion, launchAsset, assets[], metadata, extra }`
    - each asset is `{ hash (base64url SHA-256), key, contentType, fileExtension, url }`
  - an optional `directive` part: `rollBackToEmbedded` or `noUpdateAvailable`
- "No update": `204` or a `noUpdateAvailable` directive (verify which v1 expects)
- Headers: `expo-protocol-version: 1`, `expo-sfv-version: 0`, `cache-control: private, max-age=0`
- Optional code signing: an `expo-signature` header on the manifest part (RSA-SHA256), verified
  against `updates.codeSigningCertificate` in the app

### Assets

Each file is downloaded on its own from `asset.url`. The downloaded file's SHA-256 must
equal `hash`. There is no archive, which differs from the current `.tar.gz` flow.

### Downgrades (verify)

`expo-updates` may refuse a manifest whose `createdAt` is **older** than the running update. That
matters when a demo is withdrawn (section 5.6). Phase 0 must confirm this behaviour and which
response moves a device back to an older published bundle.

---

## 4. OTACenter changes: Expo support

### 4.1 Schema (new migration)

| Table | Column | Notes |
| --- | --- | --- |
| `versions` | `client_type` enum `ota-client` \| `expo`, default `ota-client` | Picks the upload format and the device routes allowed |
| `bundles` | `expo_update_id` UUID, nullable, unique | Generated on upload of an Expo bundle |
| `bundles` | `expo_metadata` JSON, nullable | Parsed `metadata.json` (debug / re-signing) |
| new `bundle_assets` | `id, bundle_id, platform, key, path, hash, content_type, file_extension, is_launch_asset, size` | One row per file in the export, both platforms under one bundle |

Demo columns are listed separately in section 5.2.

Update `App\Models\Bundle` / `Version` (fillable, casts, validation, `toArray`) and
`.agents/context/backend/MODELS.md`, `DATABASE.md`.

### 4.2 Upload (dashboard / admin API)

- `POST /api/app/{app}/version/{version}/bundle` accepts, for `client_type = expo`, a **zip of
  `npx expo export` output** (`dist/`), plus the `is_demo` flag (section 5).
- New service `App\Services\Expo\ExpoBundleImporter`:
  1. Unzip into a temp dir, rejecting entries that escape it (zip-slip).
  2. Read `metadata.json` (`fileMetadata.{android,ios}.bundle` + `assets[]`).
  3. Store each file under `bundles/{bundle_id}/{platform}/…` on the `public` disk, compute
     SHA-256 (base64url) and the content type, and write `bundle_assets`.
  4. Check that `runtimeVersion` (from the CLI-provided `expoConfig` or a form field) equals
     `version.name`; reject the upload otherwise.
  5. Generate `expo_update_id`.
- Size limits and validation errors must be clear in the dashboard UI (`BundleTab`).

### 4.3 Device routes (`routes/ota_client.php`)

```php
Route::prefix('expo/{package}')->middleware(['ota.api_key', 'device'])->group(function () {
  Route::get('/manifest', [ExpoUpdatesController::class, 'manifest']);
  Route::get('/assets/{bundle}/{asset}', [ExpoUpdatesController::class, 'asset']);
});
```

- **`{package}`** = `apps.package_name`; unknown package → 404.
- **`OtaApiKeyMiddleware`:** for the manifest route, resolve the version from `{package}` +
  `expo-runtime-version`, so the existing key check works unchanged. Assets resolve through the bound `{bundle}`.
- **`DeviceMiddleware`:** accept the `expo-updates` install ID header when `X-Device-Info` is absent.
  Brand and model stay null unless the JS package reports them later through `/app/event`.
- **`ExpoUpdatesController::manifest`:**
  1. Validate the protocol headers.
  2. Look up the version from `expo-runtime-version`. If it's unknown, answer "no update" (the app
     keeps its embedded bundle).
  3. Ask `ReleaseResolver` (section 5.4) for the bundle this **device** should run, limited to bundles
     with assets for `expo-platform`.
  4. No bundle to serve, but the device runs an OTA update → `rollBackToEmbedded` directive.
  5. Resolved bundle id == `expo-current-update-id` → no update.
  6. Otherwise build the manifest (asset URLs → the asset route, `extra.otaCenter` below), sign it
     when a key is configured, and return the multipart response.
  7. Sync `device_apps` and write `Log::record('update.available', …)` as `info()` does today.
- **`ExpoUpdatesController::asset`:** stream the file with the correct `Content-Type`, `Content-Length`
  and long-lived `cache-control` (assets are content-addressed). Record `DownloadHistory` for
  the launch asset only. Demo bundles are subject to the access check in section 5.7.
- `extra.otaCenter` payload:
  ```json
  { "bundleId": 12, "bundleName": "1.0.3", "updateType": "optional", "changelog": "…", "demo": false }
  ```

### 4.4 Code signing (optional, recommended)

- Config: `OTA_EXPO_SIGNING_KEY` (PEM path) + key id; signs each manifest part.
- Dashboard (Settings): show or download the certificate for `updates.codeSigningCertificate`.

### 4.5 Existing endpoints

- `POST /app/info`: for Expo versions, still reports `availableUpdates.version` (new native
  build / APK). `availableUpdates.bundle` is ignored by the Expo package (expo-updates owns bundles).
  Both lookups go through `ReleaseResolver`, so demo versions and bundles reach eligible devices.
- `POST /app/event`: unchanged; the Expo package sends `bundle = extra.otaCenter.bundleName`.
- `GET /app/update/version/{version}`: unchanged (APK link for Android), plus the demo access check.

### 4.6 Tests (Pest, `tests/Feature/OTAClient/Expo*`)

- Importer: valid export, zip-slip rejected, runtime mismatch rejected, hashes correct.
- Manifest: no version, no bundle, already up to date, update available (shape + headers),
  platform filtering, rollback directive, bad API key, unknown package.
- Asset: correct bytes and hash, a bundle from another app → 401/404.
- Signing: the signature verifies with the public certificate.
- Existing `ota-client` route tests still pass.

### 4.7 Docs

- Update `.agents/context/backend/ROUTES.md`, `CONTROLLERS.md`, `MODELS.md`.
- New MDX page in `resources/js/apps/docs/content/` covering Expo setup.

---

## 5. Demo releases (both clients)

### 5.1 Concept

- When uploading a **version** (native build) or a **bundle** (JS update), the uploader can mark it as a **demo**.
- A demo is offered **only to eligible devices**: devices linked to a user who belongs to a domain
  with **`allow_demo = true`** that is also bound to the app.
- Once tested, the demo is **promoted**: it becomes the public release for everyone. Nothing is
  re-uploaded; the same row and the same files become public.
- A demo can also be **withdrawn**; eligible devices then go back to the public release.
- This is server-side only. `ota-client` (bare RN) and `expo-ota-client` both pick it up through the
  existing `/app/info` and the new Expo manifest route. The only client-side addition is
  **device linking** (section 5.5).

### 5.2 Schema

| Table | Column | Notes |
| --- | --- | --- |
| `domains` | `allow_demo` boolean, default `false` | Members of this domain may install demos of the domain's apps |
| `versions` | `is_demo` boolean, default `false`; `promoted_at` timestamp, nullable | Set at upload; cleared on promotion |
| `bundles` | `is_demo` boolean, default `false`; `promoted_at` timestamp, nullable | Same |
| `apps` | `demo_latest_id` → `versions.id`, nullable | Demo counterpart of `apps.latest_id` |
| `versions` | `demo_latest_id` → `bundles.id`, nullable | Demo counterpart of `versions.latest_id` |
| new `device_link_codes` | `id, user_id, app_id (nullable), code_hash, expires_at, used_at, created_by` | One-time codes that link a device to a user |

Two pointers keep the existing "publishing is a pointer" model: `latest_id` is what everyone gets,
`demo_latest_id` is what eligible devices get.

### 5.3 Eligibility

New service `App\Services\Releases\DemoAccess::allows(Device $device, App $app): bool`:

```
device.user_id is set
AND EXISTS domain d
    WHERE d.allow_demo = true
      AND d ∈ user.domains      (user_domains)
      AND d ∈ app.domains       (app_domains)
```

Cache the result per request; it's evaluated on every update check.

### 5.4 Resolution: `App\Services\Releases\ReleaseResolver`

Everything that decides what a device gets must go through this one service: `/app/info`, the Expo manifest,
download routes, the store and download links.

- **Bundle for a version:** candidates = `version.latest` (public), plus `version.demoLatest` when
  `DemoAccess::allows`. Serve the **newer** of the two (by `created_at`). A public hotfix published
  after the demo therefore still reaches testers, instead of leaving them on a stale demo.
- **Version for an app:** same rule with `app.latest` / `app.demoLatest`.
- No candidate → no update (and, for Expo, `rollBackToEmbedded` when the device runs an OTA bundle).

### 5.5 Linking a device to a user

Needed because the device API is anonymous (section 1).

- **Code generation:** the dashboard (`UserTab` → "Demo access", or the user's own profile) creates a
  short-lived one-time code (e.g. 8 characters, 15 min), shown as text and as a QR code. Only the hash is stored.
- **Device route:** `POST /ota-client/v1/device/link { package, version, code }` (behind `ota.api_key` + `device`)
  → sets `devices.user_id` and marks the code used. `DELETE /ota-client/v1/device/link` unlinks.
- **Dashboard:** the device list shows the linked user; an admin can unlink a device.
- **Clients:**
  - `expo-ota-client`: `OtaClient.linkDevice(code)`, `unlinkDevice()`, `getDeviceLink()`, and a
    ready-made `<OTADemoAccessScreen>` (code entry + QR scan through `expo-camera` when installed).
  - `ota-client` (bare RN): the same three JS methods, as plain `fetch` calls through the native
    module's config and device header. A small follow-up release of that package.
- After linking, the next update check returns the demo, if there is one.

### 5.6 Promotion and withdrawal

| Action | Effect | Permission |
| --- | --- | --- |
| **Activate as demo** | `versions.demo_latest_id = bundle` (or `apps.demo_latest_id = version`) | `bundle.publish` / `version.publish` |
| **Promote** | `latest_id = item`, `is_demo = false`, `promoted_at = now()`, clear `demo_latest_id` if it pointed to the item | `bundle.publish` / `version.publish` |
| **Withdraw demo** | Clear `demo_latest_id`; the item stays as a draft demo | `bundle.publish` / `version.publish` |

- Promotion keeps the same `expo_update_id`, so testers already running the demo download nothing.
- **Withdrawal on Expo:** the public bundle is usually older than the demo. If Phase 0 confirms that
  `expo-updates` refuses older manifests, the server sends `rollBackToEmbedded` first, and the next
  check moves the device from the embedded bundle to the public one. On `ota-client` the public bundle
  is simply offered as the next update.
- A user removed from an `allow_demo` domain, or a device that is unlinked, gets the same fallback.
- Logs: `version.demo_activated`, `bundle.demo_activated`, `version.promoted`, `bundle.promoted`,
  `version.demo_withdrawn`, `bundle.demo_withdrawn`, `device.linked`, `device.unlinked`.

### 5.7 Access enforcement

An API key alone must not be enough to fetch a demo:

- `GET /app/update/bundle/{bundle}`, `GET /app/update/version/{version}` and the Expo asset route
  return **404** for an `is_demo` item that isn't promoted unless `DemoAccess::allows` for the requesting device.
- The public store (`/api/public/*`) and the `download/{app}` link never serve a demo version, except
  through a download-link token whose user passes the same eligibility check.

### 5.8 Dashboard

- Upload forms (version and bundle): **"Demo release"** toggle.
- Lists and detail tabs: **Demo** badge, "Activate as demo", **Promote to public**, "Withdraw demo".
- `DomainTab`: **"Allow demo installs"** toggle (`allow_demo`), with a members count.
- `StatisticsTab`: split installs into demo and public.

### 5.9 Tests

- Eligibility matrix: no linked user / user not in domain / domain without `allow_demo` / domain
  not bound to the app / eligible.
- Resolver: demo newer than public → demo; public hotfix newer than demo → public; no demo → public.
- Promotion keeps ids and files; withdrawal falls back (both clients).
- Download routes and Expo assets: 404 for ineligible devices on demo items.
- Link codes: expired, reused, wrong app → rejected; unlink works.
- Store and download links never expose demo versions.

---

## 6. Expo package: `expo-ota-client` (this repo)

Pure TypeScript, no native code.

**Peer deps:** `expo`, `expo-updates`, `react`, `react-native`. Optional: `expo-application`,
`expo-device` (richer device info for telemetry), `expo-camera` (QR scanning for demo access).

### 6.1 Config plugin (`app.plugin.js`)

```json
{
  "expo": {
    "runtimeVersion": "1.0.0",
    "plugins": [
      ["expo-ota-client", {
        "serverUrl": "https://ota.example.com",
        "apiKey": "v1.xxxxxxxx",
        "package": "com.example.app",
        "checkOnLaunch": "NEVER",
        "codeSigningCertificate": "./certs/ota.pem"
      }]
    ]
  }
}
```

The plugin:
- Sets `updates.url` → `{serverUrl}/ota-client/expo/{package}/manifest`.
- Sets `updates.requestHeaders` → `API-KEY`.
- Sets `updates.enabled: true`, `checkAutomatically` (default `NEVER`, so the provider controls the flow).
- Wires in code signing when a certificate is given.
- Fails clearly when `expo-updates` is missing, `runtimeVersion` is unset, or `serverUrl` is not https in release.
- Uses `package` = `android.package` / `ios.bundleIdentifier` by default.

### 6.2 Runtime API

```ts
import { OTAProvider, useOTA, OtaClient } from 'expo-ota-client';

<OTAProvider autoCheck confirmDelayMs={2000} onError={…}>
  <App />
</OTAProvider>

const { status, update, isDemo, forceUpdate, progress, checkForUpdates,
        downloadAndInstall, dismissUpdate, nativeUpdate, openNativeUpdate } = useOTA();

await OtaClient.linkDevice(code);   // demo access, section 5.5
```

- Built on `Updates.useUpdates()` / `checkForUpdateAsync` / `fetchUpdateAsync` / `reloadAsync`.
- Reads `manifest.extra.otaCenter` for `updateType`, changelog, bundle name and `demo`.
- **Forced updates:** the overlay hides "Not now" and blocks the Android back button.
- **Demo:** the overlay labels demo updates; `<OTADemoAccessScreen>` handles linking.
- **Native update:** calls `POST /app/info`. When `availableUpdates.version` is set, it offers
  the APK link (Android, through `Linking.openURL` with `?api_key=`) or a store / custom URL (iOS,
  configurable).
- **Telemetry** (fire-and-forget, never throws): available / refused / downloaded / installed /
  failed. It detects a rollback after launch (`Updates.isEmergencyLaunch`, or the update id
  changing back to the embedded one) and reports `update.rollback` or `bundle.launch_confirmed`.
- **Components:** `OTAProvider`, `OTAUpdateOverlay` (themed by props, same look as `ota-client`),
  `OTASplashScreen`, `OTADemoAccessScreen`. Ported from `react-ota-client/src/components` where practical.
- In development (`__DEV__` / `Updates.isEnabled === false`) the provider renders children and does nothing.

### 6.3 CLI (`expo-ota-client`)

| Command | Does |
| --- | --- |
| `release [--platform all\|android\|ios]` | `npx expo export` → zip `dist/` → `release/{name}-{runtime}-{version}.zip` |
| `publish --token … [--demo] [--activate]` | `release` + upload to `POST /api/app/{app}/version/{version}/bundle`; `--demo` marks it as a demo |
| `promote <bundle> --token …` | Promotes a demo bundle to public |
| `doctor` | Checks the plugin config, that `expo-updates` is installed, `runtimeVersion`, and that the server is reachable (`/health`) and accepts the key |
| `cert` | Generates a code-signing key pair |

### 6.4 Package layout

```
src/
  index.ts
  plugin/withOtaClient.ts
  client/OtaClient.ts      # /app/info, /app/event, /device/link, device header
  hooks/useOTA.ts
  components/OTAProvider.tsx, OTAUpdateOverlay.tsx, OTASplashScreen.tsx, OTADemoAccessScreen.tsx
  internal/flow.ts, errors.ts, telemetry.ts
cli/index.js, cli/lib/{release,publish,promote,doctor,cert}.js
app.plugin.js
example/                   # Expo app used for end-to-end testing
```

---

## 7. Phases

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Spike** | Check the protocol against the spec and reference server, including downgrade behaviour (section 3). Hand-build one manifest route in OTACenter that serves a single committed `expo export`. `example/` app with `updates.url` set. | A release build of `example/` downloads and launches the update on an Android device; behaviour verified on iOS if hardware is available. Section 3 corrected. |
| **1. Server core** | Migration, models, `ExpoBundleImporter`, `ExpoUpdatesController`, middleware changes, Pest tests | Tests green; spike app updates from a bundle uploaded through the API |
| **2. Demo releases (server)** | Section 5: schema, `DemoAccess`, `ReleaseResolver` wired into `/app/info` + manifest + downloads + store, link codes + `/device/link`, promote / withdraw endpoints, tests | Eligibility matrix and resolver tests green; an `ota-client` app and the spike app both receive a demo only after linking |
| **3. Dashboard** | `client_type` on versions, Expo zip upload, platform badges, assets list, demo toggle / badges / promote / withdraw, domain `allow_demo`, link codes UI, device → user display | Upload, demo, promote, withdraw and rollback all work from the UI |
| **4. Package: plugin + CLI** | Config plugin, `release`, `publish` (+ `--demo`), `promote`, `doctor` | `npx expo prebuild` writes a correct config; `publish --demo` then `promote` work end to end |
| **5. Package: runtime** | Provider, hook, overlay, forced updates, telemetry, native-update prompt, `linkDevice` + `OTADemoAccessScreen` | Logs appear in OTACenter for every event; a forced update blocks the UI; a linked device receives the demo |
| **6. `ota-client` follow-up** | `linkDevice` / `unlinkDevice` / `getDeviceLink` in the bare RN package | A bare RN app can join the demo program |
| **7. Signing + hardening** | Code signing, size limits, caching headers, rate limits (link codes especially) | A signed update is accepted; a tampered one is rejected; brute-forcing link codes is throttled |
| **8. Docs + release** | README, OTACenter MDX docs (Expo setup + demo program), `.agents/context` updates, npm publish | A fresh Expo app integrates by following the README alone |

---

## 8. Decisions log and open questions

### Resolved

| # | Question | Decision |
| --- | --- | --- |
| 1 | Package identification: header vs path | **Path segment**: `/ota-client/expo/{package}/manifest` |
| 2 | One bundle row per platform or one for both | **One for both**; files grouped by platform in `bundle_assets` |
| 3 | Map `expo-channel-name` to domains? | **No.** Testing is done with **demo releases** gated by `domains.allow_demo` (section 5); channels are ignored |
| 6 | npm package name | **`expo-ota-client`** |

### Open

4. The API key is per version, but `updates.requestHeaders` is fixed at build time. That's fine
   while one build = one version. Confirm it holds when the server address is overridden at runtime.
5. iOS native updates: App Store URL, TestFlight, or an enterprise/ad-hoc link? (No APK equivalent.)
7. Are `super-admin` / `admin` / `developer` users always eligible for demos, or only through an `allow_demo` domain?
8. Who may create link codes: only admins (for any user), or every user for themselves (e.g. from the
   store profile) when they belong to an `allow_demo` domain?
9. Can a device be linked to only one user at a time? (Proposed: yes, and relinking replaces the link.)

## 9. Risks

- **Protocol drift** between Expo SDK releases. Mitigation: pin the tested SDK range and keep a contract
  test against the reference server's fixtures.
- **Install ID header**: if `expo-updates` sends no stable device id, device stats and demo linking
  get worse. Mitigation: the JS package reports full device info through `/app/event` with its own persisted id.
- **Downgrade on withdrawal** (Expo): may need two steps (embedded first, then public). See section 5.6.
- **Demo leakage**: a demo artifact fetched with only the API key. Mitigation: every artifact route
  goes through `DemoAccess` (section 5.7) and has tests.
- **Storage growth**: an export contains every asset each time. Mitigation: deduplicate stored files by hash
  across bundles of the same app.
- **`expo-updates` conflicts**: none, since it *is* the engine. Bare RN `ota-client` must not be installed in the same app.
