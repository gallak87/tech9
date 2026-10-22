import { createColossusTrack } from './track/model.js';
import { createColossusRoad } from './track/road.js';
import { createColossusEnvironment } from './environment/index.js';
import { createColossusBackdrop } from './backdrop/index.js';
import { createColossusCollisionWorld } from './collision.js';
import { createColossusDynamics } from './dynamics.js';
import { createColossusRuntime } from './runtime.js';
import { createDevices } from './devices.js';
export default function createLevel({ shape = false } = {}) {
  return {
    version: '1.1.0-colossus-v6',
    renderer: {
      world: 'colossus',
      background: '#a7b3b9',
      fog: { color: '#acb4b6', density: 0.00022 },
      bloomStrength: 0.025,
      bloomThreshold: 1.1,
      reflectionFar: 16000,
      fillHeight: 90,
      ambientOcclusion: { radius: 12, thickness: 4, blendIntensity: 0.78 },
      sunShadowExtent: 320,
      sunShadowNormalBias: 0.35,
      sunShadowBias: -0.00012,
      catapultBlurScale: 0.12,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 7.5,
      chaseDistance: 18,
      lookAhead: 58,
      flightViewScale: 0.85,
      flightChaseBlend: 0.65,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.62, top: 0.8 },
    },
    createTrack: createColossusTrack,
    createRoad: (c) => createColossusRoad({ ...c, shape }),
    createEnvironment: (c) => createColossusEnvironment({ ...c, shape }),
    createBackdrop: createColossusBackdrop,
    createCollisionWorld: createColossusCollisionWorld,
    createDynamics: createColossusDynamics,
    createRuntime: createColossusRuntime,
    racing: { createDevices, createMotion: createColossusRuntime },
    effects: { refinedSparks: !shape },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    playtests: {
      jump: {
        scenario: 'die-transfer-approach',
        label: 'COLOSSUS / MACHINERY PLAYTEST',
        automaticRecovery: false,
        description:
          'W / Shift drive. A/D steer. R repeats. Normal Practice retains automatic recovery.',
        cases: [
          ['die-transfer', 'Broken Die Transfer'],
          ['gantry-flight', 'Gantry Flight'],
          ['dispatch-cut', 'Dispatch Cut'],
          ['ejector', 'Horizontal ejector'],
          ['ejector-two', 'Reverse ejector'],
          ['press', 'Working presses'],
          ['press-impact', 'Deliberate press impact'],
          ['ejector-impact', 'Deliberate ejector impact'],
          ['crossfeed', 'Sideways belts'],
          ['screw', 'Screw feed wall roll'],
          ['auger', 'Reverse auger'],
          ['dive', 'Discharge dive'],
          ['rise', 'Counterweight ascent'],
          ['cooling', 'Cooling drum reversals'],
          ['headstock', 'Headstock hairpin'],
          ['finish', 'Lap seam'],
        ].map(([id, label]) => ({
          id,
          label,
          scenario: id.endsWith('-impact') ? id : id + '-approach',
        })),
      },
    },
  };
}
