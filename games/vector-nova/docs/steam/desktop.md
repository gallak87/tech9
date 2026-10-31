# Desktop builds and Steam handoff

Run commands from `games/vector-nova` with Node 22.13+ and npm. The ordinary `npm run dev`, `npm run build`, `npm run preview`, and GitHub Pages deployment remain the browser workflow. Desktop outputs live in ignored `.desktop/` and `release/`; neither is a Pages input.

## Editions

|              | Demo                                                                  | Full game                                    |
| ------------ | --------------------------------------------------------------------- | -------------------------------------------- |
| Player ships | Kestrel                                                               | Kestrel, Shrike, Bastion, Needle             |
| Courses      | Halcyon Speedway, Nacre Tempest                                       | All 14 existing courses                      |
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

Desktop CI is paused until the private-repository move. Its complete definition is retained as `.github/workflows/vector-nova-desktop.yml.disabled`; restore the `.yml` extension in the private repository to enable manual and pull-request runs. It builds and verifies both editions on Windows and macOS with separate artifacts, without uploading to Steam or changing Pages deployment. Local build/package commands remain available.

`verify:desktop` uses an external, unshipped main-process harness to load the exact staged main/preload/renderer (or the packaged archive with `--archive PATH_TO_APP_ASAR`), with DevTools disabled. It checks catalog counts, attempted URL/save unlocks, local assets, every player ship, driving, pause/resume/setup, modes, garage studio, the edition-scoped unlock bar, settings and resumable cups across a complete restart, the native menu and synthetic standard-controller menu input. It mutes native audio before loading the app while still exercising playback controls. It does not insert a test API or test flag into the release. `VN_PROBE_WINDOW_ONLY=1` checks native fullscreen availability at startup without loading races. `VN_PROBE_LEVELS=halcyon,nacre` narrows iteration; omit it for all edition courses. An optional `VN_PROBE_CAPTURE=<scratch-directory>` saves screenshots; ordinary runs leave no evidence files. Use the existing browser frontend verifier for accelerated finish/results and deeper gameplay regression coverage.

## Player controls and saves

Keyboard driving is unchanged. F11 or Alt+Enter toggles fullscreen; the menu also has Fullscreen / Windowed and Quit game. Window size/fullscreen state and game settings survive restarts. Demo/full settings, cups and records use separate OS application-data directories, preventing an old full save from choosing excluded demo content. There is no automatic demo-to-full migration or Steam Cloud configuration.

Native fullscreen is available through the top-right menu/inspector icon, pause quick settings, F11, Alt/Option+Enter and the macOS green button or Control+Command+F. Window size/fullscreen persist per edition. In the Electron constructor, omit a false fullscreen value: explicitly passing `fullscreen: false` disables the macOS fullscreen control.

Standard controllers use the [Classic, Shoulders or Arcade presets](release.md#controller-presets-and-dead-zones), selected in Settings alongside a saved 0–40% steering dead zone (15% default), live stick test and reset. Left stick steers, X cycles normal race cameras, Menu/Start pauses, View/Select toggles music, and menu A/B confirm/return. Tunes opens from setup or pause for song/volume controls, with B returning focus to its button. The in-race shortcut strip is omitted; all bindings remain in Settings. D-pad/stick navigates menus; left/right adjusts focused sliders/selects. While focused in controller settings, use D-pad so the left stick can test steering without editing the controls. Disconnecting during play pauses; held buttons need releasing after a context switch or reconnect. Keyboard driving remains available. Physical controller/Steam Input validation remains a release gate.

## Release boundary

- Vite substitutes release constants before building. The development fly camera, live Dev tools, art/review/test launch routes, Sounds panel, pickup inspector and `window.__VN*` APIs are absent from release bundles. Player ship inspection remains available.
- Renderer runs with sandbox, context isolation and web security; no Node integration, webview or DevTools. The preload exposes fixed fullscreen/quit operations plus read-only fullscreen state and change notifications, with sender/main-frame validation.
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
