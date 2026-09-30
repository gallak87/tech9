import * as T from 'three';
import {
  createLevel3Track,
  buildLevel3Blockout,
  buildNacreTrack,
  createNacreRuntime,
} from '../../track/level3/index.js';
import { createNacreEnvironment } from '../../environment/level3/index.js';
import { createNacreBackdrop } from '../../renderer/level3/index.js';
import { createNacreImmersion } from '../../core/nacre-presentation.js';
import { legacyPart } from '../legacy.js';

export default function createLevel({ shape }) {
  return {
    version: '0.4.1-nacre-v1',
    renderer: {
      world: shape ? 'nacre-shape' : 'nacre-tempest',
      background: '#77899d',
      fog: { color: '#8195af', density: 0.00025 },
    },
    audio: { nacre: !shape },
    camera: {
      preserveFlightView: true,
      portraitAspect: 0.64,
      maxPortraitScale: 1.5,
    },
    practiceSectionsUntimed: true,
    createTrack() {
      const track = createLevel3Track();
      if (!shape)
        track.review = {
          ...track.review,
          kind: 'nacre-production',
          phase: 'gate-4.1',
        };
      return track;
    },
    createRoad: ({ track }) =>
      legacyPart(shape ? buildLevel3Blockout(track) : buildNacreTrack(track)),
    createEnvironment({ track, view }) {
      const group = createNacreEnvironment(track, {
        blockout: shape,
        skyTexture: view.assets.skyTexture,
      });
      return legacyPart(group, (frame) => {
        group.userData.setOverview?.(frame.reviewing);
        group.userData.updateVehicle?.({
          position: frame.ship.group.position,
          quaternion: frame.ship.group.quaternion,
          speed: frame.state.speed,
          distance: frame.state.distance,
          time: frame.time,
          mode: frame.mode,
          reset: frame.reset,
        });
        group.userData.updateScene?.(
          view.scene,
          frame.camera.position,
          frame.time,
          frame.settings,
        );
      });
    },
    async createBackdrop({ settings }) {
      let skyTexture = null;
      try {
        if (!shape) {
          skyTexture = await new T.TextureLoader().loadAsync(
            '/assets/level3/nacre-storm-sky-v1.png',
          );
          skyTexture.colorSpace = T.SRGBColorSpace;
          skyTexture.wrapS = T.RepeatWrapping;
          skyTexture.minFilter = T.LinearMipmapLinearFilter;
          skyTexture.magFilter = T.LinearFilter;
          skyTexture.generateMipmaps = true;
        }
        const backdrop = createNacreBackdrop({
          waterY: 0,
          blockout: shape,
          settings,
          skyTexture,
        });
        const direction = new T.Vector3();
        return {
          ...backdrop,
          assets: { skyTexture },
          update: (frame) => {
            frame.camera.getWorldDirection(direction);
            backdrop.update?.(
              frame.camera.position,
              frame.time,
              frame.settings,
              {
                direction,
                enabled: frame.mode === 'racing' || frame.mode === 'paused',
                reset: frame.reset,
              },
            );
          },
        };
      } catch (error) {
        skyTexture?.dispose();
        throw error;
      }
    },
    createRuntime: createNacreRuntime,
    createOverlay: shape
      ? undefined
      : ({ host, track, view }) => {
          const immersion = createNacreImmersion(host);
          return {
            update: (frame) =>
              immersion.update(
                frame.camera.position.y,
                track.waterY ?? 0,
                !frame.reviewing && ['racing', 'paused'].includes(frame.mode),
              ),
            afterRender: (frame) =>
              immersion.updateStorm(
                frame.mode === 'inspection' ? null : view.getPresentation(),
              ),
            getPresentation: () => ({ immersion: immersion.getPresentation() }),
            dispose: () => immersion.dispose(),
          };
        },
  };
}
