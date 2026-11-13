# Architecture

`expo-ota-client` connects Expo apps to **OTACenter**, the team's own update
server (Laravel, `E:\OTA\OTACenter`). The update engine is not ours: it is Expo's
**`expo-updates`**. OTACenter speaks the Expo Updates protocol v1, so downloads,
asset caching, crash rollback and code signing come from Expo. This package adds
what Expo lacks for OTACenter: forced updates and changelog UI, demo releases,
device linking, new native builds (APKs), activity reporting and a release CLI.

It is the Expo sibling of `ota-client` (`E:\OTA\react-ota-client`), which has its
own Kotlin engine for bare React Native. The two must never be installed in the
same app.

## Parts

| Part | Source | Ships as | Runs in |
| --- | --- | --- | --- |
| Runtime | `src/` (TypeScript, React) | `dist/index.js` + `dist/types/` | The app |
| Config plugin | `plugin/withOtaClient.js`, entry `app.plugin.js` | `dist/plugin/withOtaClient.js` | `expo prebuild` / EAS (Node) |
| CLI | `cli/index.js`, `cli/lib/` | `dist/cli/index.js` (bin `expo-ota-client`) | Developer machine / CI (Node 18+) |
| Android module | `android/` (Kotlin), `expo-module.config.json` | Source, compiled by the app | The app, Android only |

`app.plugin.js` loads the built plugin when `dist/` exists, otherwise the source,
so the example app works without a build.

## How the pieces connect

1. **Build time.** The config plugin writes `updates.url`
   (`{serverUrl}/ota-client/v1/expo/{package}/manifest`), the `API-KEY` request
   header, `checkAutomatically: NEVER`, optional code signing, and copies the
   server details into `extra.otaClient`. Android-only extras: cleartext traffic
   when `allowInsecure`, and removing `REQUEST_INSTALL_PACKAGES` when
   `inAppNativeUpdates: false`.
2. **Runtime config.** `src/config.ts` reads `Constants.expoConfig.extra.otaClient`;
   `OtaClient.configure()` overrides it for this package's own requests only
   (expo-updates keeps the URL and key it was built with).
3. **JS updates** go through expo-updates (`checkForUpdateAsync`,
   `fetchUpdateAsync`, `reloadAsync`). OTACenter-specific data (bundle name,
   changelog, update type, demo flag) arrives in the manifest's `metadata`.
4. **Everything else** (`/app/info`, `/app/event`, `/device/*`) is a JSON POST
   from `src/http.ts` to `{serverUrl}/ota-client/v1`. See `server-api.md`.
5. **Device identity.** `src/device.ts` stores a generated id and device facts as
   expo-updates extra params, so they reach the manifest route in
   `Expo-Extra-Params`, and sends the same facts as `X-Device-Info` on POSTs.

## Runtime layout (`src/`)

- `OtaClient.ts`: the imperative API; every server call and expo-updates call
  goes through it.
- `components/OTAProvider.tsx`: the launch flow and state machine behind
  `useOTA()` (`context.ts`). Check JS update → else check native build →
  download → restart; reports events; confirms the launch after `confirmDelayMs`.
- `components/OTAUpdateOverlay.tsx`, `OTADemoAccessScreen.tsx`, `styles.ts`: UI.
- `installer.ts`: wrapper over the optional native module `ExpoOtaInstaller`
  (`requireOptionalNativeModule`, so a build without it falls back to a link).
- `types.ts`, `errors.ts` (`OtaDisabledError`, `OtaRequestError`), `index.ts`
  (public exports).

## When it is off

`OtaClient.isEnabled()` is false in development (`__DEV__`), when expo-updates is
disabled, or when no server is configured. The provider then renders the app and
does nothing. Expo Go is not supported (expo-updates needs a dev build or EAS).

## Repo layout, other

- `example/`: Expo SDK 58 app that installs the package with `file:..`
  (see `workflows.md`).
- `scripts/build.js`, `tsconfig.build.json`: the dist build.
- `.agents/plans/EXPO_INTEGRATION.md`: the original plan and decision log.
- No iOS native code. iOS gets JS updates; new native builds open `iosUpdateUrl`.
