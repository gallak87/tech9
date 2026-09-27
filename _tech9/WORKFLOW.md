# Working with Tech9

- **game-dev:** build a standalone game from a baseline. Start with [GENERATE.md](./GENERATE.md).
- **framework-dev:** build or improve reusable modules. Start with [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md).

Resolve workflow paths from `_tech9/`. CLI paths are relative to the framework directory.

## Plan and coordinate

Record scope, acceptance, path ownership, dependencies, validation, authority and the stopping point in ignored `runs/<task>/`. Game forks use `plan.json` following the [execution-plan schema](./schemas/execution-plan.schema.json). Framework tasks can use a short plan suited to their scope.

Use the authority delegated by the user and clarify material missing requirements. Assign one owner per edited path and use bounded agents when authorized. Send current instructions directly to agents in other worktrees; ignored coordination files remain local.

## Build and verify

Keep renderer ownership, authored content, controllers and game rules at concrete interfaces. For games, complete start → player input → core action → outcome → restart before expanding depth.

Run relevant unit, lint and build checks. Use real-input browser checks for player interactions and rendering changes. Test hooks support observation and rare-state setup. Framework checks run through `./run run check`; package commands live in their packages.

Commit stable source before independent review. Serialize browser/GPU captures against that build. Fix actionable findings and rerun affected checks. Performance records include browser, GPU, viewport, preset and frame timing, with the measurement's limits.

For visual work, use the brief's review target and round cap. If a requested art gate has neither, default to **8/10 or four rounds**, whichever comes first. An independent demanding critic reviews composition, lighting, materials, assets, animation and readability against the brief and its references. Fix the highest-value findings between committed captures. Report the actual result and remaining limitations; resolve correctness blockers independently of the visual score.

## Deliver

Commit source, tests, editable assets and required licenses. Keep launch instructions, controls and current limitations with the owning package. A reusable module includes one usage aid: a working example or concise documentation.

Report the deliverable, validation and limitations in the task. Keep plans, assignments, reviews and captures in ignored `runs/` or `.artifacts/`. Remove the completed task's run folder after handoff, preserving other active tasks. Git records source history.

Stop task-owned processes and finish at the agreed handoff.
