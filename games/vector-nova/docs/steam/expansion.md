# VECTOR//NOVA expansion direction

Recorded 2026-10-18 for later review. This is a proposed direction, not an instruction to start implementation or reopen completed art campaigns. Publishing and desktop packaging are covered in [release.md](release.md); implementation work should be scoped against the current [roadmap](../../ROADMAP.md).

## Product direction

A focused single-player anti-gravity racer about mastering spectacular worlds and dangerous descents. Build a stronger reason to learn routes, improve times and return for another race while preserving the simpler menu experience.

The game already has 13 environments, four selectable ships, nine opponents, circuits, downhill sprints and environmental hazards. The next investment should make those assets work together as a satisfying game: clear goals, meaningful racing decisions, persistent achievements within the game and rewarding results.

This direction does not guarantee commercial success or a particular visual standard. Judge progress through playable builds, visible comparisons and external playtesting.

## Reference games

The description of [AG Racing Central's video](https://www.youtube.com/watch?v=QcIK0vN7qiU) lists the following games. These notes summarize their advertised positioning as checked on 2026-10-18, not a hands-on assessment or confirmation that every advertised feature has shipped.

| Reference                                                                                      | Advertised emphasis                                                   | Useful design question                                             |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [AGX GP](https://store.steampowered.com/app/4250680/AGX_GP/)                                   | Vehicle abilities, speed classes, championships and skill challenges  | What can a player get noticeably better at over repeated runs?     |
| [Race of the Nine Worlds](https://store.steampowered.com/app/3817560/Race_of_the_Nine_Worlds/) | Story, characters and vehicle abilities                               | What connects races and gives the player a reason to continue?     |
| [Airframe Ultra](https://store.steampowered.com/app/2522120/Airframe_Ultra/)                   | Combat, customization, multiplayer and an underground-racing identity | Can a player immediately recognize the game's particular identity? |
| [DEATHGRIP](https://store.steampowered.com/app/1721590/DEATHGRIP/)                             | Detailed controls, combat, upgrades, ghosts and competitive records   | How does the game expose mastery and make improvement rewarding?   |

## Proposed expansion order

### 1. Make improvement visible

- Persist personal bests and show them on track selection and results.
- Separate records by relevant track, ship and rules versions; define how recovery affects validity.
- Add playtested bronze/silver/gold targets and clear new-record feedback.
- Make retry quick and predictable. Test how often players choose another attempt without prompting.

### 2. Build one complete championship

Start with the existing Founders Cup proposal: Halcyon → Asterion → Nacre, cumulative points, standings between races, saved progress, restart/abandon controls and a satisfying final result. Use the current ten-racer field when defining scoring.

Give the cup a clear identity and consider a cosmetic reward. Keep individual tracks available in Quick Race and Practice. Validate one cup before multiplying championships across the remaining worlds.

### 3. Add time attack and a personal ghost

Expose where a player gains or loses time, with sector comparisons and a local non-colliding ghost. The roadmap contains a three-lap Time Trial proposal; circuits and one-way sprints need explicit event rules before implementation.

Existing developer replay tooling is a foundation to inspect, not a finished player ghost system. Choose the playback approach deliberately, define compatibility/versioning, bound storage and handle obsolete records gracefully. Online leaderboards can follow later.

### 4. Deepen racing decisions

Playtest whether players can explain why they chose a ship, saved boost, braked early or approached a jump differently. Improve weak decisions before adding more systems. If the race still feels passive, prototype one additional skill mechanic on one representative track and evaluate it in play.

### 5. Connect races through presentation

Consider a short starting-grid presentation, readable rival identities, stronger finish feedback, cup standings and restrained cosmetic unlocks. These should make outcomes feel meaningful while retaining the compact menus.

## Speed, cockpit and HUD experiments

The owner is interested in snappier handling, a stronger sense of speed, an optional cockpit view, instrument-like speed/boost gauges, and more engaging environmental events. Weapon aiming, combat and more open routes are inspirations to evaluate, not approved scope.

- **Speed:** treat approximately 700 km/h as an experiment, not a new universal cap. The shared pace API already separates cruise and boost targets. At this review, Needle's Shatterline boost target is approximately 716 km/h (`173 m/s × 1.15 × 3.6`); this is a propulsion target, not a hard maximum, and downhill momentum can change actual speed.
- **Difficulty:** learning where to brake can create valuable mastery. Corners, hazards and jump approaches must communicate the required action with enough time to respond. Test entry speed, braking distance, landing windows, rivals and recovery together; a higher number alone does not establish fair difficulty.
- **Perceived speed:** compare camera distance/height, response, restrained field-of-view changes, nearby geometry, consistent world scale, engine/wind audio and frame pacing. Change one variable at a time. The camera already has smoothing and speed-dependent FOV; establish a baseline before stacking more effects.
- **Cockpit:** first test a simple forward camera and readable HUD to judge visibility through banks, inversions and flight. A finished cockpit also needs interior art, lighting, clipping clearance and comfortable motion. Prototype one ship before promising the whole fleet.
- **HUD:** prioritize speed, boost reserve, position and timing. Instruments should communicate real game state. An RPM-style gauge needs a meaningful propulsion state to represent; a targeting reticle needs an actual targeting mechanic.
- **Hazards:** extend readable, track-owned events where they improve choices. Explosions and spectacle need clear timing, gameplay purpose and a measured rendering cost.

Preserve approved steering assistance and handling outside an explicitly scoped experiment. Increasing pace requires checks across affected courses; speed classes cannot be assumed to preserve jump feasibility.

## Art strategy

The owner's concern is the gap between the current runtime artwork and the appeal of other racing games, despite several overnight revamp rounds. Source review alone cannot rank the current visuals against those games. A fresh comparison should use ordinary gameplay views at matched resolution and presentation size.

The existing [ship workflow](../../assets/ships/README.md#visual-improvement-workflow) already records a plateau from repeated procedural material tweaks and full bakes. Use its proof-before-rollout approach, alongside the [art direction](../ART_BIBLE.md) and existing level-specific workflows.

1. Choose one ship, one 30–60 second track section and a small set of concrete references. Include an ordinary connector, a corner and a jump/landing approach where possible.
2. Agree on an achievable visual target. Decide what should read clearly at racing speed: road shape, nearby structure, ship silhouette, material separation and depth.
3. Diagnose the dominant weakness: composition/scale, large and medium geometry, material authoring, lighting, export fidelity or camera presentation. Ask the agent to demonstrate the diagnosis before a broad rewrite.
4. Make one substantial intervention and compare the actual exported game at fixed views and while driving. A beauty render or critic score is insufficient acceptance evidence.
5. Measure frame time, draw calls and memory under consistent conditions. Maintain route readability and collision/camera clearance.
6. If two successive passes show only marginal improvement, reassess the construction or authoring method. Repeating another overnight detail pass is not the default response.
7. Roll out a proven treatment within the chosen level, then assess reuse elsewhere. Refresh affected saved menu previews after final visual changes.

A coherent, deliberately stylized finish is a valid target. Photorealism, additional texture noise, more postprocessing and denser scenery are not automatic improvements. Optional human art direction or carefully licensed production assets may help if separately desired; neither replaces runtime integration and testing.

## Architecture and agent guidance

The [architecture](../../ARCHITECTURE.md) already separates track-owned environments, ship assets/handling, camera presentation, rendering, session ownership and race validation. Preserve these boundaries and work in small, reviewable increments.

| Work                    | Existing ownership / direction                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cups and saved progress | Extend progression deliberately; keep session orchestration in the frontend/core and results/validity in race logic.                 |
| Records and ghosts      | Reuse existing identity and replay contracts where suitable; distinguish persistent player data from temporary developer recordings. |
| Speed experiments       | Use ship handling and the shared pace API; validate player and rival behaviour, ground/flight transitions and actual landings.       |
| Camera/HUD experiments  | Keep presentation separate from physical state; camera changes must not silently alter steering or collision.                        |
| Art                     | Keep world-specific changes under the selected level and fleet changes under ships; preserve editable sources and provenance.        |
| Performance             | Profile the actual runtime and resource lifecycle before introducing shared rendering complexity.                                    |

For each agent assignment, specify the player-visible outcome, exact area in scope, invariants, a small reference set, verification and a stopping condition. Require a concise delivery report: what changed, why, how it was checked, measured costs and known limitations. Code review and targeted regression checks remain necessary even when the owner primarily reviews play and visuals.

Available agent credits are capacity for experiments, not a guarantee of artistic quality. Spend effort on competing approaches, concrete diagnoses, bounded implementations and independent checks. Advance work when it earns a visible or playable improvement; do not widen scope simply to consume expiring usage.

## Next reviewable milestones

1. **One convincing gameplay section:** compare a bounded feel/art experiment on a representative existing course. Nightweir is a candidate because the owner already finds its descent engaging. Verify any shared camera or handling change on a contrasting circuit too.
2. **A complete three-race cup:** persistent records, standings, saved progress and polished results/retry flow using existing tracks.
3. **External playtest:** observe whether players understand braking/boost choices, finish without coaching and voluntarily replay. Record confusion, readability, responsiveness and performance separately.
4. **Expand proven work:** add further cups, time attack/ghosts and wider art treatment according to the playtest results.

Keep online multiplayer, a full story campaign, weapons, an upgrade economy, open-world conversion and large new map production outside the immediate milestone. Revisit them when evidence supports their contribution to the chosen game identity.
