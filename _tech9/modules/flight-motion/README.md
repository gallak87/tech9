# Flight motion

Assisted or free-attitude fixed-wing movement and keyboard input, with trainer and sport profiles. Copy this folder into the game's `src/modules/`. Requires Three.js r186.

```js
import { FlightSimulation } from './modules/flight-motion/src/FlightSimulation.js';
import { FlightInput } from './modules/flight-motion/src/FlightInput.js';

const flight = new FlightSimulation({
  profile: 'trainer', // or 'sport'
  spawn: { x: 20, z: 150, heading: 0 },
  groundHeight: terrainHeight,
  obstacle: findObstacle, // (x, y, z, radius) => null or a hit descriptor
});
let playing = false;
const input = new FlightInput({
  onPause: () => {
    playing = false;
    showPauseMenu();
  },
  actions: { KeyC: 'camera' },
  onAction: () => toggleCamera(),
});
function resume() {
  document.activeElement?.blur();
  playing = true;
  input.setEnabled(true);
}
function restart() {
  flight.reset();
  resume();
}
function update(dt) {
  if (!playing) return;
  const state = flight.step(dt, input.sample());
  aircraft.position.set(state.x, state.y, state.z);
  aircraft.rotation.set(state.pitch, -state.heading, -state.roll, 'YXZ');
  if (state.contact) handleContact(state.contact);
}
// Teardown: input.dispose(). The simulation owns no external resources.
```

Units are metres, seconds and radians. Heading zero faces −Z; positive heading/roll turn right and positive pitch raises the nose. The caller owns the frame loop, renderer, pause, contact rules and recovery. [follow-camera](../follow-camera/README.md) accepts the returned pose for chase views and consumer-supplied poses for cockpit views.

`step(dt, input)` advances movement; `snapshot()` reads state; `reset(spawn?)` restores the last valid spawn or accepts a replacement. Spawn requires `x`, `z`, `heading`; optional `y`, `pitch`, `roll`, `speed`, `verticalSpeed` and `throttle` support airborne starts. Omitted altitude uses the ground query plus aircraft clearance.

`FLIGHT_PROFILES` exports the two configurations. `handling` overrides `stallSpeed`, `takeoffSpeed`, `acceleration`, `drag`, `rollRate`, `pitchRate` and `groundClearance`. Controls supply −1…1 `pitch`, `roll`, `yaw`, `throttle`, plus `brake` and `level` booleans. Throttle changes the retained power setting. Speed determines takeoff, control response and stall sink; banking coordinates turns. Ground motion follows the height query directly.

Snapshots include pose, speed, vertical speed, throttle, grounded/stall flags, applied control axes and `contact`. Contact is null or the first impact in the latest step, with pre-response position, attitude, speed and sink rate. Ground contact settles at clearance; obstacle contact stops at the last clear pose and includes an owned copy of the hit descriptor. The next step clears the observation. Hit descriptors must be structured-cloneable; ground queries return finite heights and obstacle queries account for `footprint` (default 3.2 metres).

Movement uses fixed 120 Hz ticks and bounded 0.5-metre contact sweeps. `maxFrameTime` defaults to 0.1 seconds; excess time and the remainder of a contact-producing step are discarded. Consumers decide whether a touchdown or collision permits continued movement.

Input starts disabled. W/S change throttle, arrows control pitch/bank, A/D yaw, B brakes and Space steadies flight. P/Escape/Tab, blur and hidden-document transitions clear and disable input; resume with `setEnabled(true)`. Disabling input alone does not pause simulation. `clear()`, `sample()` and `dispose()` manage held state and listeners; focused UI controls retain their keys. Partial `bindings` overrides accept code arrays for `pitchUp`, `pitchDown`, `rollLeft`, `rollRight`, `yawLeft`, `yawRight`, `throttleUp`, `throttleDown`, `brake`, `level`. Configure `pauseKeys`, `actions`, or injected `window`/`document` separately.

Version 2 adds proven Forest Flight body-axis quaternion attitude: full rolls/inverted flight, `stabilization: false` at construction and `setStabilization(enabled)`. Assistance remains on by default; `input.level` temporarily recovers in either mode. Spawn pitch/roll accept −π…π, and snapshots include `stabilization`. Euler output remains YXZ-compatible; renderer and rules remain caller-owned. This changes the old clamped attitude behavior and adds the Three.js dependency. See [aircraft](../aircraft/README.md) for complete model/cockpit/input bindings.
