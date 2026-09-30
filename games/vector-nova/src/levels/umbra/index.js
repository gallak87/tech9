import * as T from 'three';
import { createUmbraTrack, buildUmbraRoad } from './track/index.js';
import { createUmbraRuntime } from './track/runtime.js';
import { createUmbraEnvironment } from './environment/index.js';
import { createUmbraBackdrop } from './backdrop/index.js';
import { createUmbraOverlay } from './overlay.js';

export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.4.0-umbra-v1',
    renderer: {
      world: shape ? 'umbra-shape' : 'umbra-fold',
      background: '#050912',
      fog: null,
      bloomStrength: 0.25,
      bloomThreshold: 1.05,
      reflectionFar: 2600,
    },
    camera: {
      preserveFlightView: true,
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
        ['fragment', 38],
        ['consume', 50],
      ]) {
        track.scenarios[`accretion-${phase}`] = {
          distance: 1750,
          speed: 0,
          lateral: 0,
          heading: 0,
          time,
        };
      }
      track.featureZones = track.tidalZones;
      return track;
    },
    createRoad: ({ track, settings }) =>
      buildUmbraRoad(track, { shape, settings }),
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
    createOverlay: createUmbraOverlay,
  };
}
