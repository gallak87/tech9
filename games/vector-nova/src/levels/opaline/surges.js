export const OPALINE_SURGE_RULES = Object.freeze({
  period: 18,
  warningSeconds: 3,
  activeSeconds: 6,
  pulseHalfLength: 85,
  forwardAcceleration: 18,
  lateralAcceleration: 8.5,
  shelterStart: 5,
  shelterEnd: 12,
  shelteredForce: 0.12,
});
const wrap = (v, n) => ((v % n) + n) % n;
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/** Pure simulation clock shared by physics and every quality of presentation. */
export function sampleOpalineSurge(zone, time = 0) {
  const R = OPALINE_SURGE_RULES,
    phase = wrap(
      (Number.isFinite(time) ? time : 0) + zone.phaseOffset,
      R.period,
    );
  const warning =
    phase < R.warningSeconds ? smooth(phase / R.warningSeconds) : 0;
  const active =
    phase >= R.warningSeconds && phase < R.warningSeconds + R.activeSeconds;
  const progress = active ? (phase - R.warningSeconds) / R.activeSeconds : 0;
  const length = zone.end - zone.start;
  const headDistance =
    zone.start -
    R.pulseHalfLength +
    progress * (length + R.pulseHalfLength * 2);
  return {
    id: zone.id,
    phase,
    warning,
    active,
    progress,
    headDistance,
    strength: active ? Math.sin(Math.PI * progress) ** 0.5 : 0,
  };
}

/** Cross-current runs toward -lateral; the +lateral mineral groove shelters the inner line. */
export function sampleOpalineSurface(track, state) {
  const R = OPALINE_SURGE_RULES,
    distance = wrap(state.distance, track.length),
    lateral = state.lateral ?? 0;
  const zone = track.surgeZones.find(
    (z) => distance >= z.start && distance <= z.end,
  );
  const quiet = {
    id: 'mineral',
    zone: null,
    warning: 0,
    strength: 0,
    exposure: 0,
    forwardAcceleration: 0,
    lateralAcceleration: 0,
  };
  if (!zone) return quiet;
  const surge = sampleOpalineSurge(zone, state.time);
  const envelope = smooth(
    1 - Math.abs(distance - surge.headDistance) / R.pulseHalfLength,
  );
  const exposure =
    1 -
    (1 - R.shelteredForce) *
      smooth((lateral - R.shelterStart) / (R.shelterEnd - R.shelterStart));
  const strength = surge.strength * envelope * exposure;
  return {
    id: strength > 0 ? 'spillway-current' : 'mineral',
    zone: zone.id,
    warning: surge.warning,
    strength,
    exposure,
    forwardAcceleration:
      zone.kind === 'along' ? R.forwardAcceleration * strength : 0,
    lateralAcceleration:
      zone.kind === 'cross' ? -R.lateralAcceleration * strength : 0,
  };
}
