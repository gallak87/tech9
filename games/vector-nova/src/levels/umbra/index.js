import * as T from 'three';
import { createDevices } from './devices.js';
import { createUmbraTrack, buildUmbraRoad } from './track/index.js';
import { createUmbraRuntime } from './track/runtime.js';
import { createUmbraEnvironment } from './environment/index.js';
import { createUmbraBackdrop } from './backdrop/index.js';
import { createUmbraOverlay } from './overlay.js';
import { loadUmbraSurface } from './environment/surfaces.js';

export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.5.0-umbra-racing',
    racing: { createDevices, createMotion: createUmbraRuntime },
    renderer: {
      world: shape ? 'umbra-shape' : 'umbra-fold',
      background: '#050912',
      fog: null,
      bloomStrength: 0.1,
      bloomThreshold: 1.6,
      reflectionFar: 2600,
    },
    camera: {
      preserveFlightView: true,
      flightViewScale: 0.67,
      flightChaseBlend: 0.78,
      chaseHeight: 6,
      lookAhead: 52,
      jumpPreview: { distance: 280, height: 27, back: 36 },
      safeFrame: { left: -0.68, right: 0.68, bottom: -0.66, top: 0.55 },
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    practiceSectionsUntimed: true,
    railContactSparks: true,
    createTrack() {
      const track = createUmbraTrack();
      for (const zone of track.tidalZones) {
        track.scenarios[`${zone.id}-test`] = {
          distance: (zone.start + zone.end) / 2 - 25,
          speed: 65,
          lateral: 0,
          heading: 0,
        };
      }
      for (const [phase, time] of [
        ['intact', 14],
        ['stretch', 24],
        ['fragment', 32],
        ['consume', 50],
      ]) {
        track.scenarios[`accretion-${phase}`] = {
          distance: 1740,
          speed: 0,
          lateral: 0,
          heading: 0,
          time,
        };
      }
      track.featureZones = track.tidalZones;
      return track;
    },
    async createRoad({ track, settings }) {
      if (shape) return buildUmbraRoad(track, { shape, settings });
      const surfaceTexture = await loadUmbraSurface();
      try {
        return buildUmbraRoad(track, { shape, settings, surfaceTexture });
      } catch (error) {
        surfaceTexture.dispose();
        throw error;
      }
    },
    createEnvironment: (context) =>
      shape
        ? { group: new T.Group(), dispose() {} }
        : createUmbraEnvironment(context),
    createBackdrop: (context) =>
      shape
        ? {
            group: new T.Group(),
            sunDirection: new T.Vector3(-0.5, 0.8, -0.3).normalize(),
            ambientIntensity: 1.4,
            dispose() {},
          }
        : createUmbraBackdrop(context),
    createRuntime: createUmbraRuntime,
    createOverlay: (context) => createUmbraOverlay({ ...context, shape }),
  };
}
