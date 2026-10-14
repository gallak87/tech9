import * as T from 'three';
import { getShip } from '../ships/catalog.js';
import {
  COLLISION_HULLS_ID,
  getCollisionHull,
} from '../ships/collision-hulls.js';
import {
  getVehiclePace,
  STEERING_ASSIST,
  surfaceHullClearance,
  updateBoostState,
} from './index.js';
import { VEHICLE_HULL, projectedHullExtent, hullAxes } from './hull.js';
import { createContactFeedback, racerImpact } from './contact-feedback.js';

export const MAGNETIC_BODY_RULES = `magnetic-constraint-v2-yaw-0.85-120-grip80:${COLLISION_HULLS_ID}`;
const clamp = T.MathUtils.clamp;
const axisY = new T.Vector3(0, 1, 0);
const axisZ = new T.Vector3(0, 0, 1);
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const poseCopy = (p) =>
  p && { position: p.position.clone(), quaternion: p.quaternion.clone() };

export function magneticFrame(track, distance, lateral) {
  const surface = track.sampleSurface?.(distance, lateral);
  const frame = surface ?? track.sample(distance);
  return {
    ...frame,
    position: frame.position
      .clone()
      .addScaledVector(frame.right, surface ? 0 : lateral),
    surface,
  };
}

// Local Newton projection preserves route ownership at overpasses. Coordinates
// describe the solved body; they never move it back to an expected route pose.
export function projectMagneticBody(track, position, distance, lateral) {
  for (let i = 0; i < 8; i++) {
    const f = magneticFrame(track, distance, lateral);
    const residual = position.clone().sub(f.position);
    const along = residual.dot(f.tangent) / (f.longitudinalMetric ?? 1);
    const across =
      (residual.dot(f.right) - (f.longitudinalShear ?? 0) * along) /
      (f.lateralMetric ?? 1);
    distance += clamp(along, -8, 8);
    lateral += clamp(across, -8, 8);
    if (Math.abs(along) + Math.abs(across) < 1e-6) break;
  }
  const f = magneticFrame(track, distance, lateral);
  if (f.period > 0)
    lateral =
      T.MathUtils.euclideanModulo(lateral + f.period / 2, f.period) -
      f.period / 2;
  return { distance, lateral, frame: magneticFrame(track, distance, lateral) };
}

/** Forces drive the free road-plane axes; Rapier owns pose and contact response. */
export function createMagneticBody({
  track,
  dynamics,
  actor,
  hull = VEHICLE_HULL,
  contactFeedback = createContactFeedback(),
}) {
  let initialized = false,
    current = null,
    previous = null,
    lastSpeed = 0;
  let pending = null,
    capture = null;
  function support(state, options = {}, dt = 0) {
    const f = magneticFrame(track, state.distance, state.lateral);
    const solved = initialized ? actor.read() : null;
    const actual = solved?.quaternion ?? f.quaternion;
    const aligned = f.quaternion
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(axisY, state.heading));
    // Ordinary support follows the road target. Lifting that target in response
    // to every contact-induced tilt would make the magnets pump energy into a
    // pair of touching hulls. Only landing capture needs swept attitude clearance.
    let bodyHeight = hull.hover;
    const vertices = getCollisionHull(state.chassisId ?? state.shipId).vertices;
    const modelClearance = (quaternion) => {
      const direction = f.up
        .clone()
        .applyQuaternion(quaternion.clone().invert());
      let extent = 0;
      for (let i = 0; i < vertices.length; i += 3)
        extent = Math.max(
          extent,
          -vertices[i] * direction.x -
            vertices[i + 1] * direction.y -
            vertices[i + 2] * direction.z,
        );
      return Math.max(projectedHullExtent(quaternion, f.up, hull), extent);
    };
    let bodyFrame;
    if (capture) {
      bodyHeight = modelClearance(actual);
      const t = clamp(capture.elapsed / 0.18, 0, 1);
      bodyFrame = capture.orientation
        .clone()
        .slerp(new T.Quaternion(), t * t * (3 - 2 * t));
      const target = f.quaternion.clone().multiply(bodyFrame.clone().invert());
      // Reserve the swept corner height while the constraint rights a landed
      // hull. It changes the magnet target, never the body's solved pose.
      for (let i = 1; i <= 8; i++)
        bodyHeight = Math.max(
          bodyHeight,
          modelClearance(actual.clone().slerp(target, i / 8)),
        );
    }
    let height =
      Math.max(hull.hover, bodyHeight) +
      surfaceHullClearance(f.surface, state.heading);
    // Cover the whole advancing hull, not just the route point underneath its
    // centre. On a rising ramp an unaccounted nose/deck contact creates yaw.
    const axes = hullAxes(capture ? actual : aligned);
    const travel =
      solved?.velocity.clone().multiplyScalar(dt) ?? new T.Vector3();
    for (const x of [-hull.halfWidth, hull.halfWidth]) {
      for (const z of [-hull.halfLength, hull.halfLength]) {
        const offset = axes[0]
          .clone()
          .multiplyScalar(x)
          .addScaledVector(axes[1], -hull.hover)
          .addScaledVector(axes[2], z)
          .add(travel);
        const along = offset.dot(f.tangent) / (f.longitudinalMetric ?? 1);
        const distance = state.distance + along;
        const wrapped =
          track.closed === false
            ? distance
            : T.MathUtils.euclideanModulo(distance, track.length);
        if (
          (track.jumps ?? []).some(
            (jump) =>
              !jump.optional &&
              wrapped > jump.takeoff &&
              wrapped < jump.landingStart,
          )
        )
          continue;
        const lateral =
          state.lateral +
          (offset.dot(f.right) - (f.longitudinalShear ?? 0) * along) /
            (f.lateralMetric ?? 1);
        const road = magneticFrame(track, distance, lateral);
        height = Math.max(
          height,
          road.position.sub(f.position).sub(offset).dot(f.up),
        );
      }
    }
    height += finite(options.supportHeight);
    return {
      position: f.position.clone().addScaledVector(f.up, height),
      quaternion: f.quaternion.clone(),
      ...(bodyFrame ? { bodyFrame } : {}),
    };
  }
  function initialize(state, options) {
    actor.setContactShape(getCollisionHull(state.chassisId ?? state.shipId));
    const frame = magneticFrame(track, state.distance, state.lateral);
    const pose = support(state, options);
    pose.quaternion.multiply(
      new T.Quaternion().setFromAxisAngle(axisY, state.heading),
    );
    actor.reset({
      active: true,
      pose,
      velocity: frame.tangent
        .clone()
        .multiplyScalar(state.speed * Math.cos(state.heading))
        .addScaledVector(frame.right, state.lateralSpeed),
    });
    current = poseCopy(pose);
    previous = poseCopy(pose);
    initialized = true;
    lastSpeed = state.speed;
  }
  return {
    stage(state, input, dt, options = {}) {
      if (!initialized) initialize(state, options);
      const body = actor.read();
      if (capture) {
        capture.elapsed += dt;
        if (capture.elapsed > 0.18 + dt) capture = null;
      }
      previous = poseCopy(body);
      const f = magneticFrame(track, state.distance, state.lateral);
      // Vector entry is an explicit propulsion impulse applied by the device
      // adapter between ticks. Preserve it without replacing contact velocity.
      const deviceImpulse = state.speed - lastSpeed;
      if (Math.abs(deviceImpulse) > 1e-6) {
        body.velocity.addScaledVector(f.tangent, deviceImpulse);
        actor.setVelocity(body.velocity);
      }
      const events = [];
      const handling = getShip(state.shipId).handling;
      const throttle = clamp(finite(input?.throttle), 0, 1);
      const brake = clamp(finite(input?.brake), 0, 1);
      const steer = clamp(finite(input?.steer), -1, 1);
      const airbrake = Boolean(input?.airbrake);
      const boost = updateBoostState(state, input, events);
      const resolvedPace = getVehiclePace(state.shipId, options.pace);
      const pace = resolvedPace ?? handling;
      const pad = options.propulsion && brake < 0.1;
      const cruise = Math.max(
        boost ? pace.boostSpeed : pace.cruiseSpeed,
        pad ? options.propulsion.cruiseSpeed : 0,
      );
      const thrust = Math.max(
        boost ? handling.boostThrust : handling.thrust,
        pad ? options.propulsion.thrust : 0,
      );
      const forward = axisZ
        .clone()
        .applyQuaternion(body.quaternion)
        .addScaledVector(
          f.up,
          -axisZ.clone().applyQuaternion(body.quaternion).dot(f.up),
        )
        .normalize();
      const side = f.up.clone().cross(forward).normalize();
      const speed = body.velocity.dot(forward);
      const slip = body.velocity.dot(side);
      const surface = options.surface ?? {};
      const dragScale = pace.aerodynamicDragScale ?? 1;
      const drag = 4.4 + 0.0018 * dragScale * speed * speed;
      const nominalDrag = 4.4 + 0.0018 * cruise * cruise;
      const ratio = (Math.max(0, speed) / cruise) ** 2;
      const engine = resolvedPace
        ? Math.max(
            0,
            drag +
              (thrust - 4.4) *
                (1 - ratio) *
                (ratio > 1 ? pace.overspeedDeceleration : 1),
          )
        : Math.max(0, thrust - (thrust - nominalDrag) * ratio);
      const drive =
        (pad ? 1 : throttle) *
        engine *
        clamp(finite(surface.thrustScale, 1), 0, 1);
      const resistance =
        brake * handling.braking +
        drag +
        (airbrake ? 7 : 0) +
        finite(surface.drag);
      // Bounded braking opposes existing momentum, including a backwards shove.
      const deceleration =
        Math.sign(speed) * Math.min(Math.abs(speed) / dt, resistance);
      const parking =
        throttle === 0 && Math.abs(steer) < 0.05 && Math.abs(speed) < 0.12;
      const grip =
        (parking ? 24 : airbrake ? 4.5 : 7.2) *
        handling.grip *
        clamp(finite(surface.grip, 1), 0.05, 4);
      // The lateral thrusters have a finite force budget. Unbounded slip
      // damping can overpower yaw control after a shove, keeping a hull
      // pressed sideways into whatever it touched while the pilot steers away.
      const lateralLimit = 80 * handling.turn;
      const lateralAcceleration = clamp(
        (-slip * -Math.expm1(-grip * dt)) / dt,
        -lateralLimit,
        lateralLimit,
      );
      const acceleration = forward
        .clone()
        .multiplyScalar(drive - deceleration)
        .addScaledVector(side, lateralAcceleration);
      const forwardSpeed = body.velocity.dot(f.tangent);
      acceleration.addScaledVector(
        f.right,
        finite(f.curvature) * forwardSpeed * forwardSpeed * 0.25 +
          finite(surface.lateralAcceleration),
      );
      acceleration.addScaledVector(
        f.tangent,
        finite(surface.forwardAcceleration),
      );
      // The approved on-road gravity is 9.81; flight retains level gravity.
      const worldGravity = new T.Vector3(0, -9.81, 0);
      acceleration
        .add(worldGravity)
        .addScaledVector(f.up, -worldGravity.dot(f.up)).y +=
        dynamics.gravity ?? 26;
      if (parking && Math.abs(slip) < 0.12) {
        acceleration.copy(body.velocity).multiplyScalar(-1 / dt);
        acceleration.y += dynamics.gravity ?? 26;
      }
      const assist = clamp(
        finite(options.steeringAssist, STEERING_ASSIST),
        0,
        1,
      );
      const oldSteering = finite(state.steeringHeading);
      const target = -steer * (airbrake ? 0.27 : 0.18) * assist * handling.turn;
      const nextSteering =
        oldSteering +
        (target - oldSteering) *
          -Math.expm1(-(airbrake ? 10.5 : 8.5) * handling.response * dt);
      const yawTarget =
        (nextSteering - oldSteering) / dt -
        (1 - assist) *
          steer *
          (airbrake ? 2.1 : 1.5) *
          handling.turn *
          clamp(Math.abs(speed) / 30, 0.85, 1) +
        assist * finite(f.curvature) * forwardSpeed;
      const angularAcceleration = f.up
        .clone()
        .multiplyScalar(
          (yawTarget - body.angularVelocity.dot(f.up)) *
            120 *
            handling.response,
        );
      state.steeringHeading = nextSteering;
      state.time += dt;
      state.steer = steer;
      state.impact = Math.max(0, state.impact - dt * 2.4);
      state.energy = clamp(
        state.energy + (boost ? -handling.boostDrain : handling.recharge) * dt,
        0,
        100,
      );
      pending = { events, shield: options.shield === true };
      actor.stage({
        active: true,
        support: support(state, options, dt),
        acceleration,
        angularAcceleration,
      });
    },
    finish(state) {
      const body = actor.read();
      const projected = projectMagneticBody(
        track,
        body.position,
        state.distance,
        state.lateral,
      );
      const f = projected.frame;
      const forward = axisZ.clone().applyQuaternion(body.quaternion);
      state.distance = projected.distance;
      state.lateral = projected.lateral;
      state.heading = Math.atan2(forward.dot(f.right), forward.dot(f.tangent));
      state.speed = body.velocity.dot(forward);
      state.lateralSpeed = body.velocity.dot(f.right);
      lastSpeed = state.speed;
      current = poseCopy(body);
      const events = pending?.events ?? [];
      for (const hit of contactFeedback.collect(body.contacts, state.time)) {
        const key = hit.shape.id;
        const impact = racerImpact(hit.incomingSpeed);
        const { severity } = impact;
        const shielded = pending?.shield === true;
        if (pending) pending.shield = false;
        const energyCost = shielded ? 0 : impact.energyCost;
        state.energy = Math.max(0, state.energy - energyCost);
        state.impact = Math.max(state.impact, severity);
        events.push({
          type: 'impact',
          payload: {
            source:
              hit.shape.kind === 'racer' ? 'racer-contact' : 'rail-contact',
            collider: key,
            contactKind: hit.shape.kind,
            severity,
            energyCost,
            side: Math.sign(hit.normal.dot(f.right)) || 1,
            position: hit.point.toArray(),
            normal: hit.normal.toArray(),
            ...(shielded ? { shielded: true } : {}),
          },
        });
      }
      pending = null;
      return events;
    },
    adopt(state) {
      initialized = true;
      lastSpeed = state.speed;
      current = poseCopy(actor.read());
      previous = poseCopy(current);
      const f = magneticFrame(track, state.distance, state.lateral);
      capture = {
        elapsed: 0,
        orientation: current.quaternion.clone().invert().multiply(f.quaternion),
      };
    },
    reset(state) {
      if (state)
        actor.setContactShape(
          getCollisionHull(state.chassisId ?? state.shipId),
        );
      initialized = false;
      current = previous = pending = capture = null;
      contactFeedback.reset();
    },
    pose(alpha = 1) {
      if (!current) return null;
      const before = previous ?? current;
      return {
        grounded: true,
        steeringBank: true,
        position: before.position
          .clone()
          .lerp(current.position, clamp(alpha, 0, 1)),
        quaternion: before.quaternion
          .clone()
          .slerp(current.quaternion, clamp(alpha, 0, 1)),
      };
    },
    snapshot() {
      return {
        initialized,
        lastSpeed,
        ...contactFeedback.snapshot(),
        capture: capture && {
          elapsed: capture.elapsed,
          orientation: capture.orientation.toArray(),
        },
        current: current && {
          position: current.position.toArray(),
          quaternion: current.quaternion.toArray(),
        },
        previous: previous && {
          position: previous.position.toArray(),
          quaternion: previous.quaternion.toArray(),
        },
      };
    },
    restore(data) {
      if (
        !data ||
        typeof data.initialized !== 'boolean' ||
        !Number.isFinite(data.lastSpeed)
      )
        throw new Error('Invalid magnetic body state');
      const decode = (p) =>
        p && {
          position: new T.Vector3().fromArray(p.position),
          quaternion: new T.Quaternion().fromArray(p.quaternion),
        };
      initialized = data.initialized;
      lastSpeed = data.lastSpeed;
      contactFeedback.restore(data);
      current = decode(data.current);
      previous = decode(data.previous);
      pending = null;
      capture = data.capture && {
        elapsed: data.capture.elapsed,
        orientation: new T.Quaternion().fromArray(data.capture.orientation),
      };
    },
  };
}
