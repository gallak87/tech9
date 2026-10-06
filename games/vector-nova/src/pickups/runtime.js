import {
  createMagneticRuntime,
  runtimeIdentity,
} from '../core/session-runtime.js';
import { createPickupSimulation, VECTOR_PROPULSION } from './simulation.js';

// Compose devices around a circuit's actual simulation. Player and rivals use
// this same adapter; only the player supplies decorative presentation.
export function createDeviceRuntime({
  track,
  devices,
  motion = createMagneticRuntime({ track }),
  identity,
  presentation = null,
  scenarios = {},
}) {
  const simulation = createPickupSimulation({
    trackLength: track.length,
    devices,
  });
  const deviceScenarios = Object.fromEntries(
    devices.map((device) => [
      device.id,
      {
        label: `${device.type === 'vector' ? 'VECTOR' : 'AEGIS'} · ${device.label} · parked`,
        state: {
          distance:
            device.distance -
            (device.type === 'vector' ? device.length / 2 + 12 : 30),
          lateral: device.lateral,
          speed: 0,
          heading: 0,
        },
      },
    ]),
  );
  let pending = [];
  let disposed = false;
  let staged = null;
  const supportedState = (state) => ({
    ...state,
    grounded: motion.pose(1)?.grounded !== false,
  });
  function applyEntryImpulse(events, state) {
    for (const event of events)
      if (event.type === 'pickup-activate' && event.payload.kind === 'vector')
        state.speed = Math.max(
          state.speed,
          Math.min(
            VECTOR_PROPULSION.cruiseSpeed,
            state.speed + event.payload.speedGain,
          ),
        );
  }
  const ownIdentity = identity ?? {
    id: `${motion.id}-devices`,
    version: 1,
    rulesId: `${JSON.stringify(runtimeIdentity(motion))}:vector65-600kph-1800:aegis6:${simulation.snapshot().layoutKey}`,
  };
  return {
    ...ownIdentity,
    scenarios: { ...motion.scenarios, ...deviceScenarios, ...scenarios },
    advance(state, input, dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return [];
      const elapsed = Math.min(dt, 0.1);
      const steps = Math.ceil(elapsed * 120 - 1e-10);
      const ordered = [];
      for (let tick = 0; tick < steps; tick++) {
        const previous = supportedState(state);
        const before = simulation.beforeStep(input, elapsed / steps, previous);
        applyEntryImpulse(before.events, state);
        const physics = motion.advance(
          state,
          input,
          elapsed / steps,
          before.modifiers,
        );
        const after = simulation.afterStep(
          previous,
          supportedState(state),
          input,
          physics,
        );
        applyEntryImpulse(after, state);
        ordered.push(...before.events, ...physics, ...after);
      }
      pending.push(...ordered);
      return ordered;
    },
    ...(typeof motion.beginAdvance === 'function' &&
    typeof motion.finishAdvance === 'function'
      ? {
          beginAdvance(state, input, dt) {
            if (disposed || !Number.isFinite(dt) || dt <= 0) return;
            if (staged) throw new Error('Device advance is already staged');
            const previous = supportedState(state);
            const before = simulation.beforeStep(input, dt, previous);
            applyEntryImpulse(before.events, state);
            staged = { state, input, previous, before };
            motion.beginAdvance(state, input, dt, before.modifiers);
          },
          finishAdvance(state) {
            if (!staged) return [];
            if (state !== staged.state)
              throw new Error('Device advance state mismatch');
            const { input, previous, before } = staged;
            const physics = motion.finishAdvance(state);
            const after = simulation.afterStep(
              previous,
              supportedState(state),
              input,
              physics,
            );
            applyEntryImpulse(after, state);
            const ordered = [...before.events, ...physics, ...after];
            staged = null;
            pending.push(...ordered);
            return ordered;
          },
        }
      : {}),
    reset(context) {
      motion.reset(context);
      simulation.reset(context);
      pending = [];
      staged = null;
      presentation?.reset();
    },
    snapshot() {
      const movement = motion.snapshot();
      return {
        ...movement,
        ...simulation.snapshot(),
        ...(movement === null ? {} : { motion: movement }),
      };
    },
    restore(data) {
      simulation.restore(data);
      motion.restore(data?.motion ?? null);
      pending = [];
      staged = null;
      presentation?.reset();
    },
    pose: (alpha) => motion.pose(alpha),
    getPresentation: () => presentation?.getPresentation?.() ?? null,
    update(context) {
      motion.update(context);
      presentation?.update({
        ...context,
        effects: simulation.snapshot(),
        events: pending,
      });
      pending = [];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = [];
      staged = null;
      presentation?.dispose();
      motion.dispose();
    },
  };
}
