# Desktop builds and Steam handoff

Run commands from `games/vector-nova` with Node 22.13+ and npm. The ordinary `npm run dev`, `npm run build`, `npm run preview`, and GitHub Pages deployment remain the browser workflow. Desktop outputs live in ignored `.desktop/` and `release/`; neither is a Pages input.

## Editions

|              | Demo                                                                  | Full game                                    |
| ------------ | --------------------------------------------------------------------- | -------------------------------------------- |
| Player ships | Kestrel                                                               | Kestrel, Shrike, Bastion, Needle             |
| Courses      | Halcyon Speedway, Nacre Tempest                                       | All 13 existing courses                      |
| Modes        | Quick Race, Practice, Time Trial with local ghosts, two-race Demo Cup | Same core modes, four existing championships |
| AI field     | Nine rivals in Quick Race / Cup; solo Practice / Time Trial           | Same                                         |
| Duration     | Unlimited; no timer or expiry                                         | Unlimited                                    |
| Save folder  | `vector-nova-demo`                                                    | `vector-nova-full`                           |

Excluded player hulls and playable worlds are absent from the demo catalog and asset package. Halcyon borrows Helion's concrete maps and two Nightweir facade textures; these are explicitly allowed shared materials, not those worlds. Rivals remain opponents, not selectable player ships.

There is no edition unlock IPC, URL parameter, local-storage key, launch argument or environment variable. Edition selection happens only in the build tool. An owner of a computer can modify software; disabling DevTools is not DRM. The content boundary is the missing game content, reinforced by package integrity and build audits.

## Build and test

```sh
npm ci
npm run test:desktop
npm run build:demo
npm run verify:desktop -- demo
npm run build:full
npm run verify:desktop -- full

# Native Mac test apps on an Apple Silicon Mac
npm run package:demo -- --platform darwin --arch arm64
npm run package:full -- --platform darwin --arch arm64

# Steam Windows x64 payloads; packaging also works from macOS
npm run package:demo -- --platform win32 --arch x64
npm run package:full -- --platform win32 --arch x64
```

Packaging rebuilds and audits the edition, then creates a complete directory and ZIP under `release/<edition>/`. Extract the ZIP before launching. Windows executables are `VectorNovaDemo.exe` / `VectorNova.exe`; macOS applications are `Vector Nova Demo.app` / `Vector Nova.app`. The whole Windows directory is the depot payload, including the Electron runtime and `resources/app.asar`. No Node, npm, localhost server, SDK, account or Internet connection is needed to play.

Mac artifacts use local ad-hoc signatures after fuse changes; they are for testing and are not Developer ID signed/notarized. Windows artifacts are unsigned. Public direct-download distribution should use the publisher's signing identity. Advertise Windows initially; Mac artifacts enable owner testing until Mac hardware/distribution checks are complete. Linux and Steam Deck are not claimed as supported.

The `Vector Nova desktop releases` workflow builds and verifies both editions on Windows and macOS using each runner's native architecture, with separate artifacts. It is manually runnable and runs on relevant pull requests; it does not upload to Steam or alter Pages deployment. Workflow success still requires an actual run on GitHub.

`verify:desktop` uses an external, unshipped main-process harness to load the exact staged main/preload/renderer (or the packaged archive with `--archive PATH_TO_APP_ASAR`), with DevTools disabled. It checks catalog counts, attempted URL/save unlocks, local assets, every player ship, driving, pause/resume/setup, modes, inspector, settings and resumable cups across a complete restart, the native menu and synthetic standard-controller menu input. It does not insert a test API or test flag into the release. `VN_PROBE_LEVELS=halcyon,nacre` narrows iteration; omit it for all edition courses. An optional `VN_PROBE_CAPTURE=<scratch-directory>` saves screenshots; ordinary runs leave no evidence files. Use the existing browser frontend verifier for accelerated finish/results and deeper gameplay regression coverage.

## Player controls and saves

Keyboard driving is unchanged. F11 or Alt+Enter toggles fullscreen; the menu also has Fullscreen / Windowed and Quit game. Window size/fullscreen state and game settings survive restarts. Demo/full settings, cups and records use separate OS application-data directories, preventing an old full save from choosing excluded demo content. There is no automatic demo-to-full migration or Steam Cloud configuration.

Standard controllers retain left-stick steering, RT throttle, LT brake, A boost and B airbrake. In menus use the stick/D-pad to navigate, A to activate, B to return and Start to pause/resume. Left/right adjusts focused sliders/selects. Disconnecting a controller during play pauses. This mapping is fixed; there is no remapping UI or rumble. The planned [presets and adjustable dead zones](release.md#controller-presets-and-dead-zones-deferred) are deferred. Physical controller/Steam Input validation remains a release gate.

## Release boundary

- Vite substitutes release constants before building. The development fly camera, live Dev tools, art/review/test launch routes, Sounds panel, pickup inspector and `window.__VN*` APIs are absent from release bundles. Player ship inspection remains available.
- Renderer runs with sandbox, context isolation and web security; no Node integration, webview or DevTools. The preload exposes only fixed fullscreen and quit operations, with sender/main-frame validation.
- A secure local protocol streams files only from the packaged renderer directory, including byte ranges for music. CSP allows local scripts/assets, WASM physics/decoders and local blob texture reads. A build-generated, sandboxed Basis decoder worker alone permits the Function constructors required by its Emscripten bindings; the document never permits JavaScript eval. Network access, downloads, popups and navigation are denied.
- Electron fuses disable RunAsNode, Node options and Node inspection flags, require `app.asar`, and enable embedded archive integrity. Debugging/unsafe launch switches are rejected. Native OS debugging is outside this application's control.
- Every package contains dependency notices and a SHA-256 release inventory. Build/package audits fail on developer modules/APIs, excluded playable worlds/assets, source maps, source/tools/dependency folders or incorrect fuses.

## SteamPipe

Create separate full-game and demo App IDs in Steamworks and associate the demo with the full game. Use separate Windows depot IDs and executable launch configurations. Steam's demo documentation describes the association and release controls: [Valve demos](https://partner.steamgames.com/doc/store/application/demos).

After assigning real IDs, generate a preview-only SteamPipe configuration for each audited Windows directory:

```sh
npm run steam:prepare -- demo --app-id DEMO_APP_ID --depot-id DEMO_WINDOWS_DEPOT_ID --content "release/demo/Vector Nova Demo-win32-x64"
npm run steam:prepare -- full --app-id FULL_APP_ID --depot-id FULL_WINDOWS_DEPOT_ID --content "release/full/Vector Nova-win32-x64"
```

The generator rejects placeholders, wrong editions and unaudited content. It writes `release/steam/<edition>/app_<id>.vdf`, depot VDF and launch-option instructions. From the Steamworks SDK `ContentBuilder` command-line client, use `steamcmd +login YOUR_STEAM_BUILD_ACCOUNT +run_app_build ABSOLUTE_PATH_TO_APP_VDF +quit`. Enter account credentials through Steam's prompt; do not commit them. `Preview "1"` validates without uploading. Set it to `0` when deliberately uploading, then select the uploaded build on a private testing branch in Steamworks. No `SetLive` directive is generated. See [Valve's upload instructions](https://partner.steamgames.com/doc/sdk/uploading).

This version uses no Steamworks runtime APIs and ships no `steam_appid.txt`. Steam installation/launch does not require achievements, leaderboards or Cloud. Configure the executable in Steamworks, install through a private branch and test offline play and an update before review.

## Public release

These are testable release candidates and SteamPipe-ready payloads. The remaining hardware, publisher, asset-rights and Valve review gates are maintained in [release.md](release.md#release-gates).
