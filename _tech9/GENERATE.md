# Build a game

Follow [WORKFLOW.md](WORKFLOW.md). Read the [module guide](modules/README.md) and selected package's README/architecture. CLI paths resolve from `_tech9/`, regardless of the invoking directory.

## Start from the user's pitch

Accept a few ordinary sentences about the game. The user does not need to request concept development, supply a plan, choose modules or explain the build workflow. For example: “A 2.5D arcade racer with two or three biomes, one track in each, and a completely new look.” This is enough to begin interpreting a build request.

For an existing game, read its current prompt/brief, receipts and working status and resume that work. Do not replace an established concept or regenerate its immutable plan merely because this guide is invoked again.

Read the pitch and any existing brief, inspect the framework catalog, then choose a coherent, bounded game: what the player does, what makes it interesting, how a session ends and restarts, and how it should look, sound and control. Preserve explicit constraints. Fill routine gaps with sensible design decisions; distinguish these choices from user requirements. Ask only when missing information materially blocks a coherent result or would contradict the user's direction. A brief pitch is not a reason to inflate scope or create a questionnaire.

Write `runs/<slug>/PROMPT.md` using the [game-prompt template](docs/templates/game-prompt.md). Keep its **Goal → How to work → Rules** structure, replacing every placeholder with concrete instructions for this game. The result is a self-contained build prompt, not advice to a future agent to invent another concept or plan. State the selected premise, playable loop, scope, presentation, controls/devices, source package and reusable capabilities. Then specify architecture, early verification, path ownership, integration, critique and completion. Scale subsystem count, performance budgets and review requirements to the game; do not inherit another prompt's genre, renderer, AAA target, asset policy or agent/tool names.

Summarize the selected direction briefly and continue when building is authorized. The generated prompt is an execution artifact, not an automatic approval gate. For a prompt-only or planning-only request, deliver it and stop before package creation. A generated document never grants authority beyond the user's request; honor any requested concept approval or module-extraction approval.

## Select the foundation and derive the plan

Use the package selection below while drafting the prompt. Reuse proven capabilities, but give the game its own composition and identity. Baseline artwork and rules are replaceable examples. Record concrete gaps without promising that a renderer or module supports an untested genre automatically.

| `startingPoint`  | Choose when                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `web-2.5d-world` | The game benefits from authored sprite exploration, camera, scenery occlusion and touch controls. |
| `web-3d-world`   | The authored outdoor forest, terrain and weather fit the experience.                              |
| `web-canvas2d`   | A Canvas2D shooter, puzzle or other composition needs a minimal package.                          |
| `web-pixi`       | PixiJS is appropriate but the coastal world is not.                                               |
| `web-three`      | A Three.js flight, space or other composition should start without forest content.                |

Run `./run run t9 -- starting-points` for current versions, renderers and selected modules. Each source is a runnable package with owned dependencies. Native Godot is not supported by this CLI; its reference project does not establish a verified generation path.

Derive `runs/<slug>/plan.json` from the filled prompt using the [execution-plan schema](schemas/execution-plan.schema.json). Do this for the user; the CLI consumes this record, not the raw pitch. Keep `title`/`pitch`, scope, milestones, lane ownership/dependencies, validation, `artGate` and `stopAfter` consistent with the prompt. A solo build can have one implementation lane. `authorization.basis` describes the actual user request; use `draft` for a planning-only request or unresolved required approval. Use `approved` only within explicit or delegated build authority, without demanding a second confirmation when that authority already exists.

Set `schemaVersion: 2`, `startingPoint` to the chosen name and `baselineVersion` to **that package's version**, including for minimal scaffolds. Legacy plans without `startingPoint` continue to mean `web-3d-world`. Source names allow dots independently of the stricter game slug rules. Set the review target and round cap from the brief or the shared workflow's default. Validate the generated plan before forking. Preserve existing user briefs rather than rewriting them as if inferred decisions came from the user.

## Create the package

The destination must be absent. If `games/<slug>` contains only a launch packet (`BRIEF.md` and `PROMPT.md`), move it to `runs/<slug>` before creating the plan; preserve existing run directories and inspect unexpected contents. A game with a fork receipt is an existing project to resume.

```sh
./run ci
./run run t9 -- modules
./run run t9 -- validate runs/<slug>/plan.json
./run run t9 -- fork --slug <slug> --plan runs/<slug>/plan.json --port <dev-port> --dry-run
./run run t9 -- fork --slug <slug> --plan runs/<slug>/plan.json --port <dev-port>
./run --prefix games/<slug> ci
./run --prefix games/<slug> run dev
```

The plan selects the source. Optional `--from web-2.5d-world` must agree with the plan. The source package must be clean and committed; creation rejects overwrite, unsafe paths and uncommitted source files. Source, selected module copies, editable art and licenses travel together.

Keep `tech9.json` and `GAME_PLAN.json` byte-for-byte intact. Receipts record the actual selected package, runtime/renderer, source version/commit and per-file hashes. Give the game its own presentation, storage namespace and documentation. Add modules using the [copying guide](docs/MODULES.md); install their declared dependencies in the game and preserve required sibling modules.

## Build and validate

Execute the generated prompt. After package creation, adapt its `ARCHITECTURE.md` before feature work and establish a small readiness/input/capture verification loop early. Keep one owner per edited path, including application integration; use bounded agents only when authorized and available. A game's subsystems are not automatically new canonical framework modules.

Complete the playable loop through real input: start, core action, outcome, recovery/restart, pause/resume and focus loss. Test target layouts and input devices. Use strict free ports and serialize GPU captures. Commit stable source before independent critique; keep captures and disposable packages in ignored artifacts. Review motion as well as stills when feel, animation or camera behavior matters. Apply the shared workflow's bounded review loop; a round cap does not erase correctness failures or turn an unmet visual target into a pass.

Keep iteration state in `runs/<slug>/STATUS.json`: current milestone, validated commit, checks/evidence, critique scores and rounds, ranked open issues and next action. Resume from the outstanding work. The forked `GAME_PLAN.json` remains immutable; record later scope decisions in working notes rather than modifying the receipt.

Keep launch instructions, controls and limitations in the game README. Reusable systems discovered during game development enter the framework through a separately scoped [framework-dev](FRAMEWORK_DEV.md) phase.
