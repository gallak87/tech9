# Sailing ships

Two authored Three.js vessels: **Kestrel**, a 14 m schooner, and **Resolute**, an 18 m galleon. Includes fitted hull/deck geometry, sails, rigging, procedural materials, an animated wooden helm, captain and compass. Copy this folder's `src/`, README and `THREE-LICENSE.txt` into the consuming game's modules. Install Three.js **0.186.1**. No sibling module or remote asset is required.

```js
import { createSailingShip } from './modules/sailing-ships/src/SailingShipModel.js';
import { createShipShadow } from './modules/sailing-ships/src/ShipShadow.js';

const ship = createSailingShip('schooner'); // or 'galleon'
scene.add(ship.group);
// Optional: use the caller's existing WebGLRenderer and direction toward the sun.
const shadow = createShipShadow(renderer, ship.group, [-130, 100, -90]);
shadow.attach();

function update(dt, state) {
  ship.group.position.set(state.x, waterLevel, state.z);
  ship.group.rotation.y = -state.heading;
  ship.update(dt, state.steer); // normalized steering; returns wheel angle in radians
  shadow.render(ship.profile); // after transforms/animation, before scene rendering
}

ship.setView('captain'); // hides head/torso; retains hands and foreground forearms
const pose = ship.getHelmPose(); // world-space { position, target, up } arrays
// Existing follow-camera: mounted: { getPose: ship.getHelmPose }
// Caller switches its camera and ship.setView('outside'|'captain') together.

// Restart: ship.reset(); reset motion/position separately in the consumer.
// Teardown, in this order:
shadow.dispose();
ship.dispose();
```

`SHIP_PRESETS` and `getShipPreset(id)` in `presets.js` provide immutable metadata: name, type, length, beam, mastHeight and conservative XZ collision-disc `footprint`. Only the two named shapes are supported; arbitrary dimensions are not a ship generator. Coordinates use metres, +Y up, the waterline at local y=0 and bow toward −Z. With the existing `boat-motion` module, apply `rotation.y = -heading` and use the preset footprint. Geometry and every generated material/texture belong to the ship; do not share them with another owner. Disposal detaches the group and is idempotent.

The consumer owns scene placement, movement, input, camera, water, wake/bobbing, pause and the frame loop. `update(dt, steer=0)` clamps steering to −1…1 and elapsed time to 0.25 s, and rejects nonfinite values or negative time. Use dt=0 while paused. `getHelmPose()` includes ancestor transforms and does not move a camera. The compass follows world heading. `setView()` accepts only `outside` or `captain`; it controls model visibility, not camera composition. `reset()` centres the wheel and hands.

Self-shadowing is optional and uses WebGL shader hooks, not WebGPU. `createShipShadow(renderer, root, sunDirection, { size=1536, interval=2 })` accepts a 128–4096 pixel depth target and a cadence of 1–8 updates. `sunDirection` is a nonzero three-number direction toward the light. `setSunDirection(direction)` updates it and forces the next capture. `attach()` applies hooks to current ship materials; call it again after replacing the ship under a retained root. Materials must have one shadow owner. `render(profile)` preserves parent transforms and restores renderer state even on failure. Dispose the helper before destroying the ship; it restores prior material hooks and releases its render target. It casts shadows only within the ship, not onto the water/world. Borrowed renderers, cameras and scenes remain caller-owned. Use positive uniform scale for the authored proportions and shadow bounds.

The sails have fixed sculpted folds, not wind/cloth simulation. Captains and materials remain stylized. These detailed models have no distance LOD or fleet instancing; validate budgets before displaying many ships. All ship geometry, lettering, compass markings and texture data are authored in the module's editable JavaScript. No bitmap assets or extra asset licenses are needed. Three.js and its imported geometry/batching helpers use the adjacent MIT notice.
