import createHalcyonLevel from '../halcyon/index.js';
import { HALCYON_TRACK_ID } from '../halcyon/devices.js';
import { createInterceptorDevices } from '../interceptor/devices.js';
import { createBossTarget } from '../../ships/boss-targets.js';
import { createRivalPreview } from '../../ships/rivals.js';
import { createHalcyonLockdownTrack } from './track/model.js';

export default function createLevel() {
  const base = createHalcyonLevel();
  return {
    ...base,
    version: '1.0.0-halcyon-lockdown',
    event: {
      type: 'interceptor',
      targetId: 'bulwark',
      bossId: 'bulwark',
      escapeLaps: 2,
    },
    createTrack: createHalcyonLockdownTrack,
    // Halcyon's legacy device identity/scenarios describe a different layout.
    // This course borrows its scenery and geometry, then owns a new layout.
    racing: {
      createDevices: (track) =>
        createInterceptorDevices(track, {
          prefix: 'halcyon-lockdown',
          // The canonical placement factory checks its original track ID.
          supportDevices: base.racing.createDevices({
            ...track,
            id: HALCYON_TRACK_ID,
          }),
        }),
      loadRival: (id, { settings = {} } = {}) =>
        id === 'bulwark'
          ? createBossTarget(id, settings)
          : createRivalPreview(id, { settings }),
    },
  };
}
