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

Follow clearance uses the ground-height query; walls and overhead obstructions need caller handling. Mounted poses use the supplied attachment positions directly. The caller owns the frame loop, camera and input.
