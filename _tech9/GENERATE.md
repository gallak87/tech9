# Build a game

Accept a short game pitch and carry it through the [shared workflow](WORKFLOW.md). The agent supplies the design and planning work; the user supplies the idea and constraints. For an existing game, read its brief, receipts and working status and resume.

## Turn the pitch into a build packet

Choose a coherent, bounded experience: player actions, challenge, outcome/retry loop, presentation and target devices. Honor explicit constraints, make routine decisions, and state consequential assumptions. Ask only about blocking ambiguity. Inspect the [module guide](modules/README.md) and the selected package's README/architecture before committing to its capabilities.

Write these files in `runs/<slug>/`:

- **`PROMPT.md`:** fill the [game-prompt template](docs/templates/game-prompt.md), retaining **Goal → How to work → Rules**. Replace placeholders with concrete game decisions and acceptance criteria. Keep user requirements distinct from inferred choices; scale scope and quality targets to this game.
- **`plan.json`:** derive the [schema-2 execution plan](schemas/execution-plan.schema.json) from that prompt. Set `startingPoint` and `baselineVersion` to the selected package and its current version. Match scope, milestones, ownership, validation, art gate and stopping point to the prompt. Use the workflow's review defaults unless the brief specifies otherwise. One implementation lane is sufficient for a solo build.

Record the actual user authority in `authorization.basis`. Use `approved` when the build is authorized and required approvals are satisfied; otherwise use `draft`. Summarize the direction and proceed with an authorized build. For prompt-only requests, deliver the packet and stop.

## Choose the starting point

From `_tech9/`, run `./run run t9 -- starting-points` for current versions and modules. CLI paths resolve from this directory.

| `startingPoint`  | Foundation                                                   |
| ---------------- | ------------------------------------------------------------ |
| `web-2.5d-world` | Sprite exploration, camera, scenery depth and touch controls |
| `web-3d-world`   | Authored Three.js forest, terrain and weather                |
| `web-canvas2d`   | Minimal Canvas2D package                                     |
| `web-pixi`       | Minimal PixiJS package                                       |
| `web-three`      | Minimal Three.js package                                     |

Reuse suitable capabilities and give the game its own identity. Baseline artwork and composition are replaceable examples; choose a minimal scaffold when neither authored world fits. Native engines have no supported generation path yet.

## Create and build

Fork requires an absent destination and a clean, committed source package. Preserve existing work: resume a game with a fork receipt, or move launch-only notes into `runs/<slug>/` without overwriting existing files.

```sh
./run ci
./run run t9 -- validate runs/<slug>/plan.json
./run run t9 -- fork --slug <slug> --plan runs/<slug>/plan.json --port <dev-port> --dry-run
./run run t9 -- fork --slug <slug> --plan runs/<slug>/plan.json --port <dev-port>
./run --prefix games/<slug> ci
./run --prefix games/<slug> run dev
```

Execute the generated prompt and shared workflow. Keep `tech9.json` and `GAME_PLAN.json` byte-for-byte intact; record progress, review results and later decisions in `runs/<slug>/STATUS.json`. Each game owns its source, assets and dependencies. Use the [copying guide](docs/MODULES.md) to add modules.

Finish with committed work and a game README covering launch, controls and limitations. Reusable discoveries enter a separately scoped [framework-dev](FRAMEWORK_DEV.md) phase.
