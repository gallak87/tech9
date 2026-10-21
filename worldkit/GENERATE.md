# Build a game

> Historical framework reference. This guide is not the Worldkit package development workflow; use [README.md](README.md) for the consumable environment package.

Accept a short game pitch and carry it through the [shared workflow](WORKFLOW.md). The agent supplies the design and planning work; the user supplies the idea and constraints. For an existing game, read its brief, receipts and working status and resume.

## Turn the pitch into a build packet

Choose a coherent, bounded experience: player actions, challenge, outcome/retry loop, presentation and target devices. Honor explicit constraints, make routine decisions, and state consequential assumptions. Ask only about blocking ambiguity. Inspect the [module guide](modules/README.md) and the selected package's README/architecture before committing to its capabilities.

Use these defaults for new game briefs unless the user specifies otherwise:

- **AAA quality:** aim for AAA-level art direction, game feel and finish within the chosen style and compact scope. Select strong visual references and concrete presentation goals; placeholder art is not finished work.
- **Bounded fanout:** propose subagents for independent work, with clear interfaces, exclusive file ownership and one integrator. After the packet is approved, use that parallelism when available and useful; explain a solo plan when it is the better fit.
- **Harsh AAA art critic:** assign a separate reviewer who writes no implementation code. Review actual gameplay, motion, art, effects, UI and audio against references. Default to **8.5/10, up to four rounds**, with ranked fixes and honest final scores; reaching the cap does not meet the target automatically.

Write these files in `runs/<slug>/`:

- **`BRIEF.md`:** fill the [game-brief template](docs/templates/game-brief.md). Keep it about one screen: the game, scope, presentation, important assumptions and a short build summary with proposed roles and milestones.
- **`PROMPT.md`:** fill the [game-prompt template](docs/templates/game-prompt.md), retaining **Goal → How to work → Rules**. Replace placeholders with concrete game decisions and acceptance criteria. Keep user requirements distinct from inferred choices; scale scope and quality targets to this game.
- **`plan.json`:** derive a draft [schema-2 execution plan](schemas/execution-plan.schema.json) from that prompt. Set `startingPoint` and `baselineVersion` to the selected package and its current version. Match scope, roster/ownership, milestones, validation, art gate and stopping point across the packet. Record the brief's review target and round cap; one implementation lane is sufficient for a justified solo build.

## Review once before building

Prepare and validate the complete packet, then show the brief and build summary in the conversation and link the full prompt. Ask the user to approve or revise, and **wait before forking, generating game assets or starting implementation**. A general request to build does not skip this review.

Keep the plan `draft` while awaiting approval. Apply requested revisions across the packet; once accepted, record the approval in `authorization.basis`, set `approved`, revalidate and build. That approval covers the concept and build summary, including the proposed roster; a separate roster gate is used only when requested. Routine implementation decisions need no further confirmation. Bring material departures from the approved concept or scope back for review.

Honor an explicit instruction to skip this review, recording it as delegated authority. Do not repeat an already completed gate on resume. For prompt-only requests, deliver the packet without building.

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
