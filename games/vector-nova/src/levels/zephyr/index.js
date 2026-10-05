import { createZephyrTrack, createZephyrRoad } from './track/index.js';
import { createZephyrEnvironment } from './environment/index.js';
import { createZephyrBackdrop } from './backdrop/index.js';
import { createZephyrOverlay } from './overlay.js';
import { createZephyrRuntime } from './runtime.js';
import { createDevices } from './devices.js';
function spiralView(track, state) {
  const s = ((state.distance % track.length) + track.length) % track.length;
  const { start, end } = track.landmarks.cloudspire;
  const ease = (a, b) => {
    const t = Math.max(0, Math.min(1, (s - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return ease(start + 40, start + 180) * (1 - ease(end - 20, end + 70));
}
export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.6.0-zephyr-v3',
    racing: { createDevices, createMotion: createZephyrRuntime },
    renderer: {
      world: shape ? 'zephyr-shape' : 'zephyr-basilica',
      background: '#a18eac',
      fog: shape ? null : { color: '#b7a8b6', density: 0.00016 },
      bloomStrength: 0.045,
      catapultBlurScale: 0.2,
      bloomThreshold: 1.65,
      reflectionFar: 3600,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: (track, state) => 5 + 19 * spiralView(track, state),
      chaseDistance: (track, state) => 12.5 + 25.5 * spiralView(track, state),
      lookAhead: (track, state) => 38 + 222 * spiralView(track, state),
      safeFrame: (aspect) =>
        aspect >= 1.7
          ? { left: -0.15, right: 0.45, bottom: -0.62, top: 0.45 }
          : { left: -0.65, right: 0.65, bottom: -0.8, top: 0.65 },
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
        distance: track.sections.find((s) => s.id === 'falls').start - 200,
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
