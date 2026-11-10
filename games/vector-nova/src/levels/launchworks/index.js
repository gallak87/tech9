import { createLaunchworksTrack } from './track/model.js';
import { createLaunchworksRoad } from './track/road.js';
import { createLaunchworksEnvironment } from './environment.js';
import {
  createLaunchworksRuntime,
  createLaunchworksDynamics,
} from './runtime.js';
import { createLaunchworksDevices } from './devices.js';
import { createZephyrBackdrop } from '../zephyr/backdrop/index.js';
import { collectProductionSolids } from '../../physics/production-solids.js';
import { createFreestyleOverlay } from '../../freestyle/overlay.js';
import { createFreestyleCatchVfx } from '../../freestyle/catch-vfx.js';
import { createFreestyleAudio } from '../../freestyle/audio.js';
import { RACE_SAMPLES } from '../../audio/sample-cues.js';

export default function createLevel() {
  let catchVfx = null;
  return {
    version: '0.6.0-skywell-freestyle',
    freestyle: true,
    audio: {
      samples: RACE_SAMPLES,
      environment: createFreestyleAudio,
    },
    renderer: {
      world: 'zephyr-basilica',
      background: '#a18eac',
      fog: { color: '#a9b0c6', density: 0.00022 },
      bloomStrength: 0.08,
      bloomThreshold: 1.2,
      catapultBlurScale: 0.45,
      reflectionFar: 6500,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 6.5,
      chaseDistance: 18,
      lookAhead: 55,
      flightViewScale: 1.06,
    },
    createTrack: createLaunchworksTrack,
    createRoad(context) {
      const road = createLaunchworksRoad(context);
      if (context.shape) return road;
      let effect;
      try {
        effect = createFreestyleCatchVfx(context);
        catchVfx = effect;
        road.group.add(effect.group);
      } catch (error) {
        road.dispose();
        throw error;
      }
      return {
        ...road,
        update(frame) {
          road.update?.(frame);
          effect.update(frame);
        },
        reset() {
          road.reset?.();
          effect.reset();
        },
        dispose() {
          effect.group.removeFromParent();
          effect.dispose();
          if (catchVfx === effect) catchVfx = null;
          road.dispose();
        },
      };
    },
    createEnvironment: createLaunchworksEnvironment,
    createBackdrop: createZephyrBackdrop,
    createOverlay(context) {
      const overlay = createFreestyleOverlay(context);
      return {
        ...overlay,
        getPresentation: () => ({
          ...overlay.getPresentation?.(),
          freestyleCatch: catchVfx?.getPresentation(),
        }),
      };
    },
    createCollisionWorld: ({ track }) =>
      collectProductionSolids({
        track,
        id: 'launchworks-solids',
        geometryId: track.geometryVersion,
        road: createLaunchworksRoad({ track, shape: true }),
        select: (object) =>
          object.userData.drivingSurface
            ? { kind: 'deck' }
            : /Low outboard rail/.test(object.name)
              ? { kind: 'rail', roadBoundary: true }
              : null,
      }),
    createRuntime: createLaunchworksRuntime,
    createDynamics: createLaunchworksDynamics,
    racing: {
      createDevices: createLaunchworksDevices,
      createMotion: createLaunchworksRuntime,
    },
  };
}
