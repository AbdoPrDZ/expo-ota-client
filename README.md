# expo-ota-client

Over-the-air updates for **Expo** apps from an **OTACenter** server.

The engine is Expo's own [`expo-updates`](https://docs.expo.dev/versions/latest/sdk/updates/):
OTACenter speaks the Expo Updates protocol, so downloads, Hermes bundles, assets, fonts,
crash rollback and code signing all come from Expo, on Android and iOS. This package adds the
OTACenter parts:

- **Config plugin**: points `expo-updates` at your server.
- **`<OTAProvider>`** and an update overlay: forced updates, changelog, download progress.
- **Demo releases**: link a device to a user so it receives demo versions and bundles.
- **Native updates**: when a new APK is published, it downloads and installs **inside the app**
  (Android), or opens the store link (iOS).
- **Activity reporting**: available / refused / downloaded / installed / rollback events.
- **CLI**: `release`, `publish`, `promote`, `doctor`, `cert`.

The package includes one small Android module (`ExpoOtaInstaller`) for the in-app APK install.
A development build or EAS Build is needed, as for `expo-updates` itself; it doesn't work in Expo Go.

## Requirements

| | |
| --- | --- |
| Expo SDK | 52+ (typechecked against SDK 54 and 58; native module compiled with SDK 58) |
| OTACenter | with Expo support (`/ota-client/v1/expo/*` routes) |
| Node | 18+ for the CLI |

## Setup

### 1. Install

```sh
npx expo install expo-updates expo-device
npm install expo-ota-client
```

`expo-device` is optional; with it, OTACenter shows the device's maker and model.

### 2. Create the version in OTACenter

In OTACenter: **Apps → your app → Add version**, with:

- **Client**: Expo
- **Name**: your app's runtime version (e.g. `1.0.0`)
- **API key**: any secret; the app sends it with every request

The app's **package name** in OTACenter must equal `android.package` / `ios.bundleIdentifier`.

### 3. Configure the plugin

```json
{
  "expo": {
    "version": "1.0.0",
    "runtimeVersion": "1.0.0",
    "android": { "package": "com.example.app" },
    "ios": { "bundleIdentifier": "com.example.app" },
    "plugins": [
      [
        "expo-ota-client",
        {
          "serverUrl": "https://ota.example.com",
          "apiKey": "the-version-api-key",
          "iosUpdateUrl": "https://apps.apple.com/app/id0000000000"
        }
      ]
    ]
  }
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `serverUrl` | required | OTACenter URL. Must be https unless `allowInsecure`. |
| `apiKey` | required | API key of this runtime's version. |
| `package` | `android.package` / `ios.bundleIdentifier` | Package name in OTACenter. |
| `checkAutomatically` | `NEVER` | expo-updates' own launch check. Keep `NEVER` so `OTAProvider` runs the check and can show the UI. |
| `codeSigningCertificate` | – | Path to the certificate (see [Code signing](#code-signing)). |
| `codeSigningKeyId` | `main` | Must match the server's `OTA_EXPO_SIGNING_KEY_ID`. |
| `iosUpdateUrl` | – | Where iOS users go when a new native build exists. |
| `allowInsecure` | `false` | Allow `http://` (local testing only). |
| `inAppNativeUpdates` | `true` | `false` removes `REQUEST_INSTALL_PACKAGES` (needed on Google Play); new native builds then open in the browser. |

`runtimeVersion` must be a fixed string or `{ "policy": "appVersion" }`: OTACenter looks up the
version by that name. Change it whenever native code changes, and create the matching version in
OTACenter.

Then rebuild: `npx expo prebuild` / `eas build`. Check the wiring with:

```sh
npx expo-ota-client doctor
```

### 4. Wrap the app

```tsx
import { OTAProvider } from 'expo-ota-client';

export default function App() {
  return (
    <OTAProvider onError={(error) => console.warn(error)}>
      <RootNavigator />
    </OTAProvider>
  );
}
```

On launch the provider registers the device, checks for a JS update and, when there's none,
for a new native build. It always renders your app, so an unreachable server never blocks it.
In development builds it does nothing, because Metro serves the code and Fast Refresh keeps working.

## Publishing

```sh
npx expo-ota-client login -u admin -P '…'     # prints a token
export OTA_TOKEN=…

npx expo-ota-client publish --activate        # export, upload, publish to everyone
npx expo-ota-client publish --demo            # …or to demo testers only
npx expo-ota-client promote 1.0.3             # demo → everyone
```

`publish` names the bundle after `expo.version` (override with `--name`); `--force-update`
makes it required, `--changelog` sets the text shown in the dialog. Without `--activate` or
`--demo`, the bundle is uploaded but not served; publish it from the dashboard.

`release` builds the upload without sending it (`release/<slug>-<runtime>-<version>.zip`), for
uploading by hand in **Version → Add bundle**. The zip is `npx expo export` output plus
`expoConfig.json`, which OTACenter uses to check the runtime version.

## New native builds

When OTACenter has a newer version (a new APK) for the app, the overlay offers it. On Android,
**Download** fetches the APK inside the app with a progress bar and a Cancel button, checks it
against the server's SHA-256 and the APK signature bytes, and opens the system installer — no
browser. On iOS it opens `iosUpdateUrl`.

Android asks once for permission to install apps from this app ("install unknown apps"). If it
is off, the setting opens and the overlay explains it; tapping **Download** again continues. The
system's own install confirmation can't be skipped.

The module declares `REQUEST_INSTALL_PACKAGES` and a `FileProvider`
(`${applicationId}.expootaclient.apkprovider`). For a Google Play app, set
`inAppNativeUpdates: false`.

A build made before this module was added has no `ExpoOtaInstaller`; it falls back to the
browser link until the app is rebuilt.

## Demo releases

A demo version or bundle reaches only devices whose user belongs to a domain with **Demo
releases** enabled that is also bound to the app. Everyone else stays on the public release
until you **promote** the demo.

Devices are anonymous until they're linked to a user:

1. OTACenter → **Users → user → Demo access → Create link code**.
2. In the app, open `<OTADemoAccessScreen>` and enter the code.

```tsx
import { OTADemoAccessScreen, useOTA } from 'expo-ota-client';

function DemoSettings() {
  const { checkForUpdates } = useOTA();

  return <OTADemoAccessScreen onLinked={() => void checkForUpdates()} />;
}
```

Put it behind a settings or debug menu. `OtaClient.linkDevice(code)`, `unlinkDevice()` and
`getDeviceLink()` are available for a custom UI.

If a demo is withdrawn, or a tester loses access, their device first returns to the update
embedded in the build, then gets the public bundle on its next check.

## API

### Hook

```tsx
const {
  status,             // 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'update-available'
                      // | 'native-update-available' | 'downloading' | 'restarting' | 'failed'
  update,             // OtaUpdate: bundleName, changelog, updateType, demo
  nativeUpdate,       // OtaNativeUpdate: name, url, updateType, demo
  forceUpdate, isDemo, progress, error, dismissed, running,
  downloadKind,       // 'update' | 'native' | null while status is 'downloading'
  checkForUpdates, downloadAndInstall,
  openNativeUpdate,   // Android: in-app APK download + installer; iOS: store link
  cancelDownload,     // cancels the in-app APK download
  dismissUpdate, retry,
} = useOTA();
```

### Provider props

| Prop | Default | |
| --- | --- | --- |
| `autoCheck` | `true` | Check on mount. |
| `checkNativeUpdates` | `true` | Ask for a new native build when there's no JS update. |
| `confirmDelayMs` | `2000` | When to report the launch outcome. |
| `reportEvents` | `true` | Send activity events to OTACenter. |
| `showUpdateOverlay` | `true` | Render the built-in dialog. |
| `overlayProps` | – | `copy`, styles, or `render` for your own UI. |
| `onStatusChange`, `onUpdateAvailable`, `onNativeUpdateAvailable`, `onError` | – | Callbacks. |

### Imperative

```ts
import { OtaClient } from 'expo-ota-client';

OtaClient.isEnabled();
OtaClient.getRunningInfo();          // updateId, runtimeVersion, isEmbedded, bundleName, demo
await OtaClient.checkForUpdate();    // { type: 'none' | 'update' | 'rollback' }
await OtaClient.downloadUpdate();
await OtaClient.applyUpdate();       // restart into it
await OtaClient.checkNativeUpdate(); // OtaNativeUpdate | null
await OtaClient.canInstallNativeUpdate();      // "install unknown apps" allowed?
await OtaClient.openInstallSettings();
await OtaClient.installNativeUpdate(native, { onProgress: (fraction) => {} });
await OtaClient.cancelNativeUpdate();
await OtaClient.reportEvent('update.refused', { reason: 'later' });
await OtaClient.linkDevice('ABCD2345');
```

## Code signing

```sh
npx expo-ota-client cert
```

This wraps `expo-updates codesigning:generate`. Then:

1. Add `"codeSigningCertificate": "./certs/certificate.pem"` to the plugin options and rebuild.
2. Copy `keys/private-key.pem` to the OTACenter server and set `OTA_EXPO_SIGNING_KEY=/path/to/private-key.pem`.
3. Keep `keys/` out of git.

The app then rejects any update the server didn't sign.

## How the device is identified

expo-updates sends no stable device id to a custom server. The package generates one on first
launch and stores it with `Updates.setExtraParamAsync('did', …)`; expo-updates then sends it on
every update request in the `Expo-Extra-Params` header. Until that first launch has run, the
device gets public updates only. The id survives updates, but not a reinstall.

## Troubleshooting

**`doctor` says the API key is rejected**: use the key of the version whose name equals the
runtime version.

**No update arrives**: the bundle must be published (activated, or a demo for a linked tester)
on the version matching the runtime, and contain the device's platform. Exports made for
`android` only never reach iOS.

**Dialog never shows**: `checkAutomatically` other than `NEVER` lets expo-updates download
the update silently at launch; it then applies on the next start without a prompt.

## License

MIT
