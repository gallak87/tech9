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

export const MAGNETIC_BODY_RULES = `magnetic-query-v9-visual-landing160-yaw-0.85-120-grip:${COLLISION_HULLS_ID}`;
const clamp = T.MathUtils.clamp;
const axisY = new T.Vector3(0, 1, 0);
const axisZ = new T.Vector3(0, 0, 1);
const finite = (value, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const poseCopy = (p) =>
  p && { position: p.position.clone(), quaternion: p.quaternion.clone() };

export function magneticFrame(track, distance, lateral, sampleRoad) {
  let surface = track.sampleSurface?.(distance, lateral);
  if (sampleRoad && !surface?.period) {
    const reference = surface ?? track.sample(distance);
    const wrapped =
      track.closed === false
        ? distance
        : T.MathUtils.euclideanModulo(distance, track.length);
    const actual = sampleRoad(wrapped, lateral, reference);
    if (actual) surface = { ...reference, ...actual };
  }
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
export function projectMagneticBody(
  track,
  position,
  distance,
  lateral,
  sampleRoad,
) {
  for (let i = 0; i < 8; i++) {
    const f = magneticFrame(track, distance, lateral, sampleRoad);
    const residual = position.clone().sub(f.position);
    const along = residual.dot(f.tangent) / (f.longitudinalMetric ?? 1);
    const across =
      (residual.dot(f.right) - (f.longitudinalShear ?? 0) * along) /
      (f.lateralMetric ?? 1);
    distance += clamp(along, -8, 8);
    lateral += clamp(across, -8, 8);
    if (Math.abs(along) + Math.abs(across) < 1e-6) break;
  }
  let f = magneticFrame(track, distance, lateral, sampleRoad);
  if (f.period > 0) {
    lateral =
      T.MathUtils.euclideanModulo(lateral + f.period / 2, f.period) -
      f.period / 2;
    f = magneticFrame(track, distance, lateral, sampleRoad);
  }
  return { distance, lateral, frame: f };
}

/** Handling proposes road movement; shared queries accept and resolve it. */
export function createMagneticBody({
  track,
  dynamics,
  actor,
  hull = VEHICLE_HULL,
  contactFeedback = createContactFeedback(),
  automaticRecovery = true,
  recoveryDelay = 1.5,
}) {
  const sampleRoad = dynamics.sampleRoadSurface;
  let initialized = false,
    current = null,
    previous = null,
    lastSpeed = 0;
  let pending = null,
    capture = null;
  let edgeStall = 0,
    roadRecovery = null;

  function outsideRoad(frame, lateral) {
    if (frame.period > 0) return false;
    const bounds = frame.bounds ?? {
      min: -track.width / 2,
      max: track.width / 2,
    };
    return lateral < bounds.min - 0.15 || lateral > bounds.max + 0.15;
  }
  function leaveRoad(state, distance, reason, events) {
    roadRecovery = { elapsed: 0, distance, reason };
    edgeStall = 0;
    capture = null;
    state.distance = distance;
    state.boosting = false;
    actor.stage({ support: null });
    events.push({ type: 'road-departure', payload: { distance, reason } });
  }
  function strandedAtEdge(state, input, dt, frame, body) {
    const boundaries = body.contacts.filter((hit) => hit.shape.boundaryPoints);
    if (!boundaries.length) {
      edgeStall = 0;
      return null;
    }
    const bounds = frame.bounds ?? {
      min: -track.width / 2,
      max: track.width / 2,
    };
    if (frame.period > 0) {
      edgeStall = 0;
      return null;
    }
    const vertices = getCollisionHull(state.chassisId ?? state.shipId).vertices;
    let min = Infinity,
      max = -Infinity;
    const vertex = new T.Vector3();
    for (let i = 0; i < vertices.length; i += 3) {
      vertex.fromArray(vertices, i).applyQuaternion(body.quaternion);
      const lateral = state.lateral + vertex.dot(frame.right);
      min = Math.min(min, lateral);
      max = Math.max(max, lateral);
    }
    // A normal scrape has only contact tolerance outside the boundary. A
    // stranded hull has a wing/nose on each side of the wall.
    const side = min < bounds.min - 0.35 ? -1 : max > bounds.max + 0.35 ? 1 : 0;
    const crossedBoundary =
      side &&
      boundaries.some((hit) => {
        const [a, b, c] = hit.shape.boundaryPoints.map(
          (point) => new T.Vector3(...point),
        );
        const outward = b.sub(a).cross(c.sub(a)).normalize();
        const alignment = outward.dot(frame.right);
        if (Math.abs(alignment) < 0.5) return false;
        if (alignment * side < 0) outward.negate();
        // Use the real wall plane, not only the route tangent approximation:
        // ordinary contact on a tight bend must never count as a straddle.
        for (let i = 0; i < vertices.length; i += 3)
          if (
            vertex
              .fromArray(vertices, i)
              .applyQuaternion(body.quaternion)
              .add(body.position)
              .sub(a)
              .dot(outward) > 0.35
          )
            return true;
        return false;
      });
    const driving =
      finite(input?.throttle) > 0.2 || Math.abs(finite(input?.steer)) > 0.2;
    edgeStall = crossedBoundary && driving ? edgeStall + dt : 0;
    return edgeStall >= 0.6;
  }

  function modelClearance(quaternion, up, vertices, includeArcade = false) {
    const direction = up.clone().applyQuaternion(quaternion.clone().invert());
    let extent = hull.hover;
    for (let i = 0; i < vertices.length; i += 3)
      extent = Math.max(
        extent,
        -vertices[i] * direction.x -
          vertices[i + 1] * direction.y -
          vertices[i + 2] * direction.z,
      );
    return includeArcade
      ? Math.max(extent, projectedHullExtent(quaternion, up, hull))
      : extent;
  }
  function landingPresentation(body, frame, state, baseHeight) {
    const t = clamp(capture.elapsed / capture.duration, 0, 1),
      blend = t * t * (3 - 2 * t);
    const upright = new T.Quaternion()
      .setFromUnitVectors(
        axisY.clone().applyQuaternion(body.quaternion),
        frame.up,
      )
      .multiply(body.quaternion);
    const quaternion = upright.multiply(
      capture.orientation.clone().slerp(new T.Quaternion(), blend),
    );
    const vertices =
      body.contactShape?.vertices ??
      getCollisionHull(state.chassisId ?? state.shipId).vertices;
    const clearance =
      modelClearance(quaternion, frame.up, vertices) +
      surfaceHullClearance(frame.surface, state.heading) +
      capture.supportHeight;
    const height =
      Math.max(baseHeight, clearance) + capture.heightResidual * (1 - blend);
    const position = body.position
      .clone()
      .addScaledVector(
        frame.up,
        height - body.position.clone().sub(frame.position).dot(frame.up),
      );
    return { position, quaternion };
  }
  function support(state, options = {}, dt = 0) {
    const f = magneticFrame(track, state.distance, state.lateral, sampleRoad);
    const solved = initialized ? actor.read() : null;
    const actual = solved?.quaternion ?? f.quaternion;
    const aligned = f.quaternion
      .clone()
      .multiply(new T.Quaternion().setFromAxisAngle(axisY, state.heading));
    const vertices =
      solved?.contactShape?.vertices ??
      getCollisionHull(state.chassisId ?? state.shipId).vertices;
    let height = hull.hover + surfaceHullClearance(f.surface, state.heading);
    // Whole-hull road clearance belongs to ordinary support, independent of
    // the decorative landing animation.
    const axes = hullAxes(aligned);
    const roadOwners = new Set(f.surface?.roadOwners ?? []);
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
        const road = magneticFrame(track, distance, lateral, sampleRoad);
        for (const owner of road.surface?.roadOwners ?? [])
          roadOwners.add(owner);
        height = Math.max(
          height,
          road.position.sub(f.position).sub(offset).dot(f.up),
        );
      }
    }
    height += finite(options.supportHeight);
    const presentationHeight = height;
    // Align a newly landed physical hull in one swept move. Reserve clearance
    // for its turning corners only while it is actually tilted, never for the
    // duration of a presentation animation. Queries can still clip this move.
    if (capture?.aligning) {
      const upright = new T.Quaternion()
        .setFromUnitVectors(axisY.clone().applyQuaternion(actual), f.up)
        .multiply(actual);
      for (let i = 0; i <= 8; i++) {
        const q = actual.clone().slerp(upright, i / 8);
        height = Math.max(
          height,
          modelClearance(q, f.up, vertices, true) +
            surfaceHullClearance(f.surface, state.heading) +
            finite(options.supportHeight),
        );
      }
    }
    return {
      position: f.position.clone().addScaledVector(f.up, height),
      quaternion: f.quaternion.clone(),
      presentationHeight,
      road: {
        distance:
          track.closed === false
            ? state.distance
            : T.MathUtils.euclideanModulo(state.distance, track.length),
        length: track.closed === false ? 0 : track.length,
        reach:
          Math.hypot(hull.halfWidth, hull.halfLength) + travel.length() + 2,
        owners: [...roadOwners],
      },
    };
  }
  function initialize(state, options) {
    actor.setContactShape(getCollisionHull(state.chassisId ?? state.shipId));
    const frame = magneticFrame(
      track,
      state.distance,
      state.lateral,
      sampleRoad,
    );
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
        if (capture.elapsed >= capture.duration - 1e-9) capture = null;
      }
      previous = poseCopy(current ?? body);
      const f = magneticFrame(track, state.distance, state.lateral, sampleRoad);
      const events = [];
      if (!roadRecovery) {
        if (outsideRoad(f, state.lateral))
          leaveRoad(state, state.distance, 'off-road', events);
        else if (strandedAtEdge(state, input, dt, f, body))
          leaveRoad(state, state.distance, 'stranded-edge', events);
      }
      if (roadRecovery) {
        roadRecovery.elapsed += dt;
        state.time += dt;
        state.impact = Math.max(0, state.impact - dt * 2.4);
        state.energy = Math.min(
          100,
          state.energy + getShip(state.shipId).handling.recharge * dt,
        );
        state.boosting = false;
        pending = {
          events,
          shield: options.shield === true,
          supportHeight: options.supportHeight,
          beforeDistance: state.distance,
        };
        // Once unsupported, neither propulsion nor the magnetic plane may
        // carry this body across empty space. World gravity and contact queries continue.
        actor.stage({
          active: true,
          support: null,
          acceleration: new T.Vector3(),
          angularAcceleration: new T.Vector3(),
        });
        return;
      }
      // Vector entry is an explicit propulsion impulse applied by the device
      // adapter between ticks. Preserve it without replacing contact velocity.
      const deviceImpulse = state.speed - lastSpeed;
      if (Math.abs(deviceImpulse) > 1e-6) {
        body.velocity.addScaledVector(f.tangent, deviceImpulse);
        actor.setVelocity(body.velocity);
      }
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
      // Grip keeps the approved response time at every speed. A fixed force
      // ceiling made boosted steering lose authority as speed increased. This
      // exponential damping preserves bump momentum and cannot reverse slip;
      // collision queries independently stop movement into a wall.
      const lateralAcceleration = (-slip * -Math.expm1(-grip * dt)) / dt;
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
      pending = {
        events,
        shield: options.shield === true,
        supportHeight: options.supportHeight,
        beforeDistance: state.distance,
      };
      // Propose one movement along the actual road skin. A tangent-plane
      // Euler step drifts sideways while an inverted road twists beneath it.
      // The query controller may clip this displacement; finish() projects only
      // the accepted result, so this cannot tow a ship through a wall.
      const travel = body.velocity.clone().addScaledVector(acceleration, dt);
      travel.y -= (dynamics.gravity ?? 26) * dt;
      travel.multiplyScalar(dt);
      const along = travel.dot(f.tangent) / (f.longitudinalMetric ?? 1);
      const across =
        (travel.dot(f.right) - (f.longitudinalShear ?? 0) * along) /
        (f.lateralMetric ?? 1);
      const destination = {
        ...state,
        distance: state.distance + along,
        lateral: state.lateral + across,
      };
      const targetSupport = support(destination, options);
      pending.presentationHeight = targetSupport.presentationHeight;
      targetSupport.destination = targetSupport.position.clone();
      actor.stage({
        active: true,
        support: targetSupport,
        acceleration,
        angularAcceleration,
      });
    },
    finish(state) {
      const body = actor.read();
      const events = pending?.events ?? [];
      const projected = roadRecovery
        ? null
        : projectMagneticBody(
            track,
            body.position,
            state.distance,
            state.lateral,
            sampleRoad,
          );
      if (projected && outsideRoad(projected.frame, projected.lateral))
        leaveRoad(state, pending.beforeDistance, 'off-road', events);
      const f = roadRecovery
        ? magneticFrame(track, state.distance, state.lateral, sampleRoad)
        : projected.frame;
      const forward = axisZ.clone().applyQuaternion(body.quaternion);
      if (!roadRecovery) {
        state.distance = projected.distance;
        state.lateral = projected.lateral;
      }
      state.heading = Math.atan2(forward.dot(f.right), forward.dot(f.tangent));
      state.speed = roadRecovery
        ? body.velocity.length()
        : body.velocity.dot(forward);
      state.lateralSpeed = body.velocity.dot(f.right);
      lastSpeed = state.speed;
      if (
        capture?.aligning &&
        axisY.clone().applyQuaternion(body.quaternion).dot(f.up) > 1 - 1e-8
      )
        capture.aligning = false;
      // A solid may block the alignment sweep. Show the accepted pose until
      // that obstruction clears; presentation must not hide a physical snag.
      current =
        capture && !capture.aligning
          ? landingPresentation(body, f, state, pending.presentationHeight)
          : poseCopy(body);
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
      if (
        roadRecovery &&
        automaticRecovery &&
        roadRecovery.elapsed >= recoveryDelay - 1e-8
      ) {
        const { distance, reason } = roadRecovery;
        // A recovery is an explicit relocation after the fall, never a raised
        // hover path. Returning to the departure station cannot skip a corner.
        Object.assign(state, {
          distance,
          lateral: 0,
          heading: 0,
          steeringHeading: 0,
          lateralSpeed: 0,
          speed: 0,
          steer: 0,
          boosting: false,
        });
        roadRecovery = null;
        edgeStall = 0;
        initialized = false;
        initialize(state, { supportHeight: pending?.supportHeight });
        events.push({ type: 'road-recovery', payload: { distance, reason } });
      }
      pending = null;
      return events;
    },
    adopt(state, { duration, supportHeight = 0 }) {
      initialized = true;
      edgeStall = 0;
      roadRecovery = null;
      lastSpeed = state.speed;
      current = poseCopy(actor.read());
      previous = poseCopy(current);
      const f = magneticFrame(track, state.distance, state.lateral, sampleRoad);
      const body = actor.read();
      const upright = new T.Quaternion()
        .setFromUnitVectors(
          axisY.clone().applyQuaternion(body.quaternion),
          f.up,
        )
        .multiply(body.quaternion);
      const vertices =
        body.contactShape?.vertices ??
        getCollisionHull(state.chassisId ?? state.shipId).vertices;
      const height =
        modelClearance(body.quaternion, f.up, vertices) +
        surfaceHullClearance(f.surface, state.heading) +
        supportHeight;
      capture = {
        elapsed: 0,
        duration,
        aligning: true,
        supportHeight,
        heightResidual:
          body.position.clone().sub(f.position).dot(f.up) - height,
        orientation: upright.clone().invert().multiply(body.quaternion),
      };
    },
    reset(state) {
      if (state)
        actor.setContactShape(
          getCollisionHull(state.chassisId ?? state.shipId),
        );
      initialized = false;
      lastSpeed = 0;
      current = previous = pending = capture = null;
      edgeStall = 0;
      roadRecovery = null;
      contactFeedback.reset();
    },
    pose(alpha = 1) {
      if (!current) return null;
      const before = previous ?? current;
      return {
        grounded: !roadRecovery,
        recovering: Boolean(roadRecovery),
        steeringBank: !roadRecovery,
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
        edgeStall,
        roadRecovery: roadRecovery && { ...roadRecovery },
        ...contactFeedback.snapshot(),
        capture: capture && {
          ...capture,
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
        !Number.isFinite(data.lastSpeed) ||
        (data.capture &&
          (!Number.isFinite(data.capture.elapsed) ||
            data.capture.elapsed < 0 ||
            !Number.isFinite(data.capture.duration) ||
            data.capture.duration <= 0 ||
            data.capture.elapsed >= data.capture.duration ||
            typeof data.capture.aligning !== 'boolean' ||
            !Number.isFinite(data.capture.heightResidual) ||
            !Number.isFinite(data.capture.supportHeight) ||
            !Array.isArray(data.capture.orientation) ||
            data.capture.orientation.length !== 4 ||
            !data.capture.orientation.every(Number.isFinite) ||
            Math.abs(Math.hypot(...data.capture.orientation) - 1) > 1e-6)) ||
        !Number.isFinite(data.edgeStall ?? 0) ||
        (data.edgeStall ?? 0) < 0 ||
        (data.roadRecovery &&
          (!Number.isFinite(data.roadRecovery.elapsed) ||
            data.roadRecovery.elapsed < 0 ||
            !Number.isFinite(data.roadRecovery.distance) ||
            !['off-road', 'stranded-edge'].includes(data.roadRecovery.reason)))
      )
        throw new Error('Invalid magnetic body state');
      const decode = (p) =>
        p && {
          position: new T.Vector3().fromArray(p.position),
          quaternion: new T.Quaternion().fromArray(p.quaternion),
        };
      initialized = data.initialized;
      lastSpeed = data.lastSpeed;
      edgeStall = data.edgeStall ?? 0;
      roadRecovery = data.roadRecovery && { ...data.roadRecovery };
      contactFeedback.restore(data);
      current = decode(data.current);
      previous = decode(data.previous);
      pending = null;
      capture = data.capture && {
        ...data.capture,
        orientation: new T.Quaternion().fromArray(data.capture.orientation),
      };
    },
  };
}
