# Using promoted capabilities

The framework owns canonical source under `modules/`. Runnable scenes contain local copies under `src/capabilities/<id>/src/`, with versions and SHA-256 records in `src/capabilities/PROVENANCE.json`. A starter fork copies the whole runnable scene, so the resulting game owns those modules too. There are no runtime imports into another game or the framework.

| Capability                     | Canonical source                                                  | Example integration                                            |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Grounded walking/input         | [grounded-walking](../modules/grounded-walking/README.md)         | Forest with `?controller=walk`; pond exploration               |
| Placement-derived collision    | [placement-collisions](../modules/placement-collisions/README.md) | Forest tree/rock/deadfall transforms; pond bank placements     |
| Shoreline and reflective water | [pond-water](../modules/pond-water/README.md)                     | Pond terrain, vegetation exclusion, water and walking boundary |

Walking owns camera input and movement, not game rules or menus. Its consumer supplies pause presentation and optional movement/look gates. Collision helpers create conservative horizontal proxies from authored transforms; small foliage and full 3D physics remain outside that contract. Water promotion includes the shore query and disposal/quality contract, not only a water mesh. Fishing rules, fish and tackle remain in Stillwater.

## Consumer kickoff

Give the agent a player-experience prompt through [GENERATE.md](../GENERATE.md). It inspects the actual catalog and each relevant module's contract, chooses the closest registered starter, then plans the missing game-specific work. The forest starter bundles walking/collision; the pond starter also bundles water. Availability is determined by the catalog, not this list of source directories.

An agent can deliberately copy additional module source into another owned game, preserving the documented folder layout, dependencies, license records and provenance, and then validate the integration. There is no automatic arbitrary-module resolver or compatibility solver. The current CLI forks complete starter combinations. Unavailable capabilities are new work and must not be described as supplied features.

## Maintainer source-copy workflow

Each scene's `capabilities.json` names its module dependencies. After changing canonical module source and its version/catalog record, from `_tech9` run:

```sh
./run run sync:modules -- --write
./run test
./run run lint
./run --prefix scenes/scene-test run verify:walking
./run --prefix scenes/pond-test run verify
```

The sync command only targets registered `_tech9/scenes/` and canonical `_tech9/modules/`. It rejects symlinks and unexpected copy files/directories, and never updates existing games. Check mode is read-only and detects stale source copies and version/hash records. Preserve the relative layout: grounded walking imports the sibling placement-collisions module; water imports its own shoreline implementation. Module docs and original license texts remain part of the examples' provenance.

Keep copied source byte-identical; make fixes in the canonical module, format there, then sync. Do not let independent formatting of a copy create a hidden fork. Run the owning scene's checks and fresh standalone-fork verification after changing a shipped capability. Version source changes deliberately; old games retain their recorded versions until explicitly ported.

## Local runtime

The executable `../run` helper anchors npm commands to this framework directory and selects an installed Node satisfying `^22.13.0 || >=24.0.0`. It tries an explicit `TECH9_NODE`, then PATH, a local Codex-bundled runtime and installed NVM runtimes. A bad explicit override fails visibly. It never downloads Node, changes repository hooks or edits the parent shell environment. Its shell entrypoint supports macOS/Linux; ordinary supported Node/npm commands remain the portable interface.

```sh
./run --runtime
./run ci
./run --prefix scenes/scene-test ci
./run --prefix scenes/pond-test ci
./run run dev:walk
./run run dev:pond
```

The forest uses ports 4399/4400; the pond uses 4450/4451. Browser scripts support `SCENE_PORT` for isolated checks. Strict ports fail rather than silently taking another session's port. Run native pointer-capture/focus checks on an unlocked desktop; synthetic input-event tests are separately identified.

## Evidence and early promotion

Walking/collision patterns appeared across the three accepted game pilots. Water has one game consumer plus the neutral framework example: the user explicitly requested its promotion now. Preserve this limited evidence instead of presenting it as a universally tested water system. The [historian record](../runs/capability-promotion/HISTORIAN.md) documents sources, known pitfalls and MIT/CC0 obligations. Earlier game art scores remain historical; this engineering promotion does not start another AAA art cycle or claim an inherited pass.
