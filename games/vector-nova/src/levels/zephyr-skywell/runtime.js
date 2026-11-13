import * as T from 'three';
import { createFlightModel } from '../../physics/flight.js';
import { createRapierWorld } from '../../physics/rapier-world.js';

import {
  createFreestyleController,
  landingEstimate,
  FREESTYLE_RULES,
} from '../../freestyle/controller.js';
import { freestyleReceiverCorrection } from '../../freestyle/feedback.js';

export const SKYWELL_FLIGHT_RULES = Object.freeze({
  gravity: 18,
  timeout: 10,
  missBelow: 220,
});
export function createSkywellDynamics({ collisionWorld }) {
  return createRapierWorld({
    collisionWorld,
    gravity: SKYWELL_FLIGHT_RULES.gravity,
  });
}

export function createSkywellRuntime(context) {
  const { track, dynamics } = context;
  let physicalActor = null;
  const observedDynamics = dynamics && {
    ...dynamics,
    createActor(...args) {
      physicalActor = dynamics.createActor(...args);
      return physicalActor;
    },
  };
  const controller = createFreestyleController({ track });
  const model = createFlightModel({
    ...SKYWELL_FLIGHT_RULES,
    railHeight: Object.fromEntries(track.jumps.map((j) => [j.id, 0.8])),
  });
  const motion = model.createRuntime(
    { ...context, dynamics: observedDynamics },
    {
      id: 'zephyr-skywell-freestyle',
      version: 6,
      rulesId: `zephyr-skywell-v6:${JSON.stringify({ rules: FREESTYLE_RULES, pace: track.pace, flight: SKYWELL_FLIGHT_RULES })}`,
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
      surfaceLanding: true,
    },
  );
  let incoming = null,
    trickEvents = null;
  function before(state, input, dt) {
    incoming = { pose: motion.pose(1), flight: motion.snapshot().flight };
    trickEvents = controller.step(input, dt);
    return input;
  }
  function finish(state, events) {
    if (trickEvents) {
      for (const payload of trickEvents)
        events.push({ type: 'freestyle-trick', payload });
      trickEvents = null;
    }
    for (const e of events) {
      if (e.type === 'jump-launch') {
        const interrupted = controller.launch(e.payload.id);
        if (interrupted)
          events.push({ type: 'freestyle-bank', payload: interrupted });
      }
      if (e.type === 'impact') controller.damage();
      if (e.type === 'jump-miss') controller.fail();
      if (e.type === 'road-recovery') {
        const leg = controller.rejectLanding('Lost receiver support');
        if (leg) events.push({ type: 'freestyle-bank', payload: leg });
        controller.invalidate();
      }
      if (e.type === 'jump-transfer') {
        const jump = track.jumps.find((j) => j.id === e.payload.id);
        const pose = motion.pose(1) ?? incoming.pose;
        if (!jump || !pose) continue;
        const leg = controller.land({
          jump,
          distance: state.distance,
          lateral: state.lateral,
          outcome: e.payload.outcome,
          position: pose.position,
          quaternion: pose.quaternion,
          velocity: new T.Vector3().fromArray(
            incoming.flight?.velocity ?? [0, 0, 0],
          ),
          edgeCaught: !!e.payload.edgeCaught,
        });
        if (leg) events.push({ type: 'freestyle-bank', payload: leg });
      }
    }
    if (controller.readFrame().pendingLanding) {
      // Grade sustained physical support, not the visual landing interpolation
      // or a remembered airborne rotation command. No movement is corrected.
      const pose = motion.pose(1);
      const body = physicalActor?.read();
      const frame =
        track.sampleSurface?.(state.distance, state.lateral) ??
        track.sample(state.distance);
      const leg = controller.settle({
        distance: state.distance,
        lateral: state.lateral,
        supported:
          pose?.grounded === true &&
          !track.isGap(state.distance) &&
          (!body || body.support != null),
        quaternion: body?.quaternion ?? pose?.quaternion,
        normalSpeed: body?.velocity.dot(frame.up) ?? 0,
        supportError: body?.support
          ? body.position.clone().sub(body.support.position).dot(frame.up)
          : 0,
      });
      if (leg) events.push({ type: 'freestyle-bank', payload: leg });
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
      trickEvents = null;
      motion.reset(options);
      if (options.reason === 'manual-recover') controller.invalidate();
      else {
        controller.reset();
        if (options.reason === 'freestyle-practice') controller.invalidate();
      }
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
        SKYWELL_FLIGHT_RULES,
      );
      return { ...snapshot, freestyle };
    },
    readFrame() {
      const frame = motion.readFrame();
      const freestyle = controller.readFrame();
      const jump = track.jumps.find(
        (candidate) => candidate.id === freestyle.flight?.id,
      );
      const pose = motion.pose(1);
      const velocity =
        frame.flight?.velocity ??
        (incoming?.flight?.id === frame.flight?.id
          ? incoming?.flight?.velocity
          : null);
      freestyle.touchdown = landingEstimate(
        track,
        jump,
        pose,
        velocity ? new T.Vector3().fromArray(velocity) : null,
        SKYWELL_FLIGHT_RULES,
      );
      freestyle.actualAngularSpeed = frame.flight?.angularVelocity
        ? Math.hypot(...frame.flight.angularVelocity)
        : 0;
      if (pose && jump) {
        // This is an aiming reference, not a prediction of future contact:
        // compare the real hull with the authored receiver's target surface.
        const receiver =
          track.sampleSurface?.(jump.target, jump.targetLateral ?? 0) ??
          track.sample(jump.target);
        const up = new T.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
        const forward = new T.Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
        freestyle.receiverReference = {
          tilt: Math.acos(T.MathUtils.clamp(up.dot(receiver.up), -1, 1)),
          nose: Math.acos(
            T.MathUtils.clamp(forward.dot(receiver.tangent), -1, 1),
          ),
          correction: freestyleReceiverCorrection(
            pose.quaternion,
            receiver.quaternion,
          ),
        };
      }
      return { ...frame, freestyle };
    },
    restore(data, options) {
      trickEvents = null;
      motion.restore(data, options);
      controller.restore(data.freestyle);
      incoming = null;
    },
    pose(alpha = 1) {
      const pose = motion.pose(alpha),
        flight = motion.snapshot().flight;
      if (pose && !pose.grounded && flight) {
        const forward = new T.Vector3().fromArray(flight.velocity).normalize();
        const right = new T.Vector3(0, 1, 0).cross(forward);
        if (right.lengthSq() < 1e-8) {
          right.fromArray(flight.launchRight);
          right.addScaledVector(forward, -right.dot(forward));
        }
        if (right.lengthSq() < 1e-8)
          right.set(1, 0, 0).addScaledVector(forward, -forward.x);
        right.normalize();
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
