import { createCrucibleTrack } from './track/model.js';
import { createCrucibleRoad } from './track/road.js';
import { createCrucibleEnvironment } from './environment.js';
import { createColossusBackdrop } from '../colossus/backdrop/index.js';
import { createCrucibleDevices } from './devices.js';
import { createMagneticRuntime } from '../../core/session-runtime.js';

export default function createLevel() {
  return {
    version: '1.0.0-crucible-foundry',
    event: { type: 'eliminator', firstCut: 22, interval: 10 },
    renderer: {
      world: 'colossus',
      background: '#8c9ba8',
      fog: { color: '#98a7af', density: 0.00016 },
      bloomStrength: 0.05,
      bloomThreshold: 1.1,
      reflectionFar: 13000,
      fillHeight: 100,
      ambientOcclusion: { radius: 10, thickness: 4, blendIntensity: 0.6 },
      sunShadowExtent: 320,
      sunShadowNormalBias: 0.35,
      sunShadowBias: -0.00012,
      catapultBlurScale: 0.4,
    },
    camera: {
      chaseHeight: 7,
      chaseDistance: 18,
      lookAhead: 52,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.62, top: 0.8 },
    },
    createTrack: createCrucibleTrack,
    createRoad: createCrucibleRoad,
    createEnvironment: createCrucibleEnvironment,
    createBackdrop: (context) =>
      createColossusBackdrop({ ...context, sourceSunU: 0.74 }),
    createRuntime: createMagneticRuntime,
    racing: {
      createDevices: createCrucibleDevices,
      createMotion: createMagneticRuntime,
    },
    effects: { refinedSparks: true },
    railContactSparks: true,
  };
}
