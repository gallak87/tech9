import { createSaffronTrack } from './track/model.js';
import { createSaffronRoad } from './track/road.js';
import { createSaffronEnvironment } from './environment/index.js';
import { createSaffronBackdrop } from './backdrop/index.js';
import { createSaffronRuntime, createSaffronOverlay } from './runtime.js';

export default function createLevel({ shape = false }) {
  return {
    version: '0.5.0-saffron-v1',
    renderer: {
      world: shape ? 'saffron-shape' : 'saffron-leviathan',
      background: '#b7a4a2',
      fog: { color: '#b8a5a3', density: 0.00017 },
      bloomStrength: 0.14,
      bloomThreshold: 1.12,
      fillHeight: 28,
      reflectionFar: 2600,
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    practiceSectionsUntimed: true,
    railContactSparks: true,
    createTrack: createSaffronTrack,
    createRoad: (context) => createSaffronRoad(context, { shape }),
    createEnvironment: (context) =>
      createSaffronEnvironment(context, { shape }),
    createBackdrop: ({ settings }) =>
      createSaffronBackdrop({ settings, shape }),
    createRuntime: createSaffronRuntime,
    createOverlay: createSaffronOverlay,
  };
}
