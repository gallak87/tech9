import { Group } from 'three';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';

// Reuse the player's field, fracture and expiry, without a second simulation,
// HUD, audio graph or render pass. Low retains the same single outline draw.
export function createRivalShield(ship, runtime, settings) {
  const feedback = createShipFeedbackPresentation(settings);
  const root = new Group();
  root.name = 'Rival / Aegis';
  const bounds = ship.userData.bounds;
  if (bounds) {
    const size = bounds.max.map((value, axis) => value - bounds.min[axis]);
    root.scale.set(
      Math.max(1, size[0] / 4),
      Math.max(1, size[1] / 1.5),
      Math.max(1, size[2] / 7.3),
    );
    root.position.x = (bounds.min[0] + bounds.max[0]) / 2;
    root.position.z = (bounds.min[2] + bounds.max[2]) / 2;
  }
  root.add(feedback.group);
  ship.add(root);
  const events = [];
  let previousTime = null;
  function reset() {
    events.length = 0;
    previousTime = null;
    feedback.reset();
  }
  const detach = runtime.observePresentation?.({
    events(batch) {
      for (const event of batch)
        if (event.payload?.kind === 'aegis' || event.type === 'impact')
          events.push(event);
    },
    reset,
  });
  return {
    update({ visible, mode, state, effects, settings }) {
      if (!visible) reset();
      const time = state.time ?? 0;
      const dt =
        previousTime === null
          ? 0
          : Math.max(0, Math.min(0.1, time - previousTime));
      feedback.update({
        effects: { aegisRemaining: effects.aegisRemaining },
        events,
        racing: visible && (mode === 'racing' || events.length > 0),
        driving: visible,
        dt,
        speed: state.speed,
        time,
        settings,
      });
      events.length = 0;
      previousTime = visible ? time : null;
    },
    dispose() {
      detach?.();
      events.length = 0;
      feedback.dispose();
      root.removeFromParent();
    },
  };
}
