# Boat movement and keyboard input

Copy this module's `src/` into the game's owned capabilities. It has no runtime dependencies. Metres/seconds, XZ plane, heading zero faces −Z and positive heading turns right.

```js
import { BoatSimulation } from './capabilities/boat-motion/src/BoatSimulation.js';
import { BoatInput } from './capabilities/boat-motion/src/BoatInput.js';

const boat = new BoatSimulation({
  spawn: { x: 22, z: 114, heading: Math.PI / 2 },
  footprint: 3, // conservative hull-disc radius, including overhang
  canOccupy: (x, z, radius) => navigation(x, z, radius),
  handling: { acceleration: 3, maxForwardSpeed: 8 },
});
const input = new BoatInput({
  onPause: () => showPauseMenu(),
  actions: { KeyC: 'camera' },
  onAction: () => toggleCamera(),
});
// On start/resume, blur the menu button and explicitly enable input.
input.setEnabled(true);
// In the consumer's frame loop, only while playing:
boat.step(dt, input.sample());
// Use boat.snapshot() for the model, camera and rules.
// On teardown: input.dispose(). The simulation owns no external resources.
```

Default controls are WASD/arrows; P/Escape/Tab pause. Override `bindings` with forward/reverse/left/right code arrays, `pauseKeys`, and `actions`. Menu fields and buttons retain their keys. Pause, blur, hidden document and owned pointer-lock loss clear input and disable it; the consumer owns resume. Repeated keydown cannot restart movement after a reset. Optional `canvas` observes its lock lifetime but never acquires lock. Use `input.clear()` when restarting or changing vehicle.

`reset(spawn?)` validates occupancy before changing state and clears velocity/contact history; omitted spawn reuses the last valid spawn. Handling fields are exported as `DEFAULT_HANDLING`, each accepting 0–1000. Input axes clamp to −1…1. The simulation runs fixed 1/120 s steps, discards frame time beyond `maxFrameTime` (default 0.25 s; maximum 1 s), and sweeps in at most 0.2 m increments. Navigation must accept the complete disc; barriers thinner than the sweep spacing can be missed. Contacts slide along free axes and count a new collision after 0.25 s clear of contact.

This is assisted arcade motion: thrust, braking, drag and speed-dependent reverse-aware steering. No wind, sail/rigging simulation, buoyancy, waves, hull polygons or game rules. Render model and input adapter are optional; AI or other devices can call `step` directly.
