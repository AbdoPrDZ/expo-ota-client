# Context Structure

The specification for this context: which files exist, what each holds, and when
new ones are created. Change this file only when the organization changes.

## Files

| File | Holds | Does not hold |
| --- | --- | --- |
| `README.md` | What the context is, what to read per task | Project knowledge |
| `config.md` | Update mode, detail level, scope, template | Anything else |
| `structure.md` | This specification | Project knowledge |
| `architecture.md` | What the package is, its three parts (runtime, config plugin, CLI) plus the Android module, how they connect to expo-updates and OTACenter, repo layout | Endpoint details, build commands |
| `server-api.md` | The contract with OTACenter: routes, headers, auth, protocol rules the server relies on | Server internals (those live in OTACenter's own context) |
| `workflows.md` | Build, test, typecheck, packaging, the example app, publishing and device testing | Architecture rationale |
| `conventions.md` | Rules for changing code here: compatibility, style, what must stay in sync | Feature descriptions |
| `domains/README.md` | Index of domain files | Domain content |
| `domains/demo-releases.md` | Demo releases and device linking as seen from the client | Server-side resolution internals |
| `domains/native-updates.md` | New native builds: in-app APK install, fallbacks, permissions | JS bundle updates |

## Creation rules

- A new domain file only for a feature with its own rules and workflow that spans
  several layers (runtime + native, or runtime + server). Not one file per module.
- `decisions.md` only if decisions start to pile up that are not already in
  `.agents/plans/EXPO_INTEGRATION.md`; until then, point to the plan.
- An `ios.md` (or an iOS section in `domains/native-updates.md`) once the package
  ships iOS native code. Today it has none.

## Per detail level

```text
minimal:   README.md, config.md, structure.md, architecture.md
standard:  + server-api.md, workflows.md, conventions.md, domains/
detailed:  + decisions.md, deeper domain files (state machines, error tables)
```

## Related, outside this context

- `.agents/plans/EXPO_INTEGRATION.md`: the original plan, its decisions log and
  where the build differs from it. Historical; the code wins.
- `E:\OTA\OTACenter\.agents\context\backend\EXPO-DEMO.md`: server side of Expo
  updates and demo releases.
- `E:\OTA\react-ota-client`: the bare React Native client (`ota-client`), the
  sibling package this one mirrors where it can.
