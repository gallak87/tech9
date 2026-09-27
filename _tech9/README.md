# tech9

Build games from a runnable world and battle-tested modules.

Give an agent a game idea. Start with the forest, compose the capabilities it needs, and build a standalone game.

---

## Pilots

Small games used to develop and extract reusable capabilities. Each owns its source, assets and dependencies.

| Pilot                                                     | Focus                            |
| --------------------------------------------------------- | -------------------------------- |
| [🎣 Stillwater Fishing](games/_pilot/stillwater-fishing/) | Fishing and pond water           |
| [🦌 Pinewatch Hunt](games/_pilot/pinewatch-hunt/)         | Grounded exploration and hunting |
| [⛵ Tidebreak](games/_pilot/tidebreak/)                   | Sailing, ships and island water  |
| [🛩️ Forest Flight](games/_pilot/forest-flight/)           | Aircraft and large landscapes    |
| [🚙 Trail Driving](games/_pilot/trail-driving/)           | Jeep, ATV and dirt bike          |

New games live in `games/<slug>/`. Pilots stay in `games/_pilot/` as working references.

---

## How it works

```text
idea + baseline + modules
          │
          ▼
    standalone game
          │
          ▼
   play → review → improve
          │
          ▼
 framework-dev → reusable modules
```

The baseline supplies the starting application and authored forest. Modules supply reusable behavior, models, materials and effects. Each game owns its copies and can evolve independently.

---

## Quickstart

From `_tech9/`, with Node `^22.13.0 || >=24.0.0`:

```sh
./run ci
./run run check
./run --prefix baseline ci
./run --prefix baseline run dev
```

Open the baseline at **http://127.0.0.1:4399**. `run` selects an installed supported Node; `TECH9_NODE` overrides it.

To build a game, give an agent your pitch and [GENERATE.md](GENERATE.md). To develop or extract a reusable capability, use [FRAMEWORK_DEV.md](FRAMEWORK_DEV.md).

---

## Modules

Walking, placement collisions, pond water, boat motion, follow cameras, island ocean, sailing ships, weather, flight motion, aircraft, landscape and vehicles.

[Module guide](modules/README.md) · [Copying modules](docs/MODULES.md) · [Shared workflow](WORKFLOW.md)

---

## Structure

```text
_tech9/
├── GENERATE.md        ← build a game
├── FRAMEWORK_DEV.md   ← develop reusable capabilities
├── ROADMAP.md         ← framework evolution
├── baseline/          ← runnable forest starting point
├── modules/           ← source, assets, tests and usage guides
├── modules.json       ← module IDs and versions
├── games/
│   ├── <game>/        ← standalone games
│   └── _pilot/        ← extraction pilots
├── docs/              ← integration, setup and planned work
└── tools/, tests/     ← framework commands and checks
```

[Architecture](ARCHITECTURE.md) · [Baseline](baseline/README.md) · [Local setup](docs/MIGRATION.md)
