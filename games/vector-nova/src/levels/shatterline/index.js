import { createShatterlineTrack } from './track/model.js';
import { createShatterlineRoad } from './track/road.js';
import { createShatterlineCollisionWorld } from './collision.js';
import { createShatterlineRuntime, SHATTERLINE_RULES } from './runtime.js';
import { createDevices } from './devices.js';
import { createShatterlineEnvironment } from './environment/index.js';
import { createShatterlineBackdrop } from './backdrop/index.js';

export default function createLevel({ shape = false } = {}) {
  const heroes = [
    ['severance', 'The Severance'],
    ['crown-shot', 'The Crown Shot'],
    ['horizon-transfer', 'Horizon Transfer'],
  ];
  return {
    version: '0.7.2-shatterline-exit-nudge',
    renderer: {
      world: 'shatterline',
      background: '#b5c5cb',
      fog: { color: '#c3c1b6', density: 0.000085 },
      bloomStrength: 0.04,
      bloomThreshold: 1.15,
      reflectionFar: 24000,
      fillHeight: 80,
      catapultBlurScale: 0.12,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 7.5,
      chaseDistance: 16,
      lookAhead: 65,
      jumpPreview: {
        distance: 250,
        height: (_track, _state, jump) => (jump?.hero ? 30 : 18),
        back: 18,
      },
      flightViewScale: 0.82,
      flightChaseBlend: 0.65,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.6, top: 0.8 },
    },
    createTrack: createShatterlineTrack,
    createRoad: (context) => createShatterlineRoad({ ...context, shape }),
    createEnvironment: (context) =>
      createShatterlineEnvironment({ ...context, shape }),
    createBackdrop: (context) =>
      createShatterlineBackdrop({ ...context, shape }),
    createCollisionWorld: createShatterlineCollisionWorld,
    async createDynamics({ collisionWorld }) {
      const { createRapierWorld } =
        await import('../../physics/rapier-world.js');
      return createRapierWorld({
        collisionWorld,
        gravity: SHATTERLINE_RULES.gravity,
      });
    },
    createRuntime: createShatterlineRuntime,
    racing: { createDevices, createMotion: createShatterlineRuntime },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    playtests: {
      jump: {
        scenario: 'severance-approach',
        label: 'SHATTERLINE · FLIGHT LAB',
        automaticRecovery: false,
        description:
          'Select a signature jump or district. W / Shift drive, A/D steer, R repeats. No automatic recovery in flight tests; F opens free camera.',
        cases: [
          ...heroes.flatMap(([id, label]) => [
            {
              id: `${id}-approach`,
              label: `${label} · approach`,
              scenario: `${id}-approach`,
            },
            {
              id: `${id}-launch`,
              label: `${label} · nominal launch`,
              scenario: `${id}-launch`,
            },
            {
              id: `${id}-short`,
              label: `${label} · short contact`,
              scenario: `${id}-short`,
            },
            {
              id: `${id}-landing`,
              label: `${label} · receiving deck`,
              scenario: `${id}-landing`,
            },
          ]),
          ...[
            ['summit-chute', 'Summit Chute'],
            ['service-corkscrew', 'Service Corkscrew'],
            ['overturn-descent', 'Overturn Weave'],
            ['avalanche-sweep', 'Avalanche Sweep'],
            ['scissor-dive', 'Scissor Dive'],
          ].flatMap(([id, label]) => [
            {
              id: `${id}-approach`,
              label: `${label} · drive`,
              scenario: `${id}-approach`,
            },
            {
              id: `${id}-showcase`,
              label: `${label} · fly camera`,
              scenario: `${id}-showcase`,
            },
          ]),
          ...['summit', 'service', 'fracture'].map((id) => ({
            id: `${id}-showcase`,
            label: `${id} · fly camera start`,
            scenario: `${id}-showcase`,
          })),
          {
            id: 'scissor-underpass',
            label: 'Scissor Dive · underpass',
            scenario: 'scissor-underpass-approach',
          },
          {
            id: 'scissor-transfer',
            label: 'Scissor Transfer · medium flight',
            scenario: 'last-relay-approach',
          },
          ...[
            ['tube-entry', 'Overturn Weave · full sequence'],
            ['tube-1-entry', 'Left tube · entry'],
            ['tube-1-mid', 'Left tube · free 360° drive'],
            ['tube-1-exit', 'Left tube · guided exit'],
            ['tube-weave', 'Overturn Weave · exposed corkscrew'],
            ['tube-2-entry', 'Right tube · entry'],
            ['tube-2-mid', 'Right tube · free 360° drive'],
            ['tube-2-exit', 'Right tube · guided exit'],
            ['tube-mid', 'Left tube · free 360° drive'],
            ['tube-ceiling', 'Left tube · ceiling drive'],
            ['tube-exit', 'Overturn Weave · final guided exit'],
            ['tube-collector-wall', 'Left tube · wall-side collector'],
          ].map(([id, label]) => ({ id, label, scenario: id })),
          {
            id: 'finish',
            label: 'Finish and runout',
            scenario: 'finish-approach',
          },
        ],
      },
    },
  };
}
