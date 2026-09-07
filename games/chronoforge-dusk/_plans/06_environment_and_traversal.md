# 06 — Coastal environment and traversal

**Type:** bounded environment production and native gameplay assignment. **Status:** ready for owner review and assignment; implementation has not started.

**Requires:** 03's working character/controller/import handoff. [Kaida a1](../releases/kaida-a1.md) is the current baseline. Use the latest completed Dusk handoff if it has advanced, recording the exact revision tested. **04, story approval, ATB, and additional characters are not prerequisites.** Existing Kaida cosmetic limitations do not block this work.

**Read:** [AGENTS.md](../AGENTS.md), [native instructions](../NATIVE.md), the [Kaida handoff](../_prep/KAIDA_HANDOFF.md), and relevant [03 evidence](../evidence/kaida-03/README.md). For new static assets, use [_prep/README.md](../_prep/README.md) and the [runtime contract](../_prep/ASSET_CONTRACT.md). Consult original visual references through [README.md](../README.md#reference-entry-points) as needed. Story documents and the other future plans are not required reading.

## Outcome

Launch the native app and explore a small, polished coastal-ruins area as the real Kaida. It should feel like the first piece of Chronoforge's world: a place worth walking around, with deliberate composition, convincing surfaces, atmosphere, and comfortable movement. The development grid is no longer the normal play experience.

Build this inside the existing Dusk game, using its character, asset consumer, movement, tuning, and diagnostics. The environment becomes the physical foundation for [07's complete playable loop](07_first_playable_loop.md). It is useful and reviewable before that loop or its story exists.

## The place and its presentation

Author one compact coastal reclamation site, with room for a few minutes of unhurried exploration. Give it a readable arrival, a connected route, an elevation change, a distinctive distant landmark, and a small optional overlook or side space. A weathered seawall, broken landing, repaired crossing, and upper ruin are possible ingredients; choose the layout and details creatively rather than treating these as a mandatory object list. Let the player return comfortably to the start.

Make the ruin belong to Chronoforge's post-collapse Earth: salt-worn construction, remnants of useful technology, signs of practical repair, and coastal nature reclaiming the edges. Haventide is a useful visual reference, not an instruction to adopt a particular plot, town layout, or named event. Leave narrative identities open.

Give the environment grounded coastal architecture, believable construction and proportions, weathered materials, natural lighting, and readable terrain. Surface wear, shoreline forms, and vegetation should make the place feel tangible and lived in. Use composition, color balance, and lighting to integrate Kaida with the surroundings while keeping her silhouette clear. Judge every visual choice from the actual elevated 2.5D game camera.

## Build and integrate

1. **Establish the playable route.** Place Kaida through the existing actor/import path. Block out the route at her scale, then solve ground contact, slopes or steps, corners, narrow passages, and safe boundaries before dressing it. Keep controller-owned displacement and the existing walk/run behavior. Do not require jumping, climbing, swimming, or new traversal animations to navigate the site.
2. **Finish the environment.** Replace the visible blockout with a small coherent kit: ground and shoreline, architectural forms, selected props and vegetation, and a focal landmark. Concentrate detail where the camera and route make it count. Use reusable Dusk scenes and materials; retain editable sources. A dressed diagnostic floor or a beautiful scene Kaida cannot navigate does not satisfy the assignment.
3. **Use the asset pipeline where it applies.** Author new meshes in Blender and send them through the existing static recipe and game handoff. Static scenery skips Meshy, Mixamo, skeletons, and clip acquisition. Terrain, lighting, water, scene layout, and game effects can be authored directly in Godot. Make only small producer/consumer fixes needed for these real assets; do not build a new pipeline or level editor. No hosted credits or manual service downloads should be necessary.
4. **Make the camera serve exploration.** Establish an authored elevated view with comfortable follow, clear foreground treatment, and readable height changes. Keep Kaida visible around walls, vegetation, and transitions. Preserve the useful inspection camera separately; do not force players to orbit around an obstruction to find themselves. Keep environment-specific framing from overwriting accepted inspection/rehearsal tuning.
5. **Finish light, motion, and sound.** Add coherent daylight or dusk lighting, readable contact shadows, sea/shore presentation, and restrained ambient movement. Use simple ambient audio and footsteps where they help the place feel present, retaining sources and provenance. Tune effects in the exported game and keep Kaida readable; a costly weather system is outside scope.
6. **Provide a clean way to play.** Make the environment directly launchable in the native app with minimal control guidance, pause/quit, and a simple reset to a safe spawn. Keep Inspect/Traverse/Rehearse and diagnostics accessible through a deliberate development entry or toggle, with tools hidden during normal exploration. Use shared runtime components rather than maintaining a second character/controller for this scene.

Keep Kaida's current source, clips, and immutable package intact unless a concrete environment integration defect requires a focused fix. Produce only scenery needed here; no additional humanoid proof or character lineup is required. A useful static-asset revision/reimport during this work can supply repeatability evidence for 04, without declaring the whole paused milestone complete.

## Ownership and scope

Own the new environment scenes/assets, their integration, camera and traversal fixes needed by the route, and minimal launch/development access. New production sources belong under `_prep/`; selected runtime assets and game behavior belong under `game/`. Update native instructions and keep a concise handoff under `evidence/environment-06/`.

Existing Dusk systems and assets are the implementation base. Original Chronoforge imagery is visual reference; Dawn and the prototype do not supply code, models, rigs, or environment assets. Follow AGENTS.md for coherent checkpoint commits.

This assignment ends at polished exploration. Combat/ATB, enemies, companions, dialogue, quests, loot, inventory, skill trees, XP, settlement mechanics, and campaign save/progression belong to later assignments. Do not add empty menus or story gates for them. Preserve existing development rehearsal behavior without expanding it. Web support and tech9 work remain deferred.

## Verification and handoff

- Walk and run the complete route through real input in the exported Mac app, including cold startup, slopes/steps, corners, side space, boundaries, return, and reset. Check feet, carried sword, camera occlusion, and input after pause or development-view changes. Fix falls through terrain, trapped positions, major clipping, and movement/camera regressions.
- Reopen the app and reproduce the intended environment and character settings without overwriting the owner's accepted tuning. Verify new static assets after import/export; exercise one useful revision/reimport if needed during production and record the result.
- Run the existing Kaida native/restart checks when shared runtime behavior changes, plus focused environment checks. Use the foundation suite only for relevant importer/fixture changes. Do not build a speculative test framework.
- Measure representative traversal and stationary views after warmup at the existing 1080p internal resolution and 60 FPS cap. Report frame-time distribution/spikes, draw calls, geometry and memory, and CPU/GPU data where available. Check pause and inactive behavior. Profile material regressions before adding scenery; keep screenshot/readback stalls separate from normal play measurements.
- Deliver a launchable `.app`, source and asset identities, a few representative gameplay-camera captures and motion evidence, controls, checks actually performed, and remaining limitations. Distinguish engineering verification from the owner's subjective playtest; unavailable checks stay explicitly unverified.

**Done:** Kaida can explore a cohesive, finished-looking coastal place comfortably in the native game; the pipeline, controller, tools, and saved tuning still work; performance is measured; and the owner has a concrete build to review. Stop here. Story acceptance and [07](07_first_playable_loop.md) remain separate work.
