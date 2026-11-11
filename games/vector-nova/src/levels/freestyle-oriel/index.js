import { createFreestyleCourse } from '../../freestyle/course-level.js';
import { createOrielFreestyleTrack } from './track/model.js';
import { createOrielFreestyleEnvironment } from './environment.js';
import { createOrielBackdrop } from '../oriel/backdrop/index.js';

export default function createLevel() {
  return createFreestyleCourse({
    id: 'freestyle-oriel',
    createTrack: createOrielFreestyleTrack,
    createEnvironment: createOrielFreestyleEnvironment,
    createBackdrop: () => ({
      ...createOrielBackdrop(),
      far: 36000,
      sunColor: '#fff0d3',
      sunIntensity: 3.15,
      ambientIntensity: 0.28,
      fillColor: '#a0c1cf',
      fillIntensity: 0.24,
      environmentIntensity: 0.36,
    }),
    renderer: {
      world: 'oriel-sunvault',
      // This five-times-scale habitat needs enough depth precision for the
      // distant formed facades, while retaining the close native hull.
      near: 2,
      background: '#b5cbd0',
      fog: { color: '#b5cbd0', density: 0.000045 },
      reflectionFar: 18000,
      bloomStrength: 0.035,
      sunShadowExtent: 220,
    },
    palette: { deck: '#b8bdb3', stone: '#cfc6a9', metal: '#826d4d' },
  });
}
