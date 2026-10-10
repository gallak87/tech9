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

- [x] Front end: neutral graphite/red palette; one desktop setup screen for scrolling circuit cards, race mode/difficulty, inline ship preview and vertical stats; stacked accordion on narrower screens. Hover/arrows preview, click/Enter selects; settings includes keyboard controls.
- [x] Loading and assets: preload Kestrel then the fleet, retain parsed models, defer worlds until Start, and place quiet progress beneath the ship/loading hero. Ship previews use real models; ship-free, pulled-back circuit stills have a [repeatable refresh workflow](ARCHITECTURE.md#circuit-preview-refresh). Tunes stays anchored across menus, loading and racing.
- [x] Race/session polish: green GO lights, a shared checker finish line, finish camera beat and sound, live track-backed results, retry/continue actions, and pause → Circuits → Resume without discarding the active run. Shared settings stay synchronized. See [architecture](ARCHITECTURE.md#front-end-and-world-ownership).

- [x] Vesper performance/dev tools: remove physical resin transmission while retaining amber shading, reflections and internal detail. Free camera now has live FPS/frame-time/draw-count readouts and material switches; the wider art/performance pass remains open.

## Remaining gameplay

Agree each phase's scope before implementation; scoped independent critique ends with human review.

### Level polish

- [ ] Halcyon art pass: explore closer buildings and street-canyon scale using the [saved circuit concept](docs/levels/art-revamp-reference/circuit-wall-v1.png); preserve the approved route.
- [ ] Nacre art pass: strengthen wave scale, crests, foam and water lighting using the [saved concept](docs/levels/art-revamp-reference/circuit-wall-v1.png); preserve road/jump readability and approved water/flight behavior.
- [ ] Profile intermittent High-preset freezes on Apple M1 across the heaviest circuits and transitions before increasing art cost; distinguish CPU, shader/upload and GPU limits.
- [ ] Kestrel Blender/Three.js art pass: explore sharper construction and materials from the saved [paddock](docs/levels/art-revamp-reference/ship-paddock-v1.png) and [close-up](docs/levels/art-revamp-reference/ship-closeup-v1.png), preserving silhouette/handling and measured runtime budgets.

- [ ] Complete the [Saffron wider-circuit proof](docs/expansion/saffron.md): a separate 32 → 40 m variant, preserving the original and refitting adjacent scenery. Use the [per-level expansion process](docs/expansion/README.md); desktop-only verification, with mobile/portrait deferred to the user's final pass across all levels.

- [ ] Zephyr: refine aerated waterfall flow, vary broad island shelves and openings, and deepen close masonry weathering.

- [ ] Umbra: distinguish graphite wear and titanium polish/reflections, enrich fractured masonry and layered repair construction, reveal recessed surfaces under local lighting, bring the elevated jump preview and first arrival closer to normal chase, and strengthen the Fold’s visible start-grid reference.

- [ ] Saffron: deepen bone erosion and fracture variation, sharpen creature armor response, enrich sandfall volume and ordinary scenery and optimize high-resolution material/postprocessing cost.

- [x] Detached crash camera: confirmed misses/crashes freeze the camera position and gently pan toward the ship, then blend back to chase on landing/recovery. No trailing or zoom; existing recovery timing is preserved.
- [ ] Cindercoil: add the missing lava road flames and HUD/ship smoke when driving over lava, reusing Helion's effects through shared helpers where appropriate.
- [ ] Gameplay soundtracks: grow the audition pool toward roughly 16 distinct songs, then finish one gameplay track per circuit, including mix/loop delivery and race playback. Use the [audio guide and Halcyon direction](docs/audio/README.md).
- [ ] Audio generation Skill: package the proven prompt → sequential local render → Tunes audition → human feedback workflow. Reference the audio guide and scripts; carry the musical motivations, metadata/provenance updates and one-current-take cleanup rules without duplicating docs or collecting iteration evidence.
- [ ] Author collision worlds for additional circuits and broader static Saffron scenery; propagate actual contact sparks as they opt in and explore bounded scrape marks. Keep racer body contact separate.
- [ ] Halcyon: fix remaining ground flicker, especially white areas and street-lane markings.
- [ ] Asterion: locate and fix the reported flickering road section.

### Gate 5: broader race flow

- [ ] Scope briefing, sector splits and persistent personal records separately from the completed shared two-lap flow.
- [ ] Explore a podium presentation after the current automatic results screen.

### Gate 6: opponents and competitive Quick Race

- [ ] Expand toward player plus 11 rivals; verify independent finishes and actual performance.
- [ ] Add restrained body contact with cooldowns, without sustained rail pinning or repeated damage from one contact.

### Gate 7: energy choices and Time Trial

- [ ] Try two recharge stretches and two immediate 25-point cells on Halcyon, capped at 100 reserve. Place recharge on slower/wider lines; retain passive regeneration while tuning. Reset eligibility per racer/lap using forward crossings and anti-farming; expand only after review.
- [ ] Add a deterministic three-lap solo Time Trial with a local non-colliding ghost, sector deltas and instant retry. Use fixed initial state, manual boost/regeneration and disabled road devices; separate circuit/ship/rules records and reject incompatible ghosts. Automatic failed-jump recovery remains valid with elapsed-time loss.

### Gate 8: cups and front end

- [ ] Author per-circuit menu previews around each track's standout landmark or event: Nacre's leviathan, Cindercoil's lava, and equivalent signature vistas elsewhere. Save free-camera poses and event timing so the existing ship-free screenshot workflow can reproduce those shots after map changes.
- [ ] Music startup: attempt playback on initial arrival, then fall back to the first user interaction if autoplay is blocked. Current playback begins with a menu-button activation or explicit Play/M.
- [ ] Validate Tunes continuity and control responsiveness during the heaviest circuit transitions as part of the deferred M1 performance pass.
- [ ] Carry shared ship selection into future race modes and add a Founders Cup over Halcyon/Asterion/Nacre. Proposed 12-place points: 25/20/16/13/11/9/7/5/4/3/2/1; ties by wins, then total time. Save between races with restart/abandon controls.
- [ ] Connect future Cup and Time Trial modes; rewards unlock cosmetics rather than stronger stats. Retain completed content in Practice/Quick Race.

## Deferred

- [ ] Umbra gravity lens: revisit the arrow cue, which suggests steering toward the gravitational pull even though the player must counter-steer.

Stored/manual-use items, offensive pickups, side attacks, destructive damage/elimination, online systems, upgrade economies, procedural tracks and the industrial energy complex require separate scope. Quality and a complete racing loop take priority over map count.
