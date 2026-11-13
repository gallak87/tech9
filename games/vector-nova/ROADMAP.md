# VECTOR//NOVA roadmap

Current review direction checked on **2026-11-10**; the expanded modes still need human and release integration review. This is open work, not authorization to restart completed art or critic campaigns. Implementation and automated checks do not replace human or physical-device approval.

## Current baseline

- Main has seventeen racing courses, four original championships plus the unlockable Encore Cup, four playable ships and a ten-racer field. Quick Race, Practice, continuous circuit Time Trials, sprint trials, saved bests and personal ghosts are implemented. Course details and shared rules live in [architecture](ARCHITECTURE.md) and the [level API](docs/LEVEL_API.md).
- All 28 career rewards, six enhancement tracks, six equipped abilities, Quad Core, the live Garage, physical combat/contact and demo-to-full save transfer are implemented. The full collection now has 37 unlocks: those 28 items plus nine derived mode-course unlocks. Completing it opens the original Oriel, Ravel and Nomad Procession courses, Encore Cup and the Shatterline completion cinematic. Browser developer modes require `showcase=1` to preview that cinematic. The manual title screen, three named career slots, top-level navigation and shared audio controls are described in [entry and careers](docs/intro-and-profiles.md).
- Eight songs, local music/SFX generation, browser publishing and offline Electron demo/full packages exist. Startup selects Blue Hour and honors the saved startup-pause preference. See [audio](docs/audio/README.md), [desktop builds](docs/steam/desktop.md) and the [release checklist](docs/steam/release.md).
- Freestyle, Eliminator and Interceptor each have three standalone courses integrated into main, pending human release approval. Their course chains and progression are in [architecture](ARCHITECTURE.md#session-devices-and-replay).

## Now

### Integrate and review the work already in flight

- [ ] **Delete the obsolete developer launcher later (user request, 2026-11-02):** retire the old title/launch panel in `src/ui/index.js`, its launcher/title-panel styles in `src/ui/style.css`, and the legacy tool-entry routing in `src/frontend/index.js` (`capture`, `review`, `test=jump`). Move any necessary test entry controls to the current frontend first. Preserve the shared racing HUD, pause/input controls and current frontend; `src/ui/index.js` and its stylesheet also own active gameplay UI.

- [ ] Review the nine-course menu, sequential unlocks and unified 37-notch collection. Founders/Frontier/Horizon open the first Freestyle/Eliminator/Interceptor course; full Freestyle finishes and combat-mode wins open successors. Validate the full-game policy and borrowed assets without changing the four-item demo or original championship/item requirements.
- [ ] Human playtest Eliminator cut pressure, Interceptor pursuit/boss balance and Freestyle torque, catches, five-transfer scoring and medals before production expansion or new mastery rewards.
- [ ] **Mode-course presentation:** human review of Oriel Sunvault, Ravel Sailbreak, Glasswake Fracture, Saffron Ossuary and Nomad Last Convoy, including native world identity, clearances, rendering cost and current menu stills. Preserve Skywell and the three Interceptor encounters; completed critic loops remain closed.
- [ ] Observe external players: braking/boost comprehension, finishing without coaching and voluntary replay. Separate control confusion, route readability, performance and difficulty before adding mechanics.
- [ ] Playtest navigation across the whole game at windowed, fullscreen and ultrawide sizes. Refine grouping, D-pad/arrow movement, visible focus, scroll/focus retention and Back/Resume paths through setup, cups, records, Settings and inspection. Existing keyboard/controller coverage does not close this dedicated UX review.
- [ ] **Mid-cup navigation and Resume:** selecting Back to cup hub during a race currently stops the race. Return to race setup with the active cup race suspended and Resume race available across all menu screens. Also cover Esc → Settings → main UI: Resume currently appears only on Settings and disappears when navigating elsewhere.
- [ ] **Whole-game copy review:** review all in-game and menu strings/labels for clarity, consistent terminology and accuracy.

### Performance, devices and release readiness

- [ ] **Course FPS drops:** investigate significant frame-rate drops in parts of Worldspire and Nightweir, and at the beginning of Umbra.
- [ ] Scope a genuinely cheaper mobile graphics tier; consider calling today's Low Medium. Reduce whole-scene geometry, texture memory, shaders, render targets and decorative effects, beyond pickup FX alone.
- [ ] Investigate the reported iPhone 13 graphics-context loss after Halcyon's countdown on a physical device. Test loading, countdown and sustained full-field racing before choosing the mobile default; the error alone does not identify the cause.
- [ ] Finish hands-on phone/tablet and physical-gamepad driving checks: long flights, two-thumb ergonomics, mappings and responsive HUD/cameras. Browser emulation is not a per-device or per-level driving pass; the user's separate widening-campaign mobile review remains open.
- [ ] Profile startup, frame pacing and memory on representative hardware, including the outstanding M1 pass. Earlier transmission removal, texture compression and targeted rendering fixes do not close this work.
- [ ] Keep Vector boost-strip chevrons readable in Low: the yellow markings currently collapse into dark rectangles in matched Freestyle and Glasswake Fracture views.
- [ ] Move the game and desktop CI into a private repository when ready; decide what remains publicly playable. Complete the remaining hardware, distribution and store gates in the [release checklist](docs/steam/release.md).

### Known course follow-ups

- [ ] **Worldspire road/camera bumps:** investigate bumpy camera shifts on some road sections, resembling the previously fixed road-following issue.
- [ ] **Zephyr:** human review of the reported extra turn-assistance feel at the early right bend beneath the stone cross-span, before the first waterfall boost strip (2026-10-17 reference: lap 1, 00:07.300, 396 km/h). Production-collider yaw and camera checks do not reproduce extra assistance; preserve the approved 0.3 setting.

## Code quality and maintenance

Remaining audit work; original item numbers are retained. Prefer bounded shared-utility extractions, then a two-adapter runtime-wrapper trial before broad session/navigation or collision changes. Preserve approved handling, save/replay compatibility, deterministic stepping, resource ownership and desktop edition boundaries.

- [ ] **Session/navigation ownership (#5):** give pause, resume, results, inspection, cancellation and focus transitions explicit owners in `src/frontend/index.js` and `src/core/game.js`. Build on the existing results coordinator and owned simulation checkpoints; keep frontend navigation separate from scene/resource ownership. Migrate one transition at a time.
- [ ] **Legacy launcher and inspection retirement (#6; requested 2026-11-02):** move remaining `capture`, `review` and `test=jump` tooling consumers to the current frontend before removing the old title/launch panel, inspection branch and related routing/styles. Preserve the shared racing HUD and pause/input controls still owned by `src/ui/index.js` and `src/ui/style.css`.
- [ ] **Explicit collision metadata (#8):** replace art-name/UV assumptions with explicit solid roles and route-coordinate meanings. Distinguish broad ownership intervals from actual face coverage; migrate one level first while preserving collider geometry, triangle order, fingerprints and replay identities.
- [ ] **Shared staged-runtime wrappers (#9):** consolidate repeated before/after-step capture, pending guards, reset and restore sequencing, starting with Glasswake and Zephyr. Keep local hazards, per-substep behavior and moving-world clocks level-owned; verify tick/replay parity before adding other adapters.
- [ ] **CSS scoping and tokens (#10, remaining work):** scope broader frontend/HUD rules and give intentional color roles distinct token names. Entry palette tokens are already scoped. Preserve current computed styles, focus states and layouts while removing global token/specificity collisions.
- [ ] **Shader composition (#11, remaining work):** extend the existing checked-anchor helper into shared patch composition and cache-key handling where implementations truly match. Anchor assertions are complete; preserve shader output and validate program-cache behavior and affected visuals before migrating materials.
- [ ] **Shared cross-level utilities (#12, remaining work):** move proven material primitives, texture loaders and clocks out of individual levels into named shared modules. HTML escaping, matching LCG streams and default scenario construction are already shared. Keep world composition, differing algorithms, asset provenance and package content ownership local.
- [ ] **One completion overlay shell:** consolidate duplicated boot/loading, failure, credits and focus handling in `src/frontend/index.js` and `src/frontend/completion-cinematic.js`. Preserve eager loading feedback, cancellation/retry, saved completion acknowledgement and keyboard/controller focus return.

## Next

### Gameplay and progression

- [ ] **Cup run history:** design persistent completed-run records separately from the active championship. Explore showing the three best runs beneath a cup's map list; decide ranking, difficulty/ship details, ties, storage limits and save transfer before implementation. Finished cups currently show final standings, then clear when the player returns to setup or selection; earned rewards and trophies remain.
- [ ] **Sidegrades:** prototype one weapon variant and, if useful, one propulsion specialization. Define meaningful tradeoffs, slots/cooldowns, unlocks, counterplay and complete icon/VFX/audio presentation before growing the catalogue.
- [ ] Revisit or replace Magnetic Stabilizer if its four-second air-steering/drift assist cannot justify a distinct equipment role. Preserve stock controls and stock-build course completability.
- [ ] **Carve:** prove sustained slides and clean exits on a short banked section before authoring a course. Define useful forward-travel scoring, anti-farming and fixed-build versus career-build record rules.
- [ ] **Escape:** prove visible pursuit pressure, warnings, fair failure/recovery and a supported destination in one suitable existing biome before expanding the route. Spectacle events alone are not pursuing game rules.
- [ ] **Pilot rank:** design persistent career XP from valid races, cups and clean trials, separate from ship enhancements. Set the curve, repeat-event rules, display, demo continuity and possible titles/badges/cosmetics; keep performance rewards tied to racing achievements.
- [ ] **Jump shortcuts:** define deliberate transfers onto another supported road chunk, including lap seams, with explicit checkpoint credit and recovery grace. Current Jump uses the nearby receiving corridor; skipped checkpoints cannot be silently awarded.
- [ ] **Recharge experiment:** try two recharge stretches and two immediate 25-point cells on Halcyon, capped at 100 reserve. Use slower/wider lines, retain passive regeneration while tuning, and reset per racer/lap with forward-crossing anti-farming rules. Preserve pickup frequency and overlapping combat; expand only after review.
- [ ] Human balance review of weapon frequency, shields and pack spacing, especially long sprints and fully upgraded builds. Include equipment combinations, upgrade ratios, cooldowns and reward pacing.
- [ ] Broaden static collision coverage where driving reveals missing scenery contacts outside current deck/jump corridors. Add sparks for actual contacts and consider bounded scrape marks; the shared physical racer-contact system already exists.

### Worlds, effects and presentation

- [ ] **Oriel:** compose the remaining broad shell slopes and serial middle-distance town rows into larger agricultural/civic districts. Preserve the completed winding route and garden corkscrew, the two composed waterfront quarters, all-sided civic galleries, connected contour grove and warm axial daylight. The latest completed art pass does not authorize reopening its critic loop.

- [ ] **Nomad:** run the deferred fresh art-pass after the downhill/1,500 km/h revision, including a High-quality rendering-cost pass before adding visual density.
- [ ] **Worldkit weather/VFX unification:** consolidate the reusable parts of [Glasswake's local snow/gust layers](src/levels/glasswake/weather/index.js) and [Nomad's wheel-salt wakes](src/levels/nomad/dust.js) with the public [Worldkit weather package](../../worldkit/modules/weather/README.md). Share seeded GPU particles, wind/turbulence, fading/culling, quality budgets and resource ownership through public APIs; keep wheel-contact history, moving/stacked surfaces and racing exclusions level-owned. Match High/Low appearance, pause/seek behavior and frame cost before migrating either consumer; the current static precipitation/cover field is not a direct moving-wheel emitter.
- [ ] Human driving review of Worldspire and Nightweir, including their jumps, corkscrews, distance-linked Awakening/Floodgates events and braking runouts. Production implementation does not close that review.
- [ ] Review Saffron surroundings/clearance against its canonical 40 m roadway. Scope Umbra's adjacent scenery, supports and observatory against its canonical 35 m roadway.
- [ ] **Cindercoil:** add player-facing lava-contact flames and lingering ship/HUD smoke or heat feedback. Crater-spill glow and road-contact smoke exist; reuse suitable Helion effects.
- [ ] **Colossus:** after human review, subordinate the gantry's tall support forest, strengthen the return district's dominant machinery and develop enamel/foundation form shading. The completed broad pass did not earn AAA approval; small machinery detail remains later work.
- [ ] Fit Arc attachments, projectile origins and surrounding pickup effects to every fleet/rival hull. Review offsets, spread and scale in the desktop developer inspector and gameplay without changing shared timing or combat rules.
- [ ] **Halcyon:** explore closer buildings, street-canyon scale and grounded city infrastructure. Its asphalt pass is complete; a world/route change needs its own scope.
- [ ] **Nacre:** develop storm-ocean wave scale, layered crests, foam and water lighting while preserving road/jump readability, underwater racing and approved flight behavior. Ceramic surfacing and the flush-panel ride fix already exist.
- [ ] Reassess Umbra's road-finish direction and older graphite/metal, masonry, recessed-lighting and arrival-framing requests against current visuals before assigning another pass.
- [ ] Reassess optional Zephyr waterfall/island/masonry polish and Saffron bone erosion, creature armor, sandfall and ordinary scenery. These are retained directions, not permission to resume completed critic loops.
- [ ] Capture landmark-focused menu stills such as Nacre's leviathan and Cindercoil's lava. Save poses and event timing using the existing [preview workflow](ARCHITECTURE.md#circuit-preview-refresh); ordinary ship-free previews exist.
- [ ] Plan actual 3D hull enhancements and mounted equipment with user art direction. Start from the [attachment concepts](assets/rewards/icons-v2/), define per-hull hardpoints, scale and clearance, and preserve fleet silhouettes; current icons/notches/effects are prototypes for this model work.

## Later

### Optional systems and content

- [ ] **Further biome reuse:** review the authored Sunvault/Sailbreak/Last Convoy siblings before assigning more modes to Oriel, Ravel or Nomad. Keep the original racing courses behind 37/37 and mode variants on their cup/course chains. Future combinations need distinct pacing and clearance, not a mandatory mode trio.

- [ ] Expand only the successful event/world combinations into selected sibling routes. Extract proven reusable art into Worldkit when those routes need it; there is no per-biome mode quota.
- [ ] Consider themed championships or specialist series after measuring event duration and difficulty. Define compatible scoring/save identities and finite reward requirements; keep the original cups stable rather than automatically expanding them.
- [ ] **Assault:** prove readable moving targets, vulnerable systems and encounter states after weapon expansion. Redline's escalating speed/heat management remains a parked idea.
- [ ] Consider briefings and a dedicated podium presentation, or a field larger than ten racers after measuring performance and independent finishes.
- [ ] Consider badges, cosmetics, titles, difficulty milestones and build/loadout codes after progression playtests. Further offensive devices, side attacks, destructive ship damage, online systems, procedural tracks and a consumable economy each need separate scope.
- [ ] Consider bronze/silver/gold mastery targets and clearer sector improvement. Prototype perceived speed through camera/FOV, nearby geometry, audio and frame pacing before propulsion changes; preserve approved handling and 0.3 assistance outside an assigned experiment.
- [ ] Optionally prove a forward/cockpit view with real-state instruments on one ship, checking banks, inversions, flight, clipping and motion comfort before interiors. Story, open-world and manual-aiming directions remain separate proposals.
- [ ] Revisit the Umbra gravity-lens arrow that can imply steering toward the pull when the player must counter-steer.

### Audio, authoring and tools

- [ ] Expand beyond the eight-song pool only if useful; the earlier target was roughly sixteen. Finalize circuit assignments, race mix and audible loop transitions with the user. Blue Hour is tagged for Halcyon; seven tracks remain general mix auditions.
- [ ] Optionally package the existing prompt → sequential render → Tunes audition → human-feedback process as an audio-generation Skill. Reuse its guide, provenance and one-current-take rules.
- [ ] Resume Kestrel photorealism only as a separate authoring pass: matched Blender/Three.js baselines, then a visible improvement on one assembly before fleet rollout. Follow the [ship workflow](assets/ships/README.md#visual-improvement-workflow); the shipped finish does not prove export degradation or photorealism.
