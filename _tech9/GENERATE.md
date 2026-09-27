# Build a game

Follow [WORKFLOW.md](WORKFLOW.md). Read the [module guide](modules/README.md) and selected package's README/architecture. CLI paths resolve from `_tech9/`, regardless of the invoking directory.

## Define the experience and starting point

Record the objective, actions, outcome, recovery, presentation and devices in `runs/<slug>/BRIEF.md`. Create `plan.json` using the [execution-plan schema](schemas/execution-plan.schema.json). Record scope, path ownership, acceptance, delegated authority and the stopping point. Set `artGate` to the brief's review requirements.

| `startingPoint`  | Choose when                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `web-2.5d-world` | The game benefits from authored sprite exploration, camera, scenery occlusion and touch controls. |
| `web-3d-world`   | The authored outdoor forest, terrain and weather fit the experience.                              |
| `web-canvas2d`   | A Canvas2D shooter, puzzle or other composition needs a minimal package.                          |
| `web-pixi`       | PixiJS is appropriate but the coastal world is not.                                               |
| `web-three`      | A Three.js flight, space or other composition should start without forest content.                |

Run `./run run t9 -- starting-points` for current versions, renderers and selected modules. Each source is a runnable package with owned dependencies. Native Godot is not supported by this CLI; its reference project does not establish a verified generation path.

Set `schemaVersion: 2`, `startingPoint` to the chosen name and `baselineVersion` to **that package's version**, including for minimal scaffolds. Legacy plans without `startingPoint` continue to mean `web-3d-world`. Source names allow dots independently of the stricter game slug rules. Plans must be `approved` under the user's delegated or explicit authority before forking.

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

Complete the brief through real input: start, core action, outcome, recovery/restart, pause/resume and focus loss. Test target layouts and input devices. Use strict free ports and serialize GPU captures. Commit stable source before independent critique; keep captures and disposable packages in ignored artifacts.

Keep launch instructions, controls and limitations in the game README. Reusable systems discovered during game development enter the framework through a separately scoped [framework-dev](FRAMEWORK_DEV.md) phase.
