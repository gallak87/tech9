import { getShip } from '../ships/catalog.js';

export const SPRINT_RULES_VERSION = 1;
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

export function courseIdentity(track) {
  return track.closed === false
    ? {
        format: 'sprint',
        version: SPRINT_RULES_VERSION,
        finishDistance: track.finishDistance,
        length: track.length,
        geometryVersion: track.geometryVersion ?? null,
      }
    : { format: 'circuit' };
}

export function distanceAhead(track, from, to) {
  return track.closed === false
    ? to - from
    : (((to - from) % track.length) + track.length) % track.length;
}

// Standings may follow an airborne craft along its declared flight corridor.
// This never changes state.distance or grants checkpoint/finish credit.
export function presentationDistance(track, state, pose) {
  if (track.closed !== false || pose?.grounded !== false || !pose.position)
    return state.distance;
  const jump = track.jumps?.find(
    (entry) => Math.abs(entry.takeoff - state.distance) < 1e-4,
  );
  if (!jump) return state.distance;
  const start = track.sample(jump.takeoff).position.clone();
  const end = track.sample(jump.landingStart).position.clone();
  const axis = end.sub(start);
  const position = pose.position;
  const x = Array.isArray(position) ? position[0] : position.x;
  const y = Array.isArray(position) ? position[1] : position.y;
  const z = Array.isArray(position) ? position[2] : position.z;
  const fraction = clamp(
    ((x - start.x) * axis.x + (y - start.y) * axis.y + (z - start.z) * axis.z) /
      Math.max(1, axis.lengthSq()),
    0,
    0.999,
  );
  return jump.takeoff + fraction * (jump.landingStart - jump.takeoff);
}

// Magnetic braking dissipates speed in the receiving runway. It is ordinary
// control input, so finish motion remains physical and deterministic in replay.
export function sprintRunoutControl(track, state) {
  const handling = getShip(state.shipId).handling;
  const remaining = Math.max(1, track.length - 24 - state.distance);
  const required = (state.speed * state.speed) / (2 * remaining);
  const grade = -9.81 * track.sample(state.distance).tangent.y;
  const drag = 4.4 + 0.0018 * state.speed * state.speed;
  const deceleration = Math.max(18, required * 1.15);
  const steer = clamp(
    (state.heading + state.steeringHeading * 0.3) * 3,
    -0.5,
    0.5,
  );
  return {
    throttle: 0,
    brake: clamp((deceleration + grade - drag) / handling.braking, 0.12, 1),
    steer,
    boost: false,
    airbrake: false,
  };
}
