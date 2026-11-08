// Forecast only the avoidable sweeping fire. Full-width furnace crossings have
// no invented escape lane and retain their actual thermal/traction consequences.
export const HELION_AI_RULES = Object.freeze({
  policy: 'forecast-flare:sheltered-strip:preserve-vault-choice',
  shelteredLane: -10.25,
  flarePeriod: 14,
  flareStart: 3,
  flareEnd: 11,
  settleSeconds: 0.8,
  minimumSpeed: 30,
  tailClearance: 4.5,
  launchApproach: 260,
});
const wrap = (value, length) => ((value % length) + length) % length;

function flareDuring(zone, from, to) {
  const rules = HELION_AI_RULES;
  const first = Math.floor((from + zone.phase) / rules.flarePeriod);
  const start = first * rules.flarePeriod + rules.flareStart - zone.phase;
  return (
    (to >= start && from <= start + rules.flareEnd - rules.flareStart) ||
    to >= start + rules.flarePeriod
  );
}

export function createHelionHazardPlanner(track) {
  const zones = (track.thermalZones ?? [])
    .filter((zone) => zone.kind === 'flare')
    .sort((a, b) => a.start - b.start);
  const rules = HELION_AI_RULES;
  return (state, { laneSpeedLimit = 9 } = {}) => {
    const distance = wrap(state.distance, track.length);
    for (const jump of track.jumps ?? []) {
      if (
        distance >= jump.takeoff - rules.launchApproach &&
        distance <= jump.landingStart + rules.tailClearance &&
        state.lateral >= 0
      )
        return null;
    }
    const speed = Math.max(rules.minimumSpeed, state.speed);
    const lead =
      (Math.max(Math.abs(rules.shelteredLane - state.lateral), 16.25) /
        laneSpeedLimit +
        rules.settleSeconds) *
      speed;
    for (const zone of zones) {
      if (distance > zone.end + rules.tailClearance) continue;
      if (zone.start - distance > lead) continue;
      const from = state.time + Math.max(0, zone.start - distance) / speed;
      const to =
        state.time +
        Math.max(0, zone.end + rules.tailClearance - distance) / speed;
      if (flareDuring(zone, from, to)) return { lane: rules.shelteredLane };
    }
    return null;
  };
}
