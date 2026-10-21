# Future game direction

Deferred ideas for later review, not instructions to start implementation or reopen completed art campaigns. Use [release.md](release.md) for Steam readiness, [desktop.md](desktop.md) for packaging and the [roadmap](../../ROADMAP.md) for gameplay work.

## Existing foundation

The full game already has 13 courses, four player ships, nine AI rivals, four saved championships, Quick Race, Practice and Time Trials with local ghosts and separate standing/flying bests. Cups, records, ghosts and the menu revamp are implemented; the old proposals to build them are retired. The demo's smaller selection is defined in [desktop.md](desktop.md#editions).

## Next useful investments

1. **External playtesting:** observe whether players understand braking/boost choices, finish without coaching and voluntarily replay. Separate control confusion, route readability, performance and difficulty findings.
2. **Visible mastery:** consider playtested bronze/silver/gold targets, clearer sector improvement feedback and restrained cosmetic rewards, building on existing records and cup results.
3. **Meaningful racing decisions:** test whether ship choice, boost use, braking and jump approaches create understandable tradeoffs before adding mechanics.
4. **One convincing gameplay section:** scope a bounded feel/art experiment on an existing course. Nightweir is a candidate; verify shared changes on a contrasting course before wider rollout.

## Optional experiments

- **Speed and handling:** stronger perceived speed and snappier response need explicit scope. Compare camera framing/FOV, nearby geometry, audio and frame pacing before raising propulsion targets. Preserve approved handling and 0.3 steering assistance outside that experiment; pace changes require ground/flight/landing checks.
- **Cockpit and HUD:** prototype one forward view and readable instruments on one ship before commissioning interiors. Check banks, inversions, flights, clipping and motion comfort. Gauges must represent actual game state.
- **Hazards and presentation:** consider readable track-owned events, starting-grid presentation, rival identities and finish feedback where they improve player decisions or outcomes. Measure rendering cost.
- **Further systems:** online multiplayer, a story campaign, manual weapon aiming, upgrade economies, open-world conversion and large new map production remain outside immediate scope. Existing automatic track devices/combat stay intact.

## Art iteration

Use the [ship visual workflow](../../assets/ships/README.md#visual-improvement-workflow) and [art direction](../ART_BIBLE.md). Completed art campaigns stay closed unless a new bounded pass is assigned.

1. Pick one ship or a short representative course section and a concrete visual target. Compare ordinary gameplay views at matched resolution.
2. Diagnose composition/scale, geometry, materials, lighting or export fidelity; make one substantial intervention before wider rollout.
3. Check the exported runtime while driving, including readability, collisions, frame time and memory. A beauty render or critic score alone is insufficient.
4. Reassess the approach after two marginal passes. Roll out a proven treatment only within the agreed scope and refresh affected menu stills.

Reference inspiration retained from the earlier review: [AGX GP](https://store.steampowered.com/app/4250680/AGX_GP/), [Race of the Nine Worlds](https://store.steampowered.com/app/3817560/Race_of_the_Nine_Worlds/), [Airframe Ultra](https://store.steampowered.com/app/2522120/Airframe_Ultra/) and [DEATHGRIP](https://store.steampowered.com/app/1721590/DEATHGRIP/). These are reference leads, not current feature comparisons or a claim of hands-on review.

Follow the existing [architecture](../../ARCHITECTURE.md): keep presentation separate from physics, world-specific work local, and player records separate from developer recordings. Each future assignment needs a player-visible outcome, bounded scope, invariants, verification and a stopping condition.
