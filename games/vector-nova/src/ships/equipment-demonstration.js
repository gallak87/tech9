export const PREVIEW_TARGET_DISTANCE = 27.5;

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

// A studio demonstration, not a physics prediction. Motion stays in the
// inspection frame, so it cannot affect a race or carry the rival with it.
export function equipmentDemonstration(kind, time, reducedMotion = false) {
  const demo = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    target: [0, 0, PREVIEW_TARGET_DISTANCE],
    airborne: false,
    correction: 0,
    speed: 400 / 3.6,
    stage: null,
    end: 0,
    reserve: null,
  };
  if (kind === 'jump') {
    // Representative 22 m/s launch under 26 m/s² gravity, followed by a short
    // magnetic catch. Level-specific gravity still belongs to real gameplay.
    const flight = 44 / 26;
    const t = Math.min(time, flight);
    const catchAge = time - flight;
    demo.position[1] = Math.max(0, 22 * t - 13 * t * t);
    if (catchAge > 0 && catchAge < 0.3 && !reducedMotion)
      demo.position[1] = -0.12 * Math.sin((catchAge / 0.3) * Math.PI);
    if (!reducedMotion && time < flight)
      demo.rotation[0] = -0.1 * Math.sin((time / flight) * Math.PI * 2);
    demo.airborne = time < flight;
    demo.stage =
      time < flight / 2
        ? 'Launch · climbing'
        : time < flight
          ? 'Airborne · descending'
          : 'Landing · magnetic catch';
    demo.end = flight + 0.7;
  } else if (kind === 'stabilizer') {
    const correction = smooth((time - 0.45) / 1.8);
    const landing = smooth((time - 2.2) / 1.5);
    demo.position = [
      (-2.4 - 0.8 * smooth(time / 0.45)) * (1 - correction),
      4.5 * (1 - landing),
      0,
    ];
    if (!reducedMotion)
      demo.rotation = [0, 0.1 * (1 - correction), 0.32 * (1 - correction)];
    demo.airborne = time < 3.7;
    demo.correction = 1 - smooth((time - 0.8) / 1.6);
    demo.stage =
      time < 0.45
        ? 'Staged airborne drift'
        : time < 2.25
          ? 'Stabilizing · correcting the line'
          : time < 3.7
            ? 'Controlled descent'
            : 'Landing · line recovered';
    demo.end = 4.3;
  } else if (kind === 'injector') {
    demo.reserve = {
      before: 25,
      after: 70,
      value: 25 + 45 * smooth(time / 0.65),
    };
    demo.stage =
      time < 0.65
        ? 'Injecting · +45 boost reserve'
        : 'Reserve restored · 25 → 70';
    demo.end = 2;
  } else if (kind === 'slipstream') {
    const surge = smooth(time / 4);
    demo.target[2] = PREVIEW_TARGET_DISTANCE - 14 * surge;
    demo.speed += 45 * smooth(time / 0.7) * (1 - smooth((time - 4) / 0.3));
    demo.stage =
      time < 4
        ? `Surging · gap ${Math.round(demo.target[2])} m`
        : 'Surge complete · choose the pass';
    demo.end = 4.5;
  } else if (kind === 'deflector' || kind === 'deflector-hit') {
    demo.stage =
      kind === 'deflector-hit' && time >= 1.5
        ? 'Incoming hit absorbed · field consumed'
        : time < 2.5
          ? 'Protected · one incoming weapon'
          : 'Protection expired';
  }
  return demo;
}
