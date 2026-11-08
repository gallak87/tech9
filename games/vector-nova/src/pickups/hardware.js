import { isCombatDevice } from './combat.js';
import { createCombatDeviceGeometry } from './combat-geometry.js';
import {
  createRoadProjector,
  createDeviceGeometry,
  disposeGroup,
} from './geometry.js';
import { roadDeviceMountHeight } from './device-mount.js';
import { createLowDeviceGeometry } from './low-geometry.js';
import { createSurfaceProjector } from './surface-projector.js';

export function deviceGeometryTrack(track) {
  const moving = typeof track.deviceMotionAt === 'function';
  if (!moving) return track;
  if (
    track.deviceProjection !== 'rendered-surface' ||
    typeof track.nominalSample !== 'function'
  )
    throw new Error(
      'Moving road devices require rendered-surface projection and a nominal sampler.',
    );
  const geometryTrack = Object.create(track);
  geometryTrack.sample = track.nominalSample.bind(track);
  geometryTrack.sampleSurface = track.nominalSurface?.bind(track);
  return geometryTrack;
}

/** Build rigid road hardware in its reference pose, independent of live motion. */
export function createDeviceHardware({ track, surfaces, devices, quality }) {
  const moving = typeof track.deviceMotionAt === 'function';
  const geometryTrack = deviceGeometryTrack(track);
  const hardware = [];
  const projector =
    track.deviceProjection === 'rendered-surface'
      ? createSurfaceProjector(geometryTrack, surfaces, { nominal: moving })
      : createRoadProjector(geometryTrack);
  try {
    for (const device of devices) {
      const mountHeight =
        track.deviceProjection === 'rendered-surface'
          ? 0
          : roadDeviceMountHeight(surfaces, device, projector);
      const createGeometry =
        quality === 'low'
          ? createLowDeviceGeometry
          : isCombatDevice(device.type)
            ? createCombatDeviceGeometry
            : createDeviceGeometry;
      const visual = createGeometry(geometryTrack, device, projector, {
        mountHeight,
      });
      const record = { ...visual, device };
      hardware.push(record);
      if (moving) {
        record.updateMotion = () => {
          const translation = track.deviceMotionAt(device.distance);
          if (
            !translation?.isVector3 ||
            !translation.toArray().every(Number.isFinite)
          )
            throw new Error(
              'Moving road devices require a finite translation.',
            );
          visual.group.position.copy(translation);
        };
        record.updateMotion();
      }
    }
    return hardware;
  } catch (error) {
    for (const visual of hardware) disposeGroup(visual.group);
    throw error;
  } finally {
    projector.dispose();
  }
}
