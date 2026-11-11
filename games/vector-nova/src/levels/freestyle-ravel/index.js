import { createFreestyleCourse } from '../../freestyle/course-level.js';
import { createRavelBackdrop } from '../ravel/backdrop.js';
import { createRavelFreestyleTrack } from './track/model.js';
import { createRavelFreestyleEnvironment } from './environment.js';

export default function createLevel() {
  return createFreestyleCourse({
    id: 'freestyle-ravel',
    createTrack: createRavelFreestyleTrack,
    createEnvironment: createRavelFreestyleEnvironment,
    createBackdrop: createRavelBackdrop,
    loadScenery: () => import('./landing-solids.js'),
    renderer: {
      world: 'ravel-sailbreak',
      background: '#030812',
      fog: null,
      bloomStrength: 0.045,
      bloomThreshold: 1.4,
      reflectionFar: 22000,
      fillHeight: 90,
      catapultBlurScale: 0.28,
      sunShadowExtent: 200,
      // The wide foil beds expose grazing-angle self-shadow bands at the
      // shared tiny-road bias. Keep contact shadows, with metre-scale offset.
      sunShadowBias: -0.00018,
      sunShadowNormalBias: 0.35,
    },
    palette: {
      deck: '#bfcbd0',
      stone: '#aab7bf',
      metal: '#3b494e',
      metalness: 0.72,
    },
  });
}
