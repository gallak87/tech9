export const NACRE_STORM_RULES = Object.freeze({
  periodSeconds: 12,
  firstOnsetMin: 2.6,
  onsetVariation: 0.6,
  durationSeconds: 0.85,
  attackSeconds: 0.065,
  thunderDelaySeconds: 0.16,
  maxLightningIntensity: 0.14,
  maxScreenFlash: 0.032,
});

const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

// One unbroken pulse per seeded simulation-time event. No secondary strobe.
export function sampleNacreLightning(time, reducedMotion = false) {
  const safeTime = Number.isFinite(time) && time >= 0 ? time : 0;
  const cycle = Math.floor(safeTime / NACRE_STORM_RULES.periodSeconds);
  const seed = (Math.imul(cycle + 73, 1664525) + 1013904223) >>> 0;
  const onset =
    NACRE_STORM_RULES.firstOnsetMin +
    ((seed % 1000) / 1000) * NACRE_STORM_RULES.onsetVariation;
  const age = safeTime - cycle * NACRE_STORM_RULES.periodSeconds - onset;
  const envelope =
    ease(age / NACRE_STORM_RULES.attackSeconds) *
    (1 -
      ease(
        (age - NACRE_STORM_RULES.attackSeconds) /
          (NACRE_STORM_RULES.durationSeconds - NACRE_STORM_RULES.attackSeconds),
      ));
  const intensity =
    reducedMotion || !Number.isFinite(time) || time < 0
      ? 0
      : envelope * NACRE_STORM_RULES.maxLightningIntensity;
  return {
    cycle,
    seed,
    onset,
    age,
    intensity,
    flash:
      (intensity / NACRE_STORM_RULES.maxLightningIntensity) *
      NACRE_STORM_RULES.maxScreenFlash,
    azimuth: 0.35,
    azimuthOffset: (((seed >>> 8) % 1000) / 1000 - 0.5) * 0.24,
    pan: (((seed >>> 8) % 1000) / 1000 - 0.5) * 0.4,
  };
}
