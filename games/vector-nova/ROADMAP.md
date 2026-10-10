# VECTOR//NOVA roadmap

## Completed

- [x] Gate 1: establish the Kestrel silhouette and playable anti-gravity prototype.
- [x] Gate 2: finish Halcyon Speedway, correct steering/slope handling and retain 0.3 bend assistance.
- [x] Gate 3: finish Asterion Orbital, its open lattice raceway, shipyard and planet/stellar backdrop.
- [x] Gate 4.1: integrate Nacre Tempest, submerged racing, two real jumps, timed recovery and the leviathan.
- [x] Gate 4.2: integrate Halcyon's automatic Vector catapults and Aegis shields, feedback and deterministic replay rules.
- [x] Shared level foundation: add the circuit picker, lazy discovery, owned lifecycle, geometry helpers and common verification.
- [x] Vesper Canopy: merge the hollow-tree/resin circuit, crown jumps, sap surfaces and connected forest.
- [x] Glasswake Comet: merge crystal/frost driving, fracture jumps, the crevice corkscrew, shelf collapses and snow presentation.
- [x] Cindercoil: merge the volcanic circuit, lava surges/spill, furnace roll, vent flight and ash/heat presentation.
- [x] Saffron Leviathan: merge skull traversal, vertebral flights, migrating sand/glass choices, burrower and sandfall presentation.
- [x] Helion Flare: integrate flare-lane evasion, furnace/cooling choices, physical shelter, optional covered jumps and two timed stellar prominences.
- [x] Umbra Fold: integrate tidal line control, curved flights, continuous accretion, the enormous consumption event and the selected native sky.
- [x] Zephyr Basilica: integrate cathedral traversal, waterfall flights and wetness, falling architecture, cloud ascent and shared racing.
- [x] Gate 5 initial flow: add audible start lights, two-lap timing/results, continued driving and retained paddock results.
- [x] Gate 6 initial opponents: add Rook/Latch/Mule using actual physics/devices, a 2×2 grid and Easy/Medium/Hard difficulty.
- [x] Gate 8 fleet: add Kestrel/Shrike/Bastion/Needle, distinct handling, saved selection/stats and fleet/rival inspection.
- [x] Shared inspection: add free-camera navigation and responsive driving/review controls across circuits.
- [x] Halcyon feedback: add position/lap timing, full-field relative race gaps, matching rival colors and catapults toward 600 km/h with strong launch blur.
- [x] Asset layout: normalize Halcyon/Orbital/Nacre folders and base-aware loading; prune obsolete served models and duplicate rival GLBs while retaining sources/provenance.
- [x] Shared racing graduation: reuse Vector/Aegis, 600 km/h launch feedback, three physical rivals, difficulty, timing/results and replay on Halcyon/Orbital/Nacre/Vesper/Glasswake/Cindercoil/Saffron/Umbra/Helion/Zephyr.
- [x] Nacre immersion: blend the entire sound mix underwater and restore it smoothly on exit; add pooled bubbles at actual submerged takeoff, flight and landing.
- [x] Shared world contact: separate swept hull contact from landing acceptance; enable Saffron ramp/terrain/fossil impacts, bounded colliding recovery, deterministic replay and the untimed `?test=jump` scene.
- [x] Opt-in Rapier flight: stage the player and rivals into one shared engine tick; give Saffron airborne/recovery contact angular response while preserving grounded handling, session replay snapshots and static-only racer filters.

## Remaining gameplay

Agree each phase's scope before implementation; scoped independent critique ends with human review.

### Level polish

- [ ] Zephyr: refine aerated waterfall flow, vary broad island shelves and openings, and deepen close masonry weathering.

- [ ] Umbra: distinguish graphite wear and titanium polish/reflections, enrich fractured masonry and layered repair construction, reveal recessed surfaces under local lighting, bring the elevated jump preview and first arrival closer to normal chase, and strengthen the Fold’s visible start-grid reference.

- [ ] Saffron: deepen bone erosion and fracture variation, sharpen creature armor response, enrich sandfall volume and ordinary scenery and optimize high-resolution material/postprocessing cost.

- [ ] Detached crash camera: prioritize before the lava feedback, soundtracks, podium and menu passes below. When the ship flies off after a missed jump, detach the chase camera and frame the crash from a stable viewpoint so the player can watch the impact and bouncing without the camera inheriting that motion; blend back to normal chase on recovery.
- [ ] Cindercoil: add the missing lava road flames and HUD/ship smoke when driving over lava, reusing Helion's effects through shared helpers where appropriate.
- [ ] Gameplay soundtracks: grow the audition pool toward roughly 16 distinct songs, then finish one gameplay track per circuit, including mix/loop delivery and race playback. Use the [audio guide and Halcyon direction](docs/audio/README.md).
- [ ] Audio generation Skill: package the proven prompt → sequential local render → Tunes audition → human feedback workflow. Reference the audio guide and scripts; carry the musical motivations, metadata/provenance updates and one-current-take cleanup rules without duplicating docs or collecting iteration evidence.
- [ ] Author collision worlds for additional circuits and broader static Saffron scenery; propagate actual contact sparks as they opt in and explore bounded scrape marks. Keep racer body contact separate.
- [ ] Halcyon: fix remaining ground flicker, especially white areas and street-lane markings.
- [ ] Asterion: locate and fix the reported flickering road section.

### Gate 5: broader race flow

- [ ] Scope briefing, sector splits and persistent personal records separately from the completed shared two-lap flow.
- [ ] Design a podium-style race ending. Decide whether it replaces post-finish free driving immediately or follows a few seconds of driving while slowing toward a minimum of 200 km/h before the podium. Keep the current finish flow until the replacement is designed.

### Gate 6: opponents and competitive Quick Race

- [ ] Expand toward player plus 11 rivals; verify independent finishes and actual performance.
- [ ] Add restrained body contact with cooldowns, without sustained rail pinning or repeated damage from one contact.

### Gate 7: energy choices and Time Trial

- [ ] Try two recharge stretches and two immediate 25-point cells on Halcyon, capped at 100 reserve. Place recharge on slower/wider lines; retain passive regeneration while tuning. Reset eligibility per racer/lap using forward crossings and anti-farming; expand only after review.
- [ ] Add a deterministic three-lap solo Time Trial with a local non-colliding ghost, sector deltas and instant retry. Use fixed initial state, manual boost/regeneration and disabled road devices; separate circuit/ship/rules records and reject incompatible ghosts. Automatic failed-jump recovery remains valid with elapsed-time loss.

### Gate 8: cups and front end

- [ ] Loading screens: design two variants, one for initial startup and one for transitions between levels. Presentation and content TBD; consider keeping Tunes visible and music uninterrupted during level transitions.
- [ ] Give the paddock, level picker and overall menu flow a cohesive game-ready UI pass. Start with mode selection, such as **Championship** versus **Solo**, with level selection inside Solo; design the final mode/ship/circuit/launch flow before implementation. Retain ship stats, saved choices and Inspect Ships; each step should fit without scrolling.
- [ ] Carry shared ship selection into future race modes and add a Founders Cup over Halcyon/Asterion/Nacre. Proposed 12-place points: 25/20/16/13/11/9/7/5/4/3/2/1; ties by wins, then total time. Save between races with restart/abandon controls.
- [ ] Connect Quick Race, Cup and Time Trial to working actions; rewards unlock cosmetics rather than stronger stats. Retain completed content in Practice/Quick Race.

## Deferred

- [ ] Umbra gravity lens: revisit the arrow cue, which suggests steering toward the gravitational pull even though the player must counter-steer.

Stored/manual-use items, offensive pickups, side attacks, destructive damage/elimination, online systems, upgrade economies, procedural tracks and the industrial energy complex require separate scope. Quality and a complete racing loop take priority over map count.
