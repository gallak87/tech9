import { createTrack, buildTrackVisual } from './track/index.js';
import { createEnvironment } from './environment/index.js';
import { createSky } from './backdrop/index.js';
import {
  createMagneticRuntime,
  hasHalcyonFeatures,
} from '../../core/session-runtime.js';
import { legacyPart } from '../legacy.js';

export default function createLevel({ features }) {
  return {
    version: '0.2.2-gate2-pacing',
    renderer: {
      world: 'halcyon',
      background: '#77899d',
      fog: { color: '#8195af', density: 0.00025 },
      bloomStrength: 0.16,
      bloomThreshold: 1.8,
      fillHeight: 200,
      reflectionFar: 6000,
    },
    createTrack,
    createRoad({ track }) {
      const group = buildTrackVisual(track);
      return legacyPart(group, ({ state }) =>
        group.userData.update?.(state.distance),
      );
    },
    createEnvironment: ({ track }) => legacyPart(createEnvironment(track)),
    async createBackdrop() {
      const sky = await createSky();
      return {
        group: sky.mesh,
        sunDirection: sky.sunDirection,
        ownedTextures: [sky.texture],
        update: ({ camera }) => sky.mesh.position.copy(camera.position),
        dispose: () => sky.dispose(),
      };
    },
    async createRuntime(context) {
      return hasHalcyonFeatures(context.track, features)
        ? (await import('../../pickups/halcyon/index.js')).createHalcyonRuntime(
            context,
          )
        : createMagneticRuntime(context);
    },
  };
}
