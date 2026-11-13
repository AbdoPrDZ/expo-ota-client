# Native Updates

When the runtime changes, a JS update can't help: the user needs a new build.
OTACenter publishes it as a new **version** (an APK on Android). The provider
checks for one with `POST /app/info` only when there is no JS update.

## Android: in-app install

Ported from OTAStore's `ApkInstaller`, like `ota-client` 1.5.0. The package ships
one Expo module, `ExpoOtaInstaller` (`android/src/main/java/expo/modules/otaclient/`):

- `downloadAndInstall({ url, fileName, headers, checksum })`: `HttpURLConnection`
  download to the app's (external) files directory with manual redirects, progress events
  (`onProgress`), cancel, SHA-256 check against the server's checksum and a
  "PK" magic-bytes check, then `ACTION_VIEW` through its own `FileProvider`
  (`${applicationId}.expootaclient.apkprovider`) to the system installer.
- `canInstall()` / `openInstallSettings()`: "install unknown apps"
  (`canRequestPackageInstalls`, `ACTION_MANAGE_UNKNOWN_APP_SOURCES`).
- `cancel()`; one download at a time (`E_OTA_APK_BUSY`).

Error codes are stable strings shared with `ota-client` (`OTA_APK_ERRORS` in
`src/installer.ts`): `E_OTA_INSTALL_PERMISSION`, `E_OTA_APK_HTTP`,
`E_OTA_NOT_APK`, `E_OTA_APK_CHECKSUM`, `E_OTA_APK_CANCELLED`,
`E_OTA_APK_DOWNLOAD`, `E_OTA_APK_INSTALL`. On `E_OTA_INSTALL_PERMISSION` the
settings screen opens and the overlay explains; tapping Download again resumes.
The system's own install confirmation can't be skipped.

The APK URL carries `api_key` and `did` in the query
(`OtaClient.nativeUpdateUrl`), so the same link works from a browser.

## Fallbacks

- Module missing (build made before it existed): open the link in the browser.
- `inAppNativeUpdates: false`: the plugin removes `REQUEST_INSTALL_PACKAGES`
  (Google Play forbids it for most apps); updates open in the browser.
- iOS: no native code; `openNativeUpdate()` opens `iosUpdateUrl` (store or
  TestFlight link). Which iOS channel to support is still open in the plan.

## UI

`downloadKind` in `useOTA()` is `'native'` during an APK download (vs `'update'`
for a JS bundle); the overlay then shows Cancel (`cancelDownload()`). Forced
native updates (`updateType: 'force'`) keep the overlay up.
