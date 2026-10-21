import { createFlightModel } from '../../physics/flight.js';
import { OPALINE_SURGE_RULES, sampleOpalineSurface } from './surges.js';

// The receiving mineral edges have no authored rails. Production uses exact solids.
export const OPALINE_FLIGHT = createFlightModel({
  gravity: 26,
  railHeight: { 'porcelain-fracture': 0, 'opal-crown-leap': 0 },
});
export function opalineGroundOptions(track, state) {
  const current = sampleOpalineSurface(track, state);
  return {
    surface: {
      forwardAcceleration: current.forwardAcceleration,
      lateralAcceleration: current.lateralAcceleration,
    },
  };
}
export function createOpalineRuntime(context) {
  const { track } = context;
  const runtime = OPALINE_FLIGHT.createRuntime(context, {
    id: 'opaline-spillway-flight',
    version: 1,
    rulesId: `opaline-rules-1:${JSON.stringify({ geometry: track.geometryVersion, rules: OPALINE_FLIGHT.rules, jumps: track.jumps, zones: track.surgeZones, surges: OPALINE_SURGE_RULES, boundaries: track.boundaryIntervals })}`,
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.collisionWorld),
    groundOptions: ({ state }) => opalineGroundOptions(track, state),
  });
  const scenarios = { ...runtime.scenarios };
  for (const [index, zone] of track.surgeZones.entries()) {
    for (const [line, lateral] of [
      ['exposed', -8],
      ['sheltered', 12],
    ])
      scenarios[`surge-${index + 1}-${line}`] = {
        label: `${zone.kind === 'along' ? 'Tailcurrent' : 'Crosscurrent'} ${index + 1} · ${line}`,
        state: {
          distance: (zone.start + zone.end) / 2,
          lateral,
          speed: 65,
          time: (((6 - zone.phaseOffset) % 18) + 18) % 18,
        },
      };
    scenarios[`surge-${index + 1}-warning`] = {
      label: `Spillway ${index + 1} · pressure warning`,
      state: {
        distance: zone.start - 55,
        lateral: 0,
        speed: 0,
        time: (((2 - zone.phaseOffset) % 18) + 18) % 18,
      },
    };
  }
  return { ...runtime, scenarios };
}
