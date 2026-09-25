# Capability index

The current modules use existing runnable scenes as their usage examples. There are no parallel module manuals. Read the linked composition point and run the scene using its package README.

| Module                  | Canonical source                                                            | Working example                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Grounded movement/input | [WalkingController.js](./grounded-walking/src/WalkingController.js)         | [Forest composition](../scenes/scene-test/src/main.js), launched with `?controller=walk`                                    |
| Placement collisions    | [placementCollisions.js](./placement-collisions/src/placementCollisions.js) | [Shared forest rendering/collider placements](../scenes/scene-test/src/world/ForestWorld.js)                                |
| Pond water/shore        | [PondWater.js](./pond-water/src/PondWater.js)                               | [Pond composition](../scenes/pond-test/src/main.js) and [shore definition](../scenes/pond-test/src/world/pondDefinition.js) |

The catalog records current versions. Scenes carry checked local copies; games inherit owned copies through a starter fork. For source-copy maintenance use [CAPABILITIES.md](../docs/CAPABILITIES.md). To add or bring back a capability use [FRAMEWORK_DEV.md](../FRAMEWORK_DEV.md).
