# Run and build the native foundation

Dusk is a Godot project rooted at `game/`. The standalone app and editor run use the same scenes, prepared assets, controller and development tools. Production work stays in sibling `_prep/`, outside Godot's import and export scope.

## Play now

Open `dist/Chronoforge Dusk.app` in Finder. The generated local bundle is not tracked in Git.

For editor play, import/open `game/project.godot` with **Godot 4.6.3** and press **F5**. F5 inside the running game instead reloads the current prepared candidate. You can also open a debug game window without opening the editor:

```sh
cd games/chronoforge-dusk
python3 tools/native.py run
```

After source changes, stop and relaunch the running game. After adding/replacing an imported candidate, run the import command before relaunching or exporting. Do not run editor and packaged performance comparisons simultaneously.

## Controls

| Control | Action |
| --- | --- |
| `1`, `2`, `3` / top tabs | Inspect, traverse, rehearse |
| WASD / arrows | Camera-relative walking in traversal |
| Shift | Run |
| Right mouse drag / Q, E | Orbit the camera |
| Mouse wheel | Zoom (over the world; the left panel scrolls its controls) |
| C | Reset camera to factory framing |
| L | Toggle neutral/game lighting |
| P | Pause/resume simulation; camera and UI remain available |
| Step button | Advance one simulation tick while paused |
| R | Replay selected inspection clip or restart the rehearsal action |
| Space | Trigger one harmless strike in rehearsal; repeated triggering while busy is ignored |
| Candidate selector / F5 | Select/reload a prepared revision |
| F6 | Deliberately accept the current fixture + tuning |
| F7 | Restore the accepted candidate and settings |
| F9 | Write identity, input, action and performance diagnostics |
| Esc | Quit |

Tuning controls are in the left panel's collapsible **Tuning** section. Save/restore stay visible below the scroll area. The actor is explicitly a **diagnostic mannequin, not Kaida**. The target, baton, animation and traversal patch demonstrate foundation wiring only.

## Pinned toolchain and native export

| Tool | Pin / usage |
| --- | --- |
| Godot | `4.6.3.stable.official.7d41c59c4`, standard build / typed GDScript |
| Export templates | `4.6.3.stable`; official `macos.zip`, Universal 2 |
| Renderer | Forward+ on native Metal; 2× MSAA, one shadowed directional light, no glow/SSAO/SSR |
| Render size | Fixed 1920×1080 internal viewport; initial window 1440×810; resizing preserves aspect |
| Limits | 60 FPS active, 30 paused, 10 inactive; physics 60 Hz |
| Fixture generator/build helper | Python standard library, 3.10+; generated/tested with Python 3.14 |
| Blender | Not used or required for 01's diagnostic fixtures. Pin the production Blender version in 02. |

The matching Mac template has SHA-256:

```text
700a5759952b2260b7d894dc9bc4908d99ce9abe2964a76c6d2bddd4af4738b2
```

From the Dusk directory:

```sh
python3 tools/native.py setup       # fetch official archive once, verify macos.zip
python3 tools/native.py import      # standard Godot import + build identity
python3 tools/native.py export      # import, verify template, export and verify signature
python3 tools/native.py test        # export + rendered native checks + new-process save check
python3 tools/native.py test-editor # equivalent checks using the editor binary's game window
```

`GODOT_PATH` may point to the pinned Godot executable. The helper refuses a different version. It downloads the official approximately 1.2 GB archive only when needed, retaining the extracted Mac template under ignored `.tools/`. No global editor/template replacement is needed. The export preset uses this local template.

The result is a local **ad-hoc signed** `.app`, verified with `codesign --verify --deep --strict`. It does not need the editor. Distribution signing/notarization is outside 01; this is the owner's local test build. Only the Apple Silicon execution path has been exercised; the universal Intel slice has not.

Official references: [pinned release](https://godotengine.org/download/archive/4.6.3-stable/), [Godot macOS export](https://docs.godotengine.org/en/4.6/tutorials/export/exporting_for_macos.html), [command-line export](https://docs.godotengine.org/en/4.6/tutorials/editor/command_line_tutorial.html).

## Saved state and diagnostics

Godot's `user://` directory on this Mac is:

```text
~/Library/Application Support/Godot/app_userdata/Chronoforge Dusk/
```

- `accepted_tuning.json` pairs the asset/model hash and game build with accepted settings. It is restored on cold launch. `.previous` retains the preceding acceptance.
- `diagnostics.json` is written on F9 and includes the actually loaded asset, camera/lighting, input count, action totals, and per-view frame-time samples.
- Integration tests use `foundation_test_tuning.json` and `invalid_fixture.json`, preserving the owner's save. `test_foundation.json`, `test_restart.json` and three viewport PNGs contain the latest test results.

The opt-in test driver calls Godot's input event path and the actual runtime components. It is included in the app but runs only with `--self-test` or `--verify-restart`. It creates no network server and accepts no remote commands. Tests keep their window on top for the measurement interval, then automatically close it. Test focus changes are simulated through the same game focus handler; real OS focus events are disconnected only during this opt-in test mode. A 180-second subprocess timeout catches a stuck test; reports and errors remain in the log.

The in-app diagnostics keep up to 600 frame times per interval and retain separately named intervals across view changes. Frame times use wall-clock intervals, including pacing and stalls. `engine_process_ms` is Godot's process monitor, not a full CPU profile. GPU time is explicitly unavailable. Capture/readback introduces stalls and is separated from normal gameplay when interpreting the evidence.

## Where to extend it

- `actors/character.gd`: CharacterBody3D, collider, camera-relative movement, turning and traversal clip roles.
- `assets/asset_assembly.gd`: prepared descriptor validation, PackedScene instantiation, animation and attachments.
- `gameplay/rehearsal.gd`: approach → attack/contact/reaction → recovery → return, one impact signal.
- `development/`: patch, camera, savable tuning, diagnostics and scene composition.
- `ui/development_hud.gd`: in-game development controls.
- `content/candidates.json`: selected immutable candidate descriptors.

02 delivers selected runtime GLBs/descriptors to `game/assets/<asset-id>/<revision>/` and keeps production sources upstream. Use the concrete [runtime contract and working example](_prep/ASSET_CONTRACT.md). All five character clips must currently be embedded in the model GLB. Skeletal deformation, real Kaida and static-prop production are still 02/03 work; do not infer their quality from these rigid fixtures.
