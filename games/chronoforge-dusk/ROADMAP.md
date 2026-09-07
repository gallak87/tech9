# Chronoforge Dusk roadmap

**Current state:** 01–03 deliver the tested [Kaida a1](releases/kaida-a1.md) checkpoint. 04 is paused. 05 has a separate story/design draft awaiting owner review; it is not accepted canon. **06 is the next bounded assignment: a polished coastal environment for Kaida to explore.** Its implementation has not started. See [native instructions](NATIVE.md) and [evidence](evidence/README.md). Assign one numbered plan at a time, or explicitly assign independent portions in parallel. Reading this roadmap does not authorize executing it all.

## Next direction

Review and assign [06 — Coastal environment and traversal](_plans/06_environment_and_traversal.md). It uses 03's finished handoff and does not wait for standalone 04, story approval, ATB, or more characters. Build the physical place first; integrate the complete gameplay loop later through 07. This planner update does not itself start implementation.

## Start to finish

1. **[01 — Native game foundation](_plans/01_native_foundation.md).** Create the small Godot game and its built-in development mode. Deliver a runnable Mac app, traversal, a rehearsal target, prepared-asset selection, and visible diagnostics. Temporary test assets are clearly identified. **Bounded engineering task.**
2. **[02 — Asset pipeline](_plans/02_asset_pipeline.md).** Build metadata-selected production routes, prove static and skeletal exports, and prepare the new Kaida source/rig/animation handoff. Manual Meshy/Mixamo steps remain acceptable. **Bounded tooling task with possible manual handoff.**
3. **[03 — Kaida in game](_plans/03_kaida_in_game.md).** Import the real new Kaida and refine appearance, grip, animation, movement, and battle presentation through the actual game. **Iterative work with owner playtesting.**
4. **[04 — Repeatable asset updates](_plans/04_repeatable_assets.md).** Prove useful asset revisions without lost tuning or confusing version state. **Paused integration exercise; not a gate for 06.** Relevant static-asset evidence can emerge during environment work.
5. **[05 — Story and first-region design](_plans/05_story_and_region.md).** Review the proposed crew personality and first chapter with the owner, then agree a compact playable-region design. **Collaborative planning; can run alongside 06.**
6. **[06 — Coastal environment and traversal](_plans/06_environment_and_traversal.md).** Put Kaida in one polished coastal-ruins area with scenery, collision, elevation, comfortable camera behavior, atmosphere, and measured native performance. **Bounded implementation; no story or combat prerequisite.**
7. **[07 — First complete playable loop](_plans/07_first_playable_loop.md).** Build on 06 and implement the agreed explore → encounter → battle → reward → crew improvement → settlement improvement loop, including save/load and retry. **Implementation milestone to size from the accepted design.**
8. **[08 — Finish the first region](_plans/08_finish_first_region.md).** Complete the trio, deepen encounters and progression, add authored story moments, and polish the region's climax and ending. **Several focused tasks and playtest passes.**
9. **[09 — Expand one region at a time](_plans/09_expand_the_game.md).** Choose and deliver the next region from the wider Chronoforge direction. Repeat the proven loop until the agreed game arc is complete. **Future planning outline; refine each region when reached.**
10. **[10 — Finish and package the game](_plans/10_finish_and_package.md).** Close progression/story gaps, validate the complete playthrough, tune performance and usability, and deliver the native application and source. **Future completion outline.**

**Execution path now: 03 → 06 → 07 → 08 → 09 → 10.** 05's owner-agreed design joins before 07; relevant asset-repeatability checks accompany integration. 04 remains separately paused. The 05 draft is committed on `codex/dusk-story-05` and has not been merged into this checkout. 06–10 are not implemented. See [release evidence](evidence/kaida-03/README.md) and the [current source handoff](_prep/KAIDA_HANDOFF.md).

## What to give a new agent

For a bounded task, provide this instruction with the selected plan's absolute path:

> Read the project's AGENTS.md and the selected numbered plan. Complete only that assignment, following its prerequisites, ownership, and done criteria. Make routine decisions autonomously, use the listed references as needed, and verify the result in the actual runtime where applicable. Commit at coherent checkpoints per AGENTS.md. Report the outcome, evidence, remaining manual inputs, and any reused sources. Do not advance to the next plan or push unless I ask.

“Complete” includes honestly identifying missing source assets or manual inputs. A placeholder or structural test does not establish that Kaida is finished. Each implementation handoff should also identify the game/asset revisions tested and the next bounded action.

The game lane owns the runtime descriptor and alpha graduation. The production lane owns current editable sources and export recipes. [Kaida a1](releases/kaida-a1.md) is the current checkpoint. Further work requires a new assignment; cosmetic polish and hosted downloads are optional under the [quality cutoff](DECISIONS.md#phase-one-quality-cutoff--2026-09-07).

For a new planning session, use [PLANNER.md](PLANNER.md) to recover the intent behind this sequence and scope the next assignment from actual results.

Real-asset findings may require focused producer or consumer fixes from the earlier steps. Numbers locate milestones; their explicit prerequisites determine dependencies. 04's position in the list does not block 06.

## Parallel work

- Begin with a game lane and an asset lane. These are responsibilities, not fixed agent personas or a prescribed orchestration framework.
- Give each assignment explicit files/components to own. Coordinate changes to shared handoff data and avoid simultaneous edits to it.
- One integrator controls the reference running game. Use isolated worktrees/processes and identified revisions for simultaneous visual evaluation; sharing disjoint files alone does not isolate screenshots.
- Connect work to the runtime early. Use Kaida a1's good-enough cutoff; cosmetic refinements and additional characters do not hold up the environment.
- **06 and 05's story review are independent.** The complete loop in 07 needs the playable environment, agreed story/design, and working handoffs for its selected assets. Repeatability evidence can come from 06 or separately assigned 04 work.
- Within an assigned environment task, scenery production and game/camera work can run in parallel when authorized and coordinated. The environment requires only Kaida. Vex, Rune, enemies, and later biome assets wait for their own assignments.

## Scope and horizon

06 is ready for review and assignment as a bounded environment task. 07–10 intentionally describe future outcomes and the planning needed to make them concrete. A multi-week game, subjective character polish, and an owner-led story are not reliable one-shot deliverables.

The target is a native Godot Mac application. Browser delivery is a future pivot only if a compelling need emerges; no dual-target or compatibility work is scheduled. Dates, total regions, exact story beats, and the final game length remain open to owner direction and actual results.

The [future tech9 discussion](FRAMEWORK_FUTURE.md) is separate from this roadmap. Capture lessons as Dusk develops, then discuss extraction and possible archival later. It does not block any game milestone.
