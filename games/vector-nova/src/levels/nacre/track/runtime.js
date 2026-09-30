import * as THREE from 'three';
import { stepVehicle, STEERING_ASSIST } from '../../../physics/index.js';

export const NACRE_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  hover: 0.72,
  halfWidth: 2.25,
  halfLength: 3.5,
  airAcceleration: 4,
  airYaw: 0.22,
  headingTolerance: 0.44,
  rollTolerance: 0.6,
  pitchTolerance: 0.7,
  recoveryDelay: 1.5,
  timeout: 6,
  step: 1 / 120,
  landingSettleDuration: 0.32,
  landingBounce: 0.06,
  edgeOverlap: 0.5,
  edgeInset: 0.3,
  edgeSpeedRetention: 0.95,
  edgeEnergyCost: 2,
  railHeight: { 'storm-leap': 5.15, 'abyss-crossing': 8.25 },
});
const R = NACRE_FLIGHT_RULES;
const clamp = THREE.MathUtils.clamp;
const axis = (q, x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q);
const bodyExtent = (q, direction) =>
  Math.abs(axis(q, 1, 0, 0).dot(direction)) * R.halfWidth +
  Math.abs(axis(q, 0, 1, 0).dot(direction)) * R.hover +
  Math.abs(axis(q, 0, 0, 1).dot(direction)) * R.halfLength;
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
  const yaw = Math.atan2(forward.dot(frame.right), forward.dot(frame.tangent));
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
// a wing tip with less than half the hull over the road cannot acquire support.
export function sweptNacreRail(track, jump, before, after) {
  if (!track.jumps.includes(jump)) return null;
  const height = R.railHeight[jump.id] ?? 0.9;
  let first = null;
  const motion = new THREE.Line3(before.position, after.position);
  const nearest = new THREE.Vector3();
  const radius = jump.halfWidth + height + 8;
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
          [side * ax + aw - jump.halfWidth, side * bx + bw - jump.halfWidth],
          [jump.halfWidth - side * ax, jump.halfWidth - side * bx],
          [height - ay + ah, height - by + bh],
          [ay, by],
          [az - segment.start, bz - segment.start],
          [segment.end - az, segment.end - bz],
        ];
        for (const [from, to] of inequalities) {
          if (from < 0 && to < 0) {
            enter = 2;
            break;
          }
          if (from < 0) enter = Math.max(enter, -from / (to - from));
          else if (to < 0) leave = Math.min(leave, from / (from - to));
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
        jump.halfWidth,
      );
      const extent = bodyExtent(quaternion, frame.tangent);
      const heading = landingHeading(quaternion, frame);
      if (
        heading === null ||
        footprint.overlap < R.edgeOverlap - 1e-8 ||
        side * lateral + footprint.extent < jump.halfWidth - 1e-6 ||
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
export function sweptNacreLanding(track, jump, before, after, velocity) {
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
    const footprint = edgeFootprint(quaternion, frame, lateral, jump.halfWidth);
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
  return first;
}

export function createNacreRuntime({ track, host, settings = {} }) {
  if (track.id !== 'nacre-tempest-1-shape')
    throw new Error('Nacre flight requires its exact authored track.');
  let mode = 'magnetic';
  let flight = null;
  let previousPose = null;
  let currentPose = null;
  let releasePose = false;
  let landingSettle = null;
  let disposed = false;
  let seed = 0;
  let status = null;
  if (host?.appendChild && typeof document !== 'undefined') {
    status = document.createElement('div');
    status.dataset.nacreFlight = '';
    status.setAttribute('aria-live', 'polite');
    Object.assign(status.style, {
      position: 'absolute',
      left: '50%',
      top: '22%',
      transform: 'translateX(-50%)',
      color: '#e3f3ed',
      padding: '7px 10px',
      maxWidth: 'min(330px, calc(100vw - 28px))',
      width: 'max-content',
      boxSizing: 'border-box',
      textAlign: 'center',
      whiteSpace: 'pre-line',
      lineHeight: '1.45',
      background: 'rgba(6,31,38,.85)',
      border: '1px solid #7cafb6',
      font: '600 clamp(11px, 2.8vw, 13px) system-ui',
      letterSpacing: '.035em',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '8',
    });
    host.appendChild(status);
  }
  const poseOnRoad = (state) => {
    const f = track.sample(state.distance);
    return {
      position: f.position
        .clone()
        .addScaledVector(f.right, state.lateral)
        .addScaledVector(f.up, R.hover),
      quaternion: f.quaternion
        .clone()
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            state.heading,
          ),
        )
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            (state.steer ?? 0) * 0.08,
          ),
        ),
    };
  };
  function advanceGroundPose(state, dt) {
    if (!landingSettle) {
      if (currentPose) currentPose = poseOnRoad(state);
      return;
    }
    landingSettle.elapsed = Math.min(
      R.landingSettleDuration,
      landingSettle.elapsed + dt,
    );
    const t = landingSettle.elapsed / R.landingSettleDuration;
    const blend = t * t * (3 - 2 * t);
    const frame = track.sample(state.distance);
    const pose = poseOnRoad(state);
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
  function beginFlight(state, jump, from, events, startPose) {
    const frame = track.sample(from);
    const world = poseOnRoad(state);
    const velocity = frame.tangent
      .clone()
      .multiplyScalar(state.speed * Math.cos(state.heading))
      .addScaledVector(
        frame.right,
        state.speed * Math.sin(state.heading) + state.lateralSpeed * 0.15,
      );
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
    };
    mode = 'flight';
    landingSettle = null;
    releasePose = false;
    currentPose = world;
    // The first interpolated flight interval starts at the previous magnetic
    // tick, not at the lip partway through that interval.
    previousPose ??= clonePose(startPose);
    state.distance = from;
    if (state.boosting)
      events.push({ type: 'boost', payload: { active: false } });
    state.boosting = false;
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
    state.boosting = false;
    state.impact = flight.edgeCaught ? Math.max(state.impact, 0.35) : 0;
    mode = 'magnetic';
    const roadPose = poseOnRoad(state);
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
        ...(flight.edgeCaught ? { edgeCaught: true } : {}),
      },
    });
    flight = null;
  }
  function catchEdge(state, jump, contact, pose, events) {
    const frame = contact.frame ?? track.sample(contact.distance);
    const extent = Math.max(
      bodyExtent(pose.quaternion, frame.right),
      R.halfWidth * Math.abs(Math.cos(contact.heading)) +
        R.halfLength * Math.abs(Math.sin(contact.heading)),
    );
    const lateral = contact.side * (jump.halfWidth - extent - R.edgeInset);
    pose.position.addScaledVector(frame.right, lateral - contact.lateral);
    const sideSpeed = flight.velocity.dot(frame.right);
    const inwardSpeed = -contact.side * clamp(Math.abs(sideSpeed) * 0.22, 2, 6);
    flight.velocity.addScaledVector(frame.right, inwardSpeed - sideSpeed);
    if (!flight.edgeCaught) {
      flight.velocity.addScaledVector(
        frame.tangent,
        flight.velocity.dot(frame.tangent) * (R.edgeSpeedRetention - 1),
      );
      state.speed *= R.edgeSpeedRetention;
      state.energy = Math.max(0, state.energy - R.edgeEnergyCost);
      state.impact = 0.35;
      flight.edgeCaught = true;
      events.push({
        type: 'impact',
        payload: {
          source: 'nacre-edge-catch',
          severity: 0.18,
          side: contact.side,
          distance: contact.distance,
          lateral,
          overlap: contact.overlap,
          speedRetention: R.edgeSpeedRetention,
          energyCost: R.edgeEnergyCost,
        },
      });
    }
    return lateral;
  }
  function advanceFlight(state, input, dt, events) {
    const jump = track.jumps.find((entry) => entry.id === flight.id);
    state.time += dt;
    state.impact = Math.max(0, state.impact - dt * 2.4);
    state.steer = clamp(Number(input?.steer) || 0, -1, 1);
    state.distance = flight.from;
    state.boosting = false;
    state.energy = Math.min(100, state.energy + 5.5 * dt);
    flight.elapsed += dt;
    if (mode === 'recovery') {
      flight.remaining = Math.max(0, flight.remaining - dt);
      currentPose.position.addScaledVector(flight.velocity, dt);
      flight.velocity.y -= R.gravity * dt;
      if (flight.remaining <= 1e-8) transfer(state, jump, 'recovered', events);
      return;
    }
    const before = clonePose(currentPose);
    const acceleration = flight.launchRight
      .clone()
      .multiplyScalar(-state.steer * R.airAcceleration);
    acceleration.y -= R.gravity;
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
    let landingBefore = before;
    const rail = sweptNacreRail(track, jump, before, currentPose);
    if (rail) {
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
    const landing = sweptNacreLanding(
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
        landing.lateral = catchEdge(state, jump, landing, contactPose, events);
        landing.heading = -landing.side * 0.015;
      }
      transfer(state, jump, 'landed', events, landing, contactPose);
      return;
    }
    const frame = track.sample(jump.landingStart);
    const offset = currentPose.position.clone().sub(frame.position);
    const down = offset.dot(frame.up);
    const along = offset.dot(frame.tangent);
    const lateral = Math.abs(offset.dot(frame.right));
    const failure =
      down < -23
        ? 'short'
        : along > jump.landingEnd - jump.landingStart + 18
          ? 'long'
          : lateral > 55
            ? 'lateral'
            : flight.elapsed >= R.timeout
              ? 'timeout'
              : null;
    if (failure) {
      mode = 'recovery';
      flight.failure = failure;
      flight.remaining = R.recoveryDelay;
      events.push({
        type: 'jump-miss',
        payload: { id: jump.id, reason: failure, delay: R.recoveryDelay },
      });
    }
  }
  function tick(state, input, dt, events, startPose) {
    if (mode !== 'magnetic') {
      advanceFlight(state, input, dt, events);
      return;
    }
    const before = { ...state };
    const magneticEvents = stepVehicle(state, input, track, dt, {
      steeringAssist: settings.steeringAssist ?? STEERING_ASSIST,
    });
    let crossed = null;
    for (const jump of track.jumps) {
      const lap = Math.floor((before.distance - jump.takeoff) / track.length);
      let from = jump.takeoff + lap * track.length;
      if (from < before.distance - 1e-7) from += track.length;
      if (before.distance <= from && state.distance > from) {
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
        ...stepVehicle(state, input, track, dt * fraction, {
          steeringAssist: settings.steeringAssist ?? STEERING_ASSIST,
        }),
      );
    state.distance = crossed.from;
    beginFlight(state, crossed.jump, crossed.from, events, startPose);
    if (fraction < 1) advanceFlight(state, input, dt * (1 - fraction), events);
  }
  const scenarioLabels = {};
  for (let i = 1; i <= track.jumps.length; i += 1) {
    scenarioLabels[`jump${i}-approach`] =
      `Jump ${i} · short approach · W + Shift`;
    scenarioLabels[`jump${i}-success`] = `Jump ${i} · aligned at 403 km/h`;
    scenarioLabels[`jump${i}-short`] = `Jump ${i} · slow launch at 187 km/h`;
    scenarioLabels[`jump${i}-lateral`] = `Jump ${i} · 15° sideways at 396 km/h`;
    scenarioLabels[`jump${i}-long`] = `Jump ${i} · full boost at 565 km/h`;
    scenarioLabels[`jump${i}-cruise70`] = `Jump ${i} · 70% cruise at 282 km/h`;
    scenarioLabels[`jump${i}-boost70`] = `Jump ${i} · 70% boost at 396 km/h`;
  }
  const scenarios = Object.fromEntries(
    Object.entries(track.scenarios).map(([name, state]) => [
      name,
      {
        label: scenarioLabels[name] ?? name.replaceAll('-', ' '),
        state: { ...state },
      },
    ]),
  );
  for (const [index] of track.jumps.entries())
    for (const side of [-1, 1]) {
      const name = `jump${index + 1}-edge-${side < 0 ? 'right' : 'left'}`;
      scenarios[name] = {
        label: `Jump ${index + 1} · ${side < 0 ? 'right' : 'left'} rail catch`,
        state: {
          ...track.scenarios[`jump${index + 1}-long`],
          lateral: side * 10.9,
          heading: side * 0.007,
        },
      };
    }
  return {
    id: 'nacre-flight',
    version: 5,
    rulesId: `nacre-jumps-v5:${JSON.stringify({ track: track.id, geometry: track.geometryVersion, rules: R, jumps: track.jumps })}`,
    scenarios,
    advance(state, input, dt) {
      const events = [];
      if (disposed || !Number.isFinite(dt) || dt <= 0) return events;
      if (releasePose) {
        currentPose = null;
        previousPose = null;
        releasePose = false;
      }
      const startPose = clonePose(currentPose) ?? poseOnRoad(state);
      previousPose = clonePose(currentPose);
      const elapsed = Math.min(dt, 0.1);
      const count = Math.ceil(elapsed / R.step - 1e-10);
      for (let i = 0; i < count; i += 1)
        tick(state, input, elapsed / count, events, startPose);
      return events;
    },
    reset({ seed: nextSeed = 0 } = {}) {
      mode = 'magnetic';
      flight = null;
      currentPose = null;
      previousPose = null;
      releasePose = false;
      landingSettle = null;
      seed = nextSeed;
      if (status) status.style.display = 'none';
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
        flight: flight
          ? {
              ...flight,
              velocity: flight.velocity.toArray(),
              launchQuaternion: flight.launchQuaternion.toArray(),
              launchRight: flight.launchRight.toArray(),
              launchUp: flight.launchUp.toArray(),
            }
          : null,
      };
    },
    restore(data) {
      if (!data || !['magnetic', 'flight', 'recovery'].includes(data.mode))
        throw new Error('Invalid Nacre runtime state.');
      if (
        data.flight &&
        !track.jumps.some((jump) => jump.id === data.flight.id)
      )
        throw new Error('Unknown Nacre jump.');
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
            launchRight: new THREE.Vector3().fromArray(data.flight.launchRight),
            launchUp: new THREE.Vector3().fromArray(data.flight.launchUp),
          }
        : null;
    },
    pose(alpha = 1) {
      if (!currentPose) return null;
      const from = previousPose ?? currentPose;
      return {
        grounded: mode === 'magnetic',
        position: from.position
          .clone()
          .lerp(currentPose.position, clamp(alpha, 0, 1)),
        quaternion: from.quaternion
          .clone()
          .slerp(currentPose.quaternion, clamp(alpha, 0, 1)),
      };
    },
    update({ state, mode: sessionMode } = {}) {
      if (!status) return;
      const width = globalThis.innerWidth ?? host?.clientWidth ?? 1440;
      const height = globalThis.innerHeight ?? host?.clientHeight ?? 900;
      const compactLandscape = height < 560 && width >= height;
      status.style.top =
        width < 600 && height > width
          ? '275px'
          : compactLandscape
            ? '148px'
            : '22%';
      status.style.padding = compactLandscape ? '5px 8px' : '7px 10px';
      status.style.fontSize = compactLandscape
        ? '11px'
        : 'clamp(11px, 2.8vw, 13px)';
      status.style.maxWidth = compactLandscape
        ? 'min(300px, calc(100vw - 28px))'
        : 'min(330px, calc(100vw - 28px))';
      let text = '';
      let warning = false;
      if (sessionMode === 'racing') {
        if (mode === 'recovery') {
          text = `MISSED LANDING · RECOVERY ${flight.remaining.toFixed(1)}s`;
          warning = true;
        } else if (mode === 'flight') {
          text = 'AIRBORNE · LIMITED AIR STEER';
        } else if (state) {
          const distance =
            ((state.distance % track.length) + track.length) % track.length;
          const index = track.jumps.findIndex((jump) => {
            const remaining = jump.takeoff - distance;
            return remaining >= 0 && remaining <= 220;
          });
          if (index >= 0) {
            const remaining = Math.ceil(track.jumps[index].takeoff - distance);
            // These are presentation-only observations of the tested launch
            // envelope, never speed clamps or automatic trajectory assistance.
            const low = state.speed < 78.4;
            warning = low;
            const guidance = low
              ? 'SPEED LOW · ACCELERATE'
              : 'SPEED READY · HOLD LINE';
            text = compactLandscape
              ? `JUMP ${index + 1} · ${remaining} m · ${low ? 'ACCELERATE' : 'HOLD LINE'}`
              : `JUMP ${index + 1} · ${remaining} m · BOOST WELCOME\n${guidance}`;
          }
        }
      }
      status.style.display = text ? 'block' : 'none';
      status.style.color = warning ? '#f1cf9a' : '#e3f3ed';
      status.style.borderColor = warning ? '#987853' : '#7cafb6';
      if (status.textContent !== text) status.textContent = text;
    },
    dispose() {
      disposed = true;
      status?.remove();
      status = null;
      mode = 'magnetic';
      flight = null;
      currentPose = null;
      previousPose = null;
      landingSettle = null;
      releasePose = false;
    },
  };
}
