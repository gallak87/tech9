import { createWorldspireTrack } from './track/model.js';
import { createWorldspireRoad } from './track/road.js';
import { createWorldspireRuntime, WORLDSPIRE_RULES } from './runtime.js';
import { createDevices } from './devices.js';
import { createWorldspireEnvironment } from './environment/index.js';
import { createWorldspireBackdrop } from './backdrop/index.js';
import { createWorldspireCollisionWorld } from './collision.js';
export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.4.0-worldspire',
    renderer: {
      world: 'worldspire',
      background: '#b4c5cf',
      fog: { color: '#bac5c9', density: 0.00005 },
      bloomStrength: 0.035,
      bloomThreshold: 1.15,
      reflectionFar: 22000,
      fillHeight: 70,
      catapultBlurScale: 0.12,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 7.5,
      chaseDistance: 17,
      lookAhead: 65,
      jumpPreview: {
        distance: 230,
        height: (_t, _s, j) => (j?.hero ? 27 : 17),
        back: 17,
      },
      flightViewScale: 0.82,
      flightChaseBlend: 0.65,
      portraitAspect: 0.64,
      maxPortraitScale: 1.35,
      safeFrame: (aspect) => ({
        left: -0.86,
        right: 0.86,
        bottom: aspect < 1 ? -0.48 : -0.6,
        top: 0.8,
      }),
    },
    createTrack: createWorldspireTrack,
    createRoad: (c) =>
      createWorldspireRoad({ ...c, shape, renderer: c.view?.renderer }),
    createEnvironment: (c) => createWorldspireEnvironment({ ...c, shape }),
    createBackdrop: (c) => createWorldspireBackdrop({ ...c, shape }),
    createCollisionWorld: createWorldspireCollisionWorld,
    async createDynamics({ collisionWorld }) {
      const { createRapierWorld } =
        await import('../../physics/rapier-world.js');
      return createRapierWorld({
        collisionWorld,
        gravity: WORLDSPIRE_RULES.gravity,
      });
    },
    createRuntime: createWorldspireRuntime,
    racing: { createDevices, createMotion: createWorldspireRuntime },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    playtests: {
      jump: {
        scenario: 'crown-break-approach',
        label: 'WORLDSPIRE / FULL DESCENT',
        automaticRecovery: false,
        description:
          'Full descent. W / Shift drive, A/D steer, R repeats; F opens free camera.',
        cases: [
          ...[
            'crown-break',
            'buttress-cut',
            'heart-chasm',
            'daylight-leap',
            'mantle-shear',
            'vault-entry',
            'echo-chasm',
            'vault-exit',
            'root-gate',
          ].flatMap((id) => [
            {
              id: id + '-approach',
              label: id + ' approach',
              scenario: id + '-approach',
            },
            {
              id: id + '-launch',
              label: id + ' launch',
              scenario: id + '-launch',
            },
          ]),
          { id: 'coil', label: 'Sunward Corkscrew', scenario: 'coil-approach' },
          {
            id: 'heart',
            label: 'Through the spire',
            scenario: 'heart-approach',
          },
          { id: 'vault', label: 'The Split Vault', scenario: 'vault-approach' },
          {
            id: 'mantle-coil',
            label: 'Reverse Mantle Corkscrew',
            scenario: 'mantle-coil-approach',
          },
          {
            id: 'root-coil',
            label: 'Root Corkscrew',
            scenario: 'root-coil-approach',
          },
          {
            id: 'finish',
            label: 'Root Gate finish',
            scenario: 'finish-approach',
          },
        ],
      },
    },
  };
}
