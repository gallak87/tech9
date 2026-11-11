import { createMagneticRuntime } from '../core/session-runtime.js';
import { createDeviceLayout } from '../pickups/layout.js';
import { createEliminatorRoad } from './eliminator-road.js';

export function createEliminatorDevices(track) {
  return createDeviceLayout(
    track,
    [
      ['vector', 0.025, 0, 22, 60],
      ['arc', 0.15, -11, 8, 11],
      ['aegis', 0.18, 11, 8, 9],
      ['vector', 0.29, 0, 22, 60],
      ['repulsor', 0.39, 11, 8, 11],
      ['arc', 0.44, -11, 8, 11],
      ['vector', 0.55, 0, 22, 60],
      ['aegis', 0.65, -11, 8, 9],
      ['ion', 0.69, 11, 8, 11],
      ['vector', 0.79, 0, 22, 60],
      ['repulsor', 0.89, -11, 8, 11],
      ['aegis', 0.94, 11, 8, 9],
    ].map(([type, f, lateral, width, length], i) => ({
      id: `course-${type}-${i}`,
      type,
      distance: f * track.length,
      lateral,
      width,
      length,
      label: `${type} lane`,
    })),
  );
}

export function createEliminatorCourse({
  id,
  createTrack,
  createEnvironment,
  createBackdrop,
  renderer = {},
  palette,
}) {
  return {
    version: `1.0.0-${id}`,
    event: { type: 'eliminator', firstCut: 22, interval: 10 },
    renderer: {
      world: id,
      background: '#83939f',
      fog: { color: '#8c9eaa', density: 0.0001 },
      bloomStrength: 0.045,
      bloomThreshold: 1.2,
      reflectionFar: 12000,
      catapultBlurScale: 0.35,
      ...renderer,
    },
    camera: {
      chaseHeight: 7,
      chaseDistance: 18,
      lookAhead: 52,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.62, top: 0.8 },
    },
    createTrack,
    createEnvironment,
    createBackdrop,
    createRoad: (context) => createEliminatorRoad(context, palette),
    createRuntime: createMagneticRuntime,
    racing: {
      createDevices: createEliminatorDevices,
      createMotion: createMagneticRuntime,
    },
    effects: { refinedSparks: true },
    railContactSparks: true,
  };
}
