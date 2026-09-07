# Chronoforge Dusk roadmap

**Current state:** 01 native foundation is implemented and tested; 02 and all later implementation remain unstarted. See [native instructions](NATIVE.md) and [evidence](evidence/README.md). This is the ordered route from the first native build to a finished game. Assign one numbered plan at a time, or explicitly assign independent portions in parallel. Reading this roadmap does not authorize executing it all.

## Start to finish

1. **[01 — Native game foundation](_plans/01_native_foundation.md).** Create the small Godot game and its built-in development mode. Deliver a runnable Mac app, traversal, a rehearsal target, prepared-asset selection, and visible diagnostics. Temporary test assets are clearly identified. **Bounded engineering task.**
2. **[02 — Asset pipeline](_plans/02_asset_pipeline.md).** Build metadata-selected production routes, prove static and skeletal exports, and prepare the new Kaida source/rig/animation handoff. Manual Meshy/Mixamo steps remain acceptable. **Bounded tooling task with possible manual handoff.**
3. **[03 — Kaida in game](_plans/03_kaida_in_game.md).** Import the real new Kaida and refine appearance, grip, animation, movement, and battle presentation through the actual game. **Iterative work with owner playtesting.**
4. **[04 — Repeatable asset updates](_plans/04_repeatable_assets.md).** Prove a revised Kaida and a static prop can reach the game without special repair, lost tuning, or confusing version state. **Bounded integration task.**
5. **[05 — Story and first-region design](_plans/05_story_and_region.md).** With Kaida established, develop the crew's personality and first chapter with the owner. Turn the agreed story into a compact playable-region design. **Collaborative planning, not an autonomous whole-story generation task.**
6. **[06 — First complete playable loop](_plans/06_first_playable_loop.md).** Implement the agreed explore → encounter → battle → reward → crew improvement → settlement improvement loop, including save/load and retry. **Implementation milestone to size from the accepted design.**
7. **[07 — Finish the first region](_plans/07_finish_first_region.md).** Complete the trio, deepen encounters and progression, add authored story moments, and polish the region's climax and ending. **Several focused tasks and playtest passes.**
8. **[08 — Expand one region at a time](_plans/08_expand_the_game.md).** Choose and deliver the next region from the wider Chronoforge direction. Repeat the proven loop until the agreed game arc is complete. **Future planning outline; refine each region when reached.**
9. **[09 — Finish and package the game](_plans/09_finish_and_package.md).** Close progression/story gaps, validate the complete playthrough, tune performance and usability, and deliver the native application and source. **Future completion outline.**

**01 is complete. Steps 02–09 are not started.** Update individual statuses when work actually happens; do not infer completion from documents or disconnected code.

## What to give a new agent

For a bounded task, provide this instruction with the selected plan's absolute path:

> Read the project's AGENTS.md and the selected numbered plan. Complete only that assignment, following its prerequisites, ownership, and done criteria. Make routine decisions autonomously, use the listed references as needed, and verify the result in the actual runtime where applicable. Commit at coherent checkpoints per AGENTS.md. Report the outcome, evidence, remaining manual inputs, and any reused sources. Do not advance to the next plan or push unless I ask.

“Complete” includes honestly identifying missing source assets or manual inputs. A placeholder or structural test does not establish that Kaida is finished. Each implementation handoff should also identify the game/asset revisions tested and the next bounded action.

**01 has supplied the runnable foundation and concrete runtime handoff. Assign 02 explicitly to continue.** The source-reference and hosted acquisition portion of **02** can proceed alongside it. The game lane in 01 owns concretizing the shared runtime descriptor; pipeline tools in 02 consume that agreed handoff. Do not let both lanes independently invent the runtime format. Once 01 supplies it, the local tooling portion of 02 is a good separate assignment.

For a new planning session, use [PLANNER.md](PLANNER.md) to recover the intent behind this sequence and scope the next assignment from actual results.

The remainder of 02, 03, and 04 form a short iteration loop: real-asset findings may require changes to the producer or consumer. Numbers indicate dependency order, not a ban on returning to an earlier step to fix a cause.

## Parallel work

- Begin with a game lane and an asset lane. These are responsibilities, not fixed agent personas or a prescribed orchestration framework.
- Give each assignment explicit files/components to own. Coordinate changes to shared handoff data and avoid simultaneous edits to it.
- One integrator controls the reference running game. Use isolated worktrees/processes and identified revisions for simultaneous visual evaluation; sharing disjoint files alone does not isolate screenshots.
- Connect work to the runtime early. More content is not a substitute for unresolved Kaida quality.
- After 03, the owner can begin the story discussion in 05 while the integration lane completes 04. **06 needs both 04's repeatability proof and 05's agreed design.**
- As the first region develops, the asset lane can slowly deliver Vex, Rune, enemies, props, and environment pieces. Do not manufacture every biome or asset upfront.

## Scope and horizon

Only the early tasks are ready for immediate assignment. Later plans intentionally describe outcomes and the planning needed to make them concrete. A multi-week game, subjective character polish, and an owner-led story are not reliable one-shot deliverables.

The target is a native Godot Mac application. Browser delivery is a future pivot only if a compelling need emerges; no dual-target or compatibility work is scheduled. Dates, total regions, exact story beats, and the final game length remain open to owner direction and actual results.

The [future tech9 discussion](FRAMEWORK_FUTURE.md) is separate from this roadmap. Capture lessons as Dusk develops, then discuss extraction and possible archival later. It does not block any game milestone.
