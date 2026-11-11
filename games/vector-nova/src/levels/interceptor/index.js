import createCrucibleLevel from '../crucible/base.js';
import { createInterceptorTrack } from './track/model.js';
import { createInterceptorDevices } from './devices.js';
import { createInterceptorEnvironment } from './environment.js';
import { createInterceptorTarget } from '../../ships/interceptor-target.js';
import { createRivalPreview } from '../../ships/rivals.js';

export default function createLevel() {
  const base = createCrucibleLevel();
  return {
    ...base,
    version: '1.2.0-interceptor-dispatch',
    renderer: {
      ...base.renderer,
      fog: { color: '#8e9fa9', density: 0.00018 },
    },
    async createBackdrop(context) {
      const backdrop = await base.createBackdrop(context);
      return {
        ...backdrop,
        ambientSky: '#9abbd1',
        ambientGround: '#556167',
        ambientIntensity: 0.75,
        fillColor: '#bad4eb',
        fillIntensity: 1.0,
        environmentIntensity: 0.8,
      };
    },
    event: {
      type: 'interceptor',
      targetId: 'goliath',
      bossId: 'goliath',
      escapeLaps: 2,
    },
    createTrack: createInterceptorTrack,
    createEnvironment: createInterceptorEnvironment,
    racing: {
      ...base.racing,
      createDevices: createInterceptorDevices,
      loadRival: (id, { settings = {} } = {}) =>
        id === 'goliath'
          ? createInterceptorTarget(settings)
          : createRivalPreview(id, { settings }),
    },
  };
}
