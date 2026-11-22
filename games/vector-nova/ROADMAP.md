# VECTOR//NOVA roadmap

Current direction updated on **2026-11-13**. Remaining work covers hardware validation, release integration, code maintenance and presentation. Completed art and critic campaigns remain closed.

## Current baseline

- Track Workshop supports direct 3D editing, seeded circuits and downhill courses up to 20 km, jumps, scenery presets, pickups and test drives. Saved tracks are playable in Quick Race, Practice and Time Trial. Time Trial keeps course-specific personal records.

- Main has seventeen racing courses, four original championships plus the unlockable Encore Cup, four playable ships and a ten-racer field. Quick Race, Practice, continuous circuit Time Trials, sprint trials, saved bests and personal ghosts are implemented. Course details and shared rules live in [architecture](ARCHITECTURE.md) and the [level API](docs/LEVEL_API.md).
- All 28 career rewards, six enhancement tracks, six equipped abilities, Quad Core, the live Garage, physical combat/contact and demo-to-full save transfer are implemented. The full collection now has 37 unlocks: those 28 items plus nine derived mode-course unlocks. Completing it opens the original Oriel, Ravel and Nomad Procession courses, Encore Cup and the Shatterline completion cinematic. Browser developer modes require `showcase=1` to preview that cinematic. The manual title screen, three named career slots, top-level navigation and shared audio controls are described in [entry and careers](docs/intro-and-profiles.md).
- Eight songs, local music/SFX generation, browser publishing and offline Electron demo/full packages exist. Startup selects Blue Hour and honors the saved startup-pause preference. See [audio](docs/audio/README.md), [desktop builds](docs/steam/desktop.md) and the [release checklist](docs/steam/release.md).
- Freestyle, Eliminator and Interceptor each have three standalone courses integrated into main and complete the planned mode additions. Their course chains and progression are in [architecture](ARCHITECTURE.md#session-devices-and-replay).

## Now

### Integrate and review the work already in flight

- [ ] Finish physical fullscreen/controller navigation acceptance. Dedicated automated windowed/ultrawide, keyboard/controller, retained-session and focus/scroll checks cover the revised frontend; physical input and display behavior still need their release pass.

### Performance, devices and release readiness

- [ ] Validate sustained foreground performance in Worldspire, Nightweir and Umbra on representative hardware after the rendering fixes; investigate any remaining slow sections. Bounded M1 Pro GPU/scene-cost regressions pass.
- [ ] Investigate the reported iPhone 13 graphics-context loss after Halcyon's countdown on a physical device. Test loading, countdown and sustained full-field racing before choosing the mobile default; the error alone does not identify the cause.
- [ ] Finish hands-on phone/tablet and physical-gamepad driving checks: long flights, two-thumb ergonomics, mappings and responsive HUD/cameras. Browser emulation is not a per-device or per-level driving pass; the user's separate widening-campaign mobile review remains open.
- [ ] Finish startup, sustained foreground frame-pacing and memory validation on representative hardware. Bounded M1 Pro native-Chrome GPU/scene-cost probes cover the rendering changes; they do not close foreground performance or physical-device acceptance.
- [ ] Move the game and desktop CI into a private repository when ready; decide what remains publicly playable. Complete the remaining hardware, distribution and store gates in the [release checklist](docs/steam/release.md).

## Code quality and maintenance

Remaining audit work; original item numbers are retained. Preserve approved handling, save/replay compatibility, deterministic stepping, resource ownership and desktop edition boundaries.

- [ ] **Explicit collision metadata (#8):** replace art-name/UV assumptions with explicit solid roles and route-coordinate meanings. Distinguish broad ownership intervals from actual face coverage; migrate one level first while preserving collider geometry, triangle order, fingerprints and replay identities.
- [ ] **One completion overlay shell:** consolidate duplicated boot/loading, failure, credits and focus handling in `src/frontend/index.js` and `src/frontend/completion-cinematic.js`. Preserve eager loading feedback, cancellation/retry, saved completion acknowledgement and keyboard/controller focus return.

## Next

### Worlds, effects and presentation

- [ ] Broaden static collision coverage where driving reveals missing scenery contacts outside current deck/jump corridors. Add sparks for actual contacts and consider bounded scrape marks; the shared physical racer-contact system already exists.
- [ ] **Worldkit weather/VFX unification:** consolidate the reusable parts of [Glasswake's local snow/gust layers](src/levels/glasswake/weather/index.js) and [Nomad's wheel-salt wakes](src/levels/nomad/dust.js) with the public [Worldkit weather package](../../worldkit/modules/weather/README.md). Share seeded GPU particles, wind/turbulence, fading/culling, quality budgets and resource ownership through public APIs; keep wheel-contact history, moving/stacked surfaces and racing exclusions level-owned. Match High/Low appearance, pause/seek behavior and frame cost before migrating either consumer; the current static precipitation/cover field is not a direct moving-wheel emitter.
- [ ] Review Saffron surroundings/clearance against its canonical 40 m roadway. Scope Umbra's adjacent scenery, supports and observatory against its canonical 35 m roadway.
- [ ] **Colossus:** after human review, subordinate the gantry's tall support forest, strengthen the return district's dominant machinery and develop enamel/foundation form shading. The completed broad pass did not earn AAA approval; small machinery detail remains later work.
- [ ] Fit Arc attachments, projectile origins and surrounding pickup effects to every fleet/rival hull. Review offsets, spread and scale in the desktop developer inspector and gameplay without changing shared timing or combat rules.
- [ ] **Halcyon:** explore closer buildings, street-canyon scale and grounded city infrastructure. Its asphalt pass is complete; a world/route change needs its own scope.
- [ ] **Nacre:** develop storm-ocean wave scale, layered crests, foam and water lighting while preserving road/jump readability, underwater racing and approved flight behavior. Ceramic surfacing and the flush-panel ride fix already exist.
- [ ] Reassess Umbra's road-finish direction and older graphite/metal, masonry, recessed-lighting and arrival-framing requests against current visuals before assigning another pass.
- [ ] Reassess optional Zephyr waterfall/island/masonry polish and Saffron bone erosion, creature armor, sandfall and ordinary scenery. These are retained directions, not permission to resume completed critic loops.
- [ ] Capture landmark-focused menu stills such as Nacre's leviathan and Cindercoil's lava. Save poses and event timing using the existing [preview workflow](ARCHITECTURE.md#circuit-preview-refresh); ordinary ship-free previews exist.
- [ ] Plan actual 3D hull enhancements and mounted equipment with user art direction. Start from the [attachment concepts](assets/rewards/icons-v2/), define per-hull hardpoints, scale and clearance, and preserve fleet silhouettes; current icons/notches/effects are prototypes for this model work.

## Later

See the [track editor roadmap](track-editor-roadmap.md) for mixed biomes, cross-biome props/hazards, selectable skies and the deferred optional trick-scoring setting.

### Optional systems and content

- [ ] Consider briefings and a dedicated podium presentation, or a field larger than ten racers after measuring performance and independent finishes.
- [ ] Consider badges, cosmetics, titles, difficulty milestones and build/loadout codes. Further offensive devices, side attacks, destructive ship damage, online systems, procedural campaign tracks and a consumable economy each need separate scope.
- [ ] Consider bronze/silver/gold mastery targets and clearer sector improvement. Prototype perceived speed through camera/FOV, nearby geometry, audio and frame pacing before propulsion changes; preserve approved handling and 0.3 assistance outside an assigned experiment.
- [ ] Optionally prove a forward/cockpit view with real-state instruments on one ship, checking banks, inversions, flight, clipping and motion comfort before interiors. Story, open-world and manual-aiming directions remain separate proposals.
- [ ] Revisit the Umbra gravity-lens arrow that can imply steering toward the pull when the player must counter-steer.

### Audio, authoring and tools

- [ ] Expand beyond the eight-song pool only if useful; the earlier target was roughly sixteen. Finalize circuit assignments, race mix and audible loop transitions with the user. Blue Hour is tagged for Halcyon; seven tracks remain general mix auditions.
- [ ] Optionally package the existing prompt → sequential render → Tunes audition → human-feedback process as an audio-generation Skill. Reuse its guide, provenance and one-current-take rules.
