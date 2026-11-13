# expo-ota-client example

An Expo app (SDK 58) wired to OTACenter through `expo-ota-client`, linked from the parent
folder (`"expo-ota-client": "file:.."`).

## Run it against a local OTACenter

1. **OTACenter**: start it (`composer run dev`, port 8000), then:
   - create an app with package name `com.example.otaclient`;
   - add a version with **Client: Expo**, **Name** `1.0.0` (the `runtimeVersion`) and
     **API key** `example-api-key` (as in `app.json`).

2. **Server URL**: `app.json` uses `http://10.0.2.2:8000`, which is the host machine as seen
   from the Android emulator. On a phone, use your computer's LAN IP. `allowInsecure` permits
   http for local testing only.

3. **Build a release** (updates are off in development builds, where Metro serves the code):

   ```sh
   npm install
   npx expo run:android --variant release
   ```

4. **Publish an update**: change something in `App.tsx`, bump `expo.version` (the bundle
   name), then:

   ```sh
   npx expo-ota-client login -u <login> -P <password> --server http://localhost:8000
   export OTA_TOKEN=<token>
   npx expo-ota-client publish --activate --server http://localhost:8000
   ```

   Or run `npx expo-ota-client release` and upload `release/*.zip` in **Version → Add bundle**.
   Reopen the app: the update dialog appears.

5. **Demo releases**: publish with `--demo`, enable **Demo releases** on a domain bound to the
   app with your user in it, create a code in **Users → you → Demo access**, and enter it under
   **Demo access** in the app.

`npx expo-ota-client doctor` checks the setup.

## Notes

- `metro.config.js` watches the parent folder and hides the parent's `node_modules`, so the
  library resolves `react`, `react-native` and `expo-*` from this app. Restart Metro with
  `--clear` after changing it.
- During development (`npx expo start`) the screen shows `disabled`: that's expected.
