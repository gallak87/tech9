import createOrbitalLevel from '../orbital/index.js';
import { createInterceptorDevices } from '../interceptor/devices.js';
import { createBossTarget } from '../../ships/boss-targets.js';
import { createRivalPreview } from '../../ships/rivals.js';
import { createAsterionInterceptTrack } from './track/model.js';

export default function createLevel() {
  const base = createOrbitalLevel({ shape: false });
  return {
    ...base,
    version: '1.0.0-asterion-intercept',
    event: {
      type: 'interceptor',
      targetId: 'wraith',
      bossId: 'wraith',
      escapeLaps: 2,
    },
    createTrack: createAsterionInterceptTrack,
    racing: {
      createDevices: (track) =>
        createInterceptorDevices(track, {
          prefix: 'asterion-intercept',
          supportDevices: base.racing.createDevices(track),
        }),
      loadRival: (id, { settings = {} } = {}) =>
        id === 'wraith'
          ? createBossTarget(id, settings)
          : createRivalPreview(id, { settings }),
    },
  };
}
