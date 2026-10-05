import { createFlightModel } from '../../../physics/flight.js';
import { tidalResponse, airborneGravity } from './forces.js';

export const UMBRA_RULES_ID = 'umbra-tides-flight-v1-assist-0.3';
export const umbraFlight = createFlightModel({
  gravity: 26,
  timeout: 7,
  missBelow: 65,
  missBeyond: 70,
  missLateral: 180,
});

export function createUmbraRuntime(context) {
  const runtime = umbraFlight.createRuntime(context, {
    id: 'umbra-tidal-flight',
    version: 1,
    rulesId: `${UMBRA_RULES_ID}:${JSON.stringify({
      route: context.track.geometryVersion,
      rules: umbraFlight.rules,
      jumps: context.track.jumps,
      tides: context.track.tidalZones,
    })}`,
    groundOptions: ({ state, track }) => {
      const force = tidalResponse(track, state.distance, state.lateral);
      return {
        surface: {
          forwardAcceleration: force.forwardAcceleration,
          lateralAcceleration: force.lateralAcceleration,
        },
      };
    },
    airAcceleration: airborneGravity,
  });
  return runtime;
}
