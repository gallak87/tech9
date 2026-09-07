# Playtesting and validation

## What counts as evidence

Use four complementary forms of evidence: asset inspection, real-input play, gameplay assertions, and performance measurements. A successful import does not establish appearance; a screenshot does not establish animation; a passing combat test does not establish feel.

Validation belongs to the game and integration work. The asset pipeline provides structural checks and provenance, then the game tests the actual imported result.

## Identify what was tested

Record game revision, native build type, Godot version/renderer, asset ID/version/hash, animation revision, camera/lighting preset, render resolution, frame cap, and machine for any comparison used to accept a change.

Verify that the intended asset finished loading and is the actor actually drawn. A file request or elapsed delay is insufficient. Show missing/failed imports visibly in development mode.

Accepted-versus-candidate comparisons must keep unrelated variables fixed. Another lane must not mutate the running project or replace its assets during the comparison. Reload/restart deliberately after edits and confirm that the new version is active.

## Kaida evaluation

| Area | Inspect or exercise |
| --- | --- |
| Identity | Face, hair, costume, proportions, silhouette, original color anchors at actual game scale |
| Surfaces | Texture assignment, normal orientation, roughness/metal response, controlled emissive blade, readable shadows |
| Rig and skin | Shoulders, elbows, hips, knees, wrists, palms/fingers, weapon grip across complete clips and transitions |
| Ground contact | Standing, starts/stops, walking/running, turns, slopes where applicable, approach and return |
| Animation | Idle loops, transitions, attack anticipation/contact/recovery, hit reaction, defeat; no snapping or unintended root drift |
| Interaction | Actual movement input, response timing, collision, camera tracking, repeated action triggering, pause and reset |
| Battle timing | One impact at the intended contact, synchronized reaction/effects/audio, correct completion and return |

Use neutral lighting for diagnosis and intended game lighting for acceptance. Inspect motion at normal speed and in slow/stepped playback. The owner should also play the native build directly; scripted operation alone cannot judge whether it is satisfying.

## Performance from the first runtime

Use the owner's Mac as the first target. Start with a 60 FPS cap and a documented 1080p internal resolution; record window size and display scale separately. The nominal frame budget is about 16.7 ms. Treat targets as proposed budgets to verify, not achieved claims.

Measure a representative interval after loading/warmup, and separately note cold-start/import stutters. Report frame-time distribution and spikes, CPU/GPU time where available, draw calls, geometry, texture/memory footprint, and observed resource use.

Compare these states: neutral idle, continuous traversal/turning, repeated attack/reaction, pause/development menu, unfocused/minimized, and repeated asset reload. Once one actor works, test several instances to expose scaling costs.

Measure an exported native build as well as editor play so editor overhead is not mistaken for game cost. Suspended or inactive modes should avoid unnecessary simulation, rendering, and audio work. Verify cleanup after asset swaps; retained textures, animations, or effects must not accumulate indefinitely.

The reported Chrome CPU figure and the prototype's recorded 120 FPS are historical observations, not a Dusk benchmark. No engine comparison or improvement percentage has been demonstrated. Profile a suspected bottleneck before optimizing it.

## Checks worth automating

- Required files, declared materials/textures, skeleton/clip references, sockets, dimensions, and motion policy are valid for the asset's declared recipe.
- Importing a revised asset does not erase game-owned tuning; the accepted result survives a cold restart.
- Repeating an action does not duplicate impacts, leak effects, or leave actors out of formation.
- When the first game loop exists, earned rewards, equip/skill effects, building costs, save/load, and defeat/retry behave correctly.

Only write tests that exercise meaningful failure modes. Do not create a large speculative test suite before the features it is meant to evaluate.

## Report results honestly

A handoff states what was run, what was only inspected, which views/actions were observed, and which devices/builds were not tested. Keep structural pass, visual acceptance, motion acceptance, and performance acceptance distinct. Link the evidence and list remaining defects with reproducible steps.

There is no browser or mobile testing matrix in the current plan. Add one only if the owner chooses a platform pivot.
