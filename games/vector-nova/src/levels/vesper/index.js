import * as T from 'three';
import { createVesperTrack } from './track/model.js';
import { createVesperRoad } from './track/road.js';
import { createVesperEnvironment } from './environment/index.js';
import { createVesperBackdrop } from './backdrop/index.js';
import { createVesperRuntime } from './runtime.js';
import { createVesperOverlay } from './overlay.js';

export default function createLevel({ shape = false } = {}) {
  let activeRuntime;
  return {
    version: '0.5.0-vesper-1',
    renderer: {
      world: shape ? 'vesper-shape' : 'vesper-canopy',
      background: shape ? '#19242e' : '#081722',
      fog: shape ? null : { color: '#102b36', density: 0.00072 },
      bloomStrength: 0.35,
      bloomThreshold: 1.1,
      fillHeight: 10,
      reflectionFar: 1800,
      contact: shape ? undefined : { surfaceStep: 3, opacity: 0.5 },
    },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.45,
    },
    effects: { refinedSparks: true },
    railContactSparks: true,
    practiceSectionsUntimed: true,
    createTrack: createVesperTrack,
    createRoad: (context) => createVesperRoad({ ...context, shape }),
    createEnvironment: (context) =>
      shape
        ? { group: new T.Group(), dispose() {} }
        : createVesperEnvironment(context),
    createBackdrop: (context) =>
      shape
        ? {
            group: new T.Group(),
            sunDirection: new T.Vector3(-0.3, 0.65, 0.6).normalize(),
            ambientIntensity: 1.3,
            dispose() {},
          }
        : createVesperBackdrop(context),
    createRuntime: (context) => {
      activeRuntime = createVesperRuntime(context);
      return activeRuntime;
    },
    createOverlay: (context) =>
      createVesperOverlay({
        ...context,
        getMotion: () => activeRuntime?.snapshot().mode,
      }),
  };
}
