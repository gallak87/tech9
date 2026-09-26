# Modules

Copy the selected folders into a package's `src/modules/`, including required sibling modules, assets and licenses. Each guide below shows integration and lifecycle. [modules.json](../modules.json) records versions.

| Module                                                   | Provides                                                                | Dependencies                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| [grounded-walking](./grounded-walking/README.md)         | Grounded camera movement and desktop input                              | placement-collisions; Three.js camera supplied by the caller |
| [placement-collisions](./placement-collisions/README.md) | Placement-derived discs, capsule chains and movement resolution         | None                                                         |
| [pond-water](./pond-water/README.md)                     | Reflective water, shared shoreline queries and shore decoration         | Three.js                                                     |
| [boat-motion](./boat-motion/README.md)                   | Arcade boat simulation and keyboard input                               | None                                                         |
| [follow-camera](./follow-camera/README.md)               | Follow/mounted cameras and terrain/solid boom clearance                 | Three.js                                                     |
| [island-ocean](./island-ocean/README.md)                 | Island coast, navigation and reflective ocean                           | pond-water; Three.js                                         |
| [vehicle-motion](./vehicle-motion/README.md)             | Arcade ground-vehicle contacts, traction, jumps, collision and recovery | None                                                         |
| [vehicle-input](./vehicle-input/README.md)               | Keyboard driving actions with focus and disposal lifecycle              | Browser event targets supplied by caller                     |
| [vehicle-presentation](./vehicle-presentation/README.md) | Consumer-owned chassis pose and wheel contact articulation              | Three.js                                                     |

See [copying](../docs/MODULES.md) and [module development](../FRAMEWORK_DEV.md).
