# Expand Tech9, then build the graduation game

## Preparation goal

Create a goal to complete and verify the integrated Echo extraction, starting-point selection and reference-game review described below. Own implementation, integration and validation in this session. Work autonomously through preparation, commit the completed result, then stop for the user's new-game brief.

Use an isolated Git worktree from the current accepted branch. Reuse a suitable task worktree or create a managed one. Read `_tech9/AGENTS.md`, `_tech9/WORKFLOW.md`, `_tech9/FRAMEWORK_DEV.md`, `_tech9/GENERATE.md` and `HANDOFF-tech9-graduation.md`. Read local instructions and architecture for the source packages you inspect.

Delegate bounded inspection and independent critique when useful. Keep one owner per edited path and integrate the findings here. Commit stable milestones and keep current usage documentation concise.

## Echo extraction

Use framework-dev to extract a usable 2D/2.5D foundation from `games/chronoforge-echo/`. Echo uses PixiJS and Canvas. Follow its local instructions for any work inside the game, including permission to run its browser checks. Echo retains its independently maintained implementation and campaign.

- Assess cohesive capabilities around sprite-world rendering and exploration, touch/viewport handling, and asset loading. These are candidate areas, not a required module count.
- Put selected canonical capabilities in `_tech9/modules/`, with the reusable art, editable sources, licenses, presets and integration needed by another game. Parameterize authored content, dimensions, budgets and game callbacks.
- Compose owned module copies into `_tech9/baselines/sprite-world/`: a compact authored starting application with movement, camera, scenery depth/occlusion and usable controls. Preserve the demonstrated presentation quality of reused art.
- Register the modules and adapt build/dependency handling as required. Prioritize exploration and presentation; broader ATB combat, campaign progression and save migration extraction need separate justification.

Keep related implementation parts together unless independent reuse warrants a split.

## Starting-point selection

Allow generation to select a suitable starting package or scaffold a minimal standalone web package when none fits. Use `tools/scaffold.js` as a reference for stack selection.

- Use `_tech9/baselines/<name>/` for named runnable starting packages, including forest and sprite-world. Each owns its package, runtime dependencies, launch/build commands and module selection.
- Adapt generation, plan validation, copying, module synchronization and provenance to the selected source. Preserve existing games and immutable fork receipts, overwrite protection and clean-source provenance for package copies.
- Keep renderer and runtime requirements explicit. Advertise implemented and verified paths; native-engine support requires a usable package path.
- Update quickstart, architecture, generation and copying guides with concise commands for the supported choices.

Each game owns its source, assets and dependencies. Starting packages supply authored composition; modules supply reusable capabilities with concrete dependencies.

## Reference-game review

Use these implementations to identify real requirements and useful authoring tools. Inspect their completion state and feed findings into the extraction and generation work as it develops.

| Source | Perspective |
| --- | --- |
| `games/void-sentinel/` | Canvas2D top-down scrolling shooter |
| `games/vulpine/` | Three.js flight/shooter, worlds and audio |
| `games/void-sentinel-breach/` | Three.js and Blender/GLB asset preparation |
| `games/void-fracture/` | Native Godot scenes, scripts and package structure |
| `tools/` | Stack selection, sprite/scenery authoring and development tooling |

Trace how these game styles fit the supported entry points. Resolve unnecessary forest, RPG or renderer assumptions. Promote a helper or authoring tool when it supplies a concrete missing capability; extend accepted modules where they already fit. Keep useful usage guidance with the implementation and deferred opportunities in the roadmap. The reference review can produce findings without new code; a port or extraction from every game is outside this goal.

## Preparation acceptance

Run framework checks, relevant starting-package checks and focused generation tests. Verify the actual forest and sprite-world packages through source selection, module synchronization and package creation. Exercise the new starting application's rendering, movement, controls and asset lifetime through real input. Keep disposable verification packages and output in ignored artifacts.

Use the shared workflow's harsh independent visual critique for authored visual deliverables, and review the integrated interfaces. Resolve actionable findings and report concrete remaining limitations.

Preparation is complete when the extracted capabilities, named starting packages and generation tooling work together, reference findings are resolved or explicitly deferred, and required checks pass. Commit that checkpoint and update the graduation document's current structure and preparation status. Leave the worktree ready for the game phase and the branch ready for review; merging remains subject to the user's instructions.

## Game brief gate

Complete the preparation goal only when its acceptance criteria are satisfied. End the turn with a concise handoff containing the commit, available starting points, launch commands, validation and limitations. Ask the user for the new game's concept, core loop, presentation and target devices. Scope and visual review requirements can be agreed from that brief.

Wait for the brief before creating or implementing the game. The user's choice is a required input, not a routine decision to infer. Root cutover remains a later task.

## After the brief

Continue in this session and worktree. Clarify material missing requirements and create a new goal for the agreed game plus its framework-dev phase.

1. Use `_tech9/GENERATE.md` to create a distinct standalone 2D/2.5D game in `_tech9/games/<slug>/`, selecting the appropriate starting point and relevant extracted modules.
2. Build the complete agreed experience. Validate gameplay, controls, lifecycle, presentation and performance; follow the agreed harsh independent critique and improvement passes.
3. Complete a separately scoped framework-dev phase. Bring back a useful new capability or concrete module improvement discovered during development, with required assets, presets, integration and checks.
4. Commit the game and framework work, report completion evidence, and update `HANDOFF-tech9-graduation.md`. Merge when authorized by the user.

**Graduation gate: one completed new game using the expanded framework, plus its completed and integrated framework-dev phase.** Preparation alone does not satisfy this gate. Accepted changes must be merged before the separate root cutover task.
