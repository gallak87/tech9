export const HELION_HEAT_RULES = Object.freeze({
  maximum: 100,
  passiveCooling: 5,
  stripCooling: 34,
  shelteredCooling: 12,
  flareHeating: 27,
  furnaceHeating: 25,
  powerThreshold: 62,
  minimumThrust: 0.56,
});
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const cycle = (time, period, offset = 0) =>
  (((time + offset) % period) + period) % period;

// Broad, multi-second envelopes never depend on display quality or motion settings.
export function sampleHelionProminences(time = 0) {
  return [
    { id: 'crown', period: 26, offset: 4, rise: 8, hold: 12, fall: 20 },
    { id: 'ribbon', period: 33, offset: 19, rise: 10, hold: 15, fall: 26 },
  ].map(({ id, period, offset, rise, hold, fall }) => {
    const phase = cycle(time, period, offset);
    const strength =
      phase < rise
        ? smooth(phase / rise)
        : phase < hold
          ? 1
          : 1 - smooth((phase - hold) / (fall - hold));
    return { id, strength: 0.16 + 0.84 * strength, phase: phase / period };
  });
}

export function sampleHelionThermal(
  track,
  distance,
  lateral,
  time,
  { airborne = false } = {},
) {
  const s = ((distance % track.length) + track.length) % track.length;
  const zone = (track.thermalZones ?? []).find(
    (entry) => s >= entry.start && s <= entry.end,
  );
  const result = {
    zone: zone?.id ?? null,
    label: zone?.label ?? 'CLEAR DECK',
    exposure: 0,
    cooling: HELION_HEAT_RULES.passiveCooling,
    sheltered: false,
    warning: '',
    flareStrength: 0,
    laneCenter: 0,
    laneHalfWidth: 5.3,
    active: false,
  };
  if (airborne)
    return {
      ...result,
      label: 'SHIELDED FLIGHT',
      sheltered: true,
      cooling: HELION_HEAT_RULES.shelteredCooling,
    };
  if (!zone) {
    const approaching = (track.thermalZones ?? []).find(
      (entry) =>
        ['furnace', 'flare'].includes(entry.kind) &&
        entry.start - s > 0 &&
        entry.start - s < 130,
    );
    if (approaching)
      result.warning = `${approaching.kind === 'furnace' ? 'FURNACE' : 'FLARE LANES'} · ${Math.ceil(approaching.start - s)} m`;
    return result;
  }
  if (zone.kind === 'cooling')
    return {
      ...result,
      label: 'COOLING STRIP',
      cooling: HELION_HEAT_RULES.stripCooling,
    };
  if (zone.kind === 'shelter')
    return {
      ...result,
      label: 'SHIELD SHADE',
      sheltered: true,
      cooling: HELION_HEAT_RULES.shelteredCooling,
    };
  if (zone.kind === 'furnace')
    return {
      ...result,
      label: 'FURNACE · KEEP MOVING',
      active: true,
      exposure: HELION_HEAT_RULES.furnaceHeating,
      cooling: 0,
      warning: 'MANDATORY HEAT PASSAGE',
      flareStrength: 0.8,
    };
  if (zone.kind === 'flare') {
    const phase = cycle(time, 14, zone.phase ?? 0);
    const active = phase >= 3 && phase <= 11;
    const laneCenter = 7.5 * Math.sin(((phase - 3) / 8) * Math.PI * 2);
    const strength = active
      ? Math.min(smooth((phase - 3) / 1.2), smooth((11 - phase) / 1.2))
      : 0;
    const covered = lateral < -8.5;
    const contact =
      !covered &&
      active &&
      Math.abs(lateral - laneCenter) < result.laneHalfWidth;
    return {
      ...result,
      label: covered ? 'SHELTERED DETOUR' : 'FLARE-SWEPT DECK',
      sheltered: covered,
      cooling: covered
        ? HELION_HEAT_RULES.shelteredCooling
        : contact
          ? 0
          : HELION_HEAT_RULES.passiveCooling,
      exposure: contact ? HELION_HEAT_RULES.flareHeating * strength : 0,
      laneCenter,
      active,
      flareStrength: strength,
      warning: covered
        ? 'PHYSICAL COVER · COOLING'
        : phase < 3
          ? `FLARE IN ${(3 - phase).toFixed(1)}s · MOVE RIGHT FOR COVER`
          : active
            ? 'FLARE ACTIVE · EVADE / RIGHT SHELTER'
            : 'FLARE CLEAR',
    };
  }
  return result;
}

export function integrateHelionHeat(heat, sample, dt) {
  return clamp(
    heat + (sample.exposure - sample.cooling) * dt,
    0,
    HELION_HEAT_RULES.maximum,
  );
}
export function helionThrustScale(heat) {
  return (
    1 -
    (1 - HELION_HEAT_RULES.minimumThrust) *
      clamp(
        (heat - HELION_HEAT_RULES.powerThreshold) /
          (100 - HELION_HEAT_RULES.powerThreshold),
      )
  );
}

// Presentation samples factual contact and stored heat without changing physics.
export function sampleHelionHeatFeedback(thermal = {}) {
  const heat = clamp(thermal.heat ?? 0, 0, 100);
  const contact = !thermal.sheltered && (thermal.exposure ?? 0) > 0;
  const stress = clamp((heat - 28) / 72);
  const cooling = thermal.sheltered || thermal.label === 'COOLING STRIP';
  return {
    contact,
    smoke: contact ? 0.38 + stress * 0.62 : stress * 0.9,
    flame: contact ? 0.3 + stress * 0.3 : 0,
    severity: contact ? Math.max(0.48, heat / 100) : stress,
    status: contact
      ? 'ON FIRE'
      : cooling && heat > 1
        ? 'COOLING'
        : heat >= HELION_HEAT_RULES.powerThreshold
          ? 'OVERHEATING'
          : heat > 28
            ? 'HOT · SMOKING'
            : '',
  };
}
