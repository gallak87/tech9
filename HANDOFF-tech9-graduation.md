# Tech9 graduation

## Current structure

`_tech9/` is the framework to promote to the repository root. It owns its tools, configuration and documentation. Runnable packages install their own dependencies.

| Path                                             | Purpose                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/`, `modules.json`                       | Twelve reusable capabilities with source, assets, licenses, tests and integration guides.                                                                             |
| `baseline/`                                      | Forest starting application: authored terrain and placements, fly/walking controls, landscape rendering and weather. Selected modules are synchronized source copies. |
| `games/_pilot/`                                  | Five standalone reference pilots: Stillwater Fishing, Pinewatch Hunt, Tidebreak, Trail Driving and Forest Flight.                                                     |
| `games/<slug>/`                                  | Destination for new standalone games.                                                                                                                                 |
| `tools/`, `schemas/`, `tests/`                   | Module builds, execution plans, source copying, provenance and framework verification.                                                                                |
| `WORKFLOW.md`, `GENERATE.md`, `FRAMEWORK_DEV.md` | Shared execution practices and game/module role guides.                                                                                                               |

Framework and baseline versions live in their package manifests. Modules have no runtime dependency on games or the older root framework. Games own their copied source, assets and dependencies; `tech9.json` and `GAME_PLAN.json` remain immutable fork receipts.

The baseline selects grounded-walking, placement-collisions, landscape and weather. Its authored composition is separate from the reusable forest assets and rendering in landscape. The [canyon plan](./_tech9/docs/plans/canyon.md) and [world composition roadmap](./_tech9/ROADMAP.md) are future capability work.

From the repository root, use `./_tech9/run`; from the framework directory, use `./run`. Supported Node versions are recorded in `package.json`. Framework verification is `./run run check`; package checks run in their owning directories. Optional hooks are installed through `./run run hooks:install`.

## Pre-graduation work

Use one session and worktree with the [framework expansion prompt](./PROMPT-framework-expansion.md). Its preparation goal covers extraction, starting-point selection and reference review through verified integration. Commit the preparation checkpoint, complete that goal, and wait for the user's new-game brief. The same session can continue with a new goal for the game and framework-dev phase. Root relocation is a separate task.

| Work | Deliverable |
| --- | --- |
| Echo extraction | Reusable capabilities, supporting art and a runnable 2.5D starting package |
| Starting-point selection | Generation that selects a suitable starting package or creates a minimal standalone package |
| Reference review | Concrete findings and justified improvements informed by Canvas2D, Three.js, Godot and root authoring tools |
| Integration | Working package selection, module copies, package creation and passing affected checks |
| User input | The new game's concept, scope, presentation and target devices |
| New game and framework-dev | A completed 2D/2.5D game using the framework, followed by integrated reusable capabilities or improvements |

Chronoforge Echo is the primary extraction source. Void Sentinel supplies a Canvas2D shooter reference; Vulpine and Void Sentinel Breach supply Three.js references; Void Fracture supplies the Godot reference. Existing games retain their owned implementations. Reusable modules include the source, selected assets, presets and integration needed by another game.

Starting packages compose modules into runnable applications. Each declares its runtime and dependencies. Generation selects the appropriate foundation; concrete support follows implemented and verified package paths.

The session owns integration and can delegate independent inspection or critique. Preparation includes connecting sprite-world to generation and resolving concrete reference findings. References may justify findings alone rather than new code.

## Graduation gate

**Status: pending.** Framework expansion and the new game's brief are open. Cutover starts after preparation and the game/framework-dev phase are accepted and integrated:

- Echo capabilities and starting-point selection are usable through the new framework.
- The reference pass has resolved concrete blockers for the supported paths.
- One distinct new game meets its agreed brief and exercises relevant extracted capabilities through gameplay.
- That game's framework-dev phase contributes a useful new capability or concrete improvement, with required assets, documentation and passing checks.
- Accepted game and framework changes are merged, with completion evidence recorded here.

Update the current structure and gate status as these deliverables land. Canyon, world composition and comprehensive support for every reference runtime are independent capability work.

## Target layout

Promote all accepted `_tech9/` contents to the root, including hidden configuration, starting packages, games, modules, assets, tools and documentation. Move the older root framework into `_archive/`. Preserve source, editable assets, licenses and package boundaries. Keep `.git/` and the active `.github/` workflows at root.

GitHub deployment discovers committed browser games and reference pilots through `tools/pages.mjs`, using each package's build or static-site requirements. The workflow supports the nested and promoted framework locations. Games use `/<slug>/`, pilots use `/_pilot/<slug>/`, and Vulpine retains the front door while present. Archived games are excluded by default; `INCLUDE_ARCHIVE_GAMES=true` enables `_archive/games/` at `/_archive/<slug>/`. Choose archive coverage and any legacy-route redirects during cutover. Deployment and framework verification remain separate workflows.

## Cutover

Prerequisite: the graduation gate is complete.

1. **Checkpoint.** Inspect repository status and active worktrees, select the accepted source commit and create a recoverable checkpoint. Perform relocation in an isolated worktree.
2. **Archive.** Inventory existing root content and local files. Decide the exact `_archive/` contents and archived-game deployment policy; preserve required package boundaries and supporting tools.
3. **Promote.** Move the agreed root content to `_archive/`, then move `_tech9/` contents to root. Resolve path collisions, carry hidden configuration and preserve fork receipts byte-for-byte. Reinstall dependencies in owning packages.
4. **Reconnect.** Update root instructions, documentation links, commands, ignore rules and repository integrations. Install the scoped hook at `.husky/_`. Update GitHub deployment discovery, build paths and public routes for the selected game set.
5. **Verify.** Run root framework checks, module synchronization checks and affected baseline/package checks. Confirm relocated assets load and deployment output includes every selected game at its intended route.
6. **Commit.** Commit the cutover with concise root setup, module use and deployment instructions. Reconcile any remaining worktrees with the new paths.

Graduation is complete when the gate is satisfied and the root framework, preserved archive and deployment routes operate from their intended locations.
