import { createNomadTrack } from './track/model.js';
import { installNomadMotion } from './motion.js';
import { createNomadRuntime } from './runtime.js';
import { createNomadDynamics } from './dynamics.js';
import { createNomadCollisionWorld } from './collision.js';
import { createNomadRoad } from './track/road.js';
import { createNomadEnvironment } from './environment.js';
import { createNomadBackdrop } from './backdrop.js';
import { createDevices } from './devices.js';
import { NOMAD_CAMERA } from './camera.js';

export default function createNomadLevel({ shape = false } = {}) {
  return {
    version: '1.1.0-nomad-v2',
    renderer: {
      world: 'nomad',
      background: '#d8d9d3',
      fog: { color: '#d4d5cc', density: 0.000055 },
      bloomStrength: 0.025,
      bloomThreshold: 1.4,
      reflectionFar: 26000,
      fillHeight: 90,
      sunShadowExtent: 340,
      sunShadowNormalBias: 0.35,
      sunShadowBias: -0.00012,
      catapultBlurScale: 0.12,
    },
    camera: NOMAD_CAMERA,
    createTrack() {
      const track = installNomadMotion(createNomadTrack());
      track.deviceProjection = 'rendered-surface';
      return track;
    },
    createRoad: (context) => createNomadRoad({ ...context, shape }),
    createEnvironment: (context) =>
      createNomadEnvironment({ ...context, shape }),
    createBackdrop: (context) => createNomadBackdrop({ ...context, shape }),
    createCollisionWorld: createNomadCollisionWorld,
    createDynamics: createNomadDynamics,
    createRuntime: createNomadRuntime,
    racing: {
      createDevices,
      createMotion: createNomadRuntime,
      finishMarker: { width: 48 },
    },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    playtests: {
      jump: {
        scenario: 'overtake-approach',
        label: 'NOMAD / MOVING CONVOY LAB',
        automaticRecovery: false,
        description:
          'Drive through the carriers and intercept their moving decks. Normal Practice retains timed recovery.',
        cases: [
          ['cargo-entry', 'Cargo hall'],
          ['hull-ascent', 'Hull ascent'],
          ['hull-descent', 'Hull descent'],
          ['overtake-approach', 'Overtaking transfer'],
          ['terminus-approach', 'Convoy terminus'],
        ].map(([id, label]) => ({ id, label, scenario: id })),
      },
    },
  };
}
