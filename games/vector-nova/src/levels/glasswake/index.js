import { createGlasswakeCollisionWorld } from './collision.js';
import { createDevices } from './devices.js';
import { createGlasswakeTrack, buildGlasswakeRoad } from './track/index.js';
import { createGlasswakeEnvironment } from './environment/index.js';
import { createGlasswakeBackdrop } from './backdrop/index.js';
import { createGlasswakeRuntime } from './runtime.js';
import { createGlasswakeOverlay } from './overlay.js';
import { createGlasswakeShelfAudio } from './audio.js';

export default function createLevel({ shape = false } = {}) {
  let road, track;
  return {
    version: '0.5.1-glasswake-racing',
    audio: { environment: shape ? undefined : createGlasswakeShelfAudio },
    playtests: {
      jump: {
        scenario: 'jump1-success',
        label: 'Jump collision playtest',
        description: 'Production contacts; reset manually between launches.',
        automaticRecovery: false,
      },
    },
    createCollisionWorld: shape ? undefined : createGlasswakeCollisionWorld,
    racing: { createDevices, createMotion: createGlasswakeRuntime },
    renderer: {
      world: shape ? 'glasswake-shape' : 'glasswake-comet',
      background: '#050b1c',
      fog: { color: '#102347', density: shape ? 0 : 0.00014 },
      bloomStrength: 0.08,
      bloomThreshold: 1.1,
      reflectionFar: 2800,
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    createTrack: () => (track = createGlasswakeTrack()),
    createRoad: ({ track, settings }) =>
      (road = buildGlasswakeRoad(track, { shape, settings })),
    createEnvironment: (context) =>
      createGlasswakeEnvironment({ ...context, shape, road }),
    createBackdrop: () => createGlasswakeBackdrop({ shape, track }),
    createRuntime: createGlasswakeRuntime,
    createOverlay: createGlasswakeOverlay,
  };
}
