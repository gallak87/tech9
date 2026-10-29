import createCrucibleLevel from '../crucible/index.js';
import { createInterceptorTrack } from './track/model.js';
import { createInterceptorDevices } from './devices.js';
import { createInterceptorTarget } from '../../ships/interceptor-target.js';
import { createRivalPreview } from '../../ships/rivals.js';

export default function createLevel() {
  const base = createCrucibleLevel();
  return {
    ...base,
    version: '1.0.0-interceptor-dispatch',
    event: {
      type: 'interceptor',
      targetId: 'goliath',
      health: 240,
      escapeLaps: 2,
    },
    createTrack: createInterceptorTrack,
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
