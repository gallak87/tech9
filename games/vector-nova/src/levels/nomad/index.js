import { createNomadTrack } from './track/model.js';
import { installNomadMotion } from './motion.js';
import { createNomadRuntime } from './runtime.js';
import { createNomadDynamics } from './dynamics.js';
import { createNomadCollisionWorld } from './collision.js';
import { createNomadRoad } from './track/road.js';
import { createNomadEnvironment } from './environment.js';
import { createNomadBackdrop } from './backdrop.js';
import { createDevices } from './devices.js';

export default function createNomadLevel({ shape = false } = {}) {
  return {
    version: '1.0.0-nomad-v1',
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
    camera: {
      preserveFlightView: true,
      chaseHeight: 7.5,
      chaseDistance: 19,
      lookAhead: 65,
      flightViewScale: 0.85,
      flightChaseBlend: 0.65,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.62, top: 0.8 },
    },
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
