import { createNightweirLockdownTrack } from './track/model.js';
import { createLockdownRoad, createLockdownCollision } from './road.js';
import { createLockdownEnvironment } from './environment/index.js';
import { createNightweirBackdrop } from '../nightweir/backdrop/index.js';
import { createLockdownDevices } from './devices.js';
import { createMagneticRuntime } from '../../core/session-runtime.js';
import { createBossTarget } from '../../ships/boss-targets.js';
import { createRivalPreview } from '../../ships/rivals.js';

export default function createLevel({ shape = false } = {}) {
  return {
    version: '1.0.0-nightweir-lockdown',
    event: {
      type: 'interceptor',
      targetId: 'bulwark',
      bossId: 'bulwark',
      escapeLaps: 2,
    },
    renderer: {
      world: 'nightweir',
      background: '#243a4a',
      fog: { color: '#657682', density: 0.0005 },
      bloomStrength: 0.07,
      bloomThreshold: 1.15,
      reflectionFar: 7000,
      fillHeight: 90,
      sunShadowExtent: 260,
      catapultBlurScale: 0.25,
    },
    camera: {
      chaseHeight: 7,
      chaseDistance: 18,
      lookAhead: 56,
      safeFrame: { left: -0.86, right: 0.86, bottom: -0.62, top: 0.8 },
    },
    createTrack: createNightweirLockdownTrack,
    createRoad: (context) =>
      createLockdownRoad({
        ...context,
        shape,
        renderer: context.view?.renderer,
      }),
    createEnvironment: (context) =>
      createLockdownEnvironment({ ...context, shape }),
    createBackdrop: async (context) => ({
      ...(await createNightweirBackdrop({ ...context, shape })),
      sunColor: '#d9ded8',
      sunIntensity: 2.35,
      ambientSky: '#a1b9c9',
      ambientGround: '#3e535c',
      ambientIntensity: 0.95,
      fillColor: '#9eb9c8',
      fillIntensity: 0.74,
    }),
    createCollisionWorld: createLockdownCollision,
    createRuntime: createMagneticRuntime,
    racing: {
      createDevices: createLockdownDevices,
      createMotion: createMagneticRuntime,
      loadRival: (id, { settings = {} } = {}) =>
        id === 'bulwark'
          ? createBossTarget(id, settings)
          : createRivalPreview(id, { settings }),
    },
    effects: { refinedSparks: true },
    railContactSparks: true,
  };
}
