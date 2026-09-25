# Capability index

Each module has one usage aid: an existing runnable scene or concise documentation. Follow the linked aid for integration and current limits.

| Module                  | Canonical source                                                            | Usage aid                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Grounded movement/input | [WalkingController.js](./grounded-walking/src/WalkingController.js)         | [Forest composition](../scenes/scene-test/src/main.js), launched with `?controller=walk`                                    |
| Placement collisions    | [placementCollisions.js](./placement-collisions/src/placementCollisions.js) | [Shared forest rendering/collider placements](../scenes/scene-test/src/world/ForestWorld.js)                                |
| Pond water/shore        | [PondWater.js](./pond-water/src/PondWater.js)                               | [Pond composition](../scenes/pond-test/src/main.js) and [shore definition](../scenes/pond-test/src/world/pondDefinition.js) |
| Boat motion/input       | [BoatSimulation.js](./boat-motion/src/BoatSimulation.js)                    | [Usage documentation](./boat-motion/README.md)                                                                              |
| Follow/mounted camera   | [FollowCamera.js](./follow-camera/src/FollowCamera.js)                      | [Usage documentation](./follow-camera/README.md)                                                                            |
| Island coast/ocean      | [OceanLayer.js](./island-ocean/src/OceanLayer.js)                           | [Usage documentation](./island-ocean/README.md)                                                                             |

The catalog records current versions. Scenes carry checked local copies; games inherit owned copies through a starter fork. For source-copy maintenance use [CAPABILITIES.md](../docs/CAPABILITIES.md). To add or bring back a capability use [FRAMEWORK_DEV.md](../FRAMEWORK_DEV.md).
