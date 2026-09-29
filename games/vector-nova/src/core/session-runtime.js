import { stepVehicle } from '../physics/index.js';

export const BASELINE_RULES = 'magnetic-v3-assist-0.3';
export function createMagneticRuntime({ track }) {
  return {
    id: 'magnetic',
    version: 1,
    rulesId: BASELINE_RULES,
    scenarios: {},
    advance: (state, input, dt) => stepVehicle(state, input, track, dt),
    reset() {},
    snapshot: () => null,
    restore() {},
    pose: () => null,
    update() {},
    dispose() {},
  };
}
export function hasHalcyonFeatures(track, features) {
  return (
    track.id === 'halcyon-viaduct-4-compact' && features === 'halcyon-pickups'
  );
}
export function runtimeIdentity(runtime) {
  return { id: runtime.id, version: runtime.version, rulesId: runtime.rulesId };
}
export function compatibleRuntime(runtime, identity) {
  const expected = runtimeIdentity(runtime);
  return (
    !!identity &&
    Object.keys(expected).every((key) => identity[key] === expected[key])
  );
}
// The only simulation advance used by live input and replay. Presentation is
// deliberately outside this path and can never change the deterministic state.
export function advanceSession({ state, input, dt, runtime, race, emit }) {
  const previous = state.distance;
  const events = runtime.advance(state, input, dt);
  events.forEach(emit);
  race.step(previous, state.distance, dt, events).forEach(emit);
  return events;
}

export function captureInitial(state, runtime) {
  return JSON.parse(
    JSON.stringify({ vehicle: state, runtime: runtime.snapshot() }),
  );
}
export function restoreReplayInitial(initial, expected, state, runtime) {
  const finite = (value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(finite);
    if (value && typeof value === 'object')
      return Object.values(value).every(finite);
    return (
      value === null || typeof value === 'string' || typeof value === 'boolean'
    );
  };
  if (
    !initial ||
    !finite(initial) ||
    JSON.stringify(initial) !== JSON.stringify(expected)
  )
    throw new Error('Replay initial state mismatch');
  const copy = JSON.parse(JSON.stringify(initial));
  Object.assign(state, copy.vehicle);
  runtime.restore(copy.runtime);
}

// Refuse partial logs instead of silently replaying their tail from the grid.
export function validateReplayInputs(inputs, expectedTicks = inputs?.length) {
  if (
    !Array.isArray(inputs) ||
    inputs.length > 36000 ||
    inputs.length !== expectedTicks
  )
    throw new Error('Replay input log is truncated or invalid');
  for (let i = 0; i < inputs.length; i++) {
    const entry = inputs[i],
      control = entry?.input;
    if (
      entry?.tick !== i ||
      !control ||
      !['throttle', 'brake', 'steer'].every(
        (key) => Number.isFinite(control[key]) && Math.abs(control[key]) <= 1,
      ) ||
      control.throttle < 0 ||
      control.brake < 0 ||
      typeof control.boost !== 'boolean' ||
      typeof control.airbrake !== 'boolean'
    )
      throw new Error('Replay input log is noncontiguous or malformed');
  }
  return inputs;
}
