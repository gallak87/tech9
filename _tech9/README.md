# tech9

Build standalone games from authored starting applications and reusable modules. Each game owns its source, assets and dependencies.

## Quickstart

From `_tech9/`, with Node `^22.13.0 || >=24.0.0`:

```sh
./run ci
./run run check
./run run t9 -- starting-points
./run --prefix baselines/web-2.5d-world ci
./run --prefix baselines/web-2.5d-world run dev
```

Open **http://127.0.0.1:4403** for the coastal sprite world. For the Three.js forest, use `baselines/web-3d-world` in the last two commands and open **http://127.0.0.1:4399**. `run` selects an installed supported Node; `TECH9_NODE` overrides it.

| Starting point                              | Composition                                                                       | Renderer          |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ----------------- |
| [web-2.5d-world](baselines/web-2.5d-world/) | Coastal exploration, animated actor, layered scenery, keyboard and touch controls | PixiJS + Canvas2D |
| [web-3d-world](baselines/web-3d-world/)     | Authored forest, fly/walking controls and weather                                 | Three.js          |
| [web-canvas2d](scaffolds/web-canvas2d/)     | Minimal responsive web package                                                    | Canvas2D          |
| [web-pixi](scaffolds/web-pixi/)             | Minimal responsive web package                                                    | PixiJS            |
| [web-three](scaffolds/web-three/)           | Minimal responsive web package                                                    | Three.js          |

Use a minimal scaffold when neither authored world fits. Every choice has local dependencies, its own launch/build commands and optional selected modules. Native engines remain future work.

Give an agent a few sentences about your game and [GENERATE.md](GENERATE.md). The workflow turns that pitch into a concrete **Goal / How to work / Rules** build prompt and a validated execution plan, then builds the game within your authorization. You do not need to supply the planning instructions yourself. Use [FRAMEWORK_DEV.md](FRAMEWORK_DEV.md) to develop or extract reusable capabilities. The [shared workflow](WORKFLOW.md) covers ownership, validation and independent critique.

## Modules

Sprite exploration, grounded walking, placement collisions, pond water, boat motion, follow cameras, island ocean, sailing ships, weather, flight motion, aircraft, landscape and vehicles.

[Module interfaces](modules/README.md) · [Copying and synchronization](docs/MODULES.md) · [Architecture](ARCHITECTURE.md)

## Reference pilots

| Pilot                                                  | Focus                            |
| ------------------------------------------------------ | -------------------------------- |
| [Stillwater Fishing](games/_pilot/stillwater-fishing/) | Fishing and pond water           |
| [Pinewatch Hunt](games/_pilot/pinewatch-hunt/)         | Grounded exploration and hunting |
| [Tidebreak](games/_pilot/tidebreak/)                   | Sailing, ships and island water  |
| [Forest Flight](games/_pilot/forest-flight/)           | Aircraft and large landscapes    |
| [Trail Driving](games/_pilot/trail-driving/)           | Jeep, ATV and dirt bike          |

New games go in `games/<slug>/`; pilots remain in `games/_pilot/`. [Reference review](docs/REFERENCE-GAMES.md) records how the older Canvas2D, Three.js and Godot games inform package selection.

## Structure

```text
_tech9/
├── GENERATE.md, FRAMEWORK_DEV.md, WORKFLOW.md
├── baselines/       ← authored starting applications
├── scaffolds/       ← minimal dependency-owned web packages
├── modules/         ← reusable source, art, tests and guides
├── modules.json     ← versions and concrete requirements
├── games/           ← new games and _pilot/ references
├── docs/            ← integration and future capability work
└── tools/, schemas/, tests/
```

[Roadmap](ROADMAP.md) · [Local setup](docs/MIGRATION.md) · [Graduation gate](../HANDOFF-tech9-graduation.md)
