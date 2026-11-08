import { CINDERCOIL_RULES } from './mechanics.js';

// Driver intent only. Lava still applies its ordinary contact forces/reserve loss.
export const CINDERCOIL_AI_RULES = Object.freeze({
  policy: 'forecast-surge:downstream-spill-line:preserve-vent',
  protectedLane: 7,
  spillLane: 10.5,
  settleSeconds: 0.8,
  minimumSpeed: 30,
  tailClearance: 4.5,
  launchApproach: 260,
  turnAuthority: 1.5,
  turnReserve: 0.9,
  brakingFraction: 0.45,
});
const wrap = (value, length) => ((value % length) + length) % length;
const plannedZones = new WeakMap();

function surgeDuring(zone, from, to) {
  const rules = CINDERCOIL_RULES;
  const first = Math.floor((from + zone.phaseOffset) / rules.surgePeriod);
  const start =
    first * rules.surgePeriod + rules.warningDuration - zone.phaseOffset;
  return (
    (to >= start && from <= start + rules.activeDuration) ||
    to >= start + rules.surgePeriod
  );
}

/** Three authored intervals; no road samples, scene queries or runtime state. */
export function createCindercoilHazardPlanner(track) {
  const rules = CINDERCOIL_AI_RULES;
  let zones = plannedZones.get(track);
  if (!zones) {
    zones = [...(track.surgeZones ?? [])]
      .sort((a, b) => a.start - b.start)
      .map((zone) => {
        let curvature = 0,
          turnStation = zone.start;
        for (let s = zone.start - 80; s <= zone.end; s += 10) {
          const value = Math.abs(track.sample(s).curvature);
          if (value > curvature) {
            curvature = value;
            turnStation = s;
          }
        }
        return { ...zone, curvature, turnStation };
      });
    plannedZones.set(track, zones);
  }
  return (state, { laneSpeedLimit = 9, braking = 83, turn = 1 } = {}) => {
    const distance = wrap(state.distance, track.length);
    for (const jump of track.jumps ?? []) {
      if (
        distance >= jump.takeoff - rules.launchApproach &&
        distance <= jump.landingStart + rules.tailClearance
      )
        return null;
    }
    const speed = Math.max(rules.minimumSpeed, state.speed);
    for (const zone of zones) {
      if (distance > zone.end + rules.tailClearance) continue;
      // The spill joins opposite road edges, so every grounded line crosses it.
      // Settle on its downstream clear side before entry: this shortens the
      // unavoidable contact and avoids chasing the diagonal flow across lanes.
      const lane =
        -zone.side *
        (zone.kind === 'spill' ? rules.spillLane : rules.protectedLane);
      const lead =
        (Math.max(Math.abs(lane - state.lateral), Math.abs(lane) + 6) /
          laneSpeedLimit +
          rules.settleSeconds) *
        speed;
      if (zone.start - distance > lead) continue;
      const from = state.time + Math.max(0, zone.start - distance) / speed;
      const to =
        state.time +
        Math.max(0, zone.end + rules.tailClearance - distance) / speed;
      if (zone.kind !== 'spill' && !surgeDuring(zone, from, to)) continue;
      // Removing lava drag must not turn a safe outside line into a rail hit.
      // The yaw feedforward consumes curvature * speed / (1.5 * turn); leave
      // steering authority for the lateral move, using one cached route bound.
      const cornerSpeed =
        (rules.turnAuthority * turn * rules.turnReserve) /
        Math.max(1e-6, zone.curvature);
      return {
        lane,
        speedLimit: Math.sqrt(
          Math.max(rules.minimumSpeed, cornerSpeed) ** 2 +
            2 *
              braking *
              rules.brakingFraction *
              Math.max(0, zone.turnStation - distance - 15),
        ),
      };
    }
    return null;
  };
}
