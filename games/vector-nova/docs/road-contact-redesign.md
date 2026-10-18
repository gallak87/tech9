# Shared road and rail contact redesign

Fix shared road and rail contact so continuous roads preserve momentum, bumps and scrapes feel snappy, and jumps and crashes remain physical. Use the four circuit families below to develop and verify the solution. Preserve current track shapes and art; further flattening is a separate user decision. The implementation is open.

Zephyr's environment improvements are assigned separately in the [art improvement brief](levels/zephyr-art-improvement.md). Keep this contact work independent of that visual pass and preserve its scenery and materials.

## Starting point

Start from audited main `8b70db16`. No blanket rollback: these failures also reproduce with the pre-optimization physics from `af49f312` on the same tracks. Preserve Vesper's smoother elevations, Crown leap and corkscrew, prevention of racer-induced launches, and finite off-road support/recovery. Superseded support logic can be replaced. Retain the recent performance improvement where compatible with correct contacts.

Read [AGENTS.md](../AGENTS.md) and the surface/physics contracts in [LEVEL_API.md](LEVEL_API.md). Shared code: [magnetic-body.js](../src/physics/magnetic-body.js), [rapier-world.js](../src/physics/rapier-world.js), [magnetic-boundaries.js](../src/physics/magnetic-boundaries.js), [flight.js](../src/physics/flight.js).

## Problem and proposed direction

Magnetic constraints follow a mathematical road surface while the ship also collides with solid deck triangles. On changing slopes/banks, these can disagree and produce braking impulses. Rails combine authored solids and generated boundary walls. The audit implicates this interaction; diagnose the exact mechanism.

- **One coherent driving surface:** support reflects the actual lane and ship footprint through banks, hills, inversions and tubes, with consistent driving/collision geometry.
- **Clear ownership of grounded support:** magnetic support and redundant deck contacts should not fight over the same surface. Other decks, undersides, obstacles and racers remain solid.
- **Continuous, predictable rails:** collision follows the visible boundary without seams or duplicate barriers causing catches. Glancing hits primarily deflect sideways; direct impacts still have meaningful consequences.
- **Explicit flight and landing:** jumps or leaving the finite road release the ship into gravity. Reattachment requires a valid landing on a real surface, preserving momentum without floating across empty space.

Preserve shared handling and steering assistance `0.3`. Prefer a consistent contact model over per-level exceptions.

## Prototype cases

Distances and lateral offsets are metres in track coordinates; speeds are metres per second. Percentages are approximate race progress.

| Circuit and location                               | Probe start distance | Lateral offset              | Initial speed | Audit observation                                                                    |
| -------------------------------------------------- | -------------------- | --------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Saffron Leviathan, Amber Crest, ~82%               | 4195                 | -12, -16 and -10            | 112 and 160   | The 40 m course lost about 50 m/s in one tick at cruise and snagged at higher speed. |
| Nightweir, Harbor Corkscrew, ~80%                  | 10892                | +18; also +10 at high speed | 112 and 160   | Outer lane lost about 50 m/s at cruise and up to 120 m/s at higher speed.            |
| Worldspire, Echo Chasm approach, ~66%              | 9255                 | -21                         | 160           | Repeatable 69–73 m/s losses.                                                         |
| Zephyr, Falls Between / Choir Archipelago, ~25–29% | 1222 / 1415          | +12 / -12 respectively      | 112 and 160   | Severe catches at both transitions, including cruise speed.                          |

The temporary audit harness was removed; reconstruct it with production runtimes and the fixture patterns in [vesper-magnetic.test.mjs](../tools/vesper-magnetic.test.mjs). Start fresh Kestrels at the listed coordinates, heading/lateral speed zero. Run 60 shared ticks at `1/120` second with hard AI lane steering, throttle 1, brake 0, boost only at 160 m/s. This deliberately maintains approach speed. Compare solo with a second Kestrel at the same station/speed, seven metres laterally toward centre. Stage both before stepping the world. Inspect per-tick speed loss, contacts, support and lane position transiently for your own diagnosis.

Keep real runtime options, including support height. Test-only deck removal eliminated Saffron, Worldspire and Zephyr's ~29% failures. Nightweir retained some high-speed catches until other road solids were removed too. These comparisons isolate the problem, not a production fix. Some large slowdowns emitted no impact event; measure velocity too.

## Verification and delivery

First confirm the probes exercise the real failures, then use before/after comparisons internally to verify the fix. Check desktop driving with opponents, genuine impacts, landings, edge departure/recovery, Vesper's corkscrew and Shatterline's tubes, replay/reset and crowded-race performance. Keep useful regression tests and run the maintained desktop checks/build under the project's desktop-only scope.

The user wants the problem fixed, with no saved or presented evidence reports. Do not persist probe datasets, run logs, before/after reports, captures or evidence bundles, or include those results in chat or commit descriptions. Remove temporary probe scripts and artifacts after verification; reusable regression test code is welcome. Finish with a brief statement of what was fixed and any unresolved issue. Leave Umbra, Glasswake and Nacre geometry-smoothing decisions for the user.
