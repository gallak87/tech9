# Tech9 · playable foundations

This is the new foundation under `_tech9`, developed alongside the existing root Tech9 framework. Root planners, commands, compatibility helpers and older games retain their conventions. Root replacement is much later, after user playtests and proof from another game, potentially built by a different agent. It is outside this effort.

Tech9 starts game development from something that already runs: a scene, a small runtime and known production practices. A **scene** is authored world content with an explicit runtime contract. A **starter** describes a useful starting combination and its limits. A **game** is an owned copy that can evolve freely. A **module** is a proven reusable gameplay system; the registry is intentionally empty until reuse earns one.

This first foundation contains one available starter: `forest-exploration`, based on the `alder-vale` scene in [`scenes/scene-test`](./scenes/scene-test/README.md). It includes the Three.js/Vite forest, Blender sources, a replaceable camera controller, lifecycle-managed layers and browser testing. It does not include a character, vehicle, inventory, generic physics, or a finished game loop.

## Project map

| Location                         | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `catalog.json`, `framework.json` | Versioned availability and framework identity             |
| `scenes/scene-test/`             | Runnable, independently installable forest source         |
| `tools/`, `schemas/`, `tests/`   | Small local CLI, contracts and safety tests               |
| `runs/<game>/`                   | Approved execution plan, checkpoints and compact evidence |
| `modules/`                       | Promotion policy for future proven reusable systems       |
| `docs/`                          | Extension, migration and scoped lessons                   |
| `games/<game>/`                  | Independent runnable output, with provenance receipt      |

## Install and verify

Use Node `^22.13.0 || >=24.0.0`. From the repository root:

```sh
npm --prefix _tech9 ci
npm --prefix _tech9 test
npm --prefix _tech9 run lint
npm --prefix _tech9 run t9 -- catalog
npm --prefix _tech9/scenes/scene-test ci
npm --prefix _tech9 run dev:scene
```

Framework tooling and the scene have separate packages and lockfiles. Root dependency installation is not required. Scene verification uses `npm --prefix _tech9/scenes/scene-test run verify`; choose an unused `SCENE_PORT` when necessary.

The optional repository pre-commit hook is installed only by `npm --prefix _tech9 run hooks:install`. That explicit command changes local Git `core.hooksPath` to `_tech9/.husky/_` and reports its previous value. Dependency installation has no hook side effects. The hook checks only staged `_tech9` files, with lint-staged selecting the nearest package configuration and executing scene/game tasks in their owning package. Older games and root files are outside its scope. Installing another project's hooks may change the repository setting again; see [migration notes](./docs/MIGRATION.md).

## Make a game

Start with the agent-facing [GENERATE.md](./GENERATE.md): give an agent an idea or one of the launch packets under `games/`. The intended `/generate` slash command will invoke this same workflow; command registration is deferred. Today the user supplies a prompt and the agent handles the plan, CLI, implementation and review. New games stay inside `_tech9/games/` throughout the pilot phase.

1. Read the catalog and choose a starter whose actual limits fit the idea.
2. Write a brief and execution plan using [WORKFLOW.md](./WORKFLOW.md). Record delegated or explicit approval.
3. Validate the plan and fork a clean committed starter:

```sh
npm --prefix _tech9 run t9 -- validate _tech9/runs/alder-signal/plan.json
npm --prefix _tech9 run t9 -- fork --starter forest-exploration --slug my-game --plan path/to/my-game-plan.json --port 4420 --dry-run
npm --prefix _tech9 run t9 -- fork --starter forest-exploration --slug my-game --plan path/to/my-game-plan.json --port 4420
```

The example `my-game` needs its own plan with matching ID. Plan and catalog paths are repository-relative regardless of shell/npm working directory; absolute plan paths inside the repository also work. New output is always `_tech9/games/<slug>` at the repository root. From `_tech9`, use `npm run t9 -- ...` with the same repository-relative plan paths. Existing destinations are never overwritten. The CLI copies source, local assets and provenance; it does **not** turn a pitch into gameplay. Agents execute the approved plan afterward.

4. Install the output package, build one complete playable loop, test it with real input, and review a committed build.
5. Keep useful lessons; promote reusable code only after another game demonstrates the need.

[`runs/alder-signal/plan.json`](./runs/alder-signal/plan.json) is the first concrete production plan. Its [Alder Signal POC](../games/alder-signal/README.md) is ready for user playtesting: the full relay-and-return loop passed unit/lint/build and real-input browser validation. The [run record](./runs/alder-signal/EXECUTION.md) keeps exact checkpoints, initial critique and limitations. Alder Signal retains its earlier root `games/` location; new forks use `_tech9/games/`. Hunting and fishing launch packets prepare the next fresh-agent consumer trials. Source forks are intentionally independent, so improving the starter does not silently change a game already built from it.

See [architecture](./ARCHITECTURE.md), [workflow](./WORKFLOW.md), [extension steps](./docs/EXTENDING.md), and [roadmap](./ROADMAP.md).
