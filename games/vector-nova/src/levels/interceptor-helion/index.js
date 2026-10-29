import createHelionLevel from '../helion/index.js';
import { createBossTarget } from '../../ships/boss-targets.js';
import { createRivalPreview } from '../../ships/rivals.js';
import { createHelionBreachTrack } from './track/model.js';
import { createHelionBreachDevices } from './devices.js';

export default function createLevel() {
  // Keep this one base descriptor intact: its player runtime, heat particles
  // and thermal overlay share a private telemetry owner. Rivals keep the same
  // Helion motion factory, including active fire resistance, heat and flight.
  const base = createHelionLevel({ shape: false });
  return {
    ...base,
    version: '1.0.0-helion-breach',
    event: {
      type: 'interceptor',
      targetId: 'wraith',
      bossId: 'wraith',
      escapeLaps: 2,
    },
    createTrack: createHelionBreachTrack,
    racing: {
      ...base.racing,
      createDevices: (track) =>
        createHelionBreachDevices(track, base.racing.createDevices(track)),
      loadRival: (id, { settings = {} } = {}) =>
        id === 'wraith'
          ? createBossTarget(id, settings)
          : createRivalPreview(id, { settings }),
    },
  };
}
