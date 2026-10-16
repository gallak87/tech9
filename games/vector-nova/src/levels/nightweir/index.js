import { createNightweirTrack } from './track/model.js';
import { createNightweirRoad } from './track/road.js';
import { createNightweirRuntime, NIGHTWEIR_RULES } from './runtime.js';
import { createDevices } from './devices.js';
import { createNightweirEnvironment } from './environment/index.js';
import { createNightweirBackdrop } from './backdrop/index.js';
import { createNightweirCollisionWorld } from './collision.js';
// The receiving shelves sit hundreds of metres below their lips. Keep the
// ordinary forward aim while pulling back gently: targeting the distant shelf
// during the approach pitches the camera into the road and hides the city.
function jumpApproach(track, state, ordinary, hero, minor) {
  const jump = track.jumps.find((candidate) => {
    const remaining = candidate.takeoff - state.distance;
    return remaining >= 0 && remaining < 230;
  });
  if (!jump) return ordinary;
  const t = Math.max(
    0,
    Math.min(1, (230 - (jump.takeoff - state.distance)) / 115),
  );
  const blend = t * t * (3 - 2 * t);
  return ordinary + ((jump.hero ? hero : minor) - ordinary) * blend;
}

export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.2.0-nightweir',
    renderer: {
      world: 'nightweir',
      background: '#243a4a',
      fog: { color: '#657682', density: 0.00038 },
      bloomStrength: 0.07,
      bloomThreshold: 1.15,
      reflectionFar: 22000,
      fillHeight: 70,
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
    createTrack: createNightweirTrack,
    createRoad: (c) =>
      createNightweirRoad({ ...c, shape, renderer: c.view?.renderer }),
    createEnvironment: (c) => createNightweirEnvironment({ ...c, shape }),
    createBackdrop: (c) => createNightweirBackdrop({ ...c, shape }),
    createCollisionWorld: createNightweirCollisionWorld,
    async createDynamics({ collisionWorld }) {
      const { createRapierWorld } =
        await import('../../physics/rapier-world.js');
      return createRapierWorld({
        collisionWorld,
        gravity: NIGHTWEIR_RULES.gravity,
      });
    },
    createRuntime: createNightweirRuntime,
    racing: { createDevices, createMotion: createNightweirRuntime },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    playtests: {
      jump: {
        scenario: 'upper-lock-approach',
        label: 'NIGHTWEIR / FULL DESCENT',
        automaticRecovery: false,
        description:
          'Full stormwater sprint. W / Shift drive, A/D steer, R repeats; F opens free camera.',
        cases: [
          ...[
            'upper-lock',
            'terrace-cut',
            'spillway-leap',
            'market-cut',
            'turbine-leap',
            'canal-shear',
            'low-weir',
            'harbor-leap',
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
          {
            id: 'finish',
            label: 'Receiving Quay',
            scenario: 'finish-approach',
          },
        ],
      },
    },
  };
}
