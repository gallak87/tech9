import { getCollisionHull } from '../../ships/collision-hulls.js';
import { samplePress, sampleEjector, EJECTOR_RULES } from './mechanics.js';

// Driver policy only: these values never alter the machine or vehicle physics.
export const COLOSSUS_AI_RULES = Object.freeze({
  policy: 'earliest-grounded-hazard:tail-clear:press-height:swept-ejector',
  laneSettleSeconds: 0.75,
  racingLane: 4,
  pressLane: 16,
  beltLane: 19,
  ejectorLane: 22,
  clearance: 1,
  minimumSpeed: 30,
  brakingFraction: 0.45,
  crossingSamples: 5,
  machineClearanceHeight: 5,
});

const wrap = (distance, length) => ((distance % length) + length) % length;

/** Nine authored intervals, built once. Queries use scalar clocks, not geometry. */
export function createColossusHazardPlanner(track) {
  const hazards = [
    ...track.presses.map((spec) => ({
      type: 'press',
      spec,
      start: spec.distance - spec.depth / 2,
      end: spec.distance + spec.depth / 2,
    })),
    ...track.ejectors.map((spec) => ({
      type: 'ejector',
      spec,
      start: spec.distance - spec.depth / 2,
      end: spec.distance + spec.depth / 2,
    })),
    ...track.belts.map((spec) => ({
      type: 'belt',
      spec,
      start: spec.start,
      end: spec.end,
    })),
  ].sort((a, b) => a.start - b.start);
  const shapes = new Map();
  const rules = COLOSSUS_AI_RULES;

  function laneAt(hazard, state, distance, speed, halfWidth, halfLength) {
    const from =
      state.time + Math.max(0, hazard.start - halfLength - distance) / speed;
    const to =
      state.time + Math.max(0, hazard.end + halfLength - distance) / speed;
    if (hazard.type === 'belt')
      return { lane: -hazard.spec.side * rules.beltLane };
    if (hazard.type === 'press') {
      let blocked = false;
      for (let i = 0; i < rules.crossingSamples && !blocked; i++) {
        const sample = samplePress(
          from + ((to - from) * i) / (rules.crossingSamples - 1),
          hazard.spec,
        );
        blocked = sample.bottom < rules.machineClearanceHeight;
      }
      return blocked
        ? { lane: -Math.sign(hazard.spec.lateral) * rules.pressLane }
        : null;
    }
    // Only the outward stroke crosses the bed at hull height. The return lifts
    // clear; parked/extended endpoints sit outside every candidate lane. Bound
    // the complete monotone stroke, rather than skipping over it with samples.
    let lower = Infinity,
      upper = -Infinity,
      strokeEnd = from;
    const firstCycle = Math.floor(
      (from + hazard.spec.phaseOffset) / EJECTOR_RULES.period,
    );
    const lastCycle = Math.floor(
      (to + hazard.spec.phaseOffset) / EJECTOR_RULES.period,
    );
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const start =
        cycle * EJECTOR_RULES.period +
        EJECTOR_RULES.warning -
        hazard.spec.phaseOffset;
      const end = start + EJECTOR_RULES.stroke;
      if (from > end || to < start) continue;
      const a = sampleEjector(Math.max(from, start), hazard.spec).lateral;
      const b = sampleEjector(Math.min(to, end), hazard.spec).lateral;
      lower = Math.min(lower, a, b);
      upper = Math.max(upper, a, b);
      strokeEnd = Math.max(strokeEnd, end);
    }
    if (lower === Infinity) return null;
    lower -= hazard.spec.width / 2 + halfWidth;
    upper += hazard.spec.width / 2 + halfWidth;
    const currentLane = Math.max(
      -rules.ejectorLane,
      Math.min(rules.ejectorLane, state.lateral),
    );
    let bestLane = currentLane,
      bestClearance = -Infinity,
      bestTravel = Infinity;
    for (const lane of [
      currentLane,
      -rules.ejectorLane,
      0,
      rules.ejectorLane,
    ]) {
      const clearance = Math.max(lower - lane, lane - upper);
      const travel = Math.abs(lane - state.lateral);
      if (
        (clearance >= rules.clearance &&
          (bestClearance < rules.clearance || travel < bestTravel)) ||
        (bestClearance < rules.clearance && clearance > bestClearance)
      ) {
        bestClearance = clearance;
        bestLane = lane;
        bestTravel = travel;
      }
    }
    if (bestClearance >= rules.clearance) return { lane: bestLane };
    // No lane clears a full stroke. Keep the current line and earn a later
    // arrival with ordinary braking instead of diving toward an unguarded edge.
    return { lane: currentLane, delay: strokeEnd - from + 0.2 };
  }

  return (state, { laneSpeedLimit = 9, braking = 83 } = {}) => {
    const distance = wrap(state.distance, track.length);
    const nextJump = track.jumps.find((jump) => jump.takeoff >= distance);
    const groundEnd = nextJump
      ? nextJump.takeoff - (nextJump.launchAlignment ?? 0)
      : track.length;
    if (
      distance >= groundEnd ||
      track.jumps.some(
        (jump) => distance > jump.takeoff && distance < jump.landingStart,
      )
    )
      return null;
    const chassisId = state.chassisId ?? state.shipId;
    let shape = shapes.get(chassisId);
    if (!shape) {
      const { min, max } = getCollisionHull(chassisId).bounds;
      shape = {
        halfWidth: Math.max(Math.abs(min[0]), Math.abs(max[0])),
        halfLength: Math.max(Math.abs(min[2]), Math.abs(max[2])),
      };
      shapes.set(chassisId, shape);
    }
    const { halfWidth, halfLength } = shape;
    const speed = Math.max(rules.minimumSpeed, state.speed);
    let first = null,
      firstChoice = null,
      limit = Infinity;
    for (const hazard of hazards) {
      if (first && first.type !== 'belt') break;
      if (hazard.end + halfLength + rules.clearance < distance) continue;
      if (hazard.end + halfLength >= groundEnd) break;
      const farthestLane =
        hazard.type === 'belt'
          ? rules.beltLane
          : hazard.type === 'press'
            ? rules.pressLane
            : rules.ejectorLane;
      const maximumLead =
        (Math.max(Math.abs(state.lateral), rules.racingLane) + farthestLane) /
          laneSpeedLimit +
        rules.laneSettleSeconds;
      if (hazard.start - halfLength - distance > speed * maximumLead) continue;
      const choice = laneAt(
        hazard,
        state,
        distance,
        speed,
        halfWidth,
        halfLength,
      );
      if (!choice) continue;
      const transition =
        Math.max(
          Math.abs(choice.lane - state.lateral),
          Math.abs(choice.lane) + rules.racingLane,
        ) /
          laneSpeedLimit +
        rules.laneSettleSeconds;
      if (hazard.start - halfLength - distance > speed * transition) continue;
      if (!first) {
        first = hazard;
        firstChoice = choice;
        const remaining = Math.max(
          0,
          hazard.start - halfLength - rules.clearance - distance,
        );
        const needed =
          Math.abs(choice.lane - state.lateral) / laneSpeedLimit +
          rules.laneSettleSeconds;
        if (remaining > 0 && Math.abs(choice.lane - state.lateral) > 1)
          limit = Math.max(rules.minimumSpeed, remaining / needed);
        if (choice.delay > 0)
          limit = Math.min(
            limit,
            Math.max(
              rules.minimumSpeed,
              remaining / (remaining / speed + choice.delay),
            ),
          );
      } else {
        const changeTime =
          Math.abs(choice.lane - firstChoice.lane) / laneSpeedLimit +
          rules.laneSettleSeconds;
        const gap = hazard.start - first.end - 2 * halfLength - rules.clearance;
        if (
          hazard.type === 'belt' &&
          first.type === 'belt' &&
          gap > 0 &&
          Math.abs(choice.lane - firstChoice.lane) > 1
        ) {
          const exitSpeed = Math.max(rules.minimumSpeed, gap / changeTime);
          limit = Math.min(
            limit,
            Math.sqrt(
              exitSpeed ** 2 +
                2 *
                  braking *
                  rules.brakingFraction *
                  Math.max(0, first.end + halfLength - distance),
            ),
          );
        }
        break;
      }
    }
    return first
      ? {
          lane: firstChoice.lane,
          ...(Number.isFinite(limit) ? { speedLimit: limit } : {}),
        }
      : null;
  };
}
