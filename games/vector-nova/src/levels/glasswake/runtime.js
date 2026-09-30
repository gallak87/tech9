import { createFlightModel } from '../../physics/flight.js';
import { surfaceAt } from './surface.js';

export const GLASSWAKE_RULES = Object.freeze({ gravity: 26 });
const flightModel = createFlightModel(GLASSWAKE_RULES);
const runtimes = new WeakMap();
export const glasswakeFlightState = (track) =>
  runtimes.get(track)?.snapshot() ?? { mode: 'magnetic' };
export function createGlasswakeRuntime(context) {
  const { track } = context;
  const runtime = flightModel.createRuntime(context, {
    id: 'glasswake-fracture-grip',
    version: 1,
    rulesId: `glasswake-v1:${JSON.stringify({ geometry: track.geometryVersion, jumps: track.jumps, frost: track.gripZones, rules: GLASSWAKE_RULES })}`,
    groundOptions: ({ state }) => ({
      surface: { grip: surfaceAt(track, state.distance, state.lateral).grip },
    }),
  });
  runtimes.set(track, runtime);
  const dispose = runtime.dispose;
  runtime.dispose = () => {
    if (runtimes.get(track) === runtime) runtimes.delete(track);
    dispose();
  };
  return runtime;
}
