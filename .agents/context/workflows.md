# Workflows

## Package

| Command | Does |
| --- | --- |
| `npm run build` | `scripts/build.js`: esbuild bundles `src/` → `dist/index.js` (CJS, minified, platform neutral, es2020), the plugin → `dist/plugin/`, the CLI → `dist/cli/` (node18, shebang); then `tsc -p tsconfig.build.json` emits `.d.ts` only to `dist/types/` |
| `npm run typecheck` | `tsc --noEmit` against the dev Expo SDK (54) |
| `npm test` | `node --test`: `plugin/withOtaClient.test.js`, `cli/lib/project.test.js` |
| `npm pack --dry-run` | Check what ships (dist, android, app.plugin.js, expo-module.config.json, docs) |

- `prepare` runs the build, so `npm install` and git installs produce `dist/`.
  `prepublishOnly` runs typecheck and tests. `dist/` is git-ignored.
- The minified output is intentional (the user wants shipped JS unreadable): no
  source maps, no `keepNames`. Peers and dependencies stay external.
- `.npmignore` patterns for sources are root-anchored (`/src/`, `/plugin/`, ...).
  A bare `src/` would also drop `android/src/` and `dist/plugin/`.
- The Kotlin module ships as source; it can only be compiled inside an app
  (the example's Gradle build is how it gets checked).

## Example app (`example/`)

- Expo SDK 58, depends on `"expo-ota-client": "file:.."` (a junction on Windows).
- `metro.config.js` watches the parent, blocks the parent's `node_modules`
  (case-insensitively), and resolves `expo-ota-client` to `../src/index.ts`, or
  to `../dist/index.js` with `OTA_USE_DIST=1`. The explicit mapping works around
  the Windows `e:` vs `E:` drive-letter mismatch that made Metro treat the
  junction as outside the project. Don't add tsconfig `paths` for the package:
  Expo's Metro reads them and resolution breaks.
- `app.json` points at the LAN OTACenter (`http://172.16.40.112`,
  `allowInsecure`, package `com.example.otaclient`). `App.tsx` shows a
  `BUILD_LABEL` so the running build is obvious on the device.
- Built APKs go to `example/release/apk/` (git-ignored).

## Device test loop (Android, LAN server)

1. Bump `version` / `runtimeVersion` / `versionCode` in `example/app.json` and
   the `BUILD_LABEL` when testing a native update.
2. `npx expo prebuild` then Gradle `assembleRelease` in `example/android`
   (release, since the provider is off in dev builds).
3. Create the version (client type Expo, name = runtime) in OTACenter and upload
   the APK; or for a JS update run `npx expo-ota-client publish --activate`
   (`--demo` for testers) from `example/`.
4. `adb install` the older APK and launch it to see the update.

The admin token for the CLI comes from `npx expo-ota-client login` or
`php artisan` on the OTACenter side; never commit it.

## Releasing the package

Published on npm (`expo-ota-client`). Releases run from a developer machine,
not CI (GitHub Actions is unavailable on this account):

1. Bump `package.json` `version`, add and date the `CHANGELOG.md` entry
   (`## [x.y.z] - YYYY-MM-DD`), build the example against `dist`
   (`OTA_USE_DIST=1 npx expo export`), commit and push `main`.
2. `npm run release -- --dry-run`, then `npm run release`
   (`scripts/release.js`): checks a clean, pushed `main` and the dated entry,
   `npm publish` (its `prepublishOnly` runs typecheck + tests), pushes tag
   `v<version>`, and creates the GitHub release with the CHANGELOG notes.
   Each step skips if already done. Pre-release versions go to the `next`
   dist-tag.

Needs `npm login` (or a token in `~/.npmrc`) and `gh auth login`. A new package
name is staged by npm (`0.0.0-stage` placeholder) until approved.
