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
- [x] Gate 5 initial flow: add audible start lights, two-lap timing/results, continued driving and retained paddock results.
- [x] Gate 6 initial opponents: add Rook/Latch/Mule using actual physics/devices, a 2×2 grid and Easy/Medium/Hard difficulty.
- [x] Gate 8 fleet: add Kestrel/Shrike/Bastion/Needle, distinct handling, saved selection/stats and fleet/rival inspection.
- [x] Shared inspection: add free-camera navigation and responsive driving/review controls across circuits.
- [x] Halcyon feedback: add position/lap timing, full-field relative race gaps, matching rival colors and catapults toward 600 km/h with strong launch blur.
- [x] Asset layout: normalize Halcyon/Orbital/Nacre folders and base-aware loading; prune obsolete served models and duplicate rival GLBs while retaining sources/provenance.
- [x] Shared racing graduation: reuse Vector/Aegis, 600 km/h launch feedback, three physical rivals, difficulty, timing/results and replay on Halcyon/Orbital/Nacre/Vesper/Glasswake/Cindercoil/Saffron.
- [x] Nacre immersion: blend the entire sound mix underwater and restore it smoothly on exit; add pooled bubbles at actual submerged takeoff, flight and landing.

## Remaining level expansion

Continue the existing authored worktrees using the [expansion rules](docs/expansion/README.md). New circuits must use the shared race/device system, with authored placements and their actual motion adapter. Each level owner finishes the level and necessary shared improvements, completes desktop critique, checks mobile last, then commits and merges. Completed review history remains in Git.

- [ ] [Zephyr Basilica](docs/expansion/zephyr/HANDOFF.md): cathedral traversal, waterfall jumps and falling architecture.
- [ ] [Helion Flare](docs/expansion/helion/HANDOFF.md): flare-lane evasion, heat/cooling choices and stellar prominences.
- [ ] [Umbra Fold](docs/expansion/umbra/HANDOFF.md): tidal zones, curved leaps and debris consumption.

## Remaining gameplay

Agree each phase's scope before implementation; scoped independent critique ends with human review.

### Level polish

- [ ] Saffron: deepen bone erosion and fracture variation, sharpen creature armor response, enrich sandfall volume and ordinary scenery and optimize high-resolution material/postprocessing cost.

- [ ] Extend existing rail-local sparks to consistent actual contact points across circuits and other surfaces; add body-contact feedback when available and explore bounded scrape marks.
- [ ] Halcyon: fix remaining ground flicker, especially white areas and street-lane markings.
- [ ] Asterion: locate and fix the reported flickering road section.

### Gate 5: broader race flow

- [ ] Scope briefing, sector splits and persistent personal records separately from the completed shared two-lap flow. Retain continued driving and Escape-to-paddock until the user requests a change.

### Gate 6: opponents and competitive Quick Race

- [ ] Expand toward player plus 11 rivals; verify independent finishes and actual performance.
- [ ] Add restrained body contact with cooldowns, without sustained rail pinning or repeated damage from one contact.

### Gate 7: energy choices and Time Trial

- [ ] Try two recharge stretches and two immediate 25-point cells on Halcyon, capped at 100 reserve. Place recharge on slower/wider lines; retain passive regeneration while tuning. Reset eligibility per racer/lap using forward crossings and anti-farming; expand only after review.
- [ ] Add a deterministic three-lap solo Time Trial with a local non-colliding ghost, sector deltas and instant retry. Use fixed initial state, manual boost/regeneration and disabled road devices; separate circuit/ship/rules records and reject incompatible ghosts. Automatic failed-jump recovery remains valid with elapsed-time loss.

### Gate 8: cups and front end

- [ ] Restructure the menu into **Ship selector → Map selector → Launch**. Retain ship stats, saved choices and Inspect Ships; each step should fit without scrolling.
- [ ] Carry shared ship selection into future race modes and add a Founders Cup over Halcyon/Asterion/Nacre. Proposed 12-place points: 25/20/16/13/11/9/7/5/4/3/2/1; ties by wins, then total time. Save between races with restart/abandon controls.
- [ ] Connect Quick Race, Cup and Time Trial to working actions; rewards unlock cosmetics rather than stronger stats. Retain completed content in Practice/Quick Race.

## Deferred

Stored/manual-use items, offensive pickups, side attacks, destructive damage/elimination, online systems, upgrade economies, procedural tracks and the industrial energy complex require separate scope. Quality and a complete racing loop take priority over map count.
