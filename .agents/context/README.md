# Project Context

AI-readable memory for `expo-ota-client`: the smallest set of facts an agent
needs before changing this repo. It is derived knowledge; when it disagrees with
the code, trust the code and fix the context.

Read order: this file → `config.md` → `structure.md` → the files for your task.

## What to read

| Task | Read |
| --- | --- |
| Anything, first time | `architecture.md` |
| Runtime API, provider, overlay | `architecture.md`, `conventions.md` |
| Requests to OTACenter, headers, manifest | `server-api.md` |
| Config plugin options | `architecture.md`, `server-api.md`, `conventions.md` |
| Demo releases, device linking | `domains/demo-releases.md` |
| New APK installs, Kotlin module | `domains/native-updates.md` |
| Build, tests, example app, publishing | `workflows.md` |
| CLI | `workflows.md`, `server-api.md` |

## Files

- `architecture.md`: parts of the package and how they connect.
- `server-api.md`: the OTACenter contract.
- `workflows.md`: build, test, example app, release.
- `conventions.md`: rules for changes.
- `domains/`: demo releases, native updates.
