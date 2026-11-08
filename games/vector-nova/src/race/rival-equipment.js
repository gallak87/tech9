import { COMBAT_RULES } from '../pickups/combat.js';

// Six staggered decisions per second; ordinary equipment owns every cooldown,
// held-button edge and physical effect. This policy has no independent clock.
export const RIVAL_EQUIPMENT_RULES = Object.freeze({
  decisionTicks: 20,
  tickRate: 120,
  injectorReserve: 55,
  minimumSpeed: 35,
  threatSeconds: 0.9,
  jumpObstacleRange: 45,
  quietCurvature: 0.0015,
  quietNormal: 0.98,
  lanceRange: 180,
  lanceAimWidth: 2.5,
});

const none = null;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const gapTo = (track, from, to) => {
  let gap = to - from;
  if (track.closed !== false) {
    const length = track.length;
    gap = ((((gap + length / 2) % length) + length) % length) - length / 2;
  }
  return gap;
};

function decisionDue(time, actorId) {
  let phase = 0;
  for (let i = 0; i < actorId.length; i++)
    phase =
      (phase * 31 + actorId.charCodeAt(i)) %
      RIVAL_EQUIPMENT_RULES.decisionTicks;
  return (
    Math.round(time * RIVAL_EQUIPMENT_RULES.tickRate) %
      RIVAL_EQUIPMENT_RULES.decisionTicks ===
    phase
  );
}

function quietJumpPath(track, state, jumpSafe) {
  const reach = Math.max(450, state.speed * 4);
  if (jumpSafe?.(state, { reach }) === false) return false;
  for (const jump of track.jumps ?? []) {
    const takeoff = gapTo(track, state.distance, jump.takeoff);
    const recovery = gapTo(
      track,
      state.distance,
      jump.recovery ?? jump.landingEnd,
    );
    if (
      (takeoff > -20 && takeoff < reach) ||
      (recovery >= 0 && recovery < reach)
    )
      return false;
  }
  let first;
  for (const offset of [0, reach / 2, reach]) {
    const distance = state.distance + offset;
    if (
      track.closed === false &&
      distance >= (track.finishDistance ?? track.length) - 20
    )
      return false;
    if (
      (track.surfaceCoverage?.(distance, state.lateral) ?? 1) <= 0 ||
      track.tubeAt?.(distance)
    )
      return false;
    const frame =
      track.surfaceAtTime?.(distance, state.lateral, state.time) ??
      track.sampleSurface?.(distance, state.lateral) ??
      track.sample(distance);
    if (
      Math.abs(frame.curvature) > RIVAL_EQUIPMENT_RULES.quietCurvature ||
      frame.up.y < 0.75
    )
      return false;
    if (
      frame.bounds &&
      (state.lateral < frame.bounds.min + 4.5 ||
        state.lateral > frame.bounds.max - 4.5)
    )
      return false;
    if (
      first &&
      (dot(first.up, frame.up) < RIVAL_EQUIPMENT_RULES.quietNormal ||
        dot(first.tangent, frame.tangent) < 0.94)
    )
      return false;
    first ??= frame;
  }
  return true;
}

/** Cheap, stateless inputs for the same equipment system used by the player. */
export function getRivalEquipmentInput({
  actorId = 'rival',
  state,
  input,
  track,
  nearby = [],
  status,
  pose = null,
  combat = null,
  aegisRemaining = 0,
  jumpSafe = null,
}) {
  if (
    !status?.readyMask ||
    !state?.equipment?.length ||
    !decisionDue(status.time, actorId)
  )
    return none;
  const currentPose = typeof pose === 'function' ? pose() : pose;
  if (
    currentPose?.recovering ||
    !(input?.throttle > 0) ||
    state.speed < RIVAL_EQUIPMENT_RULES.minimumSpeed
  )
    return none;
  const grounded = currentPose?.grounded !== false;
  const world = typeof combat === 'function' ? combat() : combat;
  let draft = false,
    aimed = false,
    blockedAhead = false,
    threat = false,
    wakeAhead = false;
  for (const other of nearby) {
    if (other === state) continue;
    const ahead = gapTo(track, state.distance, other.distance);
    const across = other.lateral - state.lateral;
    if (ahead > 5 && ahead < 180 && Math.abs(across) < 9) draft = true;
    if (
      ahead > 8 &&
      ahead < RIVAL_EQUIPMENT_RULES.jumpObstacleRange &&
      Math.abs(across) < 4.8
    )
      blockedAhead = true;
    if (
      ahead > 12 &&
      ahead < RIVAL_EQUIPMENT_RULES.lanceRange &&
      Math.abs(across - Math.tan(state.heading ?? 0) * ahead) <
        RIVAL_EQUIPMENT_RULES.lanceAimWidth
    )
      aimed = true;
  }
  for (const shot of world?.shots ?? []) {
    if (shot.source === actorId) continue;
    const ahead = gapTo(track, shot.distance, state.distance);
    const closing = shot.speed - state.speed;
    if (
      ahead <= 0 ||
      closing <= 0 ||
      ahead / closing > RIVAL_EQUIPMENT_RULES.threatSeconds
    )
      continue;
    const across =
      shot.lateral + Math.tan(shot.heading ?? 0) * ahead - state.lateral;
    if (shot.target === actorId || Math.abs(across) < 5) threat = true;
  }
  for (const wake of world?.wakes ?? []) {
    if (wake.source === actorId || wake.age >= COMBAT_RULES.wakeLifetime)
      continue;
    const ahead = gapTo(track, state.distance, wake.distance);
    if (
      ahead >= 0 &&
      ahead < Math.max(35, state.speed * 0.3) &&
      Math.abs(wake.lateral - state.lateral) < 5
    )
      wakeAhead = true;
  }
  for (const other of nearby) {
    if (other === state) continue;
    const emitter = world?.emitters?.[other.chassisId ?? 'player'];
    if (
      emitter?.kind === 'repulsor' &&
      emitter.elapsed < COMBAT_RULES.pulseDelay &&
      Math.abs(gapTo(track, state.distance, other.distance)) <
        COMBAT_RULES.pulseRadius
    )
      threat = true;
  }
  const result = {};
  let canJump;
  for (let slot = 0; slot < state.equipment.length && slot < 4; slot++) {
    const bit = 1 << slot;
    if (!(status.readyMask & bit) || status.heldMask & bit) continue;
    const kind = state.equipment[slot];
    let activate = false;
    if (kind === 'injector')
      activate =
        state.energy <= RIVAL_EQUIPMENT_RULES.injectorReserve &&
        input.brake < 0.1;
    if (kind === 'slipstream')
      activate = grounded && draft && input.brake < 0.1;
    if (kind === 'deflector')
      activate =
        grounded &&
        !status.shield &&
        aegisRemaining <= 0 &&
        (threat || wakeAhead);
    if (kind === 'lance') activate = grounded && aimed && input.brake < 0.1;
    if (kind === 'stabilizer')
      activate =
        !grounded &&
        (Math.abs(state.lateralSpeed) > 1 || Math.abs(state.heading) > 0.04);
    if (
      kind === 'jump' &&
      grounded &&
      input.brake < 0.1 &&
      (wakeAhead || blockedAhead)
    ) {
      canJump ??= quietJumpPath(track, state, jumpSafe);
      activate = canJump;
    }
    if (activate) result[`equipment${slot + 1}`] = true;
  }
  return Object.keys(result).length ? result : none;
}
