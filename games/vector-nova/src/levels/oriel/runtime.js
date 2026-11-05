import { createFlightModel } from '../../physics/flight.js';
import { ORIEL_HABITAT } from './track/model.js';
import { orielAvoidanceLane, orielRoadBounds } from './hazards.js';

export const ORIEL_FLIGHT_RULES = Object.freeze({
  gravity: 18,
  timeout: 7,
  missBelow: 65,
  missBeyond: 40,
  missLateral: 75,
  pitchTolerance: 0.85,
  rollTolerance: 0.8,
});
const model = createFlightModel(ORIEL_FLIGHT_RULES);

// The habitat's centrifugal field always points out from its axis. This is a
// world force, independent of receiving decks, pilot input and target position.
export function orielGravity(position) {
  const x = position.x - ORIEL_HABITAT.center[0];
  const y = position.y - ORIEL_HABITAT.center[1];
  const radius = Math.hypot(x, y);
  if (radius < 1) return { x: 0, y: 0, z: 0 };
  return { x: (x / radius) * 18, y: (y / radius) * 18, z: 0 };
}

export function createOrielRuntime(context) {
  const worldGravity = context.dynamics?.gravity ?? ORIEL_FLIGHT_RULES.gravity;
  let driver = null;
  const runtime = model.createRuntime(context, {
    id: 'oriel-centrifugal-flight',
    version: 4,
    rulesId: `oriel-v4:${JSON.stringify({ geometry: context.track.geometryVersion, challenge: context.track.challengeVersion, islands: context.track.challenges, jumps: context.track.jumps, rules: model.rules, gravity: 'cylindrical-outward-18-native-cancel-v2' })}`,
    testLaunch: Boolean(context.playtest),
    forgivingContacts: Boolean(context.collisionWorld),
    automaticRecovery: context.playtest?.automaticRecovery !== false,
    supportHeight: 0.04,
    groundOptions: ({ state }) => ({
      supportHeight: 0.04,
      roadBounds: orielRoadBounds(context.track, state.distance),
    }),
    airAcceleration: ({ position }) => {
      const field = orielGravity(position);
      return { x: field.x, y: field.y + worldGravity, z: 0 };
    },
    scenarios: Object.fromEntries(
      Object.entries(context.track.scenarios).map(([id, state]) => [
        id,
        { label: id.replaceAll('-', ' '), state: { ...state } },
      ]),
    ),
  });
  return {
    ...runtime,
    reset(args) {
      driver = args.state;
      return runtime.reset(args);
    },
    advance(state, ...args) {
      driver = state;
      return runtime.advance(state, ...args);
    },
    ...(runtime.beginAdvance
      ? {
          beginAdvance(state, ...args) {
            driver = state;
            return runtime.beginAdvance(state, ...args);
          },
        }
      : {}),
    snapshot() {
      return {
        ...runtime.snapshot(),
        orielLaneDistance: driver?.distance ?? null,
      };
    },
    restore(data) {
      if (
        data.orielLaneDistance !== null &&
        !Number.isFinite(data.orielLaneDistance)
      )
        throw new Error('Invalid Oriel lane-preview state.');
      runtime.restore(data);
      driver =
        data.orielLaneDistance === null
          ? null
          : { distance: data.orielLaneDistance };
    },
    avoidance() {
      return driver ? orielAvoidanceLane(context.track, driver) : null;
    },
  };
}
