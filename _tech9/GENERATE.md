# Build a game

Use **game-dev** to turn a game idea into a standalone playable package. For reusable module work, use [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md).

Follow [WORKFLOW.md](./WORKFLOW.md). Read the [module guide](./modules/README.md) and the baseline's README/architecture. CLI paths are relative to the framework directory.

## Define the experience

Describe the player objective, core actions, outcome, recovery and restart in `runs/<slug>/BRIEF.md`. Identify the modules and game-specific systems needed. Record the execution plan in `runs/<slug>/plan.json` using the [schema](./schemas/execution-plan.schema.json) and shared workflow.

Use delegated authority for routine decisions and clarify material missing requirements. A planning-only task ends with the plan.

Set `artGate` and milestones to the brief's review requirements. Reference pilots live in `games/_pilot/`; create new games in `games/<slug>/`.

## Create the package

The current fork command uses `baselines/web-3d-world/`. `baselines/web-2.5d-world/` awaits extraction; selectable starting points are part of the framework expansion task.

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

Copy the clean, committed baseline. Set `schemaVersion: 2` and `baselineVersion` to the version in `baselines/web-3d-world/package.json` in the execution plan. Integrate additional modules using the [module guide](./modules/README.md) and [copying guide](./docs/MODULES.md), preserving their layout, dependencies and licenses. Keep `tech9.json` and `GAME_PLAN.json` byte-for-byte intact. Give the game its own presentation, storage namespace and documentation.

## Build and validate

Follow the brief's milestones and shared build/review workflow. Verify success, failure/recovery, pause/resume, focus loss and restart through real input. Use free strict ports and serialize GPU captures with other active work.

Keep launch instructions, controls and limitations in the game README.

Reusable game systems can be brought into the framework through a separately scoped framework-dev task.
