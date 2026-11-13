# Demo Releases

Versions and bundles can be released as **demo** in OTACenter: only testers get
them until they are **promoted** to everyone. The server decides who gets what;
the client's jobs are identifying the device, linking it to a user and showing
the demo state.

## Rules (enforced by OTACenter)

- A device gets demos only when it is linked to a user who belongs to a domain
  with **allow_demo** that is bound to the app. Admin roles get no implicit
  access.
- The newer of the public and the demo release wins.
- Promotion publishes the same item publicly; withdrawal removes the demo.
- Store pages and download links never serve demos; demos reach testers in-app
  only.
- One device has one user; linking again replaces the link.

## Client side

- **Device id**: `src/device.ts` creates `did` on first launch and stores it with
  `Updates.setExtraParamAsync`, so expo-updates sends it on manifest requests.
  Before the first launch has run, or after a reinstall (new id), the device is
  anonymous and gets public updates only.
- **Linking**: the tester gets a one-time code (OTACenter → Users → user → Demo
  access). `<OTADemoAccessScreen>` or `OtaClient.linkDevice(code)` posts it to
  `/device/link`; `unlinkDevice()` and `getDeviceLink()` complete the set. Apps
  should put the screen behind a settings or debug menu and re-check for
  updates after linking (`onLinked`).
- **Demo flag**: manifest `metadata.demo` → `update.demo`,
  `getRunningInfo().demo`, `isDemo` in `useOTA()`; `/app/info` → 
  `nativeUpdate.demo`. The overlay labels demo updates.
- **Downgrades**: when a demo is withdrawn or access is lost, the server answers
  `rollBackToEmbedded` first; the provider stages it (expo-updates applies it on
  the next launch), and the next check fetches the public bundle. Don't try to skip the embedded step on the client.

## CLI

`publish --demo` uploads and activates as demo; `promote <bundle>` makes it
public. Without `--activate` or `--demo` the bundle is uploaded but not served.
