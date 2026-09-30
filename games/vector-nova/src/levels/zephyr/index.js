import { createZephyrTrack, createZephyrRoad } from './track/index.js';
import { createZephyrEnvironment } from './environment/index.js';
import { createZephyrBackdrop } from './backdrop/index.js';
import { createZephyrOverlay } from './overlay.js';
import { createZephyrRuntime } from './runtime.js';
export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.5.0-zephyr-v1',
    renderer: {
      world: shape ? 'zephyr-shape' : 'zephyr-basilica',
      background: '#a18eac',
      fog: shape ? null : { color: '#b7a8b6', density: 0.00027 },
      bloomStrength: 0.16,
      bloomThreshold: 1.15,
      reflectionFar: 3600,
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.45,
    },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    createTrack() {
      const track = createZephyrTrack();
      track.interiors = [
        {
          start: track.landmarks.roseWindow.s - 8,
          end: track.jumps[1].takeoff - 27,
        },
        {
          start: track.landmarks.chapelLanding.s + 32,
          end: track.landmarks.chapelLanding.s + 159,
        },
      ];
      track.curtains = [
        { id: 'falls-curtain', s: track.landmarks.fallsCurtain.s },
        { id: 'chapel-curtain', s: track.landmarks.chapelCurtain.s },
      ];
      track.scenarios['rose-window'] = {
        distance: track.landmarks.roseWindow.s - 70,
        lateral: 0,
        speed: 0,
        heading: 0,
      };
      track.scenarios['nave-wall'] = {
        distance: track.landmarks.nave.s - 60,
        lateral: 0,
        speed: 0,
        heading: 0,
      };
      track.scenarios['falling-tower'] = {
        distance: track.sections.find((s) => s.id === 'falls').start,
        lateral: 0,
        speed: 0,
        heading: 0,
      };
      track.review = {
        ...track.review,
        kind: shape ? 'zephyr-shape' : 'zephyr-production',
      };
      return track;
    },
    createRoad: ({ track, settings }) =>
      createZephyrRoad(track, { shape, settings }),
    createEnvironment: (context) =>
      createZephyrEnvironment({ ...context, shape }),
    createBackdrop: () => createZephyrBackdrop({ shape }),
    createRuntime: createZephyrRuntime,
    createOverlay: shape ? undefined : createZephyrOverlay,
  };
}
