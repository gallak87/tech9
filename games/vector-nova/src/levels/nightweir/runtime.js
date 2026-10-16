import { createFlightModel } from '../../physics/flight.js';
export const NIGHTWEIR_RULES = Object.freeze({
  gravity: 26,
  timeout: 9,
  missBelow: 90,
  missBeyond: 65,
  missLateral: 85,
  airAcceleration: 4,
  airYaw: 0.16,
  pitchTolerance: 1.05,
});
const model = createFlightModel(NIGHTWEIR_RULES);
export function createNightweirRuntime(context) {
  return model.createRuntime(context, {
    id: 'nightweir-sprint-flight',
    version: 4,
    rulesId:
      'nightweir-v4:' +
      JSON.stringify({
        geometry: context.track.geometryVersion,
        pace: context.track.pace,
        jumps: context.track.jumps,
        rules: model.rules,
        curtains: context.track.curtains,
        waterSurface: { crossings: false },
      }),
    groundOptions: () => {
      return {
        pace: context.track.pace,
        supportHeight: 0.04,
      };
    },
    supportHeight: 0.04,
    testLaunch: Boolean(context.playtest),
    forgivingContacts: true,
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    scenarios: Object.fromEntries(
      Object.entries(context.track.scenarios).map(([id, state]) => [
        id,
        { label: id.replaceAll('-', ' '), state: { ...state } },
      ]),
    ),
  });
}
