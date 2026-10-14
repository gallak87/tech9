import * as THREE from 'three';
import { VEHICLE_HULL, projectedHullExtent, headingExtents } from './hull.js';
import { COLLISION_RULES } from './collision-world.js';
import {
  stepVehicle,
  STEERING_ASSIST,
  surfaceHullClearance,
  updateBoostState,
} from './index.js';
import { getShip } from '../ships/catalog.js';
import { createMagneticBody, MAGNETIC_BODY_RULES } from './magnetic-body.js';
import { createContactFeedback, racerImpact } from './contact-feedback.js';

export const DEFAULT_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  curvedContact: true,
  contactVersion: 2,
  hover: VEHICLE_HULL.hover,
  halfWidth: VEHICLE_HULL.halfWidth,
  halfLength: VEHICLE_HULL.halfLength,
  airAcceleration: 4,
  airYaw: 0.22,
  headingTolerance: 0.44,
  rollTolerance: 0.6,
  pitchTolerance: 0.7,
  recoveryDelay: 1.5,
  timeout: 6,
  missBelow: 23,
  missBeyond: 18,
  missLateral: 55,
  step: 1 / 120,
  landingSettleDuration: 0.16,
  landingBounce: 0.06,
  edgeOverlap: 0.5,
  edgeInset: 0.3,
  edgeSpeedRetention: 0.95,
  edgeEnergyCost: 2,
  railHeight: {},
  railOffset: {},
});

// Shared swept contact and ballistic motion. Authored route, rules, effects,
// scenarios and presentation belong to the level using this model.
export function createFlightModel(overrides = {}) {
  const R = {
    ...DEFAULT_FLIGHT_RULES,
    ...overrides,
    contactVersion: DEFAULT_FLIGHT_RULES.contactVersion,
    railHeight: {
      ...(overrides.railHeight ?? DEFAULT_FLIGHT_RULES.railHeight),
    },
    railOffset: {
      ...(overrides.railOffset ?? DEFAULT_FLIGHT_RULES.railOffset),
    },
  };
  for (const [name, value] of Object.entries(R)) {
    if (name === 'railHeight' || name === 'railOffset') continue;
    if (name === 'curvedContact') {
      if (typeof value !== 'boolean')
        throw new Error('curvedContact must be boolean.');
      continue;
    }
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Invalid flight rule: ${name}`);
  }
  for (const name of [
    'step',
    'halfWidth',
    'halfLength',
    'hover',
    'timeout',
    'landingSettleDuration',
  ])
    if (R[name] <= 0) throw new Error(`Flight rule must be positive: ${name}`);
  if (R.step > 1 / 120 || R.edgeOverlap > 1 || R.edgeSpeedRetention > 1)
    throw new Error('Invalid flight step or contact ratio.');
  if (
    [...Object.values(R.railHeight), ...Object.values(R.railOffset)].some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  )
    throw new Error('Invalid flight rail geometry.');
  Object.freeze(R.railHeight);
  Object.freeze(R.railOffset);
  // An unused extension must not change existing serialized replay identities.
  if (!Object.keys(R.railOffset).length)
    Object.defineProperty(R, 'railOffset', { enumerable: false });
  Object.freeze(R);
  const clamp = THREE.MathUtils.clamp;
  const axis = (q, x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q);
  const bodyExtent = (q, direction) => projectedHullExtent(q, direction, R);
  const encodePose = (pose) =>
    pose
      ? {
          position: pose.position.toArray(),
          quaternion: pose.quaternion.toArray(),
        }
      : null;
  const decodePose = (pose) =>
    pose
      ? {
          position: new THREE.Vector3().fromArray(pose.position),
          quaternion: new THREE.Quaternion().fromArray(pose.quaternion),
        }
      : null;
  const clonePose = (pose) =>
    pose
      ? { position: pose.position.clone(), quaternion: pose.quaternion.clone() }
      : null;

  // Cache only this jump's contiguous receiving road. Local frames follow the
  // actual grade/bank instead of extending the landing lip's plane over the road.
  const landingSurfaces = new WeakMap();
  function landingSegments(track, jump) {
    let surfaces = landingSurfaces.get(track);
    if (!surfaces) landingSurfaces.set(track, (surfaces = new Map()));
    if (!surfaces.has(jump)) {
      const segments = [];
      for (let start = jump.landingStart; start < jump.landingEnd; start += 4) {
        const end = Math.min(start + 4, jump.landingEnd);
        const distance = (start + end) / 2;
        segments.push({ start, end, distance, frame: track.sample(distance) });
      }
      surfaces.set(jump, segments);
    }
    return surfaces.get(jump);
  }

  // A centred projected hull has half its width over the road at the boundary.
  // Rotation contributes nose/wing/hover extents, not just the unrotated wingspan.
  function edgeFootprint(quaternion, frame, lateral, halfWidth) {
    const extent = bodyExtent(quaternion, frame.right);
    const overlap = clamp(
      (halfWidth - Math.abs(lateral) + extent) / (2 * extent),
      0,
      1,
    );
    return { extent, overlap, side: Math.sign(lateral) || 1 };
  }

  function landingHeading(quaternion, frame) {
    const forward = axis(quaternion, 0, 0, 1);
    const up = axis(quaternion, 0, 1, 0);
    const yaw = Math.atan2(
      forward.dot(frame.right),
      forward.dot(frame.tangent),
    );
    const pitch = Math.asin(clamp(forward.dot(frame.up), -1, 1));
    const upright = frame.up
      .clone()
      .addScaledVector(forward, -forward.dot(frame.up))
      .normalize();
    return Math.abs(yaw) <= R.headingTolerance &&
      Math.abs(pitch) <= R.pitchTolerance &&
      up.dot(upright) >= Math.cos(R.rollTolerance) &&
      forward.dot(frame.tangent) > 0
      ? yaw
      : null;
  }

  // Sweep the supported portion of the hull against this jump's finite receiving
  // rail envelope. The top AND inside face catch descending and sideways motion;
  // Half the hull must overlap the authored rail envelope; offsets represent
  // visible outboard barriers without expanding the road landing surface.
  function sweptRail(track, jump, before, after) {
    if (!track.jumps.includes(jump)) return null;
    const height = R.railHeight[jump.id] ?? 0.9;
    const offset = R.railOffset[jump.id] ?? 0;
    const railBoundary = jump.halfWidth + offset;
    const tolerance = offset > 0 ? 1e-7 : 0;
    let first = null;
    const motion = new THREE.Line3(before.position, after.position);
    const nearest = new THREE.Vector3();
    const radius = railBoundary + height + 8;
    for (const segment of landingSegments(track, jump)) {
      motion.closestPointToPoint(segment.frame.position, true, nearest);
      if (nearest.distanceToSquared(segment.frame.position) > radius * radius)
        continue;
      for (const side of [-1, 1]) {
        let frame = segment.frame,
          distance = segment.distance,
          contact = null;
        for (let iteration = 0; iteration < 4; iteration += 1) {
          const a = before.position.clone().sub(frame.position);
          const b = after.position.clone().sub(frame.position);
          const ax = a.dot(frame.right),
            bx = b.dot(frame.right);
          const ay = a.dot(frame.up),
            by = b.dot(frame.up);
          const az = distance + a.dot(frame.tangent),
            bz = distance + b.dot(frame.tangent);
          const aw = bodyExtent(before.quaternion, frame.right),
            bw = bodyExtent(after.quaternion, frame.right);
          const ah = bodyExtent(before.quaternion, frame.up),
            bh = bodyExtent(after.quaternion, frame.up);
          // Never pull a craft up through the underside of the deck.
          if (ay - ah < -1e-7) {
            contact = null;
            break;
          }
          let enter = 0,
            leave = 1;
          const inequalities = [
            [side * ax + aw - railBoundary, side * bx + bw - railBoundary],
            [railBoundary - side * ax, railBoundary - side * bx],
            [height - ay + ah, height - by + bh],
            [ay, by],
            [az - segment.start, bz - segment.start],
            [segment.end - az, segment.end - bz],
          ];
          for (const [from, to] of inequalities) {
            if (from < -tolerance && to < -tolerance) {
              enter = 2;
              break;
            }
            if (from < -tolerance) enter = Math.max(enter, -from / (to - from));
            else if (to < -tolerance)
              leave = Math.min(leave, from / (from - to));
          }
          if (enter > leave || enter > 1) {
            contact = null;
            break;
          }
          const position = before.position.clone().lerp(after.position, enter);
          distance += position.clone().sub(frame.position).dot(frame.tangent);
          contact = { fraction: enter, position };
          frame = track.sample(distance);
        }
        if (!contact) continue;
        const quaternion = before.quaternion
          .clone()
          .slerp(after.quaternion, contact.fraction);
        const lateral = contact.position
          .clone()
          .sub(frame.position)
          .dot(frame.right);
        const footprint = edgeFootprint(
          quaternion,
          frame,
          lateral,
          railBoundary,
        );
        const extent = bodyExtent(quaternion, frame.tangent);
        const heading = landingHeading(quaternion, frame);
        if (
          heading === null ||
          footprint.overlap < R.edgeOverlap - 1e-8 ||
          side * lateral + footprint.extent < railBoundary - 1e-6 ||
          distance - extent < jump.landingStart ||
          distance + extent > jump.landingEnd
        )
          continue;
        if (!first || contact.fraction < first.fraction)
          first = {
            ...contact,
            quaternion,
            distance,
            lateral,
            heading,
            ...footprint,
            frame,
          };
      }
    }
    return first;
  }

  // Sweep the lower hull continuously over the receiving road. Half-width
  // support permits an edge catch; internal seams never reject a supported hull.
  // Only top-down, forward, upright contacts on the current jump can relatch.
  function sweptLanding(track, jump, before, after, velocity) {
    if (!track.jumps.includes(jump)) return null;
    const motion = new THREE.Line3(before.position, after.position);
    const nearest = new THREE.Vector3();
    const radius = jump.halfWidth + Math.hypot(R.halfLength, R.hover) + 4;
    let first = null;
    for (const segment of landingSegments(track, jump)) {
      motion.closestPointToPoint(segment.frame.position, true, nearest);
      if (nearest.distanceToSquared(segment.frame.position) > radius * radius)
        continue;
      let distance = segment.distance;
      let frame = segment.frame;
      let contact = null;
      // Refine the support plane at the contact's route position so sloping or
      // curved runout road uses its own surface, including at a segment boundary.
      for (let iteration = 0; iteration < 4; iteration += 1) {
        const a =
          before.position.clone().sub(frame.position).dot(frame.up) -
          bodyExtent(before.quaternion, frame.up);
        const b =
          after.position.clone().sub(frame.position).dot(frame.up) -
          bodyExtent(after.quaternion, frame.up);
        if (
          a < -1e-7 ||
          b > 0 ||
          a - b < 1e-8 ||
          velocity.dot(frame.up) >= -0.01
        ) {
          contact = null;
          break;
        }
        const fraction = clamp(a / (a - b), 0, 1);
        const position = before.position.clone().lerp(after.position, fraction);
        const offset = position.clone().sub(frame.position);
        distance += offset.dot(frame.tangent);
        if (distance < segment.start - 0.05 || distance > segment.end + 0.05) {
          contact = null;
          break;
        }
        contact = { fraction, position };
        frame = track.sample(distance);
      }
      if (!contact) continue;
      const { fraction, position } = contact;
      const quaternion = before.quaternion
        .clone()
        .slerp(after.quaternion, fraction);
      const offset = position.clone().sub(frame.position);
      const lateral = offset.dot(frame.right);
      const yaw = landingHeading(quaternion, frame);
      const footprint = edgeFootprint(
        quaternion,
        frame,
        lateral,
        jump.halfWidth,
      );
      const longitudinalExtent = bodyExtent(quaternion, frame.tangent);
      if (
        yaw === null ||
        footprint.overlap < R.edgeOverlap - 1e-8 ||
        distance - longitudinalExtent < jump.landingStart ||
        distance + longitudinalExtent > jump.landingEnd
      )
        continue;
      if (!first || fraction < first.fraction)
        first = {
          fraction,
          distance,
          lateral,
          heading: yaw,
          edgeCatch: Math.abs(lateral) + footprint.extent > jump.halfWidth,
          ...footprint,
        };
    }
    return (
      first ??
      (R.curvedContact
        ? refinedLanding(track, jump, before, after, velocity)
        : null)
    );
  }

  // A curved receiving deck can cross the hull between cached tangent planes.
  // If the fast plane sweep finds no hit, solve against the actual sampled
  // surface: project both endpoints independently, then bracket the support
  // crossing. Never accept a craft already beneath the deck or moving upward.
  function refinedLanding(track, jump, before, after, velocity) {
    const motion = new THREE.Line3(before.position, after.position);
    const nearest = new THREE.Vector3();
    const radius = jump.halfWidth + Math.hypot(R.halfLength, R.hover) + 4;
    let first = null;
    function support(pose, seed) {
      let distance = seed;
      for (let i = 0; i < 8; i++) {
        const frame = track.sample(distance);
        const along = pose.position
          .clone()
          .sub(frame.position)
          .dot(frame.tangent);
        distance = clamp(distance + along, jump.landingStart, jump.landingEnd);
        if (Math.abs(along) < 1e-8) break;
      }
      const frame = track.sample(distance);
      return {
        distance,
        frame,
        height:
          pose.position.clone().sub(frame.position).dot(frame.up) -
          bodyExtent(pose.quaternion, frame.up),
      };
    }
    for (const segment of landingSegments(track, jump)) {
      motion.closestPointToPoint(segment.frame.position, true, nearest);
      if (nearest.distanceToSquared(segment.frame.position) > radius * radius)
        continue;
      const a = support(before, segment.distance),
        b = support(after, segment.distance);
      if (a.height < -1e-7 || b.height > 0 || a.height - b.height < 1e-8)
        continue;
      let low = 0,
        high = 1,
        contact;
      for (let i = 0; i < 24; i++) {
        const fraction = (low + high) / 2;
        const position = before.position.clone().lerp(after.position, fraction);
        const quaternion = before.quaternion
          .clone()
          .slerp(after.quaternion, fraction);
        contact = {
          fraction,
          position,
          quaternion,
          ...support(
            { position, quaternion },
            THREE.MathUtils.lerp(a.distance, b.distance, fraction),
          ),
        };
        if (contact.height > 0) low = fraction;
        else high = fraction;
      }
      const { fraction, distance, frame, position, quaternion } = contact;
      const lateral = position.clone().sub(frame.position).dot(frame.right);
      const yaw = landingHeading(quaternion, frame);
      const footprint = edgeFootprint(
        quaternion,
        frame,
        lateral,
        jump.halfWidth,
      );
      const extent = bodyExtent(quaternion, frame.tangent);
      if (
        velocity.dot(frame.up) >= -0.01 ||
        yaw === null ||
        footprint.overlap < R.edgeOverlap - 1e-8 ||
        distance - extent < jump.landingStart ||
        distance + extent > jump.landingEnd
      )
        continue;
      if (!first || fraction < first.fraction)
        first = {
          fraction,
          distance,
          lateral,
          heading: yaw,
          edgeCatch: Math.abs(lateral) + footprint.extent > jump.halfWidth,
          ...footprint,
        };
    }
    return first;
  }

  function createRuntime(
    {
      track,
      settings = {},
      collisionWorld = null,
      dynamics = null,
      playtest = null,
    },
    options,
  ) {
    if (!options?.id || !Number.isInteger(options.version) || !options.rulesId)
      throw new Error('Flight runtime requires versioned identity.');
    const automaticRecovery =
      !playtest && !options.testLaunch && options.automaticRecovery !== false;
    const boundaryRecoveryGrace = Boolean(
      automaticRecovery && collisionWorld && options.forgivingContacts,
    );
    if (!Array.isArray(track.jumps))
      throw new Error('Flight runtime requires track.jumps (may be empty).');
    if (
      track.jumps.some((jump) => jump.optional) &&
      typeof options.shouldLaunch !== 'function'
    )
      throw new Error('Optional jumps require a shouldLaunch predicate.');
    const ids = new Set();
    let previousEnd = -1;
    for (const jump of track.jumps) {
      if (
        !jump.id ||
        ids.has(jump.id) ||
        ![
          'takeoff',
          'landingStart',
          'landingEnd',
          'recovery',
          'halfWidth',
        ].every((key) => Number.isFinite(jump[key])) ||
        jump.takeoff < 0 ||
        jump.takeoff <= previousEnd ||
        jump.landingStart <= jump.takeoff ||
        jump.landingEnd <= jump.landingStart ||
        jump.recovery < jump.landingStart ||
        jump.recovery >= track.length ||
        jump.landingEnd >= track.length ||
        jump.halfWidth < R.halfWidth
      )
        throw new Error('Invalid, overlapping or unordered flight jump.');
      const credited = track.checkpoints.filter((checkpoint) => {
        const s = checkpoint.distance ?? checkpoint.s;
        return (
          s > jump.takeoff &&
          s <= Math.max(jump.recovery, jump.landingEnd) + 1e-5
        );
      });
      if (
        credited.length !== 1 ||
        Math.abs((credited[0].distance ?? credited[0].s) - jump.landingStart) >
          1e-5
      )
        throw new Error(
          'Jump requires exactly one checkpoint at landingStart.',
        );
      previousEnd = Math.max(jump.landingEnd, jump.recovery);
      ids.add(jump.id);
    }
    const actor = dynamics?.createActor({ hull: R });
    const contactFeedback = createContactFeedback();
    const magneticBody =
      actor &&
      createMagneticBody({ track, dynamics, actor, hull: R, contactFeedback });
    let pending = null;
    let mode = 'magnetic';
    let flight = null;
    let previousPose = null;
    let currentPose = null;
    let releasePose = false;
    let landingSettle = null;
    let disposed = false;
    let seed = 0;
    let stepModifiers = {};
    const surfaceFrame = (state) =>
      track.sampleSurface?.(state.distance, state.lateral) ??
      track.sample(state.distance);
    const poseOnRoad = (state, supported = false) => {
      const surface = track.sampleSurface?.(state.distance, state.lateral);
      const f = surface ?? track.sample(state.distance);
      const quaternion = f.quaternion
        .clone()
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            state.heading,
          ),
        );
      // Grounded steering bank is cosmetic. Its visual roll must not lift the
      // magnetic hull or enter the landing/support pose used by the solver.
      if (!supported || !options.forgivingContacts)
        quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            (state.steer ?? 0) * 0.08,
          ),
        );
      const height =
        R.hover +
        surfaceHullClearance(surface, state.heading) +
        (supported && options.forgivingContacts
          ? (options.supportHeight ?? 0)
          : 0);
      return {
        position: f.position
          .clone()
          .addScaledVector(f.right, surface ? 0 : state.lateral)
          .addScaledVector(f.up, height),
        quaternion,
      };
    };
    function advanceGroundPose(state, dt) {
      if (!landingSettle) {
        if (currentPose || options.forgivingContacts)
          currentPose = poseOnRoad(state, true);
        return;
      }
      landingSettle.elapsed = Math.min(
        R.landingSettleDuration,
        landingSettle.elapsed + dt,
      );
      const t = landingSettle.elapsed / R.landingSettleDuration;
      const blend = t * t * (3 - 2 * t);
      const frame = surfaceFrame(state);
      const pose = poseOnRoad(state, true);
      const baseExtent = bodyExtent(pose.quaternion, frame.up);
      pose.quaternion.multiply(
        landingSettle.orientation.clone().slerp(new THREE.Quaternion(), blend),
      );
      // Follow the current magnetic position exactly in the road plane. Only
      // support height and attitude settle, so relatching never pulls sideways.
      const support = Math.max(
        0,
        bodyExtent(pose.quaternion, frame.up) - baseExtent,
      );
      pose.position.addScaledVector(
        frame.up,
        support +
          landingSettle.heightResidual * (1 - blend) +
          R.landingBounce * Math.sin(Math.PI * t) ** 2,
      );
      currentPose = pose;
      if (t >= 1) {
        landingSettle = null;
        releasePose = true;
      }
    }
    function beginFlight(
      state,
      jump,
      from,
      events,
      startPose,
      physical = null,
    ) {
      const frame =
        track.sampleSurface?.(from, state.lateral) ?? track.sample(from);
      const world = physical
        ? clonePose(physical)
        : poseOnRoad(state, Boolean(options.forgivingContacts));
      const velocity = physical
        ? physical.velocity.clone()
        : frame.tangent
            .clone()
            .multiplyScalar(state.speed * Math.cos(state.heading))
            .addScaledVector(
              frame.right,
              state.speed * Math.sin(state.heading) + state.lateralSpeed * 0.15,
            );
      const impulse = options.launchImpulse?.({
        state,
        jump,
        position: world.position.clone(),
        time: state.time,
      });
      if (impulse) {
        if (![impulse.x, impulse.y, impulse.z].every(Number.isFinite))
          throw new Error('Launch impulse must be a finite world vector.');
        velocity.add(impulse);
      }
      flight = {
        id: jump.id,
        from,
        lapOffset: from - jump.takeoff,
        velocity,
        elapsed: 0,
        remaining: 0,
        steerAngle: 0,
        launchQuaternion: world.quaternion.clone(),
        launchRight: frame.right.clone(),
        launchUp: frame.up.clone(),
        failure: null,
        edgeCaught: false,
        ...(collisionWorld || dynamics
          ? { lastImpactAt: -1, contacts: 0 }
          : {}),
        ...(dynamics
          ? {
              angularVelocity:
                physical?.angularVelocity.clone() ?? new THREE.Vector3(),
              dynamicsStarted: Boolean(physical),
              hitAt: -1,
            }
          : {}),
      };
      mode = 'flight';
      landingSettle = null;
      releasePose = false;
      currentPose = world;
      if (physical) {
        actor.stage({ support: null });
        if (impulse) actor.setVelocity(velocity);
      }
      // The first interpolated flight interval starts at the previous magnetic
      // tick, not at the lip partway through that interval.
      previousPose ??= clonePose(startPose);
      state.distance = from;
      events.push({
        type: 'jump-launch',
        payload: { id: jump.id, speed: state.speed, heading: state.heading },
      });
    }
    function transfer(
      state,
      jump,
      outcome,
      events,
      landing = null,
      contactPose = null,
    ) {
      const from = flight.from;
      const tractionRestored =
        mode === 'recovery' &&
        landing &&
        (dynamics || options.forgivingContacts);
      state.distance =
        flight.lapOffset + (landing ? landing.distance : jump.recovery);
      state.lateral = landing ? landing.lateral : 0;
      state.heading = landing ? landing.heading : 0;
      state.steeringHeading = 0;
      state.lateralSpeed = landing
        ? flight.velocity.dot(track.sample(state.distance).right)
        : 0;
      state.speed = landing
        ? Math.max(0, flight.velocity.dot(track.sample(state.distance).tangent))
        : 0;
      state.impact = flight.edgeCaught
        ? Math.max(state.impact, 0.35)
        : state.impact;
      mode = 'magnetic';
      const roadPose = poseOnRoad(state, true);
      if (landing) {
        const frame = track.sample(state.distance);
        const support = Math.max(
          0,
          bodyExtent(contactPose.quaternion, frame.up) -
            bodyExtent(roadPose.quaternion, frame.up),
        );
        landingSettle = {
          elapsed: 0,
          orientation: roadPose.quaternion
            .clone()
            .invert()
            .multiply(contactPose.quaternion),
          heightResidual:
            contactPose.position.clone().sub(roadPose.position).dot(frame.up) -
            support,
        };
        currentPose = contactPose;
      } else {
        // Recovery intentionally relocates to the authored apron without a
        // across-world interpolation or a leftover landing animation.
        landingSettle = null;
        currentPose = roadPose;
        previousPose = clonePose(currentPose);
        releasePose = true;
      }
      events.push({
        type: 'jump-transfer',
        payload: {
          id: jump.id,
          from,
          to: state.distance,
          outcome,
          ...(tractionRestored ? { tractionRestored: true } : {}),
          ...(flight.edgeCaught ? { edgeCaught: true } : {}),
        },
      });
      if (magneticBody && landing) {
        // Reattach through the constraint on the next shared step. Keep the
        // solver's pose and tangential momentum; never snap a contacted body.
        currentPose = clonePose(actor.read());
        magneticBody.adopt(state);
      } else {
        actor?.reset();
        magneticBody?.reset(state);
      }
      flight = null;
    }
    function catchEdge(state, jump, contact, pose, events) {
      const frame = contact.frame ?? track.sample(contact.distance);
      const extent = Math.max(
        bodyExtent(pose.quaternion, frame.right),
        headingExtents(contact.heading, R).lateral,
      );
      // Clamp inward only. Repeated contact with a curb must not move an
      // already inboard hull back out to the same nominal edge each tick.
      const lateral =
        contact.side *
        Math.min(
          contact.side * contact.lateral,
          jump.halfWidth - extent - R.edgeInset,
        );
      pose.position.addScaledVector(frame.right, lateral - contact.lateral);
      const sideSpeed = flight.velocity.dot(frame.right);
      const inwardSpeed =
        -contact.side * clamp(Math.abs(sideSpeed) * 0.22, 2, 6);
      flight.velocity.addScaledVector(frame.right, inwardSpeed - sideSpeed);
      if (!flight.edgeCaught) {
        flight.velocity.addScaledVector(
          frame.tangent,
          flight.velocity.dot(frame.tangent) * (R.edgeSpeedRetention - 1),
        );
        state.speed *= R.edgeSpeedRetention;
        const energyCost = stepModifiers.shield ? 0 : R.edgeEnergyCost;
        state.energy = Math.max(0, state.energy - energyCost);
        state.impact = 0.35;
        flight.edgeCaught = true;
        events.push({
          type: 'impact',
          payload: {
            source: options.edgeSource ?? `${options.id}-edge-catch`,
            severity: 0.18,
            side: contact.side,
            distance: contact.distance,
            lateral,
            overlap: contact.overlap,
            speedRetention: R.edgeSpeedRetention,
            energyCost,
            ...(contact.point
              ? {
                  position: contact.point.toArray(),
                  normal: contact.normal.toArray(),
                  collider: contact.shape.id,
                  contactKind: contact.shape.kind,
                }
              : {}),
            ...(stepModifiers.shield ? { shielded: true } : {}),
          },
        });
      }
      return lateral;
    }
    function beginRecovery(jump, reason, events) {
      if (mode === 'recovery') return;
      mode = 'recovery';
      flight.failure = reason;
      flight.remaining = automaticRecovery ? R.recoveryDelay : 0;
      if (!automaticRecovery) flight.manualRecovery = true;
      events.push({
        type: 'jump-miss',
        payload: {
          id: jump.id,
          reason,
          delay: flight.remaining,
          ...(!automaticRecovery ? { automaticRecovery: false } : {}),
        },
      });
    }

    // Contact geometry never asks whether this is an acceptable racing landing.
    // Only after the physical query do heading, support and checkpoint bounds
    // decide whether to relatch the current jump's receiving surface.
    function receivingFrame(jump, hit) {
      let distance =
        hit.shape.distance ?? (hit.shape.start + hit.shape.end) / 2;
      distance = clamp(distance, jump.landingStart, jump.landingEnd);
      for (let i = 0; i < 8; i++) {
        const frame = track.sample(distance);
        distance = clamp(
          distance +
            hit.position.clone().sub(frame.position).dot(frame.tangent),
          jump.landingStart,
          jump.landingEnd,
        );
      }
      const frame = track.sample(distance);
      const offset = hit.position.clone().sub(frame.position);
      return { distance, frame, offset };
    }

    // Arcade assistance follows the local receiving road only after a real
    // boundary contact. External supports/undersides never attract the ship.
    function assistBoundary(jump, hit, incomingSpeed) {
      if (!options.forgivingContacts || !hit.shape.roadBoundary) return false;
      const { distance, frame, offset } = receivingFrame(jump, {
        ...hit,
        position: currentPose.position,
      });
      const lateral = offset.dot(frame.right),
        height = offset.dot(frame.up);
      if (
        distance < jump.landingStart ||
        distance > jump.landingEnd ||
        Math.abs(offset.dot(frame.tangent)) > R.halfLength + 2 ||
        height < R.hover - 0.05 ||
        height > 12 ||
        Math.abs(lateral) > jump.halfWidth + 8
      )
        return false;
      const side = Math.sign(lateral);
      if (!side) return false;
      const sideways = flight.velocity.dot(frame.right);
      const inward = -side * clamp(Math.abs(sideways) * 0.3, 6, 10);
      flight.velocity.addScaledVector(frame.right, inward - sideways);
      const rise = flight.velocity.dot(frame.up);
      if (rise > 2) flight.velocity.addScaledVector(frame.up, 2 - rise);
      flight.angularVelocity?.multiplyScalar(0.25);
      actor?.setVelocity(flight.velocity, flight.angularVelocity);
      flight.edgeCaught = true;
      // A real inward rebound gets one fresh landing window, even if the old
      // timer expired this tick. Persistent rail contacts cannot rearm it.
      if (
        boundaryRecoveryGrace &&
        mode === 'recovery' &&
        incomingSpeed > 2 &&
        !flight.boundaryRecoveryUsed
      ) {
        flight.remaining = R.recoveryDelay;
        flight.boundaryRecoveryUsed = true;
      }
      return true;
    }

    function supportedContact(jump, hit, incomingVelocity = flight.velocity) {
      const restoringTraction =
        (dynamics || options.forgivingContacts) &&
        mode === 'recovery' &&
        hit.shape.kind === 'deck';
      if (
        (mode !== 'flight' && !restoringTraction) ||
        !['deck', 'rail'].includes(hit.shape.kind)
      )
        return null;
      const { distance, frame, offset } = receivingFrame(jump, hit);
      if (
        (Number.isFinite(hit.shape.start) &&
          (distance < hit.shape.start - 1e-5 ||
            distance > hit.shape.end + 1e-5)) ||
        (Number.isFinite(hit.shape.distance) &&
          (hit.shape.distance < jump.landingStart - R.halfLength ||
            hit.shape.distance > jump.landingEnd + R.halfLength))
      )
        return null;
      const lateral = offset.dot(frame.right);
      const strictHeading = landingHeading(hit.quaternion, frame);
      const forgivingDeck =
        options.forgivingContacts && hit.shape.kind === 'deck';
      const heading =
        forgivingDeck && strictHeading === null
          ? clamp(
              Math.atan2(
                incomingVelocity.dot(frame.right),
                Math.max(0.01, incomingVelocity.dot(frame.tangent)),
              ),
              -R.headingTolerance,
              R.headingTolerance,
            )
          : strictHeading;
      const boundary =
        jump.halfWidth +
        (hit.shape.kind === 'rail' ? (R.railOffset[jump.id] ?? 0) : 0);
      const footprint = edgeFootprint(hit.quaternion, frame, lateral, boundary);
      const length = bodyExtent(hit.quaternion, frame.tangent);
      if (
        heading === null ||
        footprint.overlap < R.edgeOverlap - 1e-8 ||
        distance - length < jump.landingStart ||
        distance + length > jump.landingEnd ||
        offset.dot(frame.up) < -1e-5
      )
        return null;
      if (
        hit.shape.kind === 'deck' &&
        (hit.normal.dot(frame.up) < 0.55 ||
          (!restoringTraction &&
            !forgivingDeck &&
            incomingVelocity.dot(frame.up) >= -0.01))
      )
        return null;
      // Rails may support only a hull above the deck, never an underside pull.
      if (
        hit.shape.kind === 'rail' &&
        offset.dot(frame.up) - bodyExtent(hit.quaternion, frame.up) < -0.05
      )
        return null;
      return {
        ...hit,
        distance,
        lateral,
        heading,
        frame,
        ...footprint,
        edgeCatch:
          hit.shape.kind === 'rail' ||
          Math.abs(lateral) + footprint.extent > jump.halfWidth,
      };
    }

    function advanceWorldContacts(
      state,
      jump,
      before,
      acceleration,
      dt,
      events,
    ) {
      let start = before,
        remaining = dt;
      let target = clonePose(currentPose);
      // Recover velocity at the start of the proposed interval.
      flight.velocity.addScaledVector(acceleration, -dt);
      for (let i = 0; i < COLLISION_RULES.maxContacts; i++) {
        const hit = collisionWorld.sweepHull(start, target, R);
        if (!hit) {
          currentPose = target;
          flight.velocity.addScaledVector(acceleration, remaining);
          return false;
        }
        const elapsed = remaining * hit.fraction;
        flight.velocity.addScaledVector(acceleration, elapsed);
        remaining -= elapsed;
        flight.contacts += 1;
        const contact = supportedContact(jump, hit);
        if (contact) {
          const pose = {
            position: hit.position.clone(),
            quaternion: hit.quaternion.clone(),
          };
          if (contact.edgeCatch) {
            contact.lateral = catchEdge(state, jump, contact, pose, events);
            contact.heading = -contact.side * 0.015;
          }
          // A supported side hit keeps its ballistic height until deck contact.
          if (hit.shape.kind === 'deck') {
            if (options.forgivingContacts) {
              const height = pose.position
                .clone()
                .sub(contact.frame.position)
                .dot(contact.frame.up);
              const clearance =
                Math.max(
                  R.hover,
                  bodyExtent(pose.quaternion, contact.frame.up),
                ) + (options.supportHeight ?? 0);
              pose.position.addScaledVector(
                contact.frame.up,
                Math.max(0, clearance - height),
              );
            }
            transfer(state, jump, 'landed', events, contact, pose);
            return true;
          }
          // A supported rail is still a solid. Separate the hull and remove
          // velocity into it so a top catch can slide toward the deck instead
          // of consuming every sweep on the same zero-time contact.
          pose.position.addScaledVector(
            hit.normal,
            hit.penetration + COLLISION_RULES.skin,
          );
          flight.velocity.addScaledVector(
            hit.normal,
            Math.max(0, -flight.velocity.dot(hit.normal)),
          );
          start = pose;
        } else {
          const kind = hit.shape.kind;
          const assistedBoundary = assistBoundary(
            jump,
            hit,
            Math.max(0, -flight.velocity.dot(hit.normal)),
          );
          const crash =
            !assistedBoundary &&
            (kind === 'terrain' ||
              kind === 'structure' ||
              (kind === 'deck' &&
                Math.abs(hit.normal.dot(hit.surfaceNormal)) > 0.55));
          const incoming = Math.max(0, -flight.velocity.dot(hit.normal));
          const restitution = crash
            ? COLLISION_RULES.crashRestitution
            : COLLISION_RULES.railRestitution;
          flight.velocity.addScaledVector(
            hit.normal,
            incoming * (1 + restitution),
          );
          if (crash && incoming > 2)
            flight.velocity.multiplyScalar(1 - COLLISION_RULES.crashFriction);
          // Contact response and separation apply even when Aegis protects cost.
          if (incoming > 2 && flight.elapsed - flight.lastImpactAt >= 0.12) {
            flight.lastImpactAt = flight.elapsed;
            const energyCost = stepModifiers.shield
              ? 0
              : crash
                ? COLLISION_RULES.crashEnergy
                : R.edgeEnergyCost;
            state.energy = Math.max(0, state.energy - energyCost);
            state.impact = Math.max(state.impact, crash ? 0.9 : 0.35);
            events.push({
              type: 'impact',
              payload: {
                source: `${options.id}-${crash ? 'crash' : 'deflection'}`,
                severity: clamp(incoming / 55, crash ? 0.45 : 0.18, 1),
                position: hit.point.toArray(),
                normal: hit.normal.toArray(),
                collider: hit.shape.id,
                contactKind: kind,
                response: crash ? 'crash' : 'deflection',
                side:
                  Math.sign(
                    hit.point
                      .clone()
                      .sub(hit.position)
                      .dot(axis(hit.quaternion, 1, 0, 0)),
                  ) || 1,
                energyCost,
                ...(stepModifiers.shield ? { shielded: true } : {}),
              },
            });
          }
          if (crash && incoming > 2) beginRecovery(jump, kind, events);
          start = {
            position: hit.position.clone(),
            quaternion: hit.quaternion.clone(),
          };
          start.position.addScaledVector(
            hit.normal,
            hit.penetration + COLLISION_RULES.skin,
          );
        }
        currentPose = clonePose(start);
        if (remaining <= 1e-8) return false;
        target = {
          position: start.position
            .clone()
            .addScaledVector(flight.velocity, remaining)
            .addScaledVector(acceleration, remaining * remaining * 0.5),
          quaternion: target.quaternion.clone(),
        };
      }
      // At a corner/triangle seam, exhaust the bounded solver at the separated
      // contact pose. Never integrate an unchecked remainder through a solid.
      return false;
    }
    function flightFailure(jump) {
      const frame = track.sample(jump.landingStart);
      const offset = currentPose.position.clone().sub(frame.position);
      const down = offset.dot(frame.up);
      const along = offset.dot(frame.tangent);
      const lateral = Math.abs(offset.dot(frame.right));
      return down < -R.missBelow
        ? 'short'
        : along > jump.landingEnd - jump.landingStart + R.missBeyond
          ? 'long'
          : lateral > R.missLateral
            ? 'lateral'
            : flight.elapsed >= R.timeout
              ? 'timeout'
              : null;
    }

    function airPropulsion(state, input, dt, events) {
      const handling = getShip(state.shipId).handling;
      state.speed = flight.velocity.length();
      const boost = updateBoostState(
        state,
        mode === 'flight' ? input : null,
        events,
      );
      state.energy = clamp(
        state.energy + (boost ? -handling.boostDrain : handling.recharge) * dt,
        0,
        100,
      );
      // Apply the ship's extra boost thrust along its actual flight direction.
      // Gravity and contacts still decide the trajectory; no boost means the
      // original ballistic arc, with no aiming force or airborne speed clamp.
      return flight.velocity
        .clone()
        .normalize()
        .multiplyScalar(boost ? handling.boostThrust - handling.thrust : 0);
    }

    function prepareDynamicFlight(state, input, dt, events) {
      const jump = track.jumps.find((entry) => entry.id === flight.id);
      state.time += dt;
      state.impact = Math.max(0, state.impact - dt * 2.4);
      state.steer = clamp(Number(input?.steer) || 0, -1, 1);
      state.distance = flight.from;
      flight.elapsed += dt;
      const wasRecovering = mode === 'recovery';
      if (wasRecovering && automaticRecovery)
        flight.remaining = Math.max(0, flight.remaining - dt);
      const acceleration = airPropulsion(state, input, dt, events);
      let angularVelocity;
      if (!wasRecovering) {
        acceleration.addScaledVector(
          flight.launchRight,
          -state.steer * R.airAcceleration,
        );
        const extra = options.airAcceleration?.({
          state,
          jump,
          position: currentPose.position.clone(),
          velocity: flight.velocity.clone(),
          time: state.time,
        });
        if (extra) {
          if (![extra.x, extra.y, extra.z].every(Number.isFinite))
            throw new Error('Air acceleration must be a finite world vector.');
          acceleration.add(extra);
        }
        flight.steerAngle +=
          (-state.steer * R.airYaw - flight.steerAngle) * -Math.expm1(-4 * dt);
        // Retain the authored ballistic attitude before contact. This controls
        // angular velocity, never overwrites the engine's quaternion. After an
        // impact let rotation evolve freely; recovery has no attitude controller.
        if (flight.hitAt < 0 || flight.elapsed - flight.hitAt > 0.18) {
          const forward = flight.velocity
            .clone()
            .addScaledVector(acceleration, dt * 0.5);
          forward.y -= R.gravity * dt * 0.5;
          forward.normalize();
          const right = flight.launchUp.clone().cross(forward).normalize();
          const up = forward.clone().cross(right).normalize();
          const target = new THREE.Quaternion()
            .setFromRotationMatrix(
              new THREE.Matrix4().makeBasis(right, up, forward),
            )
            .multiply(
              new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 0, 1),
                flight.steerAngle,
              ),
            );
          const error = target
            .multiply(currentPose.quaternion.clone().invert())
            .normalize();
          if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
          const angle = 2 * Math.acos(clamp(error.w, -1, 1));
          angularVelocity = new THREE.Vector3(error.x, error.y, error.z);
          if (angularVelocity.lengthSq() > 1e-12)
            angularVelocity.setLength(Math.min(2.5, angle * 8));
        }
      }
      const starting = !flight.dynamicsStarted;
      actor.stage({
        active: true,
        support: null,
        acceleration,
        angularAcceleration: angularVelocity
          ? angularVelocity
              .clone()
              .sub(flight.angularVelocity)
              .multiplyScalar(8)
          : new THREE.Vector3(),
        ...(starting
          ? {
              pose: currentPose,
              velocity: flight.velocity,
              angularVelocity: flight.angularVelocity,
            }
          : {}),
      });
      flight.dynamicsStarted = true;
      pending.native = {
        jump,
        wasRecovering,
        incomingVelocity: flight.velocity.clone(),
      };
    }

    function finishDynamicFlight(state, events) {
      const { jump, incomingVelocity } = pending.native;
      const result = actor.read();
      currentPose = {
        position: result.position,
        quaternion: result.quaternion,
      };
      flight.velocity.copy(result.velocity);
      flight.angularVelocity.copy(result.angularVelocity);
      state.speed = flight.velocity.length();
      state.lateralSpeed = flight.velocity.dot(flight.launchRight);
      const contacts = result.contacts.map((hit) => ({
        hit,
        contact: supportedContact(
          jump,
          {
            ...hit,
            position: currentPose.position,
            quaternion: currentPose.quaternion,
          },
          incomingVelocity,
        ),
      }));
      const supportedDeck = new Set(
        contacts
          .filter(({ hit, contact }) => contact && hit.shape.kind === 'deck')
          .map(({ hit }) => hit),
      );
      const fresh = new Set(
        contactFeedback.collect(
          result.contacts,
          state.time,
          (hit) => !supportedDeck.has(hit),
        ),
      );
      let shield = stepModifiers.shield === true;
      // Resolve every impact before capture. A stronger deck contact must not
      // hide a simultaneous racer hit, nor reset its cooldown or visual effect.
      for (const { hit, contact } of contacts) {
        flight.contacts += 1;
        if (supportedDeck.has(hit)) continue;
        if (fresh.has(hit)) flight.hitAt = flight.elapsed;
        const assistedBoundary = assistBoundary(jump, hit, hit.incomingSpeed);
        const crash =
          !assistedBoundary &&
          (hit.shape.kind === 'terrain' ||
            hit.shape.kind === 'structure' ||
            (hit.shape.kind === 'deck' &&
              Math.abs(hit.normal.dot(hit.surfaceNormal)) > 0.55));
        if (contact && hit.shape.kind === 'rail') flight.edgeCaught = true;
        if (fresh.has(hit)) {
          const racer = hit.shape.kind === 'racer';
          const impact = racer
            ? racerImpact(hit.incomingSpeed)
            : {
                severity: clamp(hit.incomingSpeed / 55, crash ? 0.45 : 0.18, 1),
                energyCost: crash
                  ? COLLISION_RULES.crashEnergy
                  : R.edgeEnergyCost,
              };
          const shielded = shield;
          shield = false;
          const energyCost = shielded ? 0 : impact.energyCost;
          state.energy = Math.max(0, state.energy - energyCost);
          state.impact = Math.max(
            state.impact,
            racer ? impact.severity : crash ? 0.9 : 0.35,
          );
          events.push({
            type: 'impact',
            payload: {
              source: racer
                ? 'racer-contact'
                : contact && hit.shape.kind === 'rail'
                  ? (options.edgeSource ?? `${options.id}-edge-catch`)
                  : `${options.id}-${crash ? 'crash' : 'deflection'}`,
              severity: impact.severity,
              position: hit.point.toArray(),
              normal: hit.normal.toArray(),
              collider: hit.shape.id,
              contactKind: hit.shape.kind,
              response: crash ? 'crash' : 'deflection',
              side:
                Math.sign(
                  hit.point
                    .clone()
                    .sub(currentPose.position)
                    .dot(axis(currentPose.quaternion, 1, 0, 0)),
                ) || 1,
              energyCost,
              ...(shielded ? { shielded: true } : {}),
            },
          });
        }
        if (crash && hit.incomingSpeed > 2)
          beginRecovery(jump, hit.shape.kind, events);
      }
      const landing = contacts.find(({ hit }) => supportedDeck.has(hit));
      if (landing) {
        const { contact } = landing;
        if (contact.edgeCatch) flight.edgeCaught = true;
        const contactPose = clonePose(currentPose);
        if (mode === 'recovery' || options.forgivingContacts) {
          const height = contactPose.position
            .clone()
            .sub(contact.frame.position)
            .dot(contact.frame.up);
          contactPose.position.addScaledVector(
            contact.frame.up,
            Math.max(
              R.hover,
              bodyExtent(contactPose.quaternion, contact.frame.up),
            ) - height,
          );
        }
        transfer(state, jump, 'landed', events, contact, contactPose);
        return;
      }
      if (mode === 'recovery') {
        if (automaticRecovery && flight.remaining <= 1e-8)
          transfer(state, jump, 'recovered', events);
      } else {
        const failure = flightFailure(jump);
        if (failure) beginRecovery(jump, failure, events);
      }
    }

    function advanceFlight(state, input, dt, events) {
      const jump = track.jumps.find((entry) => entry.id === flight.id);
      state.time += dt;
      state.impact = Math.max(0, state.impact - dt * 2.4);
      state.steer = clamp(Number(input?.steer) || 0, -1, 1);
      state.distance = flight.from;
      const acceleration = airPropulsion(state, input, dt, events);
      acceleration.y -= R.gravity;
      flight.elapsed += dt;
      if (mode === 'recovery') {
        if (automaticRecovery)
          flight.remaining = Math.max(0, flight.remaining - dt);
        if (collisionWorld) {
          const before = clonePose(currentPose);
          currentPose.position
            .addScaledVector(flight.velocity, dt)
            .addScaledVector(acceleration, dt * dt * 0.5);
          flight.velocity.addScaledVector(acceleration, dt);
          // A supported landing clears flight and restores magnetic driving.
          if (
            advanceWorldContacts(state, jump, before, acceleration, dt, events)
          )
            return;
        } else {
          currentPose.position.addScaledVector(flight.velocity, dt);
          flight.velocity.y -= R.gravity * dt;
        }
        if (automaticRecovery && flight.remaining <= 1e-8)
          transfer(state, jump, 'recovered', events);
        return;
      }
      const before = clonePose(currentPose);
      acceleration.addScaledVector(
        flight.launchRight,
        -state.steer * R.airAcceleration,
      );
      const extra = options.airAcceleration?.({
        state,
        jump,
        position: currentPose.position.clone(),
        velocity: flight.velocity.clone(),
        time: state.time,
      });
      if (extra) {
        if (![extra.x, extra.y, extra.z].every(Number.isFinite))
          throw new Error('Air acceleration must be a finite world vector.');
        acceleration.add(extra);
      }
      currentPose.position
        .addScaledVector(flight.velocity, dt)
        .addScaledVector(acceleration, dt * dt * 0.5);
      flight.velocity.addScaledVector(acceleration, dt);
      // Craft attitude follows its actual ballistic velocity; limited pilot yaw is
      // visual and does not point or pull the trajectory toward the target road.
      const forward = flight.velocity.clone().normalize();
      const right = flight.launchUp.clone().cross(forward).normalize();
      const up = forward.clone().cross(right).normalize();
      const orientation = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, forward),
      );
      flight.steerAngle +=
        (-state.steer * R.airYaw - flight.steerAngle) * -Math.expm1(-4 * dt);
      orientation.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          flight.steerAngle,
        ),
      );
      currentPose.quaternion.slerp(orientation, -Math.expm1(-8 * dt));
      if (collisionWorld) {
        if (advanceWorldContacts(state, jump, before, acceleration, dt, events))
          return;
        if (mode === 'recovery') return;
      } else {
        let landingBefore = before;
        const rail = sweptRail(track, jump, before, currentPose);
        // A lower-hull road hit can precede side contact in the same tick.
        // Resolving the later rail first would start the road sweep underneath
        // the deck and incorrectly discard a valid landing.
        const directLanding = R.curvedContact
          ? sweptLanding(track, jump, before, currentPose, flight.velocity)
          : null;
        const floorFirst =
          directLanding && (!rail || directLanding.fraction <= rail.fraction);
        if (rail && !floorFirst) {
          const contact = {
            position: rail.position.clone(),
            quaternion: rail.quaternion.clone(),
          };
          // Resolve at the swept hit time, then integrate the remainder with the
          // reflected velocity. Keep ballistic height; no pull down onto the deck.
          const remaining = dt * (1 - rail.fraction);
          flight.velocity.addScaledVector(acceleration, -remaining);
          catchEdge(state, jump, rail, contact, events);
          currentPose.position
            .copy(contact.position)
            .addScaledVector(flight.velocity, remaining)
            .addScaledVector(acceleration, remaining * remaining * 0.5);
          flight.velocity.addScaledVector(acceleration, remaining);
          landingBefore = contact;
        }
        const landing =
          R.curvedContact && (!rail || floorFirst)
            ? directLanding
            : sweptLanding(
                track,
                jump,
                landingBefore,
                currentPose,
                flight.velocity,
              );
        if (landing) {
          const contactPose = {
            position: landingBefore.position
              .clone()
              .lerp(currentPose.position, landing.fraction),
            quaternion: landingBefore.quaternion
              .clone()
              .slerp(currentPose.quaternion, landing.fraction),
          };
          if (landing.edgeCatch) {
            landing.lateral = catchEdge(
              state,
              jump,
              landing,
              contactPose,
              events,
            );
            landing.heading = -landing.side * 0.015;
          }
          transfer(state, jump, 'landed', events, landing, contactPose);
          return;
        }
      }
      const frame = track.sample(jump.landingStart);
      const offset = currentPose.position.clone().sub(frame.position);
      const down = offset.dot(frame.up);
      const along = offset.dot(frame.tangent);
      const lateral = Math.abs(offset.dot(frame.right));
      const failure =
        down < -R.missBelow
          ? 'short'
          : along > jump.landingEnd - jump.landingStart + R.missBeyond
            ? 'long'
            : lateral > R.missLateral
              ? 'lateral'
              : flight.elapsed >= R.timeout
                ? 'timeout'
                : null;
      if (failure) {
        beginRecovery(jump, failure, events);
      }
    }
    function tick(state, input, dt, events, startPose) {
      if (mode !== 'magnetic') {
        advanceFlight(state, input, dt, events);
        return;
      }
      const before = { ...state };
      // Pure sampled options: a split takeoff can evaluate this more than once.
      const groundOptions = () => ({
        ...options.groundOptions?.({ state, input, dt, track }),
        ...stepModifiers,
        steeringAssist: settings.steeringAssist ?? STEERING_ASSIST,
      });
      const magneticEvents = stepVehicle(
        state,
        input,
        track,
        dt,
        groundOptions(),
      );
      let crossed = null;
      for (const jump of track.jumps) {
        const lap =
          track.closed === false
            ? 0
            : Math.floor((before.distance - jump.takeoff) / track.length);
        let from = jump.takeoff + lap * track.length;
        if (from < before.distance - 1e-7) {
          if (track.closed === false) continue;
          from += track.length;
        }
        if (before.distance <= from && state.distance > from) {
          if (
            jump.optional &&
            options.shouldLaunch &&
            !options.shouldLaunch({ jump, state: before, input, from })
          )
            continue;
          crossed = { jump, from };
          break;
        }
      }
      if (!crossed) {
        advanceGroundPose(state, dt);
        events.push(...magneticEvents);
        return;
      }
      const fraction = clamp(
        (crossed.from - before.distance) / (state.distance - before.distance),
        0,
        1,
      );
      Object.assign(state, before);
      if (fraction > 0)
        events.push(
          ...stepVehicle(state, input, track, dt * fraction, groundOptions()),
        );
      state.distance = crossed.from;
      beginFlight(state, crossed.jump, crossed.from, events, startPose);
      if (fraction < 1)
        advanceFlight(state, input, dt * (1 - fraction), events);
    }
    const scenarios =
      options.scenarios ??
      Object.fromEntries(
        Object.entries(track.scenarios ?? {}).map(([name, state]) => [
          name,
          { label: name.replaceAll('-', ' '), state: { ...state } },
        ]),
      );
    const adapter = {
      id: options.id,
      version: options.version,
      rulesId: `${collisionWorld ? `${options.rulesId}:collision-${JSON.stringify({ id: collisionWorld.id, version: collisionWorld.version, rulesId: collisionWorld.rulesId })}` : options.rulesId}${dynamics ? `:dynamics-${JSON.stringify({ id: dynamics.id, version: dynamics.version, rulesId: dynamics.rulesId })}:${MAGNETIC_BODY_RULES}:shared-transition-tick-v1` : collisionWorld ? ':supported-rail-slide-v1' : ''}${options.forgivingContacts ? `:forgiving-deck-wall-v4:support-height-${options.supportHeight ?? 0}` : ''}${boundaryRecoveryGrace ? ':boundary-recovery-grace-v1' : ''}${automaticRecovery ? '' : ':manual-recovery-v1'}`,
      scenarios,
      advance(state, input, dt, modifiers = {}) {
        const events = [];
        if (disposed || !Number.isFinite(dt) || dt <= 0) return events;
        stepModifiers = modifiers;
        if (releasePose) {
          currentPose = null;
          previousPose = null;
          releasePose = false;
        }
        const startPose = clonePose(currentPose) ?? poseOnRoad(state);
        previousPose = clonePose(currentPose);
        const elapsed = Math.min(dt, 0.1);
        const count = Math.ceil(elapsed / R.step - 1e-10);
        for (let i = 0; i < count; i += 1) {
          if (dynamics) {
            adapter.beginAdvance(state, input, elapsed / count, modifiers);
            dynamics.step(elapsed / count);
            events.push(...adapter.finishAdvance(state));
          } else tick(state, input, elapsed / count, events, startPose);
        }
        if (flight) state.speed = flight.velocity.length();
        return events;
      },
      reset({ seed: nextSeed = 0, state } = {}) {
        mode = 'magnetic';
        flight = null;
        currentPose = null;
        previousPose = null;
        releasePose = false;
        landingSettle = null;
        seed = nextSeed;
        pending = null;
        actor?.reset();
        magneticBody?.reset(state);
      },
      snapshot() {
        return {
          mode,
          seed,
          releasePose,
          landingSettle: landingSettle
            ? {
                ...landingSettle,
                orientation: landingSettle.orientation.toArray(),
              }
            : null,
          previousPose: encodePose(previousPose),
          currentPose: encodePose(currentPose),
          ...(magneticBody ? { magnetic: magneticBody.snapshot() } : {}),
          flight: flight
            ? {
                ...flight,
                velocity: flight.velocity.toArray(),
                launchQuaternion: flight.launchQuaternion.toArray(),
                launchRight: flight.launchRight.toArray(),
                launchUp: flight.launchUp.toArray(),
                ...(dynamics
                  ? { angularVelocity: flight.angularVelocity.toArray() }
                  : {}),
              }
            : null,
        };
      },
      restore(data) {
        if (!data || !['magnetic', 'flight', 'recovery'].includes(data.mode))
          throw new Error('Invalid flight runtime state.');
        if (
          data.flight &&
          !track.jumps.some((jump) => jump.id === data.flight.id)
        )
          throw new Error('Unknown flight jump.');
        mode = data.mode;
        seed = data.seed;
        releasePose = !!data.releasePose;
        landingSettle = data.landingSettle
          ? {
              ...data.landingSettle,
              orientation: new THREE.Quaternion().fromArray(
                data.landingSettle.orientation,
              ),
            }
          : null;
        previousPose = decodePose(data.previousPose);
        currentPose = decodePose(data.currentPose);
        flight = data.flight
          ? {
              ...data.flight,
              velocity: new THREE.Vector3().fromArray(data.flight.velocity),
              launchQuaternion: new THREE.Quaternion().fromArray(
                data.flight.launchQuaternion,
              ),
              launchRight: new THREE.Vector3().fromArray(
                data.flight.launchRight,
              ),
              launchUp: new THREE.Vector3().fromArray(data.flight.launchUp),
              ...(dynamics
                ? {
                    angularVelocity: new THREE.Vector3().fromArray(
                      data.flight.angularVelocity ?? [0, 0, 0],
                    ),
                  }
                : {}),
            }
          : null;
        pending = null;
        if (magneticBody) magneticBody.restore(data.magnetic);
        if (actor) {
          actor.reset({
            ...(flight && currentPose
              ? {
                  pose: currentPose,
                  velocity: flight.velocity,
                  angularVelocity: flight.angularVelocity,
                  active: true,
                }
              : {}),
          });
        }
      },
      pose(alpha = 1) {
        if (mode === 'magnetic' && magneticBody?.pose(alpha))
          return magneticBody.pose(alpha);
        if (!currentPose) return null;
        const from = previousPose ?? currentPose;
        return {
          grounded: mode === 'magnetic',
          recovering: mode === 'recovery',
          ...(mode === 'magnetic' && options.forgivingContacts
            ? { steeringBank: true }
            : {}),
          position: from.position
            .clone()
            .lerp(currentPose.position, clamp(alpha, 0, 1)),
          quaternion: from.quaternion
            .clone()
            .slerp(currentPose.quaternion, clamp(alpha, 0, 1)),
        };
      },
      update() {},
      dispose() {
        disposed = true;
        mode = 'magnetic';
        flight = null;
        currentPose = null;
        previousPose = null;
        landingSettle = null;
        releasePose = false;
        pending = null;
        actor?.dispose();
      },
    };
    // Opt-in setup for contact playtests only. All subsequent ticks still use
    // the real adapter and shared engine; no trajectory or recovery shortcuts.
    if (options.testLaunch) {
      adapter.launch = (state, setup) => {
        if (disposed || pending)
          throw new Error('Launch requires an idle live flight runtime.');
        const jump = track.jumps.find((entry) => entry.id === setup?.jump);
        const vector = (value, size) =>
          Array.isArray(value) &&
          value.length === size &&
          value.every(Number.isFinite);
        if (
          !jump ||
          !vector(setup.position, 3) ||
          !vector(setup.velocity, 3) ||
          (setup.quaternion !== undefined &&
            (!vector(setup.quaternion, 4) ||
              Math.abs(Math.hypot(...setup.quaternion) - 1) > 1e-5)) ||
          (setup.angularVelocity !== undefined &&
            !vector(setup.angularVelocity, 3))
        )
          throw new Error(
            'Launch requires a known jump, finite world position/velocity and optional unit quaternion/angular velocity.',
          );
        adapter.reset({ seed, state });
        state.distance = jump.takeoff;
        state.speed = new THREE.Vector3(...setup.velocity).length();
        beginFlight(state, jump, jump.takeoff, [], null);
        currentPose.position.fromArray(setup.position);
        if (setup.quaternion)
          currentPose.quaternion.fromArray(setup.quaternion);
        previousPose = clonePose(currentPose);
        flight.velocity.fromArray(setup.velocity);
        flight.launchQuaternion.copy(currentPose.quaternion);
        if (dynamics) {
          flight.angularVelocity.fromArray(setup.angularVelocity ?? [0, 0, 0]);
          flight.dynamicsStarted = true;
          actor.reset({
            active: true,
            pose: currentPose,
            velocity: flight.velocity,
            angularVelocity: flight.angularVelocity,
          });
        }
      };
    }
    if (dynamics) {
      adapter.beginAdvance = (state, input, dt, modifiers = {}) => {
        if (pending)
          throw new Error(
            'Finish the pending flight step before staging another.',
          );
        if (disposed || !Number.isFinite(dt) || dt <= 0 || dt > R.step + 1e-10)
          throw new Error('Dynamics require a live fixed flight step.');
        stepModifiers = modifiers;
        if (releasePose) {
          currentPose = null;
          previousPose = null;
          releasePose = false;
        }
        const startPose = clonePose(currentPose) ?? poseOnRoad(state);
        previousPose = clonePose(currentPose);
        pending = { dt, events: [], native: null };
        if (mode === 'magnetic') {
          pending.grounded = { before: { ...state }, input, startPose };
          magneticBody.stage(state, input, dt, {
            ...options.groundOptions?.({ state, input, dt, track }),
            ...modifiers,
            supportHeight: options.supportHeight ?? 0,
            steeringAssist: settings.steeringAssist ?? STEERING_ASSIST,
          });
        } else prepareDynamicFlight(state, input, dt, pending.events);
      };
      adapter.finishAdvance = (state) => {
        if (!pending)
          throw new Error('Stage the flight step before resolving it.');
        const events = pending.events;
        if (pending.grounded) {
          const { before, input, startPose } = pending.grounded;
          events.push(...magneticBody.finish(state));
          currentPose = clonePose(actor.read());
          if (landingSettle) {
            landingSettle.elapsed += pending.dt;
            if (landingSettle.elapsed >= R.landingSettleDuration)
              landingSettle = null;
          }
          // All interacting bodies share one clock. A lip crossing releases
          // the magnetic constraint at this solved fixed-tick boundary.
          for (const jump of track.jumps) {
            let from = jump.takeoff;
            if (track.closed !== false)
              from +=
                Math.ceil((before.distance - from - 1e-7) / track.length) *
                track.length;
            if (before.distance > from || state.distance <= from) continue;
            if (
              jump.optional &&
              options.shouldLaunch &&
              !options.shouldLaunch({ jump, state: before, input, from })
            )
              continue;
            beginFlight(state, jump, from, events, startPose, actor.read());
            break;
          }
        } else if (pending.native) finishDynamicFlight(state, events);
        pending = null;
        return events;
      };
    }
    return adapter;
  }

  return { createRuntime, sweptLanding, sweptRail, rules: R };
}
