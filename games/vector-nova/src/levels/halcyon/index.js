import { createHalcyonDevices } from './devices.js';
import {
  HALCYON_DEVICE_IDENTITY,
  HALCYON_DEVICE_SCENARIOS,
} from './device-runtime.js';
import { createTrack, buildTrackVisual } from './track/index.js';
import { createEnvironment } from './environment/index.js';
import { createSky } from './backdrop/index.js';
import { legacyPart } from '../legacy.js';

export default function createLevel() {
  return {
    version: '0.3.4-shared-racing',
    racing: {
      createDevices: createHalcyonDevices,
      identity: HALCYON_DEVICE_IDENTITY,
      scenarios: HALCYON_DEVICE_SCENARIOS,
    },
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
    createRoad({ track, settings, view }) {
      const group = buildTrackVisual(track, settings, view?.renderer);
      return legacyPart(group, ({ state, settings: next }) => {
        group.userData.updateFinish(next);
        group.userData.update(state.distance);
      });
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
  };
}
