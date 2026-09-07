# Coastal exploration — 06 handoff

The native app opens into a compact coastal reclamation site with Kaida a1: arrival quay and tide pump, a repaired timber crossing, a 3 m seawall ascent, an upper ruin, an optional sea overlook and a connected west return. Nine original Blender scenery assets, weathered surfaces, shoreline motion, moving grasses, soft daylight, original procedural shore audio and grounded stone/timber footfalls establish the outdoor scene. No story, combat, progression, interiors or room transitions were added. **Stop at 06.**

Launch [`dist/Chronoforge Dusk.app`](../../dist/Chronoforge%20Dusk.app), or follow [NATIVE.md](../../NATIVE.md). [Authoring guidelines](../../ENVIRONMENTS.md) record the route/camera/collision lessons for future work.

## Play and review

WASD/arrows walk; Shift runs; R returns to the safe arrival; Esc/P opens pause, reset and quit; F2 opens the existing Inspect/Traverse/Rehearse development scene and returns to the coast; F9 writes coastal diagnostics. Normal exploration hides the development UI. The inspection/rehearsal settings remain independent of the coastal camera.

The owner's early playtest identified a real control problem: an 18° camera yaw forced alternating W/D corrections along straight roads. The final elevated camera uses **0° yaw**. The route and camera-relative keyboard axes now agree; the camera opens gently at the overlook without rotating the movement frame. Native regressions hold only D across the crossing and only W up the ascent, with less than 2 cm of lateral drift. Larger foreground props/arches fade smoothly when they obstruct Kaida.

[Arrival](arrival.png) · [Repair crossing](crossing.png) · [Upper ruin](upper-ruin.png) · [Sea overlook](overlook.png) · [Foreground treatment](foreground.png) · [Native motion](coastal-traversal.webp).

## Exact content

Baseline: `21497f447e02`, using Kaida a1 graduated at `b246ff1`. Kaida's source, five clips, model and sword package remain unchanged. Model SHA-256: `ce8669efca5b747b34c35a44fb95f82e97ec153e422cf8ae5bacbb2dcc8b3fa0`; sword: `3dc29eb1cd115158bc841cba8412754b5040aeb6c7c3cef20fc0af2246f2bbea`.

Tested runtime source SHA-256:

```text
c0ccce620f453c49f925fc814c3dea4b5979fdd13664e1f3bc480ebae7217ca1
```

[Source and asset inventory](source-and-assets.json) pins every selected descriptor, GLB, editable source and prepared manifest, plus audio hashes. The kit selects seawall, arch, bollard, supplies, rocks, grass, tower and pump r1; repair bridge r2. Original/editable Blender sources and packed texture maps are under `_prep/assets/coast.*`; production scripts are under [`_prep/assets/coast`](../../_prep/assets/coast/README.md). Original audio sources and provenance are under [`_prep/audio`](../../_prep/audio/README.md).

Every new mesh used the existing `static_blend` recipe, including Blender export/reimport, texture pixel/inventory checks and runtime hash validation. The runtime uses `DuskAssetAssembly`, then shared imported meshes/batches; simple collision stays game-owned. No importer, pipeline framework, hosted credits or service downloads were added.

The bridge supplied a useful revision/reimport: r1's timber deck was hidden under blockout paving and lacked a readable repaired edge. r2 adds bolted salvage rails; the game removes the covering paving, aligns deck contact and supplies masonry supports. The r2 GLB has a new hash (`1e8675f041cdf1614bc2e39c82039458b752d01bc8d8701d3e7de12272af5111`), is visible and traversable after export, and does not alter Kaida/tuning. Superseded candidate/runtime bytes are retained by the scenery checkpoint in Git; the original r1 master remains a provenance input to r2. This is bounded repeatability evidence, **not completion of paused 04**.

Only existing Dusk components and the current Kaida handoff were reused. Original Chronoforge Haventide imagery was viewed for color/material reference. No original-game, Dawn or prototype production code, models, textures, rigs or audio were copied.

## Checks actually performed

| Check | Result | Evidence |
| --- | --- | --- |
| Exported environment / cold restart | 43 + 6 passed, fresh matching run ID, no external input | [Route report](native-environment.json), [restart](native-environment-restart.json), [native log](native-environment.log) |
| Existing Kaida gameplay / cold restart | 61 + 6 passed, fresh matching run ID | [Kaida report](native-kaida.json), [restart](native-kaida-restart.json), [log](native-kaida.log) |
| Original source preparation tests | 23 passed | [Log](pipeline-tests.log) |
| Native report integrity helper | 4 passed | [Log](native-helper-tests.log) |
| Nine selected static packages | Export/reimport + verify passed | [Asset manifests](source-and-assets.json) |
| Native motion capture | Separate continuous running route with mapped input, captured before the final foreground sight-line correction | [Capture report](native-motion.json), [animated evidence](coastal-traversal.webp) |

The route suite walks the entire connected route and runs it in reverse, including the side space, slopes/seams, corners, boundary pushing, return and reset. It checks ordinary cold startup before resetting, foot grounding, accepted movement values, full landmark framing, foreground fading, footsteps, pause/inactive handling, and a real scene round trip through the existing inspection/traversal/rehearsal tools. The route recorded zero consecutive airborne physics frames and a minimum world height of −1.15 mm, within ground-contact tolerance.

The full-route input is automated `Input.parse_input_event` using physical WASD/Shift through the actual game mappings and controller; it does not teleport between route points. Direct OS UI checks additionally exercised cold native launch, Escape pause, mouse Resume/Quit, F2 into rehearsal, Space strike and return to coast. The owner walked an earlier build and supplied the axis-alignment feedback. The final full route has **not** had a separate owner/manual held-key playthrough; the OS automation's instantaneous movement key taps did not establish sustained walking. Owner review of final movement feel, visuals and audible mix remains separate from engineering verification.

The motion artifact was captured at source `2b0ddd704fd98ec58d2d71be65ed70fe13906394a6e348947310c468876c01b2`. The subsequent change corrected foreground sight lines for the orthographic camera; route, assets, movement and framing are the same. The stills and route report use the final source above.

An earlier run received user key presses and was correctly rejected by the native report verifier. It is not release evidence. Automated runs now show an explicit banner/window title and retain interference state across the development round trip.

No accepted tuning file was present in this test account; it remained absent, and factory movement settings were reproduced on cold restart. The coastal scene contains no acceptance-file write path. The separate Kaida gate uses its isolated test save to verify full saved-tuning restoration. This distinguishes the exercised case from a pre-existing nondefault owner save.

## Native performance

Godot 4.6.3, Forward+ / Metal, Apple M1 Pro, 1920×1080 internal rendering, 2× MSAA, 60 FPS active cap. These are warmed desktop frame intervals from the actual exported app, including pacing. No concurrent editor/Blender/motion encoder ran during the final measurement. Each interval retains at most the latest 600 frames; a long route's label does not imply every earlier frame is retained.

| Interval | Samples | Mean ms | p95 ms | p99 ms | Max ms | >33.34 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Arrival stationary | 599 | 16.66 | 19.29 | 20.65 | 25.65 | 0 |
| Main walk segment | 600 | 16.67 | 18.67 | 19.70 | 21.30 | 0 |
| Ascent / upper route | 600 | 16.67 | 19.41 | 20.47 | 23.15 | 0 |
| Reverse running route | 600 | 16.67 | 19.36 | 20.52 | 21.43 | 0 |
| Boundary / corner movement | 600 | 16.67 | 18.75 | 21.74 | 42.12 | 1 |
| Paused | 120 | 33.33 | 35.24 | 36.54 | 41.15 | 62 |
| Inactive handler | 30 | 99.94 | 101.16 | 101.31 | 101.76 | 30 |

Representative movement/stationary interval endpoints report **142–206 draw calls**, **62,736–82,264 rendered primitives**, and **319.50 MiB video memory**. These are Godot's per-frame counters, not the sum of source mesh triangles or process RSS; the imported meshes use Godot's LODs. `engine_process_ms` snapshots range from about **5.21 to 7.99 ms** across those intervals; this monitor is not a full CPU profile. GPU frame time was unavailable and is not inferred from FPS.

One boundary interval contained a 42.12 ms frame; it is retained in the report rather than discarded. Pause caps rendering at 30 FPS and the inactive handler at 10 FPS, so their >33 ms counts are expected. Simulation, water/grass time and footfalls are paused with the scene. Focus-handler checks are simulated in the suite; a separate OS background/foreground session is noted in the final receipt when exercised. Capture/readback intervals and the dedicated motion run are excluded from normal-play measurements. The evidence supports the measured capped run, not a guarantee of locked 60 FPS on all hardware or sessions.

## Remaining review boundary

- This is a compact outdoor exploration foundation. No rooms/enter-exit prototype, combat, story gating, progression, additional actors or 07 systems were added.
- Kaida keeps a1's accepted alpha limitations in proportions, detailed grip and animation polish. Foreground fading protects visibility; it does not replace a future animation/IK pass for individual stair treads.
- Scenery is an original small repeated kit with baked/procedural wear; it does not claim unique scanned materials or final commercial art acceptance. Audio is synthesized, with subjective mix quality still for owner review.
- The app is a local ad-hoc signed universal bundle. Apple Silicon execution was exercised; Intel execution and distribution signing/notarization were not.

Checkpoint identities and the final packaged build receipt are recorded in [the release receipt](release-receipt.json). 06 ends here; the owner's next review is of this concrete app and its guidelines.
