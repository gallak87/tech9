import { createFlightModel } from '../../../physics/flight.js';

export const NACRE_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  hover: 0.72,
  halfWidth: 2.25,
  halfLength: 3.5,
  airAcceleration: 4,
  airYaw: 0.22,
  headingTolerance: 0.44,
  rollTolerance: 0.6,
  pitchTolerance: 0.7,
  recoveryDelay: 1.5,
  timeout: 6,
  step: 1 / 120,
  landingSettleDuration: 0.16,
  landingBounce: 0.06,
  edgeOverlap: 0.5,
  edgeInset: 0.3,
  edgeSpeedRetention: 0.95,
  edgeEnergyCost: 2,
  railHeight: { 'storm-leap': 5.15, 'abyss-crossing': 8.25 },
});
const R = NACRE_FLIGHT_RULES;

// Preserve Nacre's approved contact solver. New expansion rules opt into
// refined curved contact through the shared model defaults.
const model = createFlightModel({
  ...NACRE_FLIGHT_RULES,
  curvedContact: false,
});
export const sweptNacreRail = model.sweptRail;
export const sweptNacreLanding = model.sweptLanding;

export function createNacreRuntime({
  track,
  settings = {},
  collisionWorld = null,
  dynamics = null,
  playtest = null,
}) {
  if (track.id !== 'nacre-tempest-1-shape')
    throw new Error('Nacre flight requires its exact authored track.');
  const scenarioLabels = {};
  for (let i = 1; i <= track.jumps.length; i += 1) {
    scenarioLabels[`jump${i}-approach`] =
      `Jump ${i} · short approach · W + Shift`;
    scenarioLabels[`jump${i}-success`] = `Jump ${i} · aligned at 403 km/h`;
    scenarioLabels[`jump${i}-short`] = `Jump ${i} · slow launch at 187 km/h`;
    scenarioLabels[`jump${i}-lateral`] = `Jump ${i} · 15° sideways at 396 km/h`;
    scenarioLabels[`jump${i}-long`] = `Jump ${i} · full boost at 565 km/h`;
    scenarioLabels[`jump${i}-cruise70`] = `Jump ${i} · 70% cruise at 282 km/h`;
    scenarioLabels[`jump${i}-boost70`] = `Jump ${i} · 70% boost at 396 km/h`;
  }
  const scenarios = Object.fromEntries(
    Object.entries(track.scenarios).map(([name, state]) => [
      name,
      {
        label: scenarioLabels[name] ?? name.replaceAll('-', ' '),
        state: { ...state },
      },
    ]),
  );
  for (const [index] of track.jumps.entries())
    for (const side of [-1, 1]) {
      const name = `jump${index + 1}-edge-${side < 0 ? 'right' : 'left'}`;
      scenarios[name] = {
        label: `Jump ${index + 1} · ${side < 0 ? 'right' : 'left'} rail catch`,
        state: {
          ...track.scenarios[`jump${index + 1}-long`],
          lateral: side * 10.9,
          heading: side * 0.007,
        },
      };
    }
  return model.createRuntime(
    { track, settings, collisionWorld, dynamics, playtest },
    {
      testLaunch: Boolean(playtest),
      forgivingContacts: Boolean(collisionWorld),
      supportHeight: 0.105,
      id: 'nacre-flight',
      version: 5,
      rulesId: `nacre-jumps-v5:${JSON.stringify({ track: track.id, geometry: track.geometryVersion, rules: R, jumps: track.jumps })}`,
      edgeSource: 'nacre-edge-catch',
      scenarios,
    },
  );
}
