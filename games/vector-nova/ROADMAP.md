# VECTOR//NOVA roadmap

## Current position

Approved and merged: Halcyon Viaduct, Asterion Orbital, Nacre Tempest, Vesper Canopy, the initial Halcyon boost/shield devices and the Blender Kestrel with stronger blue exhaust. Completed review history is in Git.

## Next: integration and shared cleanup

- [x] Merge the approved Nacre circuit and final revision.
- [x] Add a simple paddock circuit picker for the available levels.
- [x] Replace hardcoded level branches with a small validated lazy loader and level descriptor.
- [x] Standardize async readiness, one presentation update per frame, reset/disposal and borrowed-resource ownership.
- [x] Drive shared UI/review navigation from metadata and camera behavior from explicit options.
- [x] Expose optional frame, road-sweep, transformed-bounds and clearance helpers; keep profiles, materials and scenery authored locally.
- [ ] Extract additional small mesh/instance/resource helpers only when repeated production needs justify them; this is not a prerequisite for the seven-level handoff.
- [x] Integrate the common CPU/runtime validation harness and documented level contract. The API and verification commands are documented with the shipped code.
- [x] Rewrite the README around the whole game and consolidate documentation around current state and lasting decisions.

The user resumes the existing level chats one at a time. Each agent follows the [common completion brief](docs/EXPANSION_HANDOFF.md), incorporates current primary code and owns its shared improvements, final mobile pass, commit, merge and verification. Progress stays in the chat; reusable lessons belong with the code/docs. No integrator or coordination ledger is needed.

## Seven requested maps

Each map gets internal shape checks, full desktop production and capped critique, then one final mobile pass and a verified merge into the primary worktree for human playtesting. The level agent handles framework/environment/tooling improvements and documents reusable learnings as part of completion. Preserve the existing Kestrel, controls and 0.3 assistance. Their briefs authorize distinct jumps, surface effects, hazards, environmental forces and large world events. Shared pickup/boost expansion remains deferred: builders record actual future-support coordinates and preserve the intended challenge even if current play is rough or hard. All assets and lighting share one eight-round critic cap per level, targeting at least 9/10 in every applicable category.

| Map                   | Direction and owned brief                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 4 — Vesper Canopy     | Complete: living-tree interiors, crown jumps and sap lines; [learnings](docs/expansion/vesper/learnings.md) |
| 5 — Glasswake Comet   | [Crystal fracture jumps, frost/grip choices and a calving ice shelf](docs/expansion/glasswake/HANDOFF.md)   |
| 6 — Cindercoil        | [Lava-surge route choices, a vent launch and a rupturing caldera](docs/expansion/cindercoil/HANDOFF.md)     |
| 7 — Saffron Leviathan | [Skull/vertebral traversal, sand crossings and a living burrower](docs/expansion/saffron/HANDOFF.md)        |
| 8 — Zephyr Basilica   | [Cathedral interiors, waterfall jumps and a falling island/tower](docs/expansion/zephyr/HANDOFF.md)         |
| 9 — Helion Flare      | [Flare-swept lanes, furnace/heat choices and gigantic solar flares](docs/expansion/helion/HANDOFF.md)       |
| 10 — Umbra Fold       | [Tidal pull, curved leaps and debris stretched into the black hole](docs/expansion/umbra/HANDOFF.md)        |

Spread vertical events and signature moments throughout each course. Ordinary connectors, road construction and surroundings need the same attention as hero views. The [common brief](docs/EXPANSION_HANDOFF.md) owns execution/quality rules; individual briefs own distinctive worlds and acceptance scenarios.

## Proposed gameplay phases — not started

Each phase ends with human review after its scoped independent critic loop. Agree the actual phase before implementation; the seven map builds do not authorize these systems.

### Level polish

- [ ] Add subtle motion blur during boost, keeping the road and HUD readable and respecting reduced motion.
- [ ] Emit sparks from the actual side/contact point when scraping rails or other surfaces, and when ship-to-ship bumps become available. Explore short-lived scrape streaks on the contacted road panels/walls, with bounded effects and cleanup.
- [ ] Halcyon: investigate and fix remaining flicker on the ground, especially white areas and street-lane markings.
- [ ] Asterion: locate and fix the reported flickering road section; its exact location is not yet known.
- [ ] Nacre: make the entire sound mix feel submerged when entering the water, including propulsion, boost, lightning/thunder and other effects, with smooth transitions back to the above-water mix.
- [ ] Nacre: add bubbles around takeoff, mid-jump travel and landing for the underwater portions, driven by actual submersion and water crossings.

### Candidate next round: shared pickups and boost support

Consider prioritizing game-wide boost/refill, protection, recovery and other shared aids using the seven builders’ measured placement notes. The user will choose the systems and iterate through human playtests. Do not implement them during level production or treat hard unsupported sections as permission to redesign the maps.

### Gate 5: complete race flow

Track select → briefing → grid/countdown → three laps → finish/results → retry or another track. Keep Practice one action away and settings available before racing. Show lap/sector splits, last-lap feedback, total/best/personal times; position waits for real opponents. Prevent pre-GO launch advantage and duplicate finishes. Persist settings/records locally with a working storage-failure fallback, and separate ship/track/rules versions. Target roughly 2–4 minutes without stretching empty road.

### Gate 6: opponents and competitive Quick Race

Start with three AI rivals on Halcyon, then reach player plus 11 rivals across approved circuits. Use real route lines, braking/boost decisions, overtakes and recoverable mistakes; Rookie/Racer/Ace vary precision and judgment, initially without catch-up assistance. All racers obey the same limits, device and jump rules. Rank by valid lap/checkpoint progress, including meaningful airborne presentation. Add restrained body contact with cooldowns, no sustained rail pinning or repeated damage from one contact. Verify the full-grid start and independent finishes against performance budgets.

### Gate 7: energy choices and Time Trial

Initially try two recharge stretches and two immediate 25-point energy cells on Halcyon, capped at 100 reserve. Put recharge on slower/wider lines so it is a real time/energy choice; retain passive regeneration while tuning. Eligibility resets per racer/lap with forward crossings and anti-farming. Expand placements to another circuit only after review.

Time Trial is a deterministic three-lap solo run with a local non-colliding ghost, sector deltas and instant retry. Fixed initial state; manual boost/regeneration remain, road devices are disabled. Separate circuit/ship/rules records and reject incompatible ghosts. Automatic failed-jump recovery remains valid with elapsed time loss.

### Gate 8: ships, cups and front end

Retain balanced Kestrel; proposed additions are agile lower-top-speed Vesper, heavy high-reserve Bastion and fast Needle with weaker braking. Names/tuning are provisional; each needs an actual distinct asset and a meaningful tradeoff.

After all three existing circuits are approved, add a Founders Cup over Halcyon/Asterion/Nacre. Proposed 12-place points: 25/20/16/13/11/9/7/5/4/3/2/1, ties by wins then total time. Save between races with restart/abandon controls. Track/ship select, Quick Race, Cup and Time Trial should lead to working actions. Rewards unlock cosmetics, not stronger stats; retain all completed content in Practice/Quick Race.

## Deferred

Stored/manual-use items, offensive pickups, side attacks, destructive damage/elimination, online systems, upgrade economies, procedural tracks and the industrial energy complex require a separate scope decision. Quality and a complete racing loop take priority over map count.
