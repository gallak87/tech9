import { createEliminatorCourse } from '../../events/eliminator-course.js';
import { createGlasswakeBackdrop } from '../glasswake/backdrop/index.js';
import { createGlasswakeEliminatorTrack } from './track/model.js';
import { createGlasswakeEliminatorEnvironment } from './environment.js';

export default function createLevel() {
  return createEliminatorCourse({
    id: 'eliminator-glasswake',
    createTrack: createGlasswakeEliminatorTrack,
    createEnvironment: createGlasswakeEliminatorEnvironment,
    // This course has no original calving/weather sections. The canonical sky
    // remains an independently owned ambient aurora without that coupling.
    createBackdrop: async ({ shape = false } = {}) => {
      const backdrop = await createGlasswakeBackdrop({ shape });
      return shape
        ? backdrop
        : {
            ...backdrop,
            sunIntensity: 2.25,
            ambientIntensity: 0.9,
            fillIntensity: 0.56,
            environmentIntensity: 0.42,
          };
    },
    renderer: {
      world: 'glasswake-fracture',
      background: '#050b1c',
      fog: { color: '#102347', density: 0.00013 },
      reflectionFar: 6500,
      bloomStrength: 0.06,
      bloomThreshold: 1.15,
      sunShadowExtent: 180,
    },
    palette: {
      surface: '#afdae8',
      structure: '#284c68',
      edge: '#c0dce4',
      guide: '#d7c7a4',
    },
  });
}
