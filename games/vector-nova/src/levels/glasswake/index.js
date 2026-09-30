import { createGlasswakeTrack, buildGlasswakeRoad } from './track/index.js';
import { createGlasswakeEnvironment } from './environment/index.js';
import { createGlasswakeBackdrop } from './backdrop/index.js';
import { createGlasswakeRuntime } from './runtime.js';
import { createGlasswakeOverlay } from './overlay.js';

export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.5.0-glasswake-v3',
    renderer: {
      world: shape ? 'glasswake-shape' : 'glasswake-comet',
      background: '#050b1c',
      fog: { color: '#102347', density: shape ? 0 : 0.00014 },
      bloomStrength: 0.2,
      bloomThreshold: 1.1,
      reflectionFar: 2800,
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    createTrack: createGlasswakeTrack,
    createRoad: ({ track, settings }) =>
      buildGlasswakeRoad(track, { shape, settings }),
    createEnvironment: (context) =>
      createGlasswakeEnvironment({ ...context, shape }),
    createBackdrop: () => createGlasswakeBackdrop({ shape }),
    createRuntime: createGlasswakeRuntime,
    createOverlay: createGlasswakeOverlay,
  };
}
