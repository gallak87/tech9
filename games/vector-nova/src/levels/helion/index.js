import * as T from 'three';
import { createDevices } from './devices.js';
import { createHelionTrack, buildHelionRoad } from './track/index.js';
import { createHelionEnvironment } from './environment/index.js';
import { createHelionBackdrop } from './backdrop/index.js';
import { createHelionRuntime } from './runtime.js';
import { createHelionOverlay } from './overlay.js';
import { withShipHeatEffects } from './ship-heat.js';

export default function createLevel({ shape = false } = {}) {
  const telemetry = {};
  return {
    version: '0.6.0-helion-racing',
    racing: { createDevices, createMotion: createHelionRuntime },
    renderer: {
      world: shape ? 'helion-shape' : 'helion-flare',
      background: '#090e19',
      fog: null,
      bloomStrength: 0.12,
      bloomThreshold: 1.4,
      fillHeight: 220,
      reflectionFar: 42000,
      contact: shape ? undefined : { surfaceStep: 4, opacity: 0.46 },
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    ship: { plumeExposure: 1.1 },
    effects: { refinedSparks: !shape },
    railContactSparks: !shape,
    practiceSectionsUntimed: true,
    createTrack: createHelionTrack,
    createRoad: ({ track, settings }) =>
      buildHelionRoad(track, { shape, settings }),
    createEnvironment: async (context) =>
      withShipHeatEffects(
        shape
          ? { group: new T.Group(), dispose() {} }
          : await createHelionEnvironment(context),
        telemetry,
      ),
    createBackdrop: (context) =>
      shape
        ? {
            group: new T.Group(),
            sunDirection: new T.Vector3(-0.69, 0.54, -0.49).normalize(),
            dispose() {},
          }
        : createHelionBackdrop(context),
    createRuntime: (context) => createHelionRuntime(context, telemetry),
    createOverlay: ({ host }) => createHelionOverlay(host, telemetry),
  };
}
