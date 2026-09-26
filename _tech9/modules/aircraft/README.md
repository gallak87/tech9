# Aircraft

Two editable procedural aircraft with motion, controls, exterior/cockpit animation and mounted camera poses. **Cedar T-1** is the approachable high-wing trainer; **Swift S-2** is the faster low-wing sport plane. Copy this folder and sibling [flight-motion](../flight-motion/README.md) into `src/modules/`. Requires Three.js r186; metres, +Y up, heading zero toward −Z. Models and canvas instrument/registration art are original JavaScript assets; see [NOTICE](./NOTICE.md) and THREE-LICENSE.txt.

```js
import {
  createAircraft,
  createAircraftControls,
} from './modules/aircraft/src/Aircraft.js';
import { FollowCamera } from './modules/follow-camera/src/FollowCamera.js';
const aircraft = createAircraft({
  profile: 'sport', // trainer is the default
  stabilization: true, // optional assistance; F toggles it
  spawn: {
    x: 0,
    z: 0,
    y: groundHeight(0, 0) + 300,
    heading: 0,
    speed: 48,
    throttle: 0.65,
  },
  groundHeight,
  obstacle, // landscape provides both queries
  appearance: { registration: 'S–2', paint: '#a62e20' },
});
scene.add(aircraft.group);
const view = new FollowCamera(camera, {
  getTarget: aircraft.snapshot,
  groundHeight,
  follow: { distance: 17, height: 5, lookAhead: 7 },
  mounted: { getPose: aircraft.getCockpitPose },
  onChange: (mode) => aircraft.setCockpitMode(mode === 'mounted'),
});
let playing = false;
const input = createAircraftControls(aircraft, {
  onPause: () => {
    playing = false;
  },
  actions: { KeyC: 'camera' },
  onAction: () => view.setMode(view.mode === 'follow' ? 'mounted' : 'follow'),
});
function resume() {
  document.activeElement?.blur();
  playing = true;
  input.setEnabled(true);
}
function update(dt) {
  if (playing) {
    const state = aircraft.step(dt, input.sample());
    if (state.contact) {
      playing = false;
      input.setEnabled(false);
    }
  }
  view.update(dt);
}
// Reset: aircraft.reset(spawn); view.resetMotion(); resume();
// Teardown: dispose weather first, then input.dispose(), view.dispose(), aircraft.dispose().
```

The caller owns renderer, frame loop, pause/restart, camera switching and contact outcomes. No airport layout, markers, landing rules or score is included. `snapshot`, `reset`, `setStabilization` and `step` forward the canonical flight-motion contract; `step` also updates the model pose, propeller, opposing ailerons, elevators, rudder, yoke and speed/altitude needles. `getCockpitPose()` returns fresh world-space `{position,target,up}` arrays and follows full roll/inversion. Follow-camera needs no changes. `setCockpitMode` hides exterior geometry and shows the interior. `getWeatherTargets()` supplies opaque exterior wetness targets; instruments, glass, snow and wind are excluded. Reattach weather if replacing aircraft/materials.

`AIRCRAFT_PRESETS` exposes names, roles and default cockpit offsets; `FLIGHT_PROFILES` exposes handling. `appearance` accepts `paint`, `accent`, `registration`; `handling` overrides validated flight-motion values. `AircraftVisual` is available on its own for consumers with their own simulation, with `update(state,dt)` and `dispose()`. Aircraft owns and releases its model geometries, materials and generated textures; disposal is idempotent and removes the group from its parent. Use a fresh aircraft afterward.

W/S change throttle; arrows pitch/bank; A/D yaw; B brakes. Assistance defaults on for both models, gently settling idle controls. **F** toggles it; **Space** temporarily recovers upright attitude in either mode. Sport supports full rolls and sustained inverted attitude with coherent reversed pitch response. This remains arcade handling: inverted lift is approximated with additional sink, and there is no aerodynamic/wind-force simulation. P/Escape/Tab or focus loss disables input and calls `onPause`; disabling input alone does not stop motion. Focused form controls retain their keys.

## Running example

From `_tech9`, run `./run exec -- vite --host 127.0.0.1 --strictPort --port 4500`, then open `/modules/aircraft/examples/`. This complete consumer uses sibling landscape, weather and follow-camera with their existing interfaces. Both aircraft start airborne; buttons select model/reset/camera. It has no game rules beyond pausing on contact. `?test=1` enables observation and rare-state setup for focused validation.
