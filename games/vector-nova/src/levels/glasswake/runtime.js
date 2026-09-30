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
    version: 3,
    rulesId: `glasswake-v3:${JSON.stringify({ geometry: track.geometryVersion, jumps: track.jumps, frost: track.gripZones, rules: flightModel.rules })}`,
    scenarios: Object.fromEntries(
      Object.entries(track.scenarios).map(([name, state]) => [
        name,
        {
          state: { ...state },
          label:
            {
              'jump1-approach':
                'Fracture 1 · short setup · W + Shift from rest',
              'jump1-straight-setup': 'Fracture 1 · straight boost setup',
              'jump1-bend-approach':
                'Gallery bend approach · steer into launch',
              'jump2-approach': 'Fracture 2 · supported run-up · W + Shift',
              'frost-matched': 'Frost lane · brake and steer at 270 km/h',
              'crystal-matched': 'Clear lane · brake and steer at 270 km/h',
              'calving-approach': 'Calving shelf · approach',
              'calving-cracks': 'Calving shelf · bright fractures',
              'calving-open': 'Calving shelf · cavern reveal',
              'calving-departure': 'Calving shelf · departure',
            }[name] ?? name.replaceAll('-', ' '),
        },
      ]),
    ),
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
