import * as T from 'three';
import { createFlightModel } from '../../physics/flight.js';
import {
  createFreestyleController,
  landingEstimate,
  FREESTYLE_RULES,
} from '../../freestyle/controller.js';

export function createLaunchworksRuntime(context) {
  const { track, dynamics } = context;
  const controller = createFreestyleController({ track });
  const model = createFlightModel({
    gravity: 26,
    timeout: 8,
    missBelow: 180,
    railHeight: Object.fromEntries(track.jumps.map((j) => [j.id, 0.8])),
  });
  const motion = model.createRuntime(context, {
    id: 'launchworks-freestyle',
    version: 2,
    rulesId: `launchworks-v2:${JSON.stringify({ rules: FREESTYLE_RULES, pace: track.pace })}`,
    scenarios: Object.fromEntries(
      Object.entries(track.scenarios).map(([id, state]) => [
        id,
        { label: id, state },
      ]),
    ),
    groundOptions: () => ({ pace: track.pace }),
    airAttitude: ({ target }) => controller.attitude(target),
    airAngularSpeed: 6,
    airAngularResponse: 24,
    forgivingContacts: false,
  });
  let incoming = null;
  function before(state, input, dt) {
    incoming = { pose: motion.pose(1), flight: motion.snapshot().flight };
    controller.step(input, dt);
    const turning =
      incoming.flight &&
      [input.aerialPitch, input.aerialYaw, input.aerialRoll].some(
        (v) => Math.abs(v ?? 0) > 0.05,
      );
    return turning ? { ...input, steer: 0, boost: false } : input;
  }
  function finish(state, events) {
    for (const e of events) {
      if (e.type === 'jump-launch') controller.launch(e.payload.id);
      if (e.type === 'impact') controller.damage();
      if (e.type === 'jump-miss') controller.fail();
      if (e.type === 'road-recovery') controller.invalidate();
      if (e.type === 'jump-transfer') {
        const jump = track.jumps.find((j) => j.id === e.payload.id);
        const pose = motion.pose(1) ?? incoming.pose;
        if (!jump || !pose) continue;
        const leg = controller.land({
          jump,
          outcome: e.payload.outcome,
          position: pose.position,
          quaternion: pose.quaternion,
          velocity: new T.Vector3().fromArray(
            incoming.flight?.velocity ?? [0, 0, 0],
          ),
          angularSpeed: Math.hypot(
            ...(incoming.flight?.angularVelocity ?? [0, 0, 0]),
          ),
          edgeCaught: !!e.payload.edgeCaught,
        });
        if (leg) events.push({ type: 'freestyle-bank', payload: leg });
      }
    }
    if (
      state.distance >= track.finishDistance &&
      motion.pose(1)?.grounded !== false
    )
      controller.complete(state.shipId);
    return events;
  }
  const runtime = {
    ...motion,
    reset(options = {}) {
      motion.reset(options);
      if (options.reason === 'manual-recover') controller.invalidate();
      else controller.reset();
      incoming = null;
    },
    snapshot() {
      const snapshot = motion.snapshot(),
        freestyle = controller.snapshot();
      const jump = track.jumps.find((j) => j.id === freestyle.flight?.id);
      freestyle.touchdown = landingEstimate(
        track,
        jump,
        motion.pose(1),
        snapshot.flight
          ? new T.Vector3().fromArray(snapshot.flight.velocity)
          : null,
      );
      return { ...snapshot, freestyle };
    },
    restore(data) {
      motion.restore(data);
      controller.restore(data.freestyle);
      incoming = null;
    },
    pose(alpha = 1) {
      const pose = motion.pose(alpha),
        flight = motion.snapshot().flight;
      if (pose && !pose.grounded && flight) {
        const forward = new T.Vector3().fromArray(flight.velocity).normalize();
        const right = new T.Vector3(0, 1, 0).cross(forward).normalize();
        const up = forward.clone().cross(right).normalize();
        pose.viewQuaternion = new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().makeBasis(right, up, forward),
        );
      }
      return pose;
    },
    advance(state, input, dt, modifiers) {
      if (!Number.isFinite(dt) || dt <= 0) return [];
      const duration = Math.min(dt, 0.1),
        count = Math.ceil(duration * 120 - 1e-10),
        events = [];
      for (let i = 0; i < count; i++) {
        if (dynamics) {
          runtime.beginAdvance(state, input, duration / count, modifiers);
          dynamics.step(duration / count);
          events.push(...runtime.finishAdvance(state));
        } else {
          const controls = before(state, input, duration / count);
          events.push(
            ...finish(
              state,
              motion.advance(state, controls, duration / count, modifiers),
            ),
          );
        }
      }
      return events;
    },
  };
  if (dynamics) {
    runtime.beginAdvance = (state, input, dt, modifiers) => {
      const controls = before(state, input, dt);
      motion.beginAdvance(state, controls, dt, modifiers);
    };
    runtime.finishAdvance = (state) =>
      finish(state, motion.finishAdvance(state));
  }
  return runtime;
}
