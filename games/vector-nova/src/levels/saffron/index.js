import { createDevices } from './devices.js';
import { createSaffronCollisionWorld } from './collision.js';
import { createSaffronTrack } from './track/model.js';
import { createSaffronRoad } from './track/road.js';
import { createSaffronEnvironment } from './environment/index.js';
import { createSaffronBackdrop } from './backdrop/index.js';
import {
  createSaffronRuntime,
  createSaffronOverlay,
  SAFFRON_RULES,
} from './runtime.js';

export default function createLevel({ shape = false }) {
  return {
    version: '0.5.1-saffron-v7-rapier-traction',
    renderer: {
      world: shape ? 'saffron-shape' : 'saffron-leviathan',
      background: '#b7a4a2',
      fog: { color: '#b8a5a3', density: 0.00017 },
      bloomStrength: 0.14,
      bloomThreshold: 1.12,
      fillHeight: 28,
      reflectionFar: 2600,
      transmissionResolutionScale: 0.5,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 6.5,
      lookAhead: 47,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.54, top: 0.76 },
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    practiceSectionsUntimed: true,
    railContactSparks: true,
    createTrack: createSaffronTrack,
    createCollisionWorld: createSaffronCollisionWorld,
    createDynamics: async ({ collisionWorld }) => {
      const { createRapierWorld } =
        await import('../../physics/rapier-world.js');
      return createRapierWorld({
        collisionWorld,
        gravity: SAFFRON_RULES.gravity,
      });
    },
    playtests: {
      jump: {
        scenario: 'jump-playtest',
        label: 'SECOND VERTEBRA · JUMP CONTACT TEST',
        automaticRecovery: false,
        cases: [
          {
            id: 'clean-first',
            label: 'First vertebra clean launch',
            scenario: 'jump2-success',
          },
          {
            id: 'clean-second',
            label: 'Second vertebra clean launch',
            scenario: 'jump3-success',
          },
          {
            id: 'approach',
            label: 'Second vertebra approach',
            scenario: 'jump-playtest',
          },
          {
            id: 'short-fall',
            label: 'Short launch / terrain contact',
            scenario: 'jump3-short',
          },
        ],
        description:
          'Choose the second vertebra approach or a short launch into terrain. W / Shift drive; A/D steer. Falls and contacts continue until R repeats the selected case. Untimed solo practice.',
      },
    },
    createRoad: (context) => createSaffronRoad(context, { shape }),
    createEnvironment: (context) =>
      createSaffronEnvironment(context, { shape }),
    createBackdrop: ({ settings }) =>
      createSaffronBackdrop({ settings, shape }),
    racing: { createDevices, createMotion: createSaffronRuntime },
    createRuntime: createSaffronRuntime,
    createOverlay: createSaffronOverlay,
  };
}
