// Simulation owns the once-per-lap trigger; presentation samples this clock.
export const GRAZER_DURATION = 26;
export const GRAZER_SPEED = 38;
export const grazerTrigger = (track) => track.landmarks.vistaStart - 330;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One low forward breach. Delayed body emergence/dive follows the head. */
export function grazerExposure(age, z = 0, speed = GRAZER_SPEED) {
  const localAge = age - Math.max(0, -z) / speed;
  return smooth(2, 4, localAge) * (1 - smooth(10, 14, localAge));
}

export function sampleBurrower(age = -1) {
  const active = age >= 0 && age < GRAZER_DURATION;
  const breach = active ? grazerExposure(age) : 0;
  return {
    age,
    traveling: Math.max(0, Math.min(1, age / 20)),
    breach,
    phase: !active
      ? 'dormant'
      : age < 2
        ? 'moving-ridge'
        : age < 4
          ? 'breaching'
          : age < 10
            ? 'grazing'
            : age < 20
              ? 'diving'
              : 'settling',
    intensity: active ? Math.max(0.15, breach) : 0,
  };
}
