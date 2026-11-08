import { Group } from 'three';
import { createShipFeedbackPresentation } from '../pickups/ship-feedback.js';

// All racers share the player's ship-local pickup effects. This owner only
// bridges simulation events/state; it creates no HUD, audio or render pass.
export function createRivalPickups(ship, runtime, settings) {
  // Rival propulsion supplies Vector at each model's actual exhaust anchors.
  const feedback = createShipFeedbackPresentation(settings, {
    vectorThrust: false,
  });
  const root = new Group();
  root.name = 'Rival / pickups';
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
  const events = [],
    feedbackEvents = [];
  let previousTime = null;
  function reset() {
    events.length = 0;
    feedbackEvents.length = 0;
    previousTime = null;
    feedback.reset();
  }
  const detach = runtime.observePresentation?.({
    events(batch) {
      events.push(...batch);
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
      const gear = effects.equipment;
      const shield =
        gear?.shieldRemaining ??
        (gear?.shield
          ? (gear.slots?.find((slot) => slot?.id === 'deflector')?.active ?? 0)
          : 0);
      const slipstream =
        gear?.slipstreamRemaining ??
        gear?.slots?.find((slot) => slot?.id === 'slipstream')?.active ??
        0;
      for (const event of events) {
        if (
          event.type === 'equipment-activate' &&
          event.payload?.kind !== 'lance'
        )
          feedbackEvents.push({
            type: 'pickup-activate',
            payload: {
              kind: event.payload.kind === 'deflector' ? 'aegis' : 'vector',
            },
          });
        else if (event.type === 'equipment-block')
          feedbackEvents.push({ type: 'shield-hit', payload: event.payload });
        else if (
          event.type === 'equipment-expire' &&
          event.payload?.kind === 'deflector' &&
          !(effects.aegisRemaining > 0)
        )
          feedbackEvents.push({
            type: 'pickup-expire',
            payload: { kind: 'aegis' },
          });
        else feedbackEvents.push(event);
      }
      feedback.update({
        effects: gear
          ? {
              ...effects,
              aegisRemaining: Math.max(effects.aegisRemaining ?? 0, shield),
              vectorActive: effects.vectorActive || slipstream > 0,
            }
          : effects,
        events: feedbackEvents,
        racing:
          visible &&
          (['racing', 'results'].includes(mode) || events.length > 0),
        driving: visible,
        dt,
        speed: state.speed,
        time,
        settings,
      });
      events.length = 0;
      feedbackEvents.length = 0;
      previousTime = visible ? time : null;
    },
    dispose() {
      detach?.();
      events.length = 0;
      feedbackEvents.length = 0;
      feedback.dispose();
      root.removeFromParent();
    },
  };
}
