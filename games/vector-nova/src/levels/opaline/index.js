import * as T from 'three';
import { createOpalineTrack } from './track/model.js';
import { createOpalineRoad } from './track/road.js';
import { createOpalineEnvironment } from './environment/index.js';
import { createOpalineBackdrop } from './backdrop/index.js';
import { createOpalineRuntime } from './runtime.js';
import { createOpalineCollisionWorld } from './collision.js';
import { createDevices } from './devices.js';

export default function createLevel({ shape = false } = {}) {
  return {
    version: '0.1.0-opaline-1',
    createTrack: createOpalineTrack,
    createRoad: (context) => createOpalineRoad({ ...context, shape }),
    createEnvironment: (context) =>
      shape
        ? { group: new T.Group(), dispose() {} }
        : createOpalineEnvironment(context),
    createBackdrop: createOpalineBackdrop,
    createCollisionWorld: createOpalineCollisionWorld,
    createRuntime: createOpalineRuntime,
    racing: { createMotion: createOpalineRuntime, createDevices },
    playtests: {
      jump: {
        scenario: 'jump-2-approach',
        label: 'Crown fracture',
        description:
          'Cross the open mineral fracture and settle onto the receiving shelf.',
        automaticRecovery: false,
      },
    },
    renderer: {
      world: shape ? 'opaline-shape' : 'opaline',
      background: '#c0c9d0',
      fog: shape ? null : { color: '#c2ccce', density: 0.00034 },
      bloomStrength: 0.12,
      bloomThreshold: 1.25,
      sunShadowExtent: 220,
      sunShadowNormalBias: 0.18,
      sunShadowBias: -0.00015,
      reflectionFar: 2600,
      contact: { surfaceStep: 3, opacity: 0.48 },
      catapultBlurScale: 0.6,
    },
    camera: {
      preserveFlightView: true,
      safeFrame: { left: -0.9, right: 0.9, bottom: -0.85, top: 0.9 },
    },
    effects: { refinedSparks: true },
    railContactSparks: true,
    practiceSectionsUntimed: true,
  };
}
