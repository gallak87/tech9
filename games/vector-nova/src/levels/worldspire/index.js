import { createWorldspireTrack } from './track/model.js';
import { createWorldspireRoad } from './track/road.js';
import { createWorldspireRuntime, WORLDSPIRE_RULES } from './runtime.js';
import { createDevices } from './devices.js';
import { createWorldspireEnvironment } from './environment/index.js';
import { createWorldspireBackdrop } from './backdrop/index.js';
import { createWorldspireCollisionWorld } from './collision.js';
// Large drops need a gentle camera pullback while the view still follows the
// road ahead; aiming straight at the low receiver hides the approaching world.
function jumpApproach(track, state, ordinary, hero, minor) {
  const jump = track.jumps.find(
    (j) => j.takeoff >= state.distance && j.takeoff - state.distance < 240,
  );
  if (!jump) return ordinary;
  const t = Math.max(
    0,
    Math.min(1, (240 - (jump.takeoff - state.distance)) / 140),
  );
  return (
    ordinary + ((jump.hero ? hero : minor) - ordinary) * t * t * (3 - 2 * t)
  );
}

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
      // The mineral shelves exceed the ordinary road-sized shadow footprint.
      // Keep nearby chamber returns and receiver supports in the same sunlight.
      sunShadowExtent: 600,
      sunShadowNormalBias: 0.1,
      sunShadowBias: -0.0004,
      catapultBlurScale: 0.12,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: (track, state) => jumpApproach(track, state, 7.5, 11, 10),
      chaseDistance: (track, state) => jumpApproach(track, state, 17, 24, 22),
      lookAhead: 65,
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
            'mantle-shear',
            'vault-entry',
            'echo-chasm',
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
