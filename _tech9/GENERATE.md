# Build a game

Use **game-dev** to turn a game idea into a standalone playable package. For reusable module work, use [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md).

Read [AGENTS.md](./AGENTS.md), [WORKFLOW.md](./WORKFLOW.md), the [module guide](./modules/README.md) and the baseline's README/architecture. The framework root is `_tech9/`; CLI paths are relative to the framework directory.

## Define the experience

Describe the player objective, core actions, outcome, recovery and restart. Start with the baseline and identify the modules and game-specific systems needed for the experience. Record scope, acceptance, path ownership, dependencies, validation, authority and the stopping point in `runs/<slug>/BRIEF.md` and `plan.json`. The plan follows the [execution-plan schema](./schemas/execution-plan.schema.json).

Use delegated authority for routine decisions and clarify material missing requirements. A planning-only task ends with the plan.

For pilots, set `artGate` to `{ "threshold": 8, "maxRounds": 4 }`. Deliver the complete playable loop and bounded review cycle before further depth. Larger games use the milestones and handoff points defined in their brief.

## Create the package

The fork destination must be absent. If `games/<slug>` contains exactly a launch packet (`BRIEF.md` and `PROMPT.md`), move that directory to `runs/<slug>` before creating its plan. Preserve existing run directories and inspect unexpected contents. A game with a fork receipt is an existing project to resume.

From `_tech9`, using supported Node:

```sh
./run ci
./run run t9 -- modules
./run run t9 -- validate runs/<slug>/plan.json
./run run t9 -- fork --slug <slug> --plan runs/<slug>/plan.json --port <dev-port> --dry-run
./run run t9 -- fork --slug <slug> --plan runs/<slug>/plan.json --port <dev-port>
./run --prefix games/<slug> ci
```

Copy the clean, committed baseline. Set `schemaVersion: 2` and `baselineVersion` to the version in `baseline/package.json` in the execution plan. Integrate additional modules using the [module guide](./modules/README.md) and [copying guide](./docs/MODULES.md), preserving their layout, dependencies and licenses. Keep `tech9.json` and `GAME_PLAN.json` byte-for-byte intact. Give the game its own presentation, storage namespace and documentation.

## Build and validate

Executing a launch prompt requests a managed goal for implementation, validation, review and handoff. Create it after scope definition when supported by the host; preserve any unfinished goal. Otherwise use the written execution plan.

Keep renderer ownership, content, controllers and rules separate. Complete start → real input → core action → outcome → restart before adding depth. Follow the brief's milestones and [shared workflow](./WORKFLOW.md).

Run the package's unit, lint, build and browser checks. Verify success, failure/recovery, pause/resume, focus loss and restart through real input. Test hooks behind `?test=1` support observation and rare-state setup. Performance measurements include browser, GPU, viewport, preset and frame timing.

With multiple worktrees, use assigned paths and free strict ports. Coordinate GPU captures against committed builds and disclose competing machine load. Stop task-owned processes at handoff.

## Review and handoff

Use an independent demanding art critic against committed builds and browser captures. Assess composition, lighting, materials, assets, animation, coherence and readability against the brief's visual ambition. Fix the highest-value findings and commit before the next round. Stop at the agreed threshold or round cap and report the actual result. Correctness blockers require resolution regardless of visual score.

Keep launch instructions, controls and limitations in the game README. Report validation, review results and remaining scope in the task. Complete the managed goal when the required handoff is finished, including an honest failed art gate if the round cap was reached. Handle local records as described in WORKFLOW.md.

Reusable game systems can be brought into the framework through a separately scoped framework-dev task.
