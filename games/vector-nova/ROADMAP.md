# VECTOR//NOVA roadmap

## Current position

Approved and merged: Halcyon Viaduct, Asterion Orbital, the initial Halcyon boost/shield devices and the Blender Kestrel with stronger blue exhaust. Completed review history is in Git.

Nacre Tempest is finishing a final user tweak in its own checkout before merge. Preserve its accepted track/water direction, two real jumps and elapsed-time recovery penalty. Follow the [active merge brief](docs/GATE4_HANDOFF.md).

## Next: integration and shared cleanup

- [ ] Finish/review the final Nacre revision and merge only with the user's authorization.
- [ ] Replace hardcoded level branches with a small validated lazy loader and level descriptor.
- [ ] Standardize async readiness, one presentation update per frame, reset/disposal and borrowed-resource ownership.
- [ ] Drive shared UI/review navigation from metadata and camera behavior from explicit options.
- [ ] Expose existing robust frame, road-sweep and clearance helpers for new level authors.
- [ ] Extract small mesh/instance/resource helpers where reuse is demonstrated; keep world-specific art local.
- [ ] Complete the common validation harness and frozen level contract. CPU track checks are already prepared in the isolated expansion checkout; they are not integrated yet.
- [x] Rewrite the README around the whole game and consolidate documentation around current state and lasting decisions.

The preliminary reuse review is complete; the final candidate and shared foundation still need verification. See the [launch ledger](docs/expansion/LAUNCH_STATE.json) and [integrator handoff](docs/EXPANSION_INTEGRATOR_HANDOFF.md). Seven-map production remains on hold until these prerequisites are satisfied.

## Seven requested maps

Each map gets an independent isolated build, internal shape checks, full production and capped critique, then final human review. Preserve the existing Kestrel, controls and 0.3 assistance. These seven routes use continuous magnetic surfaces; Nacre flight, pickups and new game systems are outside this wave.

| Map                   | Direction and owned brief                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 4 — Vesper Canopy     | [Luminous alien forest; amber resin road and hooked petal edges](docs/expansion/vesper/HANDOFF.md)          |
| 5 — Glasswake Comet   | [Crystal decks, cobalt ice caverns and a supported canyon crossing](docs/expansion/glasswake/HANDOFF.md)    |
| 6 — Cindercoil        | [Volcanic terraces, ceramic road, gravity bowls and rising corkscrew](docs/expansion/cindercoil/HANDOFF.md) |
| 7 — Saffron Leviathan | [Fossil ribs, dune sea, gold-glass road and offset braking turns](docs/expansion/saffron/HANDOFF.md)        |
| 8 — Zephyr Basilica   | [Floating stone islands, graphite bridges, waterfalls and spiral ascent](docs/expansion/zephyr/HANDOFF.md)  |
| 9 — Helion Flare      | [Solar observatory, heat tiles, radiator edges and shield-wall ride](docs/expansion/helion/HANDOFF.md)      |
| 10 — Umbra Fold       | [Gravity observatory, accretion ring, stacked crossings and inversions](docs/expansion/umbra/HANDOFF.md)    |

Spread vertical events and signature moments throughout each course. Ordinary connectors, road construction and surroundings need the same attention as hero views. The [common brief](docs/EXPANSION_HANDOFF.md) owns execution/quality rules; individual briefs own distinctive worlds and acceptance scenarios.

## Proposed gameplay phases — not started

Each phase ends with human review after its scoped independent critic loop. Agree the actual phase before implementation; the seven map builds do not authorize these systems.

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
