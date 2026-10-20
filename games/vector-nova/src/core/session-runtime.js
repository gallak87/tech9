import { stepVehicle } from '../physics/index.js';
import {
  createMagneticBody,
  MAGNETIC_BODY_RULES,
} from '../physics/magnetic-body.js';

export const BASELINE_RULES = 'magnetic-v3-assist-0.3';
export function createMagneticRuntime({
  track,
  dynamics = null,
  settings = {},
}) {
  if (dynamics) {
    const actor = dynamics.createActor();
    const body = createMagneticBody({ track, dynamics, actor });
    return {
      id: 'magnetic',
      version: 2,
      rulesId: `${BASELINE_RULES}:${MAGNETIC_BODY_RULES}:${dynamics.rulesId}`,
      scenarios: {},
      beginAdvance(state, input, dt, modifiers) {
        body.stage(state, input, dt, {
          steeringAssist: settings.steeringAssist,
          ...modifiers,
        });
      },
      finishAdvance: (state) => body.finish(state),
      applyImpulse: (state, impulse) => body.applyImpulse(state, impulse),
      advance(state, input, dt, modifiers) {
        if (!Number.isFinite(dt) || dt <= 0) return [];
        const duration = Math.min(dt, 0.1),
          count = Math.ceil(duration * 120 - 1e-10),
          events = [];
        for (let i = 0; i < count; i++) {
          this.beginAdvance(state, input, duration / count, modifiers);
          dynamics.step(duration / count);
          events.push(...this.finishAdvance(state));
        }
        return events;
      },
      reset({ state } = {}) {
        actor.reset();
        body.reset(state);
      },
      snapshot: () => body.snapshot(),
      restore: (data) => body.restore(data),
      pose: (alpha) => body.pose(alpha),
      update() {},
      dispose() {
        actor.dispose();
      },
    };
  }
  return {
    id: 'magnetic',
    version: 1,
    rulesId: BASELINE_RULES,
    scenarios: {},
    advance: (state, input, dt, modifiers) =>
      stepVehicle(state, input, track, dt, modifiers),
    reset() {},
    snapshot: () => null,
    restore() {},
    pose: () => null,
    update() {},
    dispose() {},
  };
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
export function advanceSession({
  state,
  input,
  dt,
  runtime,
  race,
  emit,
  dynamics = null,
  racers = null,
}) {
  if (dynamics && runtime.beginAdvance && runtime.finishAdvance) {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    if (racers?.enabled && !racers.beginAdvance)
      throw new Error('Shared dynamics require staged racer runtimes');
    const duration = Math.min(0.1, dt);
    const steps = Math.ceil(duration * 120 - 1e-10);
    const events = [];
    for (let tick = 0; tick < steps; tick++) {
      const step = duration / steps;
      const playerPrevious = { ...state };
      const controls = race.runoutControl(state, input);
      const context = {
        playerState: state,
        playerRace: race,
        playerInput: controls,
        playerPose: runtime.pose(1),
        playerPrevious,
      };
      runtime.beginAdvance(state, controls, step);
      racers?.beginAdvance?.(step, context);
      dynamics.step(step);
      const completed = runtime.finishAdvance(state);
      completed.forEach(emit);
      race
        .step(playerPrevious.distance, state.distance, step, completed, {
          grounded: runtime.pose(1)?.grounded !== false,
        })
        .forEach(emit);
      // Forward finish events with the same grounded sprint pose.
      racers?.finishAdvance?.({ playerPose: runtime.pose(1) })?.forEach(emit);
      const interactions = runtime.advanceInteractions?.(step) ?? [];
      interactions.forEach(emit);
      events.push(...completed, ...interactions);
    }
    return events;
  }
  const previous = state.distance;
  const controls = race.runoutControl(state, input);
  const events = runtime.advance(state, controls, dt);
  events.forEach(emit);
  race
    .step(previous, state.distance, dt, events, {
      grounded: runtime.pose(1)?.grounded !== false,
    })
    .forEach(emit);
  racers
    ?.advance(dt, {
      playerState: state,
      playerRace: race,
      playerInput: controls,
      playerPose: runtime.pose(1),
    })
    ?.forEach(emit);
  const interactions = runtime.advanceInteractions?.(dt) ?? [];
  interactions.forEach(emit);
  events.push(...interactions);
  return events;
}

export function captureInitial(state, runtime, dynamics = null) {
  return JSON.parse(
    JSON.stringify({
      vehicle: state,
      runtime: runtime.snapshot(),
      ...(dynamics ? { dynamics: dynamics.snapshot() } : {}),
    }),
  );
}
export function restoreReplayInitial(
  initial,
  expected,
  state,
  runtime,
  dynamics = null,
) {
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
  if (dynamics) dynamics.restore(copy.dynamics);
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
