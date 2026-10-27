import { createLaunchworksTrack } from './track/model.js';
import { createLaunchworksRoad } from './track/road.js';
import { createLaunchworksEnvironment } from './environment.js';
import { createLaunchworksRuntime } from './runtime.js';
import { createOrbitalBackdrop } from '../orbital/backdrop/index.js';
import { collectProductionSolids } from '../../physics/production-solids.js';
import { createFreestyleOverlay } from '../../freestyle/overlay.js';
import { RACE_SAMPLES } from '../../audio/sample-cues.js';
import { DEVICE_SAMPLES } from '../../pickups/sample-cues.js';

export default function createLevel() {
  return {
    version: '0.1.0-freestyle-pilot',
    freestyle: true,
    audio: {
      samples: {
        ...RACE_SAMPLES,
        'freestyle-bank': DEVICE_SAMPLES['jump-land'],
      },
    },
    renderer: {
      world: 'orbital',
      background: '#08111b',
      fog: { color: '#142330', density: 0.000045 },
      bloomStrength: 0.08,
      bloomThreshold: 1.2,
      reflectionFar: 24000,
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
    createBackdrop: createOrbitalBackdrop,
    createOverlay: createFreestyleOverlay,
    createCollisionWorld: ({ track }) =>
      collectProductionSolids({
        track,
        id: 'launchworks-solids',
        geometryId: 'five-aprons-v1',
        road: createLaunchworksRoad({ track }),
        select: (object) =>
          object.userData.drivingSurface
            ? { kind: 'deck' }
            : /Low outboard rail/.test(object.name)
              ? { kind: 'rail', roadBoundary: true }
              : null,
      }),
    createRuntime: createLaunchworksRuntime,
    racing: { createDevices: () => [], createMotion: createLaunchworksRuntime },
  };
}
