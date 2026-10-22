import { createFlightModel } from '../../physics/flight.js';
import {
  sampleCrossfeed,
  samplePress,
  PRESS_RULES,
  sampleEjector,
  EJECTOR_RULES,
} from './mechanics.js';
export const COLOSSUS_FLIGHT_RULES = Object.freeze({
  gravity: 26,
  timeout: 8,
  missBelow: 80,
  missBeyond: 75,
  missLateral: 85,
  airAcceleration: 4,
  airYaw: 0.16,
  pitchTolerance: 1.05,
});
const model = createFlightModel(COLOSSUS_FLIGHT_RULES);
export function createColossusRuntime(context) {
  const { track } = context;
  let currentState = null;
  const runtime = model.createRuntime(context, {
    id: 'colossus-industrial-flight',
    version: 1,
    rulesId:
      'colossus-30-v1:' +
      JSON.stringify({
        geometry: track.geometryVersion,
        pace: track.pace,
        jumps: track.jumps,
        presses: track.presses,
        belts: track.belts,
        pressRules: PRESS_RULES,
        ejectors: track.ejectors,
        ejectorRules: EJECTOR_RULES,
        flight: model.rules,
      }),
    groundOptions: ({ state }) => {
      currentState = state;
      const belt = sampleCrossfeed(
        track,
        state.distance,
        state.lateral,
        state.time,
      );
      return { pace: track.pace, surface: belt || {} };
    },
    forgivingContacts: true,
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    testLaunch: Boolean(context.playtest),
    scenarios: Object.fromEntries(
      Object.entries(track.scenarios).map(([id, state]) => [
        id,
        { label: id.replaceAll('-', ' '), state: { ...state } },
      ]),
    ),
  });
  return {
    ...runtime,
    reset(args) {
      currentState = args.state;
      context.dynamics?.setMachineTime?.(args.state.time ?? 0);
      runtime.reset(args);
    },
    avoidance() {
      const state = currentState;
      if (!state) return null;
      const distance =
        ((state.distance % track.length) + track.length) % track.length;
      const ejector = track.ejectors.find(
        (e) => e.distance - distance > -35 && e.distance - distance < 260,
      );
      if (ejector) {
        const arrival =
          state.time +
          Math.max(0, ejector.distance - distance) / Math.max(40, state.speed);
        const cycle = sampleEjector(arrival, ejector);
        // Pass behind a moving head. On approach, bias towards its departure side.
        if (cycle.warning || cycle.striking) return -ejector.side * 24;
        if (cycle.extension > 0.3) return -ejector.side * 22;
      }
      const press = track.presses.find(
        (p) => p.distance - distance > -30 && p.distance - distance < 220,
      );
      if (press) {
        const arrival =
          state.time +
          Math.max(0, press.distance - distance) / Math.max(40, state.speed);
        const sample = samplePress(arrival, press);
        if (sample.warning || sample.closure > 0.2)
          return -Math.sign(press.lateral) * 16;
      }
      const belt = track.belts.find(
        (b) => distance >= b.start - 130 && distance <= b.end,
      );
      return belt ? -belt.side * 19 : null;
    },
  };
}
