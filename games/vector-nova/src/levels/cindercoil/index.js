import { createDevices } from './devices.js';
import { createCindercoilCollisionWorld } from './collision.js';
import * as T from 'three';
import { createCindercoilTrack, createCindercoilRoad } from './track/index.js';
import { createCindercoilEnvironment } from './environment/index.js';
import { createCindercoilBackdrop } from './backdrop/index.js';
import { createCindercoilRuntime } from './runtime.js';
import { createCindercoilCues } from './cues.js';
import { createCindercoilOverlay } from './overlay.js';

export default function createLevel({ shape = false }) {
  return {
    version: '0.5.1-cindercoil-racing',
    racing: { createDevices, createMotion: createCindercoilRuntime },
    renderer: {
      world: shape ? 'cindercoil-shape' : 'cindercoil-caldera',
      background: '#303c49',
      fog: { color: '#3c4854', density: 0.0004 },
      bloomStrength: 0.35,
      bloomThreshold: 1.25,
      reflectionFar: 4200,
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    practiceSectionsUntimed: true,
    railContactSparks: true,
    createTrack: createCindercoilTrack,
    createCollisionWorld: shape ? undefined : createCindercoilCollisionWorld,
    createDynamics: shape
      ? undefined
      : async ({ collisionWorld }) => {
          const { createRapierWorld } =
            await import('../../physics/rapier-world.js');
          return createRapierWorld({ collisionWorld });
        },
    playtests: {
      jump: {
        scenario: 'vent-clean',
        label: 'VENT JUMP · CONTACT TEST',
        automaticRecovery: false,
        cases: [
          {
            id: 'clean',
            label: 'Calm aligned landing',
            scenario: 'vent-clean',
          },
          {
            id: 'short',
            label: 'Short launch / ramp underside',
            scenario: 'vent-short',
          },
          {
            id: 'left',
            label: 'Left barrier catch',
            scenario: 'vent-edge-left',
          },
          {
            id: 'right',
            label: 'Right barrier catch',
            scenario: 'vent-edge-right',
          },
          {
            id: 'erupting',
            label: 'Erupting vent crossing',
            scenario: 'vent-erupting',
          },
        ],
        description:
          'Choose a vent-jump case. W / Shift drive; A/D steer. Falls continue until R repeats the selected case. Untimed solo contact testing.',
      },
    },
    createRoad: (context) => createCindercoilRoad({ ...context, shape }),
    async createEnvironment(context) {
      let world;
      let cues;
      try {
        world = await createCindercoilEnvironment({ ...context, shape });
        cues = createCindercoilCues(context.track, shape);
        const group = new T.Group();
        group.add(world.group, cues.group);
        group.userData.metrics = world.group.userData.metrics;
        group.userData.clearanceReport = world.group.userData.clearanceReport;
        return {
          group,
          ready: world.ready,
          update(frame) {
            world.group.userData.setOverview?.(frame.reviewing);
            world.update?.(frame);
            cues.update(frame);
          },
          reset(frame) {
            world.reset?.(frame);
          },
          setReflection(texture) {
            world.setReflection?.(texture);
          },
          dispose() {
            world.dispose();
            cues.dispose();
            group.clear();
          },
        };
      } catch (error) {
        world?.dispose();
        cues?.dispose();
        throw error;
      }
    },
    createBackdrop: ({ settings }) =>
      createCindercoilBackdrop({ shape, settings }),
    createRuntime: createCindercoilRuntime,
    createOverlay: createCindercoilOverlay,
  };
}
