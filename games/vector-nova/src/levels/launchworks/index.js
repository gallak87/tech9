import { createLaunchworksTrack } from './track/model.js';
import { createLaunchworksRoad } from './track/road.js';
import { createLaunchworksEnvironment } from './environment.js';
import { createLaunchworksRuntime } from './runtime.js';
import { createLaunchworksDevices } from './devices.js';
import { createZephyrBackdrop } from '../zephyr/backdrop/index.js';
import { collectProductionSolids } from '../../physics/production-solids.js';
import { createFreestyleOverlay } from '../../freestyle/overlay.js';
import { RACE_SAMPLES } from '../../audio/sample-cues.js';
import { DEVICE_SAMPLES } from '../../pickups/sample-cues.js';

export default function createLevel() {
  return {
    version: '0.3.0-skywell-freestyle-pilot',
    freestyle: true,
    audio: {
      samples: {
        ...RACE_SAMPLES,
        'freestyle-bank': DEVICE_SAMPLES['jump-land'],
      },
    },
    renderer: {
      world: 'zephyr-basilica',
      background: '#a18eac',
      fog: { color: '#a9b0c6', density: 0.00022 },
      bloomStrength: 0.08,
      bloomThreshold: 1.2,
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
    createRoad: createLaunchworksRoad,
    createEnvironment: createLaunchworksEnvironment,
    createBackdrop: createZephyrBackdrop,
    createOverlay: createFreestyleOverlay,
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
    racing: {
      createDevices: createLaunchworksDevices,
      createMotion: createLaunchworksRuntime,
    },
  };
}
