# VECTOR//NOVA roadmap

Reviewed against `main` and the current source on **2026-10-11**. Implemented means the feature is in the game; it does not imply a new visual review or physical-device test. Open items are a backlog for future assignment, not instructions to restart completed art or critic campaigns.

## Next work, in order

Prioritize these milestones ahead of the remaining backlog. Build enough UI to play and verify each mode as it lands; use that experience to guide the full UI revamp in step 6. The four cups below cover all fourteen current tracks once, with sprints introduced in the later cups.

1. [x] **Time Trials, ghost and saved bests.** Build deterministic solo circuit lap chasing with unlimited laps and separate standing/flying bests with a local non-colliding personal ghost, sector deltas, persistent best times and instant retry. Use a fixed initial state, manual boost/regeneration and disabled road devices; automatic failed-jump recovery remains valid with elapsed-time loss. Separate records by track, ship and rules, and define compatible ghost storage/playback rather than treating developer input logs as a finished player feature. Define corresponding point-to-point rules for downhill sprints. Save each clean best lap immediately and replay it from the next lap; make completions and improvements clear.
2. [x] **Cup, clear results and easy retries.** Build one complete Founders Cup over Halcyon → Asterion → Nacre, carrying ship selection between races and saving progress. Define scoring for the current ten-racer field; retain wins then total time as the proposed tie-break order. Show race results, cumulative standings and a clear final cup result. Provide predictable continue, retry/restart, resume and abandon controls with explicit effects on standings and saved progress. Reuse the timing/results foundation from Time Trials and validate one complete cup before adding more.
3. [x] **Frontier Cup.** Add Vesper Forest → Glasswake Comet → Cindercoil: a second three-race circuit cup moving from easier routes into a medium course. Reuse the proven cup scoring, saved progress, results and retry flow.
4. [x] **Horizon Cup.** Add Saffron Leviathan → Zephyr Basilica → Shatterline (sprint): two medium circuits followed by the first downhill finale. Verify the transition from lap races to a single descent, keeping placement points consistent across event formats.
5. [x] **Apex Cup.** Add Worldspire (sprint) → Helion Flare → Nightweir (sprint) → Umbra Fold → Colossus Works: a five-event finale with two descents and three harder circuits. Reuse the same cup rules and validate resume/retry across both formats.
6. [x] **UI revamp around the working modes.** Once Time Trials and all four cups are playable, design the menu, setup, records and results flows around their actual needs. Make mode selection and return/retry paths consistent while retaining Quick Race and Practice. Preserve keyboard and touch navigation. Choose the final layout after using both modes; avoid committing to a speculative menu design first.

## Menu navigation

- [ ] **Redesign navigation for large/fullscreen menus across the whole game.** The current wide layout is difficult to navigate. Rework grouping, predictable D-pad/arrow movement between sections, visible focus, scroll/focus retention and Back/Resume paths for setup, cups, records, Settings and the inspector. Validate complete keyboard/controller flows at windowed, fullscreen and ultrawide sizes, and preserve browser/touch access. This is shared game UX, not a Steam-only redesign; choose the layout through a dedicated playtest pass.

## Implemented

- [x] Fourteen worlds: Halcyon Speedway, Asterion Orbital, Nacre Tempest, Vesper Forest, Glasswake Comet, Cindercoil, Saffron Leviathan, Umbra Fold, Helion Flare, Zephyr Basilica, Shatterline, Worldspire, Nightweir and Colossus Works, with their course-owned scenery, surfaces, hazards and events.
- [x] Shared racing: the player plus nine distinct rival chassis, physical rival motion, Vector boost strips, Aegis shields, countdown, two-lap races or solo practice, relative gaps, finish beat/results, retry and continued driving. Easy/Medium/Hard have been made faster; all difficulties receive the full strip boost. Difficulty can be changed from pause for the next restart.
- [x] Shatterline: a 21.1 km point-to-point sprint with twelve jumps, three approximately five-second flights, a double Service Corkscrew, Avalanche Sweep and Scissor Dive. Overturn Weave includes two freely drivable 360° tubes with real surface handling, collision, camera support and forgiving exits. The old level/tunnel construction tasks are complete.
- [x] Canonical Saffron Leviathan uses the 40 m roadway; Umbra Fold uses the 35 m roadway.
- [x] Fleet: Kestrel, Shrike, Bastion and Needle, distinct handling, selection/stats, real-model preview and inspection. Fitted construction, clean ceramic/composite/metal finishes, studio lighting and managed KTX2 textures are implemented; further photorealism is a separate deferred pass.
- [x] Shared flight/contact: real airborne motion, swept hull contacts, bounded recovery and detached crash camera. All production races share a game-owned movement controller using Rapier collision queries, with magnetic support and physical racer shoves/yaw. Landing transitions now carry speed without the old settling slowdown; manual boost also works in flight and consumes reserve.
- [x] Front end: desktop race setup and narrow-screen accordions, cached circuit stills, fleet preloading, deferred world loading, progress UI, live results and retained Circuits → Resume sessions. Start stays beside Resume above narrow-screen accordions.
- [x] HUD/input polish: remove mid-screen gameplay callouts across all circuits; keep art controls in Dev tools; lead the desktop legend with Shift Boost. Mobile Tunes collapses to a logo-aligned button. Two-thumb touch controls combine steering/airbrake on the left and Boost + Go/Go/Neutral/Brake on the right, with release/pause/focus cleanup.
- [x] Music and publishing: local generation/audition workflow, eight playable songs, 192 kbps MP3 delivery and GitHub Actions/Pages deployment. Start race/practice starts music unless manually paused; ordinary menu clicks do not. Initial-arrival/first-click autoplay is no longer planned.
- [x] Surface passes: Halcyon asphalt, Asterion alloy, Nacre ceramic, Glasswake crystal relief, Cindercoil fired ceramic, Helion tiles, Saffron Leviathan fused glass/sand, Zephyr weave refinements and Shatterline asphalt decks. See the [road finish index](docs/expansion/roads/README.md) before reusing an older brief.
- [x] Targeted performance/render fixes: Vesper Forest/Glasswake physical-transmission removal, fleet texture compression, live Dev tools metrics/material switches, and Halcyon's ground-underlay depth fix. These do not close the broader M1 profiling task.
- [x] Level/tooling foundation: lazy discovery, owned world/resource lifecycle, shared geometry helpers, normalized asset folders/provenance, reproducible menu captures and maintained frontend/level checks. Developer replay/scenario tooling remains; the separate AI `racersVersion` stamp was removed.

## Performance and device validation

- [ ] Introduce a substantially cheaper mobile graphics tier; consider renaming today's Low to Medium and adding a genuinely bare Low. Reduce whole-scene geometry, texture memory, shader complexity, render targets and decorative effects, beyond pickup FX alone. Investigate the reported iPhone 13 graphics-context loss after Halcyon's countdown on a physical device; the error alone does not establish the cause. Validate loading, countdown and sustained racing with a full field before choosing the mobile default.
- [ ] Finish hands-on phone/tablet and physical-gamepad driving checks, including long flights, two-thumb ergonomics and responsive HUD/camera behavior across circuits. Shared touch behavior has browser-emulation coverage; that is not a full device or per-level driving pass. The user's separate mobile review of the widening campaign remains outstanding.

## Level work

- [x] **Colossus Works.** Ship the approved 9.43 km Hard factory circuit in [the level brief](docs/levels/colossus.md), with physical ejectors, factory machinery and curved-surface markings/devices. Flat working surfaces preserve the major banks, reversing wall rolls, climbs/dives and three transfers. Faster presses/ejectors have deliberate-hit coverage and bounded crush response. Sixteen further broad gameplay/free-camera critique rounds added connected quarry cuts, steel/enamel textures, deep factory assemblies and lighting refinement.
- [ ] Further Colossus art refinement after human review: subordinate the tall support forest around the gantry, strengthen the return district’s dominant machinery and develop large enamel/foundation form shading. The sixteen-round broad pass improved construction and materials but did not earn AAA approval; small machinery detail remains a later pass.

- [ ] Resolve small on-road vertical bob on Nightweir’s broad banked panels. The two-triangle cross-sections introduce physical diagonal ridges; revisit tessellation together with road seals, pickup projection and other two-vertex-row consumers. A shared solution must preserve collision-query performance. Do not add map-specific hover offsets or smooth the ship through solid road. Countdown/reset placement is handled separately by the shared controller.

- [ ] Investigate the extra turn-assistance feel reported in Zephyr on 2026-10-17: the early right bend beneath the stone cross-span, approaching the boost strip before the first waterfall jump (reference HUD: lap 1, 00:07.300, 396 km/h). The shared 0.3 curvature assistance is present; additional bend-specific behavior is unconfirmed. Compare neutral-input yaw, road banking/support transport and camera motion before proposing a handling change. Deferred from the query-controller/FPS pass; preserve the approved assistance until reviewed with the user.

- [ ] Human driving review of [Worldspire](docs/levels/worldspire.md) and [Nightweir](docs/levels/nightweir.md): compact 13.1 km and 12.4 km races, nine/eight jumps, three corkscrews each, distinct textured edges and distance-linked Awakening/Floodgates events. Both include a 650 m braking runout and are authorized for production completion.

- [ ] Review [Saffron surroundings](docs/expansion/saffron.md) against the canonical 40 m roadway and address confirmed clearance issues.
- [ ] Investigate Vesper Forest's existing Bloomspan inversion regression at lateral −8 m and 112 m/s in `tools/vesper-forest-magnetic.test.mjs`. It reports an incomplete traversal on both the original and lowered Crown-receiver routes; distinguish a traversal problem from the test's time budget. Crown landing and full rival races pass separately.
- [ ] Scope Umbra Fold’s adjacent scenery/support/observatory refit against the canonical 35 m roadway.
- [ ] Cindercoil: add player-facing lava-contact flames and lingering ship/HUD smoke or heat feedback. The existing crater-spill glow and road-contact smoke are already implemented; reuse Helion's effects where appropriate.
- [ ] Reproduce any remaining Halcyon white-ground/lane-marking flicker and Asterion road flicker on the current build before changing them. Halcyon's underlay depth fix and both circuits' subsequent road finishes have shipped; the older reports are not confirmed current defects.
- [ ] Broaden static collision coverage where driving exposes missing contacts, especially scenery outside the existing deck/jump corridors. Many circuits already have collision worlds; this is not a from-scratch all-level rollout. Add contact sparks with actual contacts and consider bounded scrape marks. Racer body contact is separate below.

## Further art passes

- [ ] **Fit effect visuals per ship.** Arc rod/discharge origins currently suit Kestrel but intersect or float away from other hulls. Tune attachment points, offsets, spread and scale for each fleet and rival chassis, including projectile origins and surrounding pickup effects. Review in the `dev=1` ship inspector and gameplay; preserve shared effect timing and combat rules. Deferred until a dedicated visual pass.
- [ ] Halcyon: explore closer buildings, street-canyon scale and grounded city infrastructure with closer circuit-level composition. The asphalt pass is complete; a world/route change needs its own scope.
- [ ] Nacre: improve storm-ocean wave scale, layered crests, foam and water lighting with the approved ocean/storm direction. Preserve road/jump readability, underwater racing and approved flight behavior; the ceramic road finish is already implemented.
- [ ] Umbra Fold: the dedicated [road finish brief](docs/expansion/roads/umbra.md) remains available for assignment. Reassess older requests for graphite/metal separation, masonry repairs, recessed lighting, closer jump/arrival framing and the Fold's start-grid reference against the current source before defining another pass; previous Umbra construction/material/lighting passes already exist.
- [ ] Reassess older optional polish notes against current visuals: Zephyr's aerated waterfalls, varied island shelves/openings and close masonry; Saffron Leviathan's bone erosion, creature armor, sandfall volume and ordinary scenery. These are retained art directions, not freshly verified defects or permission to resume completed critique loops.
- [ ] Author landmark-focused circuit menu stills: Nacre's leviathan, Cindercoil's lava and equivalent signature vistas. Save camera poses and event timing for the existing [capture workflow](ARCHITECTURE.md#circuit-preview-refresh); ordinary ship-free previews already exist.

## Audio

- [x] Replace lap/final-lap and race-complete audio with modern synth cues shared by gameplay and Sounds. Preserve the original countdown/GO and each finish tail through results.
- [ ] Continue from the existing eight-song pool if more variety is wanted; the earlier target was roughly 16. Choose/finalize circuit assignments, race mix and audible loop transitions with the user. Blue Hour is tagged for Halcyon; the other seven tracks remain general `mix` auditions. Playback, encoding and deployment already work. See the [audio guide](docs/audio/README.md).
- [ ] Optionally package the proven prompt → sequential render → Tunes audition → human-feedback process as an audio-generation Skill. Reuse the guide/scripts, provenance and one-current-take rules; do not create a second workflow or evidence archive.

## Future race modes and systems

- [ ] **Event types, sidegrades and world reuse.** Use the [connected design notes](docs/level-types-and-rewards.md) for the event/reward matrix and proposed order: a small sidegrade batch with an Eliminator pilot, then Carve and Escape proofs; selected biome siblings and curated series follow successful pilots. Freestyle remains a candidate and Assault comes later. Next implementation is undecided; existing cups do not automatically expand with the catalogue.
- [ ] **Revisit or replace Magnetic Stabilizer.** Its four-second air-steering and sideways-drift assist currently feels too niche to justify an equipment slot outside occasional landing/recovery situations. Assess a more useful, distinct role during sidegrade playtests; rework or replace it if that role does not emerge. Preserve the stock controls and courses' stock-build completability.

- [x] Full pickup coverage across all production maps: Vector, Aegis, Repulsor, Arc and Ion, with circuit-owned optional lanes, shield counterplay and jump/recovery clearance. Preserve independent per-racer collection, rival avoidance and deterministic combat/replay.
- [ ] Human race-balance pass on the full pickup layouts: tune weapon frequency and shield availability against real pack spacing, especially on long sprints. Include equipment combinations and fully upgraded player builds.

- [ ] Consider briefings and a podium presentation after the prioritized modes and results flows are complete.
- [ ] Consider expansion beyond the delivered ten-racer field only after measuring performance and independent finishes.
- [x] Add shared physical ship contact, strong magnetic attachment, yaw response and contact feedback cooldowns.
- [ ] Prototype two recharge stretches and two immediate 25-point cells on Halcyon, capped at 100 reserve. Put recharge on slower/wider lines, retain passive regeneration while tuning, and reset eligibility per racer/lap with forward-crossing anti-farming rules. Expand only after review.
- [x] **Rewards experiment.** Persistent finish/placement progression with immediate first-finish speed, hero reward badges and results progress, ordered cup ship unlocks, six equipped abilities alongside road pickups, Quad Core, two-map Time Trial milestones, shared garage/inspector notches, save transfer and browser-only progression/finish shortcuts. Balance remains subject to human play; starting ship performance and AI tuning are unchanged.
- [x] **Demo rewards.** Speed I after one valid race finish, Jump Drive after three, Deflector plus the trophy for winning the Demo Cup, and Boost I for a clean Time Trial record. Two equipment slots; earned progress transfers to the full game through save export/import.
- [ ] **Player leveling / pilot rank.** Add persistent career XP from valid races, cups and clean Time Trials, separate from ship enhancement tiers. Define the XP curve, repeat-event rules and rank display first; consider titles, badges and cosmetics at rank milestones. Keep performance rewards tied to racing achievements rather than level gates, and plan demo-to-full rank continuity. No leveling implementation yet.
- [x] **Dedicated Garage.** User-approved Race/Garage tabs retain race setup while the Garage combines ship selection, a live model, enhancement notches and inline equipment. Two items per hull; Quad Core allows four on one hull. The advanced model inspector has a separate Race-screen button in browser developer modes (`?dev=1` or `?dev=2`).
- [ ] **Jump shortcuts across road chunks.** Allow deliberate leaps onto another supported part of a circuit, including lap-seam cases, with explicit checkpoint/shortcut rules and recovery grace. Current Jump uses the nearby receiving corridor; do not silently award skipped checkpoints.
- [ ] **Actual 3D ship modifications.** Plan authored hull changes for earned enhancements and mounted equipment with user art direction. Use the generated attachment concepts in assets/rewards/icons-v2/: stat fin/thruster/gyro/brake/reservoir/armor modules, underside Jump pods and rail-mounted Lance. Define per-hull hardpoints, scale and clearance before authoring meshes; preserve the fleet silhouettes. Current icons, glowing stat notches and runtime effects are the prototype; Blender/model work is deferred.
- [ ] **Progression balance and later rewards.** Human play review of upgrade ratios, cooldowns and reward pacing. Consider badges, cosmetics, titles and difficulty milestones; any track recharge experiment must preserve the current pickup frequency and overlapping combat. Build/loadout codes remain optional follow-up.

## Publishing

- [ ] **Move Vector Nova into its own private repository when ready.** Preserve local/browser builds, move desktop CI with the game, and decide what remains publicly playable on the web. Track the migration in the [release checklist](docs/steam/release.md#repository-and-distribution).

## Tooling follow-up

- [ ] Consolidate the compatibility developer launcher into dedicated tool views after migrating its consumers. Preserve jump-test cases/reset/step/launch, shape review and ship/rival inspection. Direct art-pass/inspection links and maintained frontend/level checks already exist.
- [ ] Migrate or retire historical browser harnesses against the current shell/session lifecycle, including old mobile scripts that still target the removed driving-button row. Preserve useful physics/scenario assertions; use the supported commands in [tools/README.md](tools/README.md). Temporary scratch cleanup is routine ownership work under AGENTS.md, not a new product milestone.

## Deferred

- [ ] Kestrel photorealism comparison and further authoring: paused while publishing/gameplay took priority. Start with matched Blender/Three.js baselines, then prove a visible improvement on one assembly before full baking or fleet rollout. Follow the [ship visual improvement workflow](assets/ships/README.md#visual-improvement-workflow); the shipped fleet finish is not evidence of photorealism or browser export degradation.
- [ ] Umbra gravity-lens cue: revisit the arrow that can imply steering toward the pull even though the player must counter-steer.

Further offensive-device rollout, side attacks, destructive damage/elimination, online systems, procedural tracks and a consumable upgrade economy require separate scope. Quality and a complete racing loop take priority over map count.
