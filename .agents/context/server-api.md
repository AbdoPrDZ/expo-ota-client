# OTACenter Contract

What this package expects from OTACenter. The server side is in
`E:\OTA\OTACenter` (`routes/ota_client.php`, `ExpoUpdatesController`,
`.agents/context/backend/EXPO-DEMO.md`). A change on either side must be made on
both.

## Identity of an app build

- **Package**: `android.package` / `ios.bundleIdentifier` must equal the app's
  package in OTACenter (plugin option `package` overrides).
- **Version**: OTACenter looks up the version **by name = runtime version**. So
  `runtimeVersion` must be a fixed string or `{ "policy": "appVersion" }`, and an
  OTACenter version with client type *Expo* must exist for it.
- **API key**: per version, baked in at build time (`updates.requestHeaders` and
  `extra.otaClient.apiKey`). One build = one version.

## Device API (`{serverUrl}/ota-client/v1`)

All POSTs are JSON, sent by `src/http.ts` with `API-KEY` and `X-Device-Info`
headers, `package` added to every body, 15 s timeout. Responses are an envelope
`{ success, message, data, errors }`; failures become `OtaRequestError(status)`.

| Route | Used for |
| --- | --- |
| `GET /health` | `isServerReachable()`, `doctor` |
| `POST /app/info` | New native build check: body `version` (runtime), `bundle` (running bundle name or `embedded`); reads `data.availableUpdates.version` |
| `POST /app/event` | Activity reports (fire-and-forget) |
| `GET /app/update/version/{id}?api_key=&did=` | APK download (query auth, so it also works from a browser) |
| `POST /device/info`, `/device/link`, `/device/unlink` | Demo device linking; `link` is throttled 10/min |

## Expo Updates protocol (expo-updates talks to these, not our code)

- `GET /expo/{package}/manifest` with `API-KEY`, the standard `expo-*` headers
  and `Expo-Extra-Params` (device id `did` and device facts, see
  `src/device.ts` `PARAM`). The device is optional here: an unknown device gets
  public updates only.
- Response: `multipart/mixed` with a manifest, or a directive
  (`noUpdateAvailable`, `rollBackToEmbedded`). A downgrade (withdrawn demo, lost
  demo access) is always a `rollBackToEmbedded` first; the next check serves the
  older bundle. `checkForUpdate()` maps it to `{ type: 'rollback' }`.
- Manifest `metadata` carries OTACenter fields the runtime reads: bundle name,
  changelog, update type (`force` / optional), demo flag.
- Assets are served from temporary **signed URLs** (`/expo/{package}/assets/{id}`);
  no API key on asset requests.
- Code signing: the server signs with `OTA_EXPO_SIGNING_KEY` /
  `OTA_EXPO_SIGNING_KEY_ID`; the plugin's `codeSigningKeyId` (default `main`)
  must match.

## Admin API (CLI only, `{serverUrl}/api`)

`cli/lib/api.js`, authenticated with a Sanctum token (`OTA_TOKEN` or `--token`;
`login` gets one from `/api/auth/login`). Finds the app by package, the version
by runtime name, uploads the bundle zip
(`POST /app/{app}/version/{version}/bundle`) and calls bundle actions
(`.../bundle/{id}/{action}`: activate, activate-demo, promote).

The upload zip is `npx expo export` output plus `expoConfig.json`; the server
checks the runtime version from it. A bundle only reaches the platforms it was
exported for (an `android`-only export never reaches iOS).
