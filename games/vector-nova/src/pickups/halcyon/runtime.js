import { stepVehicle } from '../../physics/index.js';
import { getShip } from '../../ships/catalog.js';
import { createHalcyonDevices, HALCYON_TRACK_ID } from './placements.js';
import { createPickupSimulation } from './simulation.js';

export const HALCYON_RULES_ID =
  'halcyon-strips-v2-entry16-142-50-aegis6-layout2';

// The browser wrapper supplies presentation. The deterministic adapter remains
// importable without DOM, CSS, WebAudio or WebGL, including during replay tests.
export function createHalcyonSimulationRuntime({ track, presentation = null }) {
  if (track.id !== HALCYON_TRACK_ID)
    throw new Error('Halcyon devices require the exact Halcyon track');
  const devices = createHalcyonDevices(track);
  const simulation = createPickupSimulation({
    trackLength: track.length,
    devices,
  });
  const scenarios = Object.fromEntries(
    devices.map((device) => [
      device.id,
      {
        label: `${device.type === 'vector' ? 'VECTOR' : 'AEGIS'} · ${device.label} · parked`,
        state: {
          distance:
            device.type === 'vector'
              ? device.distance - device.length / 2 - 12
              : device.distance - 30,
          lateral: device.lateral,
          speed: 0,
          heading: 0,
        },
      },
    ]),
  );
  scenarios['aegis-impact'] = {
    label: 'AEGIS · collect, then steer left into rail',
    state: { distance: 340, lateral: 3, speed: 0, heading: 0 },
  };
  let pending = [];
  function applyEntryImpulse(events, state) {
    for (const event of events)
      if (event.type === 'pickup-activate' && event.payload.kind === 'vector')
        state.speed = Math.max(
          state.speed,
          Math.min(
            getShip(state.shipId).handling.boostSpeed,
            state.speed + event.payload.speedGain,
          ),
        );
  }
  return {
    id: 'halcyon-pickups',
    version: 3,
    rulesId: HALCYON_RULES_ID,
    scenarios,
    advance(state, input, dt) {
      if (!Number.isFinite(dt) || dt <= 0) return [];
      const elapsed = Math.min(dt, 0.1);
      const steps = Math.ceil(elapsed * 120 - 1e-10);
      const ordered = [];
      for (let tick = 0; tick < steps; tick++) {
        const previous = { ...state };
        const before = simulation.beforeStep(input, elapsed / steps, state);
        applyEntryImpulse(before.events, state);
        const physics = stepVehicle(
          state,
          input,
          track,
          elapsed / steps,
          before.modifiers,
        );
        const after = simulation.afterStep(previous, state, input, physics);
        applyEntryImpulse(after, state);
        ordered.push(...before.events, ...physics, ...after);
      }
      pending.push(...ordered);
      return ordered;
    },
    reset(context) {
      simulation.reset(context);
      pending = [];
      presentation?.reset();
    },
    snapshot: () => simulation.snapshot(),
    restore(data) {
      simulation.restore(data);
      pending = [];
      presentation?.reset();
    },
    pose: () => null,
    update(context) {
      presentation?.update({
        ...context,
        effects: simulation.snapshot(),
        events: pending,
      });
      pending = [];
    },
    dispose() {
      pending = [];
      presentation?.dispose();
    },
  };
}
