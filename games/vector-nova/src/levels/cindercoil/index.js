import * as T from 'three';
import { createCindercoilTrack, createCindercoilRoad } from './track/index.js';
import { createCindercoilEnvironment } from './environment/index.js';
import { createCindercoilBackdrop } from './backdrop/index.js';
import { createCindercoilRuntime } from './runtime.js';
import { createCindercoilCues } from './cues.js';
import { createCindercoilOverlay } from './overlay.js';

export default function createLevel({ shape = false }) {
  let runtime;
  return {
    version: '0.5.0-cindercoil-v1',
    renderer: {
      world: shape ? 'cindercoil-shape' : 'cindercoil-caldera',
      background: '#303c49',
      fog: { color: '#3c4854', density: 0.00016 },
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
    createRuntime(context) {
      runtime = createCindercoilRuntime(context);
      return runtime;
    },
    createOverlay: (context) =>
      createCindercoilOverlay({
        ...context,
        readRuntime: () => runtime?.snapshot(),
      }),
  };
}
