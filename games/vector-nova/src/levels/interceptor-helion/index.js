import createHelionLevel from '../helion/index.js';
import { createBossTarget } from '../../ships/boss-targets.js';
import { createRivalPreview } from '../../ships/rivals.js';
import { createHelionBreachTrack } from './track/model.js';
import { createHelionBreachDevices } from './devices.js';
import { createBreachArchitecture } from './architecture.js';

export default function createLevel() {
  // Keep this one base descriptor intact: its player runtime, heat particles
  // and thermal overlay share a private telemetry owner. Rivals keep the same
  // Helion motion factory, including active fire resistance, heat and flight.
  const base = createHelionLevel({
    shape: false,
    environmentOptions: {
      sitePlan: [
        {
          name: 'Sunshield',
          fraction: 0.19,
          lateral: -150,
          lift: -53,
          scale: 1.12,
          yaw: 1.4,
        },
        {
          name: 'Sunshield',
          fraction: 0.29,
          lateral: -180,
          lift: -53,
          scale: 1.9,
          yaw: 1.57,
        },
        {
          name: 'Sunshield',
          fraction: 0.79,
          lateral: -160,
          lift: -53,
          scale: 1.25,
          yaw: 1.4,
        },
        {
          name: 'Sunshield',
          fraction: 0.94,
          lateral: 145,
          lift: -53,
          scale: 1,
          yaw: 1.6,
        },
        {
          name: 'RadiatorFan',
          fraction: 0.14,
          lateral: 132,
          lift: -18,
          scale: 1.1,
          yaw: 0.3,
        },
        {
          name: 'RadiatorFan',
          fraction: 0.21,
          lateral: 140,
          lift: -18,
          scale: 1.35,
          yaw: -0.6,
        },
        {
          name: 'RadiatorFan',
          fraction: 0.37,
          lateral: -115,
          lift: -18,
          scale: 0.72,
          yaw: -0.3,
        },
        {
          name: 'RadiatorFan',
          fraction: 0.83,
          lateral: 125,
          lift: -18,
          scale: 0.7,
          yaw: 0.3,
        },
        {
          name: 'RadiatorFan',
          fraction: 0.91,
          lateral: -130,
          lift: -18,
          scale: 0.8,
          yaw: -0.4,
        },
        {
          name: 'InstrumentTower',
          fraction: 0.245,
          lateral: -95,
          lift: -35,
          scale: 1.15,
          yaw: 0.25,
        },
        {
          name: 'InstrumentTower',
          fraction: 0.9,
          lateral: 145,
          lift: -38,
          scale: 0.65,
          yaw: 0.4,
        },
        {
          name: 'Sunshield',
          fraction: 0.72,
          lateral: 900,
          lift: -240,
          scale: 3,
          yaw: 1.75,
        },
        {
          name: 'RadiatorFan',
          fraction: 0.52,
          lateral: -720,
          lift: -130,
          scale: 2.2,
          yaw: 0.5,
        },
      ],
    },
  });
  return {
    ...base,
    version: '1.0.0-helion-breach',
    renderer: {
      ...base.renderer,
      sunShadowExtent: 310,
      sunShadowNormalBias: 0.08,
    },
    async createBackdrop(context) {
      const backdrop = await base.createBackdrop(context);
      return {
        ...backdrop,
        sunColor: '#ffe4c7',
        sunIntensity: 2.8,
        ambientSky: '#a6c7e4',
        ambientGround: '#29202a',
        ambientIntensity: 0.62,
        fillColor: '#8cb6db',
        fillIntensity: 0.66,
      };
    },
    event: {
      type: 'interceptor',
      targetId: 'wraith',
      bossId: 'wraith',
      escapeLaps: 2,
    },
    createTrack: createHelionBreachTrack,
    async createEnvironment(context) {
      const environment = await base.createEnvironment(context);
      let architecture;
      try {
        architecture = createBreachArchitecture(context);
        environment.group.add(architecture.group);
      } catch (error) {
        environment.dispose();
        throw error;
      }
      return {
        ...environment,
        setReflection(texture) {
          environment.setReflection?.(texture);
          architecture.setReflection(texture);
        },
        dispose() {
          architecture.group.removeFromParent();
          architecture.dispose();
          environment.dispose();
        },
      };
    },
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
