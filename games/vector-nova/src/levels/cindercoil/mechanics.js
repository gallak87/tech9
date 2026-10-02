// All cues and consequences sample the same fixed simulation clock.
export const CINDERCOIL_RULES = Object.freeze({
  version: 2,
  surgePeriod: 13,
  warningDuration: 3,
  activeDuration: 4.8,
  surgeDrag: 22,
  reserveDrain: 12,
  exposedBoundary: -3,
  ventPeriod: 11,
  ventWarning: 2.2,
  ventActive: 2.4,
  ventImpulse: 8,
});
const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
export function sampleSpill(zone, distance) {
  const t = Math.max(
    0,
    Math.min(1, (distance - zone.start) / (zone.end - zone.start)),
  );
  return {
    center:
      zone.side *
      (-17 + 34 * t + 0.45 * Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI)),
    halfWidth:
      (zone.halfWidth ?? 8.8) +
      Math.sin(t * Math.PI) * 0.35 +
      Math.sin(t * Math.PI * 13) * 0.12,
  };
}
export function sampleSurge(time, zone = {}) {
  if (zone.kind === 'spill')
    return {
      phase: 0,
      warning: false,
      active: true,
      coverage: 1,
      boundary: null,
      nextChange: null,
    };
  const phase = wrap(
    time + (zone.phaseOffset ?? 0),
    CINDERCOIL_RULES.surgePeriod,
  );
  const elapsed = phase - CINDERCOIL_RULES.warningDuration;
  const active = elapsed >= 0 && elapsed < CINDERCOIL_RULES.activeDuration;
  const coverage = active
    ? smooth(elapsed / 0.45) *
      smooth((CINDERCOIL_RULES.activeDuration - elapsed) / 0.7)
    : 0;
  return {
    phase,
    warning: phase < CINDERCOIL_RULES.warningDuration,
    active,
    coverage,
    boundary: 15 - (15 - CINDERCOIL_RULES.exposedBoundary) * coverage,
    nextChange: phase < 3 ? 3 - phase : active ? 7.8 - phase : 13 - phase,
  };
}
export function sampleCindercoilEvent(time) {
  const phase = wrap(time, CINDERCOIL_RULES.ventPeriod);
  const ventElapsed = phase - CINDERCOIL_RULES.ventWarning;
  const vent =
    ventElapsed >= 0 && ventElapsed < CINDERCOIL_RULES.ventActive
      ? smooth(ventElapsed / 0.4) *
        smooth((CINDERCOIL_RULES.ventActive - ventElapsed) / 0.5)
      : 0;
  // Every lap/session repeats from its clock; inspection and pause freeze it.
  const rupturePhase = wrap(time, 29);
  const rupture =
    smooth((rupturePhase - 5) / 3) * (1 - smooth((rupturePhase - 24) / 5));
  return {
    rupture,
    vent,
    ventWarning: phase < CINDERCOIL_RULES.ventWarning,
    ventPhase: phase,
  };
}
export function surgeAt(track, state) {
  const distance = wrap(state.distance, track.length);
  for (const zone of track.surgeZones ?? []) {
    if (distance < zone.start - 1e-7 || distance > zone.end + 1e-7) continue;
    const sample = sampleSurge(state.time, zone);
    if (zone.kind === 'spill') {
      const flow = sampleSpill(zone, distance);
      return {
        zone,
        ...sample,
        ...flow,
        contact: Math.abs(state.lateral - flow.center) < flow.halfWidth + 2.25,
      };
    }
    const overlap = zone.side * state.lateral + 2.25 - sample.boundary;
    return {
      zone,
      ...sample,
      contact: sample.active && sample.coverage > 0.02 && overlap > 0,
    };
  }
  return null;
}
