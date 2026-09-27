# Tech9 graduation

## Current structure

`_tech9/` is the framework to promote to the repository root. It owns its tools, configuration and documentation. Runnable packages install their own dependencies.

| Path                                             | Purpose                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/`, `modules.json`                       | Thirteen reusable capabilities with source, assets, licenses, tests and integration guides.                                                                           |
| `baselines/web-3d-world/`                        | Forest starting application: authored terrain and placements, fly/walking controls, landscape rendering and weather. Selected modules are synchronized source copies. |
| `baselines/web-2.5d-world/`                      | Authored coastal starting application with generic sprite-world exploration, camera, depth/occlusion, desktop/touch controls and owned artwork.                       |
| `scaffolds/`                                     | Minimal standalone Canvas2D, PixiJS and Three.js packages with owned dependencies and input/lifecycle examples.                                                       |
| `games/_pilot/`                                  | Five standalone reference pilots: Stillwater Fishing, Pinewatch Hunt, Tidebreak, Trail Driving and Forest Flight.                                                     |
| `games/<slug>/`                                  | Destination for new standalone games.                                                                                                                                 |
| `tools/`, `schemas/`, `tests/`                   | Module builds, execution plans, source copying, provenance and framework verification.                                                                                |
| `WORKFLOW.md`, `GENERATE.md`, `FRAMEWORK_DEV.md` | Shared execution practices and game/module role guides.                                                                                                               |

Framework and baseline versions live in their package manifests. Modules have no runtime dependency on games or the older root framework. Games own their copied source, assets and dependencies; `tech9.json` and `GAME_PLAN.json` remain immutable fork receipts.

`web-3d-world` selects grounded-walking, placement-collisions, landscape and weather. Its authored composition is separate from the reusable forest assets and rendering in landscape. The CLI selects either authored baseline or a minimal `web-canvas2d`, `web-pixi` or `web-three` scaffold. Module synchronization targets the selected package explicitly and validates renderer/runtime, dependencies and sibling modules. `sprite-world` takes explicit authored data and callbacks; Echo campaign/combat/progression/save state remains outside the framework. The [canyon plan](./_tech9/docs/plans/canyon.md) and [world composition roadmap](./_tech9/ROADMAP.md) are future capability work.

From the repository root, use `./_tech9/run`; from the framework directory, use `./run`. Supported Node versions are recorded in `package.json`. Framework verification is `./run run check`; package checks run in their owning directories. Optional hooks are installed through `./run run hooks:install`.

## Pre-graduation work

Use one session in the current checkout with the [framework expansion prompt](./PROMPT-framework-expansion.md). Its preparation goal covers extraction, starting-point selection and reference review through verified integration. Commit the preparation checkpoint, complete that goal, and wait for the user's new-game brief. The same session can continue with a new goal for the game and framework-dev phase. Root relocation is a separate task.

| Work                       | Deliverable                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Echo extraction            | Reusable capabilities, supporting art and a runnable 2.5D starting package                                  |
| Starting-point selection   | Generation that selects a suitable starting package or creates a minimal standalone package                 |
| Reference review           | Concrete findings and justified improvements informed by Canvas2D, Three.js, Godot and root authoring tools |
| Integration                | Working package selection, module copies, package creation and passing affected checks                      |
| User input                 | The new game's concept, scope, presentation and target devices                                              |
| New game and framework-dev | A completed 2D/2.5D game using the framework, followed by integrated reusable capabilities or improvements  |

Chronoforge Echo is the primary extraction source. Void Sentinel supplies a Canvas2D shooter reference; Vulpine and Void Sentinel Breach supply Three.js references; Void Fracture supplies the Godot reference. Existing games retain their owned implementations. Reusable modules include the source, selected assets, presets and integration needed by another game.

Starting packages compose modules into runnable applications. Each declares its runtime and dependencies. Generation selects the appropriate foundation; concrete support follows implemented and verified package paths.

The session owns integration and can delegate independent inspection or critique. Preparation includes connecting `web-2.5d-world` to generation and resolving concrete reference findings. References may justify findings alone rather than new code.

## Preparation checkpoint

**Status: complete; ready for step 04 with the user.** Implementation checkpoint `b216931b` integrates the approved cohesive `sprite-world` extraction, both authored starting packages, three minimal web scaffolds and source-qualified reference findings. The final documentation checkpoint records acceptance without changing runtime source. No new game or root cutover has begun.

`sprite-world` requires explicit scene, artwork, actor and ground-painter inputs. Its optional coastal preset retains the source artwork, measured crops, editable originals and notices. The coastal starting application demonstrates traversal, camera, scenery depth/occlusion, collisions, landmark callbacks, keyboard/pointer/touch controls and resource lifetime. Echo's campaign, combat, progression and saves remain outside the module. Existing games and immutable receipts were preserved.

Validation completed:

- Framework: **221 tests**, lint/format, module builds and registry validation for all **13 modules**.
- All five committed starting points: owned dependency installation, source copying, production build and immutable receipt checks. Both baselines passed source synchronization (3D: 4 modules/64 files; 2.5D: 1 module/24 files), package tests (21 and 2) and lint/build checks.
- Coastal application: **14 real-input browser checks**, including camera/movement, collisions, interaction, pause/focus, reset/disposal, touch cancellation, rotation and persisted-page recovery. Production checks passed local art/font loading under a subpath, back navigation and exclusion of development test hooks. All three minimal scaffolds passed keyboard, pointer, touch, resize and lifecycle browser checks.
- Independent interface review: all four reported ownership/configuration/history issues fixed and rechecked. Independent visual review: **8.0/10 in round 3**; ordinary input reaches the observatory and a grounded, opaque shoreline lookout.
- Representative coastal timing: 180 frames, median/p95 **16.7/16.7 ms**, Chromium 153.0.8010.53, ANGLE Metal Apple M1 Pro, 1280×720 CSS viewport, coastal preset and 1.5-million backing-pixel budget. This is one desktop sample, not physical mobile acceptance or full GPU-memory measurement.

Evidence remains in ignored `_tech9/.artifacts/framework-expansion/` (final framework log, interface/visual reports and `final-generation.json`), `_tech9/.artifacts/generation/run-gewTSg/`, `_tech9/.artifacts/scaffold-browser/run-A50REa/` and the coastal package's `.artifacts/verification/`.

Remaining limits are explicit: direct click movement does not route around obstacles; scenery fade affects whole props; ground/water repeats and angular authored boundaries remain visible; still captures do not establish motion polish. Resource bytes estimate retained pixels, and protected active/pending artwork may exceed the eviction target. Physical mobile performance, native Godot generation and broader asset tooling remain future work. Reference findings and justified deferrals are in `_tech9/docs/REFERENCE-GAMES.md` and `_tech9/ROADMAP.md`.

The user deferred `audio-runtime` for review after step 03; it is recorded but not extracted. Step 04 awaits the user's new-game concept, core loop, presentation and target devices. Agree its scope and visual gate before starting the separate game/framework-dev goal.

From the repository root:

```sh
./_tech9/run --prefix baselines/web-2.5d-world run dev # http://127.0.0.1:4403
./_tech9/run --prefix baselines/web-3d-world run dev  # http://127.0.0.1:4399
./_tech9/run run t9 -- starting-points
```

Use `_tech9/GENERATE.md` for `web-canvas2d`, `web-pixi` or `web-three` and for creating the selected standalone game after the brief.

## Graduation gate

**Status: pending.** Preparation is complete and committed. The new game’s brief remains required; preparation alone does not satisfy graduation. Cutover starts after preparation and the game/framework-dev phase are accepted and integrated:

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
5. **Verify.** Run root framework checks, module synchronization checks and affected baselines/web-3d-world/package checks. Confirm relocated assets load and deployment output includes every selected game at its intended route.
6. **Commit.** Commit the cutover with concise root setup, module use and deployment instructions. Reconcile any remaining worktrees with the new paths.

Graduation is complete when the gate is satisfied and the root framework, preserved archive and deployment routes operate from their intended locations.
