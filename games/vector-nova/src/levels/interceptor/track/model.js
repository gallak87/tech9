import * as T from 'three';
import { createCrucibleTrack } from '../../crucible/track/model.js';
import { createPursuitRoute, envelope } from './pursuit-route.js';

// Only Dispatch leaves the Eliminator Foundry surface. Its exchanger crest
// drops into a deep working trench, then the supported return reverses bank.
export function createInterceptorTrack() {
  const track = createPursuitRoute(createCrucibleTrack(), {
    heightAt: (f) =>
      110 * envelope(f, 0.17, 0.28, 0.29, 0.51) -
      28 * envelope(f, 0.4, 0.51, 0.56, 0.66),
    rollAt: (f) =>
      T.MathUtils.degToRad(
        -65 * envelope(f, 0.62, 0.67, 0.71, 0.76) +
          65 * envelope(f, 0.76, 0.81, 0.85, 0.91),
      ),
    moments: [
      { id: 'exchanger-plunge', type: 'drop', start: 0.29, end: 0.56 },
      {
        id: 'manifold-bank-reversal',
        type: 'bank-reversal',
        start: 0.62,
        end: 0.91,
      },
    ],
  });
  return {
    ...track,
    id: 'crucible-dispatch-pursuit-v2',
    geometryVersion: 'crucible-dispatch-plunge-reversal-v2',
    name: 'Crucible Dispatch',
  };
}
