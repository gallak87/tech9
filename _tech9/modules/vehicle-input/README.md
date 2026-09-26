# Vehicle keyboard input

Owned keyboard state and focus lifecycle, extracted from Trail Driving. Copy `src/` into your package's owned modules. Version 1.0.0; no runtime dependencies or assets. Original project code, with no third-party resources. A browser window/document provides real events; tests can inject EventTargets.

```js
import { VehicleInput } from './modules/vehicle-input/src/VehicleInput.js';

const input = new VehicleInput({
  target: window,
  onPause(reason) {
    game.pause(reason); // consumer stops simulation and opens its menu
  },
  onAction(action) {
    if (action === 'camera') game.toggleCamera();
    if (action === 'recover') game.recover();
    if (action === 'restart') game.restart();
  },
});
// In a start/resume user gesture, remove focus from the menu button first.
startButton.blur();
input.setEnabled(true);
// In the consumer's playing frame:
const controls = input.sample(); // { throttle, steer, brake }
motion.update(dt, controls);
// On owner replacement/unmount:
input.dispose();
```

Input starts disabled. W/up and S/down produce forward/reverse throttle, A/D or left/right steer, Space brakes. C/R/T emit `camera`/`recover`/`restart`; Escape/P/Tab pause. Multiple aliases never double an axis. Recognized keys prevent browser defaults only while enabled outside menus. Editable fields, buttons, links, dialogs and `[data-vehicle-input-block]` retain native keyboard behavior.

Blur, a hidden document and menu focus immediately clear held keys, disable input and call `onPause` once. Resume is explicit via `setEnabled(true)` or `enabled = true`; both clear old input. OS repeats cannot restore held keys after clear, pause, recovery or restart. `clear()` drops held movement without disabling; recovery/restart do this before their action callback. Camera actions preserve held movement. Disposal is idempotent, removes every listener and prevents reactivation. This adapter does not acquire pointer lock or manage the game's frame loop, audio, UI or controllers.

Optional `bindings` overrides any of the exported frozen `DEFAULT_BINDINGS` arrays (`forward`, `reverse`, `left`, `right`, `brake`). `pauseKeys` and `actions` replace their defaults; `actions` maps physical `KeyboardEvent.code` strings to semantic action names. `clearActions` replaces the list of action names which clear movement (default `['recover','restart']`). For example:

```js
const alternative = new VehicleInput({
  bindings: { forward: ['KeyI'], reverse: ['KeyK'] },
  actions: { KeyV: 'view', KeyY: 'reset' },
  clearActions: ['reset'],
  pauseKeys: ['Escape'],
  onAction: (name) => handleAction(name),
  onPause: (reason) => game.pause(reason),
});
// Enable when playing, then dispose when removed.
```

Mappings are copied before listeners are registered. Each code must belong to exactly one movement, pause or action mapping; conflicts throw. Arrays allow up to 32 nonempty code strings of at most 64 characters, action maps up to 32 entries, and action names up to 64 characters. Empty arrays/maps disable that category. `target` must support adding/removing listeners. Its `document`, `ownerDocument`, or global document supplies visibility/focus events; use a window target to observe application focus loss. The consumer owns callback effects and remains responsible for pause/resume state.
