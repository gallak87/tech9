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

## Gate 3 — orbital circuit above a planet (production loop complete; human playtest pending)

Latest user direction supersedes the combined industrial/orbital phase. Table the industrial circuit and build the orbital one as Gate 3. Preserve Halcyon. Start with a drivable bare track and a simple planet for orientation; give the user the whole shape early, before environment production or the formal critic loop.

Carry forward the pacing principle: engage early, distribute climbs/drops/banks and signature features, and leave short recovery sections. The proposed Asterion Orbital route must be judged from real geometry and driving, with 3D/top/profile overview controls and direct section starts.

- [x] Record explicit Gate 2 approval and the orbital-only scope change.
- [x] Build and verify the bare orbital circuit; present its shape for early human grading. See [orbital blockout notes](docs/ORBITAL_BLOCKOUT.md).
- [x] **Human approved the bare shape and explicitly requested the full goal-setting/brutal-critic loop with parallel builders.**
- [x] Complete the authorized orbital world, engineering and art on the approved shape.
- [x] Complete the bounded independent gauntlet at six rounds. Art/lighting/handling/track/visible feedback reached 9; final UI 8.5 finding received an integrator repair, while performance remains 8.5 with unavailable evidence. No all-category pass claimed.
- [x] Verify production, Halcyon regressions and the final portrait-inspection repair; retain scores and limitations in concise findings.
- [ ] **Mandatory Gate 3 human playtest before game-system expansion.**

Execution brief: [Gate 3 handoff](docs/GATE3_HANDOFF.md). Industrial production remains tabled. The six-round critic loop is closed. The production candidate now awaits the mandatory human Gate 3 playtest; do not reset the gauntlet to obtain more attempts.

## Later expansion — order to be decided with the user

After Gate 3 approval of the orbital level, return to game systems: additional selectable ships, opponent AI/rivals, powerups/pickups, damage/side attacks, powerup/crash/bump effects, racing positions/timing/checkered flag/results, garage/menus/settings expansion, championship/progression/rewards, time-trial ghost and remaining accessibility/mobile/input coverage. Existing staging telemetry stays functional; no broad systems or menu expansion is bundled into the level phase. Agree the later phases with the user rather than reserving a Gate 4 now. Each phase ends with independent critique under the six-round cap and a human review. Decide final product depth together after those phases.

## Review discipline and repository hygiene

Use the original prompt quality rubric (every applicable category ≥9/10, no critical failures) without fabricated scores or endless polishing. The user's latest instruction changes every future module and integrated gauntlet to a maximum of six completed rounds, stopping earlier at the first verified pass or the user's request. Count the initial critique as round 1, persist counters, and never reset, rename or split work to gain more attempts. If the cap is reached below target, finish packaging/verification within scope and present the unresolved findings at the human gate; do not claim a pass or expand scope. Gate 2 historically ended at the user's request after round 4 under its former ten-round limit. That history is preserved and no additional Gate 2 critic is requested. Human approval remains mandatory regardless of critic result.

Critics inspect the app directly and exercise motion. Temporary screenshots, profiles and raw reports go under git-ignored `.experiments/`; prior `evidence/` folders are also ignored. Keep concise critic findings, counters, decisions and phase state in documentation. No requirement to deliver/commit a growing screenshot collection after a critic round. No runtime dependency on review artifacts.

Review browsing preference: local game only, hidden/headless sessions. External reference videos and unsolicited visible browser windows are prohibited. Foreground performance remains unverified unless the user later explicitly requests it.
