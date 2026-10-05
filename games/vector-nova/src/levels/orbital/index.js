import { createDevices } from './devices.js';
import * as T from 'three';
import {
  createLevel2Track,
  buildLevel2Blockout,
  buildOrbitalTrack,
} from './track/index.js';
import { createOrbitalEnvironment } from './environment/index.js';
import { createOrbitalBackdrop } from './backdrop/index.js';
import { legacyPart } from '../legacy.js';

export default function createLevel({ shape }) {
  return {
    version: shape ? '0.3.0-level2-blockout' : '0.3.1-orbital-racing',
    racing: { createDevices },
    renderer: {
      world: shape ? 'orbital-blockout' : 'asterion-orbital',
      background: '#03070d',
      fog: null,
      contact: shape ? undefined : { surfaceStep: 4, opacity: 0.5 },
    },
    ship: { plumeExposure: shape ? 1 : 1.65 },
    effects: { refinedSparks: !shape },
    railContactSparks: !shape,
    createTrack() {
      const track = createLevel2Track();
      if (!shape) {
        track.id = 'asterion-orbital-1';
        track.review = {
          ...track.review,
          kind: 'orbital-production',
          phase: 'gate-3',
        };
      }
      return track;
    },
    createRoad({ track }) {
      const group = shape
        ? buildLevel2Blockout(track)
        : buildOrbitalTrack(track);
      return legacyPart(group, ({ state }) =>
        group.userData.update?.(state.distance),
      );
    },
    createEnvironment({ track }) {
      const group = shape ? new T.Group() : createOrbitalEnvironment(track);
      return legacyPart(group, ({ camera }) =>
        group.userData.update?.(camera.position),
      );
    },
    async createBackdrop() {
      if (shape)
        return {
          group: new T.Group(),
          sunDirection: new T.Vector3(-0.62, 0.145, 0.77).normalize(),
          dispose() {},
        };
      const backdrop = await createOrbitalBackdrop();
      return {
        ...backdrop,
        update: ({ camera }) => backdrop.update(camera.position),
      };
    },
  };
}
