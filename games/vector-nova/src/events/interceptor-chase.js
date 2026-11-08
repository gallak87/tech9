import { createMagneticRuntime } from '../core/session-runtime.js';
import {
  magneticFrame,
  projectMagneticBody,
} from '../physics/magnetic-body.js';

export const INTERCEPTOR_CHASE_GAP = 30;
const RULES = 'pursuit-gap-v2-road30-margin1.5-close0.65-decel60';
const MARGIN = 1.5;
const coordinates = (point) =>
  point && { distance: point.distance, lateral: point.lateral };
const validCoordinates = (point) =>
  point === null ||
  (point && Number.isFinite(point.distance) && Number.isFinite(point.lateral));

// Thirty route metres clears the largest fully rotated boss + fleet nose
// (about 25.24m) while keeping the ordinary 36m Repulsor useful. The extra
// 1.5m approach margin covers sudden contact/braking and projection tolerance.
// Limit the hunter's physical movement, never the quarry's progress. Distances
// are unwrapped route metres between chassis centres, not straight-line world
// distance (which is ambiguous at loops/overpasses). Projection follows each
// body's previous station, including flight when vehicle.distance is held at
// the launch station. The ordinary level controller retains steering, banking,
// hazards, landing and manual boost.
export function createInterceptorChaseMotion(
  context,
  { createMotion = createMagneticRuntime, getTarget } = {},
) {
  if (!context?.dynamics || typeof getTarget !== 'function')
    throw new Error(
      'Pursuit spacing requires shared dynamics and a quarry reader.',
    );
  const { track } = context;
  const sampleRoad = context.dynamics.sampleRoadSurface;
  let player = null,
    target = null,
    staging = null;
  const dynamics = {
    ...context.dynamics,
    createActor(options = {}) {
      const actor = context.dynamics.createActor({
        ...options,
        movementLimitId: RULES,
      });
      return {
        ...actor,
        stage(proposal = {}) {
          const quarry = staging && getTarget();
          const quarryPose = quarry?.runtime?.pose(1);
          if (!quarryPose || !quarry.state || !staging)
            return actor.stage({ ...proposal, movementLimit: null });
          const body = actor.read();
          const position = proposal.pose?.position ?? body.position;
          player = coordinates(
            projectMagneticBody(
              track,
              position,
              player?.distance ?? staging.state.distance,
              player?.lateral ?? staging.state.lateral,
              sampleRoad,
            ),
          );
          target = coordinates(
            projectMagneticBody(
              track,
              quarryPose.position,
              quarryPose.grounded !== false
                ? quarry.state.distance
                : (target?.distance ?? quarry.state.distance),
              target?.lateral ?? quarry.state.lateral,
              sampleRoad,
            ),
          );
          const frame = magneticFrame(
            track,
            player.distance,
            player.lateral,
            sampleRoad,
          );
          const quarryFrame = magneticFrame(
            track,
            target.distance,
            target.lateral,
            sampleRoad,
          );
          const quarrySpeed =
            (quarryPose.velocity?.dot(quarryFrame.tangent) ??
              quarry.state.speed) / (quarryFrame.longitudinalMetric ?? 1);
          const gap = target.distance - player.distance;
          if (gap >= 240)
            return actor.stage({ ...proposal, movementLimit: null });
          // Normal approaches settle above the hard envelope using bounded
          // deceleration. Extra space also covers a quarry's sudden braking.
          const spare = Math.max(0, gap - INTERCEPTOR_CHASE_GAP - MARGIN);
          const permitted =
            Math.max(0, quarrySpeed) + Math.min(45, spare * 0.65);
          const velocity = proposal.velocity ?? body.velocity;
          const acceleration =
            proposal.acceleration?.clone() ??
            frame.tangent.clone().set(0, 0, 0);
          const dt = staging.dt;
          const gravity = context.dynamics.gravity ?? 26;
          const speed = velocity.dot(frame.tangent);
          const along =
            acceleration.dot(frame.tangent) - gravity * frame.tangent.y;
          const desired = Math.max(
            -60,
            (permitted * (frame.longitudinalMetric ?? 1) - speed) * 4,
          );
          const correction = Math.min(0, desired - along);
          acceleration.addScaledVector(frame.tangent, correction);
          let support = proposal.support;
          if (support?.destination && correction < 0) {
            // Ground controllers propose their actual road-following movement.
            // Reduce the proposal too, so its support guide cannot restore the
            // propulsion just removed from physical acceleration.
            const delta = frame.tangent
              .clone()
              .multiplyScalar(correction * dt * dt);
            support = {
              ...support,
              position: support.position.clone().add(delta),
              destination: support.destination.clone().add(delta),
            };
          }
          // This rarely engages after the approach governor. It bounds the
          // same swept movement after contact impulses as well, without a wall
          // collision, pose rewrite, or retained excess forward velocity.
          const station =
            target.distance -
            INTERCEPTOR_CHASE_GAP -
            MARGIN +
            Math.min(0, quarrySpeed) * dt;
          const limit = magneticFrame(
            track,
            station,
            player.lateral,
            sampleRoad,
          );
          const normal = limit.tangent.clone().normalize();
          return actor.stage({
            ...proposal,
            acceleration,
            ...(support ? { support } : {}),
            movementLimit:
              gap < 240 ? { normal, offset: limit.position.dot(normal) } : null,
          });
        },
      };
    },
  };
  const motion = createMotion({ ...context, dynamics });
  return {
    ...motion,
    id: `interceptor-chase-${motion.id}`,
    rulesId: `${motion.rulesId}:${RULES}`,
    beginAdvance(state, input, dt, modifiers) {
      staging = { state, dt };
      try {
        return motion.beginAdvance(state, input, dt, modifiers);
      } finally {
        staging = null;
      }
    },
    advance(state, input, dt, modifiers) {
      if (!Number.isFinite(dt) || dt <= 0) return [];
      const duration = Math.min(dt, 0.1);
      const count = Math.ceil(duration * 120 - 1e-10);
      const events = [];
      for (let i = 0; i < count; i++) {
        this.beginAdvance(state, input, duration / count, modifiers);
        context.dynamics.step(duration / count);
        events.push(...this.finishAdvance(state));
      }
      return events;
    },
    reset(setup = {}) {
      player = setup.state ? coordinates(setup.state) : null;
      target = null;
      staging = null;
      return motion.reset(setup);
    },
    snapshot() {
      return {
        ...motion.snapshot(),
        chase: {
          rulesId: RULES,
          player: coordinates(player),
          target: coordinates(target),
        },
      };
    },
    restore(data, options) {
      if (
        data?.chase?.rulesId !== RULES ||
        !validCoordinates(data.chase.player) ||
        !validCoordinates(data.chase.target)
      )
        throw new Error('Invalid pursuit-spacing snapshot.');
      motion.restore(data, options);
      player = coordinates(data.chase.player);
      target = coordinates(data.chase.target);
      staging = null;
    },
  };
}
