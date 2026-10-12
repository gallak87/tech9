export const HELION_HEAT_RULES = Object.freeze({
  maximum: 100,
  passiveCooling: 5,
  stripCooling: 34,
  shelteredCooling: 12,
  flareHeating: 27,
  furnaceHeating: 25,
  powerThreshold: 62,
  minimumThrust: 0.56,
  penaltyRelease: 1,
  visualRelease: 5,
  pulsePeriod: 1.2,
  pulseMinimum: 0.65,
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
    exposure: 0,
    cooling: HELION_HEAT_RULES.passiveCooling,
    sheltered: false,
    flareStrength: 0,
    laneCenter: 0,
    laneHalfWidth: 5.3,
    active: false,
  };
  if (airborne)
    return {
      ...result,
      sheltered: true,
      cooling: HELION_HEAT_RULES.shelteredCooling,
    };
  if (!zone) return result;
  if (zone.kind === 'cooling')
    return {
      ...result,
      cooling: HELION_HEAT_RULES.stripCooling,
    };
  if (zone.kind === 'shelter')
    return {
      ...result,
      sheltered: true,
      cooling: HELION_HEAT_RULES.shelteredCooling,
    };
  if (zone.kind === 'furnace')
    return {
      ...result,
      active: true,
      exposure: HELION_HEAT_RULES.furnaceHeating,
      cooling: 0,
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

// One simulation-time pulse drives power loss, hull effects and the viewport.
export function helionHeatPulse(time = 0) {
  return (
    HELION_HEAT_RULES.pulseMinimum +
    (1 - HELION_HEAT_RULES.pulseMinimum) *
      (0.5 +
        0.5 * Math.cos((time * Math.PI * 2) / HELION_HEAT_RULES.pulsePeriod))
  );
}
export function helionActiveThrustScale(heat, contactAge, time = 0) {
  const release = 1 - smooth(contactAge / HELION_HEAT_RULES.penaltyRelease);
  return 1 - (1 - helionThrustScale(heat)) * release * helionHeatPulse(time);
}

// Contact history belongs to the runtime, so even a cold, brief hit leaves a
// five-second tail. Presentation never advances timers or extends the penalty.
export function sampleHelionHeatFeedback(
  thermal = {},
  { time = thermal.heatTime ?? 0, reducedMotion = false } = {},
) {
  const contact = !thermal.sheltered && (thermal.exposure ?? 0) > 0;
  const age = contact
    ? 0
    : (thermal.contactAge ?? HELION_HEAT_RULES.visualRelease);
  const heat = clamp(
    contact ? (thermal.heat ?? 0) : (thermal.contactHeat ?? 0),
    0,
    100,
  );
  const envelope = Math.pow(
    1 - clamp(age / HELION_HEAT_RULES.visualRelease),
    0.75,
  );
  const pulse = reducedMotion ? 0.85 : helionHeatPulse(time);
  const cooling =
    thermal.sheltered || thermal.cooling === HELION_HEAT_RULES.stripCooling;
  return {
    contact,
    envelope,
    pulse,
    smoke: (0.85 + (heat / 100) * 0.15) * envelope * pulse,
    flame: (0.22 + (heat / 100) * 0.2) * Math.pow(envelope, 1.6) * pulse,
    severity: Math.max(0.75, heat / 100) * envelope * pulse,
    status: contact
      ? 'ON FIRE'
      : envelope > 0
        ? cooling
          ? 'COOLING'
          : 'SMOKING'
        : '',
  };
}
