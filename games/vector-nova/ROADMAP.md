# VECTOR//NOVA — human-gated production roadmap

## Gate 1 — approved

One Kestrel silhouette and a 3.6km staging loop established the direction. User approved Gate 1 on 2026-09-28 and reported reversed steering, uphill rest drift and automatic bend alignment. This approval does not approve the unfinished art or authorize broad game expansion.

## Gate 2 — first level and core handling (ready for human review)

Finish Halcyon Viaduct as the first complete authored level: layered megacity expressway at blue hour; distinctive districts, atmospheric sky, physically coherent materials/light, engineered route/supports/barriers, tunnels, elevation, banked signature section, landmark sightlines and complete surroundings. Expand from the short staging benchmark to approximately 60–90 seconds at pace. Keep the approved Kestrel silhouette and refine its actual game presentation as needed. Prove corrected keyboard direction, slope/rest behavior, brake/boost response, bank transitions, camera clearance and frame pacing. Keep the current practice shell; no production menu expansion.

- [x] Adopt Echo ESLint/Prettier/Husky pattern, own dependencies/config, run on full app before feature work.
- [x] Correct driver's left/right steering in shared physics; independently confirmed through real browser controls.
- [x] Replace unphysical bank drift with signed surface forces and explicit stationary hover hold; 14 focused tests pass.
- [x] Complete 7.2km first circuit geometry and track engineering, with a valid 68.4-second automated lap.
- [x] Implement city architecture, canal precinct, skyline, sky, atmosphere, lighting and material response; premium quality remains a human review item.
- [x] Inspect ship in final race lighting and refine construction, reflection, grounding and propulsion.
- [x] Four independent critic rounds; user requested ending further iterations and moving to Gate 2. Last formal art/lighting score 8/10, not an all-category pass.
- [x] Production build, 33 unit tests, 29 browser regression checks and qualified headless performance measurements. Short final-build smoke check; normal-speed full-lap rerun skipped at user request.
- [ ] **Mandatory human playtest: stop for Gate 2 approval/changes.**

Gate 2 discussion item: **AUTO-STEERING / MAGNETIC ALIGNMENT**. The current vehicle frame follows the road tangent while player steering controls relative heading/lateral motion. User explicitly deferred changing this model until Gate 2. Do not silently redesign it. Show its behavior and decide whether to retain, weaken or replace it at that review.

Human playtest priorities: correct steering direction, stationary behavior on slopes, corner/airbrake/boost feel, camera clearance, city/sky/material quality, engine mix and smoothness on the user's actual display. Foreground performance, physical gamepad/mobile use and audio listening remain unverified. Approve this first level or record specific fixes before authorizing level 2.

## Gate 3 — level 2 (pending Gate 2)

Storm-battered industrial energy complex, its original route/signature engineering/weather/material identity. Independent critic rounds then mandatory human playtest. No automatic transition after critic approval.

## Gate 4 — level 3 (pending Gate 3)

Sunlit orbital shipyard above a planet, full route and visual identity. Independent critic rounds then mandatory human playtest.

## Later expansion — order to be decided with the user

After all three levels, return to game systems: additional selectable ships, opponent AI/rivals, powerups/pickups, damage/side attacks, powerup/crash/bump effects, racing positions/timing/checkered flag/results, garage/menus/settings expansion, championship/progression/rewards, time-trial ghost and remaining accessibility/mobile/input coverage. Existing staging telemetry stays functional but is not expanded during Gate 2. Each agreed phase ends with independent critique and a human review. Decide final product depth together after those phases.

## Review discipline and repository hygiene

Use original prompt quality rubric (each relevant category ≥9, no critical failures) without fabricated scores or endless polishing. Each applicable gauntlet stops at first verified pass or ten completed rounds, whichever comes first, unless the user explicitly ends it sooner. Gate 2 was curtailed by the user after round 4. Human approval remains mandatory regardless of critic result. Report remaining shortcomings honestly.

Critics inspect the app directly and exercise motion. Temporary screenshots, profiles and raw reports go under git-ignored `.experiments/`; prior `evidence/` folders are also ignored. Keep concise critic findings, counters, decisions and phase state in documentation. No requirement to deliver/commit a growing screenshot collection after a critic round. No runtime dependency on review artifacts.

Review browsing preference: local game only, hidden/headless sessions. External reference videos and unsolicited visible browser windows are prohibited. Foreground performance remains unverified unless the user later explicitly requests it.
