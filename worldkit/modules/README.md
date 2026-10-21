# Modules

Copy the selected folders into a package's `src/modules/`, including required sibling modules, assets and licenses. Each guide below shows integration and lifecycle. [modules.json](../modules.json) records versions.

| Module                                                   | Provides                                                                                    | Dependencies                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [sprite-world](./sprite-world/README.md)                 | Sprite exploration, foot-anchored art, camera, occlusion, touch controls and bounded assets | PixiJS + Canvas2D                                            |
| [grounded-walking](./grounded-walking/README.md)         | Grounded camera movement and desktop input                                                  | placement-collisions; Three.js camera supplied by the caller |
| [placement-collisions](./placement-collisions/README.md) | Placement-derived discs, capsule chains and movement resolution                             | None                                                         |
| [pond-water](./pond-water/README.md)                     | Reflective water, shared shoreline queries and shore decoration                             | Three.js                                                     |
| [boat-motion](./boat-motion/README.md)                   | Arcade boat simulation and keyboard input                                                   | None                                                         |
| [follow-camera](./follow-camera/README.md)               | Follow/mounted cameras and terrain/solid boom clearance                                     | Three.js                                                     |
| [island-ocean](./island-ocean/README.md)                 | Island coast, navigation and reflective ocean                                               | pond-water; Three.js                                         |
| [sailing-ships](./sailing-ships/README.md)               | Schooner and galleon models, animated helm and optional self-shadows                        | Three.js                                                     |
| [weather](./weather/README.md)                           | Rain, wet surfaces, settled snow, snowfall and shared wind                                  | Three.js                                                     |
| [flight-motion](./flight-motion/README.md)               | Aircraft motion, contact observations and keyboard input                                    | Three.js                                                     |
| [aircraft](./aircraft/README.md)                         | Trainer/sport models, cockpit animation, controls and motion binding                        | flight-motion; Three.js                                      |
| [landscape](./landscape/README.md)                       | Forest assets/materials, authored scenes and traveling detail                               | Three.js; optional weather                                   |
| [vehicles](./vehicles/README.md)                         | Jeep, ATV and dirt-bike assets, presets, movement, animation and optional input/feedback    | Three.js                                                     |

See [copying](../docs/MODULES.md) and [module development](../FRAMEWORK_DEV.md).
