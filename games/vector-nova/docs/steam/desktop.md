# Desktop builds and Steam handoff

Run from `games/vector-nova` with Node 22.13+ and npm. Browser/Vite commands are unchanged; ignored `.desktop/` and `release/` outputs are separate from Pages hosting.

## Editions

|             | Demo                                                       | Full game                                            |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Content     | Kestrel; Halcyon and Nacre; unlimited play                 | Four ships; 14 initial + 3 bonus courses             |
| Modes       | Quick Race, Practice, Time Trial/ghosts, two-race Demo Cup | Same core modes; four initial + Encore championships |
| Racing      | Nine AI rivals; solo Practice/Time Trial                   | Same                                                 |
| Save folder | `vector-nova-demo`                                         | `vector-nova-full`                                   |

Completing all 28 career rewards opens Ravel, Nomad and Oriel and their Encore Cup. Those courses ship in the full package but remain hidden from incomplete careers; development query parameters do not bypass the desktop gate.

The demo omits excluded player hulls/worlds from its catalog and package. Shared materials are explicitly allowlisted, not playable worlds. Edition selection is build-time; no runtime unlock switch exists. See the [edition policy](../../tools/desktop/policy.mjs).

## Build and test

```sh
npm ci
npm run test:desktop
npm run build:demo
npm run verify:desktop -- demo
npm run build:full
npm run verify:desktop -- full
npm run package:demo -- --platform darwin --arch arm64
npm run package:full -- --platform darwin --arch arm64
npm run package:demo -- --platform win32 --arch x64
npm run package:full -- --platform win32 --arch x64
npm run verify:desktop -- full --archive "release/full/Vector Nova-darwin-arm64/Vector Nova.app/Contents/Resources/app.asar"
```

Packaging rebuilds/audits and writes a complete directory plus ZIP under `release/<edition>/`. Extract before launch. Windows launch executables are `VectorNovaDemo.exe` / `VectorNova.exe`; upload the whole corresponding directory, including runtime and `resources/app.asar`. Playing needs no Node, server, account or Internet connection.

The unshipped native verifier loads staged code or `--archive` without enabling release DevTools/APIs, mutes host audio and checks real startup, careers, driving, saves and synthetic input. `VN_PROBE_LEVELS=halcyon,nacre` narrows iteration; `VN_PROBE_WINDOW_ONLY=1` isolates native window checks. Use the [browser checks](../../tools/README.md) for deeper accelerated race/replay coverage. CI remains paused in `.github/workflows/vector-nova-desktop.yml.disabled` until the private-repository move.

## Player controls and saves

Each edition has three isolated careers; progress, cups, ghosts and backups belong to the selected career, while Settings/music are shared within that edition. Manual career export/import supports demo-to-full transfer; automatic migration and Steam Cloud are absent. See [career ownership and startup](../intro-and-profiles.md).

Use [player controls](../../README.md#controls) and Settings for bindings/presets. F11 or Alt/Option+Enter toggles native fullscreen; menu/window controls and persisted window state are also supported. Physical hardware, Steam Input and OS window behavior require the release-gate playtest.

## Release boundary

Release builds omit developer launch routes, fly/review tools and `window.__VN*` APIs. The renderer uses sandbox/context isolation and a local-only protocol; navigation/downloads are denied. Fuses/archive integrity and build/package audits enforce the shipped-content boundary and generate notices plus a SHA-256 inventory. Canonical details: [architecture](../../ARCHITECTURE.md#desktop-release-editions), [native security](../../desktop/security.cjs) and [audits](../../tools/desktop/audit.mjs).

## SteamPipe

Replace placeholders with real associated full/demo App IDs and separate Windows depot IDs. The generator requires audited Windows content directories and writes `release/steam/<edition>/app_<id>.vdf`, depot configuration and launch instructions. See [Valve's demo](https://partner.steamgames.com/doc/store/application/demos) and [upload](https://partner.steamgames.com/doc/sdk/uploading) documentation for publisher steps.

```sh
npm run steam:prepare -- demo --app-id DEMO_APP_ID --depot-id DEMO_WINDOWS_DEPOT_ID --content "release/demo/Vector Nova Demo-win32-x64"
npm run steam:prepare -- full --app-id FULL_APP_ID --depot-id FULL_WINDOWS_DEPOT_ID --content "release/full/Vector Nova-win32-x64"
steamcmd +login YOUR_STEAM_BUILD_ACCOUNT +run_app_build ABSOLUTE_PATH_TO_APP_VDF +quit
```

Generated `Preview "1"` validates without uploading. Change it to `0` only for a deliberate upload, then select/test a private branch; no `SetLive` is generated. Authenticate interactively and keep credentials out of Git. No Steamworks runtime integration or `steam_appid.txt` is shipped.

## Public release

Mac packages are local ad-hoc-signed test builds, not Developer ID-signed/notarized; Windows packages are unsigned. Direct-download signing/distribution and advertised-platform validation remain publisher work. Linux and Steam Deck support are unclaimed. Follow the remaining [release gates](release.md#release-gates) before publishing.
