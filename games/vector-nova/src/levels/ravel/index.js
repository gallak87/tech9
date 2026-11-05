import { createRavelTrack } from './track/model.js';
import { installRavelBranches } from './track/branches.js';
import { installRavelSheets } from './track/sheets.js';
import { installRavelWaves } from './waves.js';
import {
  createRavelRuntime,
  RAVEL_FLIGHT_RULES,
  RAVEL_PLAYTEST_CASES,
} from './runtime.js';
import { createRavelRoad } from './track/road.js';
import { createRavelEnvironment } from './environment.js';
import { createRavelBackdrop } from './backdrop.js';
import { createRavelCollisionWorld } from './collision.js';
import { createDevices } from './devices.js';
import { createRavelOverlay } from './overlay.js';

export function createPlayableRavelTrack() {
  const track = createRavelTrack();
  installRavelBranches(track);
  installRavelSheets(track, { includeAdditional: true });
  track.width = 1500;
  track.deviceOutlineSkirts = true;
  installRavelWaves(track);
  // Reinforced seams are visibly open low edges; crossing them loses support.
  track.boundaryIntervals = [];
  track.aiLaneSpeedLimit = 24;
  track.aiSurfacePreview = true;
  const colors = { inner: '#9fc9ad', middle: '#a9c9e3', outer: '#d9be8a' };
  track.mapPaths = track.roadBands.map((band) => {
    const count = Math.max(2, Math.ceil((band.end - band.start) / 22));
    const points = Array.from({ length: count + 1 }, (_, i) => {
      const s = band.start + ((band.end - band.start) * i) / count;
      const low = typeof band.min === 'function' ? band.min(s) : band.min;
      const high = typeof band.max === 'function' ? band.max(s) : band.max;
      return track.branchPoint(s, (low + high) / 2);
    });
    return { points, color: colors[band.branch] ?? '#dbe8e1cc', closed: false };
  });
  return track;
}

export default function createLevel() {
  return {
    version: '1.0.0',
    renderer: {
      world: 'ravel',
      background: '#070d18',
      fog: { color: '#111522', density: 0.000025 },
      bloomStrength: 0.03,
      bloomThreshold: 1.4,
      reflectionFar: 22000,
      fillHeight: 90,
      catapultBlurScale: 0.12,
    },
    camera: {
      preserveFlightView: true,
      chaseHeight: 8,
      chaseDistance: 20,
      lookAhead: 70,
      flightViewScale: 0.85,
      flightChaseBlend: 0.7,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.6, top: 0.8 },
    },
    createTrack: createPlayableRavelTrack,
    createRoad: createRavelRoad,
    createEnvironment: createRavelEnvironment,
    createOverlay: createRavelOverlay,
    createBackdrop: createRavelBackdrop,
    createCollisionWorld: createRavelCollisionWorld,
    async createDynamics({ collisionWorld }) {
      const { createRapierWorld } =
        await import('../../physics/rapier-world.js');
      return createRapierWorld({
        collisionWorld,
        gravity: RAVEL_FLIGHT_RULES.gravity,
      });
    },
    createRuntime: createRavelRuntime,
    racing: {
      createDevices,
      createMotion: createRavelRuntime,
      finishMarker: { width: 98 },
    },
    practiceSectionsUntimed: true,
    railContactSparks: true,
    playtests: {
      jump: {
        scenario: 'wave-approach',
        label: 'RAVEL / SAIL AND FLIGHT LAB',
        automaticRecovery: false,
        description:
          'Choose a wave, ribbon or jump. W / Shift drive, A/D steer; R repeats the selected case. F opens free camera. Practice uses timed automatic recovery.',
        cases: RAVEL_PLAYTEST_CASES,
      },
    },
  };
}
