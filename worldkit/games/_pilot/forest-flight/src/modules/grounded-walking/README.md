# Grounded walking

Desktop camera movement, ground following and input lifecycle. Copy this module and the sibling `placement-collisions` module into `src/modules/`.

```js
import { WalkingController } from './modules/grounded-walking/src/WalkingController.js';

const walker = new WalkingController(
  { camera, canvas, bounds, groundHeight, definition },
  { onPause: () => showPauseMenu(), isWalkable: (x, z) => navigation(x, z) },
);
walker.setEnabled(true); // start/resume
walker.update(dt); // owning frame loop
// Teardown: walker.dispose();
```

The caller supplies a Three.js camera, canvas, XZ bounds and `groundHeight(x,z)`. Optional `definition.getColliders()` supplies placement collision discs. Defaults: speed 2.6 m/s, boost 4 m/s, radius 0.3 m, eye height 1.68 m. Options include `canMove`, `canLook`, `isWalkable`, `onPause` and `enabled=false`.

WASD/arrows move, Shift boosts, right-drag or IJKL looks. `lock()` requests pointer capture. Escape/P/Tab pause; focus/visibility loss clears input. The caller owns menus and resume via `setEnabled`. `resetMotion()` clears held input. The controller releases listeners and owned pointer lock on disposal. Collision uses conservative horizontal proxies.
