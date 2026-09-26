# Vehicle presentation

A small Three.js `0.186.1` adapter extracted from Trail Driving's three vehicles. It applies chassis pose, wheel contact position, steering and spin to consumer-owned nodes. Copy `src/` into your game. It contains original transform code and no assets; vehicle meshes, materials, riders, effects, audio and renderer stay with the consumer.

```js
import { Group } from 'three';
import { VehiclePresentation } from './modules/vehicle-presentation/src/VehiclePresentation.js';

const root = new Group();
scene.add(root);
// Add your chassis geometry under root. Add wheel geometry under each spin node,
// with its axle along local X and its center at the node origin.
const wheels = [
  [-0.8, -1.2, true],
  [0.8, -1.2, true],
  [-0.8, 1.2, false],
  [0.8, 1.2, false],
].map(([x, z, front]) => {
  const hub = new Group(),
    steering = new Group(),
    spin = new Group();
  hub.position.set(x, 0.4, z);
  root.add(hub);
  hub.add(steering);
  steering.add(spin);
  return { hub, steering, spin, front };
});
const presentation = new VehiclePresentation({
  root,
  wheels,
  wheelRadius: 0.4,
  suspension: 0.25,
});
// Once per frame, after your controller updates:
presentation.update(motion.snapshot(), dt);
// On teardown; this does not remove nodes or dispose consumer resources:
presentation.dispose();
```

Supply two wheels (front, rear) or four wheels (front-left, front-right, rear-left, rear-right), matching the order of the controller's contacts. Equal numbers must be marked `front`. All wheel transform nodes must be unique; no wheel hub may descend from another wheel's articulation. Each wheel has the hierarchy `hub > steering > spin`. Hubs may be under intermediate groups inside `root`. Their initial local positions are captured as suspension rest positions. Configure a finite positive `wheelRadius` and a nonnegative `suspension` (default 0.3 metres).

`update(snapshot, dt=1/60)` requires finite world-space `x,y,z,heading`. Optional `pitch,roll,lean,steer,speed` default to zero. Heading zero faces −Z; positive heading faces +X. Pose uses Euler YXZ with X=pitch, Y=−heading, Z=roll+lean. Front steering is −steer around local Y, rear steering is zero, and wheel spin is −wheelSpin around local X. The adapter owns these steering/spin rotations completely; put fixed mesh rotations below the spin node. Explicit finite `wheelSpin` takes precedence; otherwise signed speed is integrated using the shared wheel radius and elapsed time clamped to 0.1 seconds. `dt` must be finite and nonnegative.

Optional `contacts` must have the configured wheel count. An entry with world wheel-center `x,y,z` is converted through the hub's actual parent, including nested transforms. A missing entry or one containing only finite `compression` restores the captured rest pose and adds compression along its parent's local Y, clamped to ±suspension. Default compression is zero; the adapter does not infer contact position from terrain or grounded flags. All coordinates and dimensions use metres and radians.

Root and its ancestors must have unit scale and finite rigid transforms; root may be translated/rotated under a scene parent. Nested wheel parents must have finite invertible world matrices. Transform nodes and ancestors must keep `matrixAutoUpdate` enabled. Do not reparent wheels outside root or share articulation nodes between wheels. Invalid inputs throw before applying the new chassis pose. Updated world matrices are available immediately after `update`, for consumer-owned suspension links or camera attachment queries.

Disposal is idempotent, stops updates and releases retained node references. It does not detach nodes, alter their last pose, remove listeners or dispose geometry/materials/textures. The adapter installs no listeners and allocates no renderer resources. Vehicle modeling, suspension-link geometry, mounted-view visibility and camera smoothing remain game responsibilities.
