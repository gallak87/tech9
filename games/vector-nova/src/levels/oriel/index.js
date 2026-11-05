import { createOrielTrack, createOrielRoad } from './track/index.js';
import { createOrielRuntime } from './runtime.js';
import { createOrielCollisionWorld } from './collision.js';
import { createDevices } from './devices.js';
import { createOrielEnvironment } from './environment/index.js';
import { createOrielBackdrop } from './backdrop/index.js';

export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.1.0-oriel-inward-world',
    playtests: {
      jump: {
        scenario: 'jump1-success',
        label: 'Oriel transfer playtest',
        description: 'Production contacts; reset manually between launches.',
        automaticRecovery: false,
        cases: [
          { id: 'terrace', label: 'Terrace flight', scenario: 'jump1-success' },
          {
            id: 'sunline',
            label: 'Sunline transfer',
            scenario: 'jump2-success',
          },
        ],
      },
    },
    racing: { createDevices, createMotion: createOrielRuntime },
    renderer: {
      world: shape ? 'oriel-shape' : 'oriel-inward-world',
      background: '#b5c7bc',
      fog: { color: '#a5c6cf', density: 0.00026 },
      bloomStrength: 0.045,
      bloomThreshold: 1.8,
      catapultBlurScale: 0.28,
      reflectionFar: 6000,
      sunShadowExtent: 190,
      ambientOcclusion: { radius: 3, thickness: 1.2, blendIntensity: 0.48 },
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 7.0,
      chaseDistance: 17,
      lookAhead: 56,
      jumpPreview: { distance: 180, height: 13, back: 27 },
      safeFrame: { left: -0.6, right: 0.6, bottom: -0.79, top: 0.55 },
      portraitAspect: 0.64,
      maxPortraitScale: 1.4,
    },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    createTrack: createOrielTrack,
    createRoad: ({ track, settings }) =>
      createOrielRoad(track, { shape, settings }),
    createEnvironment: (context) =>
      createOrielEnvironment({ ...context, shape }),
    createBackdrop: createOrielBackdrop,
    createRuntime: createOrielRuntime,
    createCollisionWorld: shape ? undefined : createOrielCollisionWorld,
  };
}
