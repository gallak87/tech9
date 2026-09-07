# Run and build the coastal exploration

Dusk is a Godot project rooted at `game/`. The standalone app and editor run use the same scenes, prepared assets, controller and development tools. Production work stays in sibling `_prep/`, outside Godot's import and export scope.

## Play now

Open `dist/Chronoforge Dusk.app` in Finder. The generated local bundle is not tracked in Git.

For editor play, import/open `game/project.godot` with **Godot 4.6.3** and press **F5**. F5 inside the running game instead reloads the current prepared candidate. You can also open a debug game window without opening the editor:

```sh
cd games/chronoforge-dusk
python3 tools/native.py run
```

After source changes, stop and relaunch the running game. After adding/replacing an imported candidate, run the import command before relaunching or exporting. Do not run editor and packaged performance comparisons simultaneously.

The app opens directly in **06's coastal reclamation site**, using **Kaida r2 / Alpha a1** and her separate energy sword. Explore the arrival quay, repaired timber crossing, seawall ascent, upper ruin and sea overlook; the west path returns to the start. The authored camera and WASD axes agree, so following the main roads does not require corrective strafing. See the [environment handoff](evidence/environment-06/README.md) and [authoring guidelines](ENVIRONMENTS.md). This build ends at outdoor exploration; 04 remains paused and 07 has not started.

## Exploration controls

| Control | Action |
| --- | --- |
| WASD / arrows | Walk along the camera-aligned route axes |
| Shift | Run |
| R | Return Kaida and the camera to the safe arrival |
| Esc / P | Pause/resume; pause menu also offers reset and quit |
| F2 | Open the existing development scene; F2 there returns to the coast |
| F9 | Write coastal identity, input and performance diagnostics |

The normal view has minimal guidance and no development panels. The sea overlook gently opens the framing to reveal the signal tower while retaining the same movement axes. Foreground arches and larger props fade when they would hide Kaida. The coast reads accepted movement settings but never saves its camera into the owner's inspection tuning. Returning from development resets to the safe arrival; the saved inspection/rehearsal tuning remains available.

## Development controls

| Control | Action |
| --- | --- |
| F2 | Return to coastal exploration |
| `1`, `2`, `3` / top tabs | Inspect, traverse, rehearse |
| WASD / arrows | Camera-relative walking in traversal |
| Shift | Run |
| Right mouse drag / Q, E | Orbit the camera |
| Mouse wheel | Zoom (over the world; the left panel scrolls its controls) |
| C | Reset camera to factory framing |
| L | Toggle neutral/game lighting |
| P | Pause/resume simulation; camera and UI remain available |
| T | Toggle quarter-speed motion |
| M | Toggle rig, blade and contact markers |
| H / K | Hurt / defeat preview; K performs a finishing strike in rehearsal |
| F1 | Hide/show the side panel |
| Step button | Advance one simulation tick while paused |
| R | Replay selected inspection clip or restart the rehearsal action |
| Space | Trigger one harmless strike in rehearsal; repeated triggering while busy is ignored |
| Candidate selector / F5 | Select/reload a prepared revision |
| F6 | Save the current candidate + gameplay tuning |
| F7 | Restore the saved candidate and settings |
| F9 | Write identity, input, action and performance diagnostics |
| Esc | Quit |

Tuning controls are in the left panel's collapsible **Tuning** section. Save/restore stay visible below the scroll area. The default actor is **Kaida r2 / Alpha a1**. The harmless target is still a labeled diagnostic mannequin. Kaida a1 includes five role clips and a separate sword, with continuous running carry. The game controls displacement and attack tempo. Defeat is a basic held hurt pose plus a fall and reset, not a newly authored source animation.

## Pinned toolchain and native export

| Tool | Pin / usage |
| --- | --- |
| Godot | `4.6.3.stable.official.7d41c59c4`, standard build / typed GDScript |
| Export templates | `4.6.3.stable`; official `macos.zip`, Universal 2 |
| Renderer | Forward+ on native Metal; 2× MSAA, one shadowed directional light, no glow/SSAO/SSR |
| Render size | Fixed 1920×1080 internal viewport; initial window 1440×810; resizing preserves aspect |
| Limits | 60 FPS active, 30 paused, 10 inactive; physics 60 Hz |
| Fixture generator/build helper | Python standard library, 3.10+; generated/tested with Python 3.14 |
| Blender | 5.1.1 / b70da489d7f4 for production sources; not needed for native play. |

The matching Mac template has SHA-256:

```text
700a5759952b2260b7d894dc9bc4908d99ce9abe2964a76c6d2bddd4af4738b2
```

From the Dusk directory:

```sh
python3 tools/native.py setup       # fetch official archive once, verify macos.zip
python3 tools/native.py import      # standard Godot import + build identity
python3 tools/native.py export      # import, verify template, export and verify signature
python3 tools/native.py test-locomotion # short coastal walk/run, arm swing and restart check
python3 tools/native.py test-environment # coastal route, WASD alignment, pause/tools + restart
python3 tools/native.py capture-environment # separate native motion capture; not performance
python3 tools/encode_coast_motion.py # animated WebP evidence (Pillow only for encoding)
python3 tools/native.py test       # a1 gate: native Kaida gameplay + cold restart
python3 tools/native.py test-editor # same Kaida suite using the editor binary
python3 tools/native.py test-foundation # opt-in importer/fixture regressions
python3 tools/native.py test-foundation-editor # opt-in regressions with editor binary
```

`GODOT_PATH` may point to the pinned Godot executable. The helper refuses a different version. It downloads the official approximately 1.2 GB archive only when needed, retaining the extracted Mac template under ignored `.tools/`. No global editor/template replacement is needed. The export preset uses this local template.

The result is a local **ad-hoc signed** `.app`, verified with `codesign --verify --deep --strict`. It does not need the editor. Distribution signing/notarization is outside 01; this is the owner's local test build. Only the Apple Silicon execution path has been exercised; the universal Intel slice has not.

Official references: [pinned release](https://godotengine.org/download/archive/4.6.3-stable/), [Godot macOS export](https://docs.godotengine.org/en/4.6/tutorials/export/exporting_for_macos.html), [command-line export](https://docs.godotengine.org/en/4.6/tutorials/editor/command_line_tutorial.html).

## Test scope

`test-locomotion` checks the current walking arm swing, walk/run speed, stride playback, stopping and a cold restart in the coastal scene. It does not repeat the full route or fixture suite.

`test-environment` runs the actual coastal loop through mapped input, checks single-key road alignment, foreground fading, boundaries, pause/reset, development round trips and acceptance-file preservation, then cold restarts. `test-environment-editor` is available for the same focused checks with the editor binary. `test` runs Kaida only, then verifies saved state in a new process. This is the a1 release gate. The fixture suite is explicitly opt-in for importer, malformed-descriptor, asset-swapping or shared foundation changes; it is not a second gate for character fixes or documentation cleanup. Run checks for the changed system. A changed global content digest alone does not justify repeating unrelated suites: retain the earlier report and identify its tested source. Repeat Kaida checks for changes affecting the actor, controller, importer, saved tuning or shared launch/input flow; scenery/material/camera-only changes use focused environment checks. Documentation and commit-label changes need neither a gameplay rerun nor a new export.

## Saved state and diagnostics

Generated reports and logs stay local. JSON and log copies under `evidence/` are Git-ignored; commit only concise validation summaries with tested source identity, limitations and selected review captures. Asset manifests and production metadata remain tracked.

Godot's `user://` directory on this Mac is:

```text
~/Library/Application Support/Godot/app_userdata/Chronoforge Dusk/
```

- `accepted_tuning.json` pairs the asset/model hash and game build with accepted settings. It is restored on cold launch. `.previous` retains the preceding acceptance.
- `environment-diagnostics.json` is written on F9 in coastal exploration. `test_environment.json` and `test_environment_restart.json` contain the native route checks; `environment-*.png` are their captures. `capture-environment` writes a separate `environment-motion/` sequence and `test_environment_motion.json`. Its readbacks must not be interpreted as normal play.
- In development, `diagnostics.json` is written on F9 and includes the actually loaded asset, camera/lighting, input count, action totals, and per-view frame-time samples.
- Kaida tests use `kaida_test_tuning.json`, `test_kaida.json`, `test_kaida_restart.json`, and `kaida-*.png`; they preserve the owner’s save.
- Foundation integration tests use `foundation_test_tuning.json` and `invalid_fixture.json`, preserving the owner's save. `test_foundation.json`, `test_restart.json` and three viewport PNGs contain the latest test results.

The opt-in test driver calls Godot's input event path and the actual runtime components. Its header says **AUTOMATED TEST — PLEASE WAIT**. Avoid keyboard/mouse input in the app while it runs: external presses invalidate the result. Each invocation carries a unique run ID; the helper requires completed, zero-failure reports from that ID and the exact source digest before proceeding to restart. Quitting early cannot reuse an older passing report. It is included in the app but runs only with `--self-test`, `--verify-restart`, `--kaida-test`, or `--kaida-restart`. Coastal opt-in flags are `--environment-test`, `--environment-restart`, and `--environment-motion`. It creates no network server and accepts no remote commands. Tests keep their window on top for the measurement interval, then automatically close it. Test focus changes are simulated through the same game focus handler; real OS focus events are disconnected only during this opt-in test mode. A 180-second subprocess timeout (300 seconds for the longer coastal route) catches a stuck test; reports and errors remain in the log.

The in-app diagnostics keep up to 600 frame times per interval and retain separately named intervals across view changes. Frame times use wall-clock intervals, including pacing and stalls. `engine_process_ms` is Godot's process monitor, not a full CPU profile. GPU time is explicitly unavailable. Capture/readback introduces stalls and is separated from normal gameplay when interpreting the evidence.

## Where to extend it

- `environment/coast.gd`, `coast_site.gd`, `coast_camera.gd`: normal launch, metre-scale site/collision, independent aligned framing and clean play UI.
- `environment/coast_kit.gd`: existing descriptor validation and batching of the prepared Blender scenery, plus foreground fading.
- `environment/coast_audio.gd`: original shore ambience and displacement/grounding-driven stone/timber footfalls. Sources and provenance are under `_prep/audio/`.
- `launch.gd`: defaults to coastal exploration; `--development` and the original native test flags deliberately open the development scene.

- `actors/character.gd`: CharacterBody3D, collider, camera-relative movement, turning and traversal clip roles.
- `assets/asset_assembly.gd`: prepared descriptor validation, PackedScene instantiation, animation and attachments.
- `gameplay/rehearsal.gd`: approach → attack/contact/reaction → recovery → return, one impact signal.
- `development/`: patch, camera, savable tuning, diagnostics and scene composition.
- `ui/development_hud.gd`: in-game development controls.
- `content/candidates.json`: selected immutable candidate descriptors.

02 delivers selected runtime GLBs/descriptors to `game/assets/<asset-id>/<revision>/` and keeps production sources upstream. Use the concrete [runtime contract and working example](_prep/ASSET_CONTRACT.md). All five character clips must currently be embedded in the model GLB. The current source and runtime package use a1. See [03 evidence](evidence/kaida-03/README.md) for measured validation, remaining limitations and the owner review boundary.

## Alpha graduation

[Kaida a1](releases/kaida-a1.md) is the only Kaida entry in the current game. r2 identifies the stable model generation; a1 is the release identity across source, package and runtime. Original inputs and current editable sources remain under `_prep`. Superseded iterations are in Git history.
