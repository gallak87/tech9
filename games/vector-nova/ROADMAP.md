# VECTOR//NOVA — human-gated production roadmap

## Gate 1 — approved

One Kestrel silhouette and a 3.6km staging loop established the direction. User approved Gate 1 on 2026-09-28 and reported reversed steering, uphill rest drift and automatic bend alignment. This approval does not approve the unfinished art or authorize broad game expansion.

## Gate 2 — first level and core handling (human-approved)

Finish Halcyon Viaduct as the first complete authored level: layered megacity expressway at blue hour; distinctive districts, atmospheric sky, physically coherent materials/light, engineered route/supports/barriers, tunnels, elevation, banked signature section, landmark sightlines and complete surroundings. Keep an engaging introductory lap with early bank/elevation, distributed signature features and short recovery stretches. The latest user feedback requests removing roughly half the drawn-out route portions. Keep the approved Kestrel silhouette and refine its actual game presentation as needed. Prove corrected keyboard direction, slope/rest behavior, brake/boost response, bank transitions, camera clearance and frame pacing. Keep the current practice shell; no production menu expansion.

- [x] Adopt Echo ESLint/Prettier/Husky pattern, own dependencies/config, run on full app before feature work.
- [x] Correct driver's left/right steering in shared physics; independently confirmed through real browser controls.
- [x] Replace unphysical bank drift with signed surface forces and explicit stationary hover hold; 14 focused tests pass.
- [x] Complete 7.2km first circuit geometry and track engineering, with a valid 68.4-second automated lap.
- [x] Implement city architecture, canal precinct, skyline, sky, atmosphere, lighting and material response; premium quality remains a human review item.
- [x] Inspect ship in final race lighting and refine construction, reflection, grounding and propulsion.
- [x] Four independent critic rounds; user requested ending further iterations and moving to Gate 2. Last formal art/lighting score 8/10, not an all-category pass.
- [x] Production build, 33 unit tests, 29 browser regression checks and qualified headless performance measurements. Short final-build smoke check; normal-speed full-lap rerun skipped at user request.
- [x] Build skyline corkscrew, 158m inverted crossing and 68° plunge within the existing 7.2km length. 46 tests and 11 focused production-browser checks pass; no critic round.
- [x] Shorten to 5 km, distribute the introductory bank/climb, inversion, plunge and canal rise/dip; reduce actual bend assistance to 0.3. 55 tests and 43 focused browser/regression checks pass. Fast numerical lap: 47.175 simulated seconds, zero impacts; no real-time full lap or critic.
- [x] Fix flickering road lamp pools through continuous fixture handoffs and remove expansion-seal intersections with the curved road.
- [x] **Human approved Gate 2 on 2026-09-28: good enough for now; further iteration deferred until later game expansion.**

Checkpoint before the signature revision: `04a84460`. The user initially withheld approval for that checkpoint; the completed pacing revision is now explicitly approved.

Gate 2 handling decision: the user requested reducing automatic bend assistance from 1.0 to 0.3. Persistent yaw now leaves the remaining turn to the player; magnetic pitch/roll adhesion remains active through the inversion and plunge. The user approved the current first level and will revisit it later.

Human playtest priorities: correct steering direction, stationary behavior on slopes, corner/airbrake/boost feel, camera clearance, city/sky/material quality, engine mix and smoothness on the user's actual display. Foreground performance, physical gamepad/mobile use and audio listening remain unverified. These unverified technical claims remain unverified despite human acceptance; no new Gate 2 critic is requested.

## Gate 3 — orbital circuit above a planet (human-approved)

Latest user direction supersedes the combined industrial/orbital phase. Table the industrial circuit and build the orbital one as Gate 3. Preserve Halcyon. Start with a drivable bare track and a simple planet for orientation; give the user the whole shape early, before environment production or the formal critic loop.

Carry forward the pacing principle: engage early, distribute climbs/drops/banks and signature features, and leave short recovery sections. The proposed Asterion Orbital route must be judged from real geometry and driving, with 3D/top/profile overview controls and direct section starts.

- [x] Record explicit Gate 2 approval and the orbital-only scope change.
- [x] Build and verify the bare orbital circuit; present its shape for early human grading. See [orbital blockout notes](docs/ORBITAL_BLOCKOUT.md).
- [x] **Human approved the bare shape and explicitly requested the full goal-setting/brutal-critic loop with parallel builders.**
- [x] Complete the authorized orbital world, engineering and art on the approved shape.
- [x] Complete the bounded independent gauntlet at six rounds. Art/lighting/handling/track/visible feedback reached 9; final UI 8.5 finding received an integrator repair, while performance remains 8.5 with unavailable evidence. No all-category pass claimed.
- [x] Verify production, Halcyon regressions and the final portrait-inspection repair; retain scores and limitations in concise findings.
- [x] Commit the existing candidate as `754fdc4a`, then respond to human art feedback with true open frame spans. Preserve the gaps the user explicitly liked and apply full-color cyan/magenta/blue treatment to selected road runners, panels and side bars. No new critic round or score.
- [x] Respond to further human feedback across the whole orbital circuit: replace road-like textures with smooth induction panels, highway rails with tall open U frames, and sparse darkness with a cratered moon, broad galactic band and 17,500 stars. Parallel builders integrated; 73 tests and 45 production-browser checks pass. User approved the complete track/sky pass; formal gauntlet stays closed.
- [x] **Human explicitly approved Gate 3, including the final whole-track and sky identity pass.**

Approved checkpoint: [Gate 3 handoff](docs/GATE3_HANDOFF.md). The industrial energy-complex phrase has been removed from the original prompt. The six-round critic loop stays closed; approval does not alter scores or unavailable evidence. Continue through the [Gate 4 parallel handoff](docs/GATE4_HANDOFF.md).

## Gate 4 — two separate parallel sessions

The user requested two independently reviewable lanes, each with its own goal, narrow builder fan-out, independent brutal critic and **eight-round maximum**. Start from the same approved Gate 3 commit in separate managed worktrees. Gate 4.1 owns a small common runtime preflight; Gate 4.2 consumes its verified adapter contract, then the lanes keep exclusive files. This necessary startup dependency is not an excuse for concurrent shared-file edits. The parent session owns servers and will assign separate checkout/preview ports once the user supplies the session names/links. Neither implementation is started by this roadmap update.

### Gate 4.1 — Nacre Tempest / new level 3

**An alien ocean world with a lightning storm, true submerged racing and exactly two real long jumps.** Climb a pearl causeway above violent surf, launch across an exposed storm gap, descend below the surface into luminous reef canyons, jump an abyss crossing, then rise through the storm eye toward a tide observatory. Make it harder through readable approach-speed/angle demands, banks and braking decisions, preserving 0.3 assistance. Missed jumps cause a visible fall and timed recovery at a safe point just beyond the landing. **The lap remains valid: the recovery delay, counted in lap time, is the penalty.**

Give the entire raceway its own overlapping pearlescent scales, translucent pressure inserts, swept fin barriers and wave-cut supports. Wet exposed deck, luminous submerged infrastructure and storm-eye sections should feel related but varied. Sky, water, weather, structures and the road all carry the identity; no Halcyon asphalt reskin, generic orbital U-frame reuse, blue-filter-only underwater scene or single hero vista surrounded by unfinished stretches.

- [ ] Land and verify the common optional runtime/feature preflight; transfer the no-op Halcyon adapter contract without unfinished level imports.
- [ ] Build the bare route, water-level massing, review views, both real jumps and fall/recovery demonstrations, with a small representative deck/barrier sample.
- [ ] **Early human shape/jump/identity approval before full art production.**
- [ ] Complete the approved ocean/storm world and raceway, actual submersion transitions and exactly two airborne jumps with swept landings and deterministic valid-lap recovery.
- [ ] Full goal/production/independent critic loop, stop at first verified pass or eight completed rounds; record honest scores and limits.
- [ ] Verify production, high/low, live motion/replay/failure states, resource budgets and first/second-level regressions.
- [ ] **Gate 4.1 final human art/driving approval.**

Execution: [level session brief](docs/gate4-1/HANDOFF.md). Counter and state: [Gate 4.1 status](docs/gate4-1/STATUS.json). No pickups on this level during this gate.

### Gate 4.2 — first-level immediate boosts and shields

**Halcyon only.** Begin with roughly four directional Vector strips that grant a short, smooth free acceleration effect and two Aegis pickups that activate an immediate six-second-or-one-impact shield. These are tuning starting points. Shields absorb the next rail impact's reserve loss while retaining collision and speed consequences. Place strips on readable exits/recovery straights and shields before demanding sections, offering line choice within the existing route. Preserve manual Shift boost, brake authority, the city's art and default magnetic physics.

No inventory, stored item, activation button, randomized item roulette, weapons or AI in this pass. A player drives over a device and its effect starts immediately. Road hardware, ship feedback, audio and small HUD states need a coherent finished design; no glowing placeholders or HUD clutter. Nonstacking effects, swept crossings, pause/reset rules, anti-farming and replay/record isolation are part of the feature.

- [ ] Adopt the exact common preflight contract; keep all behavior gated to Halcyon's identity and explicit feature flag.
- [ ] Build one playable strip/shield pair and show it early for human steering while continuing the authorized loop.
- [ ] Complete authored placements, automatic effects, distinct feedback, deterministic lifecycle and record/replay rules.
- [ ] Full goal/production/independent critic loop, stop at first verified pass or eight completed rounds; include mechanic fairness and baseline isolation.
- [ ] Verify real-input speed/impact behavior, braking, bank/inverted placements, high/low, responsive HUD and orbital rejection of the feature flag.
- [ ] **Gate 4.2 final human gameplay/art approval.**

Execution: [mechanics session brief](docs/gate4-2/HANDOFF.md). Counter and state: [Gate 4.2 status](docs/gate4-2/STATUS.json). Do not touch level 3, orbital or first-level route geometry. Cross-level feature rollout is a later explicit decision.

### Combine the lanes

Merge the common preflight once, then the verified lane changes in either order with an integrator. Check plain Halcyon, feature-enabled Halcyon, orbital production/shape and Nacre production/shape, including replay rules and resource disposal. Consolidate shared docs from the lane-local records without resetting critic counters. Each human gate is independent; one approval cannot authorize the other's expansion.

## Later expansion — decide after these gates

Consider immediate energy cells/recharge lanes and deliberate rollout to other levels first. **Stored pickups with a manual activation control are only a future design option**, requiring discussion and explicit approval; they are not a Gate 4 requirement. Other deferred work: additional ships, opponent AI, attacks/weapons, damage systems, racing positions/splits/finish/results, championship/progression/rewards, garage/menu redesign, Time Trial/ghost and expanded accessibility/device coverage. Keep future Time Trial pickup-free with comparable rules. Agree order and scope with the user after the two handbacks, rather than reserving more content now.

## Review discipline and repository hygiene

Use the original prompt quality rubric (every applicable category ≥9/10, no critical failures) without fabricated scores or endless polishing. The user's latest instruction gives each of these Gate 4 lanes a maximum of eight completed rounds, stopping earlier at the first verified pass or the user's request. Count the initial critique as round 1, persist counters, and never reset, rename or split work to gain more attempts. If the cap is reached below target, finish packaging/verification within scope and present the unresolved findings at the human gate; do not claim a pass or expand scope. Gate 2 historically ended at the user's request after round 4 under its former ten-round limit. That history is preserved and no additional Gate 2 critic is requested. Human approval remains mandatory regardless of critic result.

Critics inspect the app directly and exercise motion. Temporary screenshots, profiles and raw reports go under git-ignored `.experiments/`; prior `evidence/` folders are also ignored. Keep concise critic findings, counters, decisions and phase state in documentation. No requirement to deliver/commit a growing screenshot collection after a critic round. No runtime dependency on review artifacts.

Review browsing preference: local game only, hidden/headless sessions. External reference videos and unsolicited visible browser windows are prohibited. Foreground performance remains unverified unless the user later explicitly requests it.
