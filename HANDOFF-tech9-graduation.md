# Tech9 graduation

Snapshot: 2026-09-26. Integration branch: `g/scene-test`. Framework checkpoint: `70dd3bef`.

## Current framework

`_tech9/` is the self-contained framework to promote to the repository root. Its package is version 3.0.0. Commands resolve from the framework directory; each runnable baseline and game owns its source, assets, dependencies and package lifecycle.

- `baseline/`: the runnable 160 × 160 metre forest, version 1.3.0, with fly and grounded exploration.
- `modules/` and `modules.json`: six registered capabilities—grounded walking, placement collisions, pond water, boat motion, follow camera and island ocean. Modules include usable code, supporting assets, tests and concise integration guidance.
- `games/`: standalone Stillwater Fishing, Pinewatch Hunt and Tidebreak packages; the Trail Driving launch packet is also committed here.
- `tools/`, `schemas/` and `tests/`: module tooling, execution plans, baseline copying and provenance validation. The fork command currently selects `baseline/` and creates `games/<slug>/`.
- `GENERATE.md`, `FRAMEWORK_DEV.md` and `WORKFLOW.md`: game development, reusable-capability development and execution/review practices.

Runtime and build code in `_tech9/` has no identified dependency on the legacy root framework. Repository-level integration covers Git provenance and optional hook installation. The local hook path is `_tech9/.husky/_`.

Use supported Node (`^22.13.0 || >=24.0.0`) through `./_tech9/run`. From `_tech9/`, `./run run check` runs framework tests, lint, canonical module builds and registry validation.

## Parallel work and integration

Inspect the current branches and working trees before selecting a graduation checkpoint. Worktree progress and local review evidence are separate from this branch's committed framework.

| Work          | Branch                | Integration status                                                                                                                 |
| ------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Forest Flight | `codex/forest-flight` | Game, flight-module and landscape work remain outside the integration branch; user playtest governs acceptance.                    |
| Trail Driving | `codex/trail-driving` | Vehicle game, model polish and reusable vehicle packaging remain outside the integration branch; user playtest governs acceptance. |
| Weather       | `codex/weather`       | Committed launch packet at `modules/weather/`; implementation belongs to the dedicated worktree.                                   |
| Canyon        | `codex/canyon`        | Committed launch packet at `baselines/canyon/`; implementation belongs to the dedicated worktree.                                  |

Weather develops rain, wetness, settled snow, snowfall, wind and presets against the forest. Canyon develops a standalone dry landscape. Both briefs require six independent demanding art-critic passes with fixes between passes and a 9/10 target. Review actual results before accepting either implementation.

A subsequent integration pass applies weather to canyon and establishes the multiple-baseline layout and selection workflow. Forest and canyon remain standalone starting packages; games adopt owned source copies. [World composition](./_tech9/ROADMAP.md) is future capability work, independent of graduation.

## Graduation target

The accepted contents of `_tech9/` become the repository-root framework, including packages, games, modules, assets/licenses, tools, schemas, documentation and hidden configuration. The root package and entry instructions come from that framework. The `_tech9/` wrapper is removed.

`_archive/` holds the older root framework. Its exact contents and treatment of the older games are TBD. Preserve each archived package's source, assets, licenses and package boundary. The older root `package.json` can remain with its archived CommonJS tools.

GitHub deployment remains active. Update `.github/workflows/deploy.yml` to discover and host every committed game with a runnable entry, using each game's package or static-site requirements and distinct routes. Inclusion of games under `_archive/` is TBD. Keep game publication separate from framework validation.

The intended multiple-baseline layout is `baselines/forest/` and `baselines/canyon/`, with explicit baseline selection in the fork workflow. Establish that layout during the weather/canyon integration or as a deliberate part of graduation; update copying and module-sync tooling together with it.

## Cutover sequence

1. **Choose the source checkpoint.** Account for active worktrees and pending playtests. Integrate accepted deliverables and identify work that will continue after relocation. Create a recoverable Git checkpoint and perform the cutover in an isolated worktree.
2. **Define the archive.** Inventory the older root framework, games, assets and local files. Decide what moves to `_archive/`, including package boundaries and any tools required by retained games. Decide whether archived games participate in deployment. Keep `.git/` and the active `.github/` workflow at the repository root.
3. **Promote the framework.** Move the agreed root content into `_archive/`, then move the accepted `_tech9/` contents to root, including hidden configuration. Resolve directory/name collisions explicitly. Preserve game ownership and leave existing `tech9.json` and `GAME_PLAN.json` receipts byte-for-byte intact. Reinstall dependencies in their owning packages.
4. **Update entrypoints.** Correct documentation links, package commands, module-sync and baseline-selection paths, ignore rules and active agent/command instructions. Reinstall the scoped hook at `.husky/_` with `./run run hooks:install`. Retain and update deployment discovery, build paths and public routes for the chosen game set.
5. **Validate the relocated tree.** Run `./run ci`, `./run run check` and CLI/module-copy checks from root. Run affected baseline/package checks and launch existing content to verify relocated asset paths. Validate deployment discovery and site output for every included game. Record actual results and unresolved issues.
6. **Finish the handoff.** Commit the cutover and publish concise root setup, baseline selection, module integration and deployment instructions. Confirm the committed content has its intended active or archived location and reconcile remaining worktrees before resuming them.

## Decisions remaining

- Exact `_archive/` contents, including the location of older games and retained supporting tools.
- Archived-game deployment inclusion and public route naming.
- The accepted feature checkpoint and timing of the multiple-baseline change.

Graduation is complete when the promoted root framework operates independently, the archive has its agreed contents, deployment covers the selected committed games, and the relocated workflows pass their required checks.
