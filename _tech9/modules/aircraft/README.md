# Aircraft — extraction draft

Checkpoint only; not yet registered or release-validated. Both original procedural trainer/sport models and cockpit/control-surface animation are in `src/AircraftVisual.js`. `src/Aircraft.js` binds them to sibling **flight-motion** and exposes rolled cockpit poses and optional keyboard controls. Requires Three.js r186. No external assets; editable visual sources are JavaScript. See NOTICE.md and THREE-LICENSE.txt.

```js
import {
  createAircraft,
  createAircraftControls,
} from './modules/aircraft/src/Aircraft.js';
const aircraft = createAircraft({
  profile: 'sport',
  spawn: { x: 0, z: 0, y: 300, heading: 0, speed: 45 },
  groundHeight,
  obstacle,
});
scene.add(aircraft.group);
const input = createAircraftControls(aircraft, {
  enabled: true,
  onPause: pauseApplication,
});
// In the caller's frame loop:
aircraft.step(dt, input.sample());
// getCockpitPose() feeds follow-camera's existing mounted.getPose contract.
// Teardown: dispose participating weather first, then input.dispose(), aircraft.dispose().
```

F toggles stabilization; Space temporarily recovers upright attitude. The consumer owns pause/resume, restart, camera switching and all contact/game outcomes. A runnable example, browser validation and complete contract review remain pending. See [checkpoint](../../docs/FLIGHT_LANDSCAPE_CHECKPOINT.md).
