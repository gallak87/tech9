import { createEliminatorCourse } from '../../events/eliminator-course.js';
import { createSaffronBackdrop } from '../saffron/backdrop/index.js';
import { createSaffronEliminatorTrack } from './track/model.js';
import { createSaffronEliminatorEnvironment } from './environment.js';

export default function createLevel() {
  return createEliminatorCourse({
    id: 'eliminator-saffron',
    createTrack: createSaffronEliminatorTrack,
    createEnvironment: createSaffronEliminatorEnvironment,
    createBackdrop: async ({ shape = false } = {}) => {
      const backdrop = await createSaffronBackdrop({ shape });
      return shape ? backdrop : { ...backdrop, fillIntensity: 0.2 };
    },
    renderer: {
      world: 'saffron-ossuary',
      background: '#c3a891',
      fog: { color: '#cbb7aa', density: 0.000085 },
      reflectionFar: 9000,
      bloomStrength: 0.04,
      bloomThreshold: 1.25,
      sunShadowExtent: 200,
      // Grazing light on the clear banked deck otherwise exposes dense
      // self-shadow bands. Keep genuine fossil/ship shadows at world scale.
      sunShadowBias: -0.00018,
      sunShadowNormalBias: 0.35,
    },
    palette: {
      surface: '#b59c68',
      structure: '#756044',
      edge: '#c7bda2',
      guide: '#e5cf9e',
    },
  });
}
