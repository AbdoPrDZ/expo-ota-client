# Conventions

## Compatibility

- Support Expo SDK 52+ (peer ranges in `package.json`). Typecheck against SDK 54
  (repo dev deps) and SDK 58 (the example). Verify Expo APIs against the docs of
  the SDK in use; they change every release.
- `expo-device` is an optional peer: import it lazily and degrade without it.
- The native module is optional at runtime: always go through `src/installer.ts`
  (`requireOptionalNativeModule`), and keep a link fallback for builds made
  before the module existed.
- Never break the app because of the server: the provider always renders its
  children, reports are fire-and-forget, network errors go to `error` /
  `onError`, not exceptions out of the tree.

## Keep in sync

- **With `react-ota-client`** (`E:\OTA\react-ota-client`): same OTACenter device API,
  same event names, same APK error codes (`OTA_APK_ERRORS`, `E_OTA_*`), same
  overlay behaviour and copy keys where they overlap. A fix to the APK installer
  in one usually belongs in the other (it was ported from OTAStore's
  `ApkInstaller`).
- **With OTACenter**: routes, headers, manifest `metadata` fields and the
  `Expo-Extra-Params` keys (`src/device.ts` `PARAM`) are a contract; see
  `server-api.md`.
- **Plugin options**: an option touches `plugin/withOtaClient.js`, its tests,
  `OtaClientConfig` in `src/types.ts` (if the runtime reads it from
  `extra.otaClient`), the README options table and `doctor`.
- **Public API**: anything exported from `src/index.ts` is public; document it in
  the README and the CHANGELOG.

## Code style

- TypeScript strict in `src/`; plain CommonJS JavaScript (`'use strict'`, `//`
  comments) in `plugin/`, `cli/`, `scripts/` since Node runs them directly.
- Short doc comments on exported functions that say what and why.
- Kotlin under `expo.modules.otaclient`; error codes are stable strings the JS
  matches on.
- CLI on Windows: spawn `npx` through `quoteForCmd` (`cli/lib/project.js`), not
  `shell: true` with an args array.

## Docs

- `README.md` is the user guide; `CHANGELOG.md` follows Keep a Changelog.
- Update this context (`.agents/context/`) when architecture, the server
  contract, workflows or a domain changes (update mode: automatic).
