# Follow and mounted cameras

Copy `src/` into the game's modules and use Three.js `0.186.1`. Supply an unparented camera (or an identity scene parent); positions are world space.

```js
import { FollowCamera } from './modules/follow-camera/src/FollowCamera.js';

const view = new FollowCamera(camera, {
  getTarget: () => ({ ...boat.snapshot(), y: waterLevel }),
  groundHeight: (x, z) => terrain.height(x, z),
  follow: { distance: 16, height: 8, lookAhead: 5, clearance: 1 },
  mounted: { getPose: () => vehicle.helmPose(), near: 0.05, fov: 70 },
  onChange: () => water.invalidateReflection(),
});
view.update(dt); // after movement and the vehicle's world transforms
view.setMode('mounted'); // or 'follow'
view.resetMotion(); // after teleport/restart; next update snaps to the pose
// Teardown: view.dispose(); the camera remains consumer-owned.
```

Target requires `x`, `z`, `heading` (zero faces −Z), optional `y` (default 0). Mounted pose returns world-space arrays `{ position, target, up }`; up defaults to `[0,1,0]`. It preserves vehicle roll and snaps each update. The consumer decides which model parts to hide in mounted view.

Follow options: `distance=12`, `height=6`, `side=0`, `lookAhead=4`, `targetHeight=1`, `damping=5`, `clearance=1`, `near=0.15`, `fov=58`. Damping is exponential; elapsed time clamps to 0.25 s. Terrain clearance applies to both the desired and interpolated position; omit `groundHeight` for no floor. Switching mode updates projection and invokes `onChange`, as does `resetMotion`.

## Terrain and solid camera booms

Version 1.1.0 adds the optional `resolvePosition(position, subject, phase)` callback, where phase is `desired` or `interpolated`. Return a finite `{ x, y, z }`. Arguments are fresh objects; the camera remains consumer-owned. The resolver runs both before and after damping so interpolation cannot bypass a solid. Ground clearance also applies after resolution. Mounted poses use attachment positions directly and do not call this resolver.

```js
import { resolveCameraBoom } from './modules/follow-camera/src/CameraBoom.js';

const view = new FollowCamera(camera, {
  getTarget: () => vehicle.snapshot(),
  groundHeight: terrain.height,
  resolvePosition: (position, subject) =>
    resolveCameraBoom(
      { x: subject.x, y: subject.y + 1.65, z: subject.z },
      position,
      {
        groundHeight: terrain.height,
        colliders: sceneryDiscs,
        clearance: 0.55,
      },
    ),
});
```

`resolveCameraBoom(target, desired, options)` shortens the boom at the first terrain or solid obstruction. Options: `groundHeight` returns a finite height or `-Infinity` (default no floor); `colliders` is an array of static `{ x, z, radius }` discs (default empty); `clearance=0.55`; `sampleSpacing=0.35` metres; `maxSamples=4096` (integer 1–16384). Endpoints are world-space points. Discs use exact segment intersections and conservative infinite vertical extent. Terrain is sampled, so features narrower than the spacing can be missed; use the same smooth terrain query as the vehicle and choose spacing for its smallest features. Excessive boom length throws rather than silently reducing accuracy.

The target must itself be in clear space. An obstructed target collapses the boom and may lift it to terrain clearance; this is not a general escape or cave navigation solver. The consumer owns queries, scene solids, camera, input and frame loop. The pure helper retains no state, does not mutate queries or colliders, and has nothing to dispose. This source was extracted from Trail Driving's three-vehicle camera integration; no game content or assets are required.
