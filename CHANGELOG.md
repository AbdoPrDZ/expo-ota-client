# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-13

First release. Over-the-air updates for Expo apps from an OTACenter server, with
Expo's own `expo-updates` as the update engine: OTACenter speaks the Expo Updates
protocol (v1), and this package adds the OTACenter-specific parts.

Requires an OTACenter with Expo support (the `/ota-client/v1/expo/*` routes) and
Expo SDK 52 or newer (typechecked against SDK 54 and 58). It doesn't work in Expo
Go; use a development build or EAS Build.

### Added

- **Config plugin** (`expo-ota-client` in `plugins`). Sets `updates.url` to
  `{serverUrl}/ota-client/v1/expo/{package}/manifest`, sends the version's
  `API-KEY` through `updates.requestHeaders`, sets `checkAutomatically` to
  `NEVER` so `OTAProvider` controls the check, and writes the server details to
  `extra.otaClient` for the runtime. Options: `serverUrl`, `apiKey`, `package`,
  `checkAutomatically`, `codeSigningCertificate`, `codeSigningKeyId`,
  `iosUpdateUrl`, `allowInsecure` (also enables cleartext traffic on Android)
  and `inAppNativeUpdates`.
- **`<OTAProvider>` and `useOTA()`.** On launch the provider registers the
  device, checks for a JS update and, when there is none, for a new native
  build. It always renders the app, so an unreachable server never blocks it,
  and does nothing in development builds, so Metro and Fast Refresh keep
  working.
- **`<OTAUpdateOverlay>`**: forced and optional updates, changelog, download
  progress, Cancel for native downloads. `copy`, styles or a `render` function
  replace any part of it.
- **Demo releases.** Bundles and versions marked as demo reach only devices
  linked to a user in a domain with demo releases enabled. `isDemo` and
  `update.demo` / `nativeUpdate.demo` flag them.
- **Device linking.** `<OTADemoAccessScreen>` and `OtaClient.linkDevice()`,
  `unlinkDevice()`, `getDeviceLink()` link a device to a user with a one-time
  code from OTACenter.
- **In-app native updates (Android).** A new APK published in OTACenter
  downloads inside the app with progress and Cancel, is checked against the
  server's SHA-256 and the APK signature bytes, and opens the system installer.
  It is handled by the bundled Android module `ExpoOtaInstaller`, with its own
  `FileProvider` (`${applicationId}.expootaclient.apkprovider`) and
  `REQUEST_INSTALL_PACKAGES`. When "install unknown apps" is off, the setting
  opens and `error.code` is `E_OTA_INSTALL_PERMISSION`. On iOS, and in builds
  made without the module, the update opens `iosUpdateUrl` or the browser link.
  `inAppNativeUpdates: false` removes the permission for Google Play apps.
- **Imperative API** (`OtaClient`): `checkForUpdate`, `downloadUpdate`,
  `applyUpdate`, `checkNativeUpdate`, `canInstallNativeUpdate`,
  `openInstallSettings`, `installNativeUpdate`, `cancelNativeUpdate`,
  `openNativeUpdate`, `reportEvent`, `getRunningInfo`, `configure`;
  `OTA_APK_ERRORS` and `errorCode()`.
- **Device identity.** A device id is generated on first launch and stored with
  `Updates.setExtraParamAsync`, so expo-updates sends it in `Expo-Extra-Params`
  on every update request, together with the maker, brand, model, OS version
  and API level.
- **Activity reporting.** `update.available`, `update.refused`,
  `update.downloaded`, `update.failed`, `update.installed`, `update.rollback`
  and `bundle.launch_confirmed` are sent to OTACenter. Set `reportEvents={false}`
  to turn it off; reports never fail the update flow.
- **CLI** (`npx expo-ota-client`): `release` builds the upload zip
  (`npx expo export` output plus `expoConfig.json`), `publish` uploads it
  (`--activate`, `--demo`, `--force-update`, `--changelog`), `promote` turns a
  demo public, `login` prints an API token, `doctor` checks the app config and
  the server, and `cert` generates a code-signing key pair.
- **Code signing** through `codeSigningCertificate`; the server signs manifests
  with `OTA_EXPO_SIGNING_KEY`.
- The package ships built, minified JavaScript in `dist/` (runtime, config
  plugin and CLI) with `.d.ts` declarations. `prepare` builds it, so git
  installs work.
- Example app in `example/`.
