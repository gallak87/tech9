import { Euler, Quaternion } from 'three';
import { COMPLETION_FINISH } from './completion-timeline.js';

export const COMPLETION_COURSE = 'halcyon';

// The film crosses the production timing seam; every actor follows its own
// sampled course frame, including the approach's real banking and elevation.
export const completionDistance = (track, z) =>
  track.length + z - COMPLETION_FINISH;

export function completionPose(track, pose) {
  const distance = completionDistance(track, pose.z);
  const frame = track.sample(distance);
  return {
    distance,
    frame,
    position: frame.position
      .clone()
      .addScaledVector(frame.right, pose.x)
      .addScaledVector(frame.up, pose.y),
    quaternion: frame.quaternion
      .clone()
      .multiply(
        new Quaternion().setFromEuler(
          new Euler(pose.pitch ?? 0, pose.yaw ?? 0, pose.roll ?? 0, 'YXZ'),
        ),
      ),
  };
}

export function completionCamera(track, sample, aspect = 1.6) {
  const frame = track.sample(completionDistance(track, sample.hero.z));
  const fit = Math.max(1, Math.min(2.4, 1.4 / aspect));
  const point = ([x, y, z], widen = false) =>
    frame.position
      .clone()
      .addScaledVector(
        frame.right,
        widen ? sample.hero.x + (x - sample.hero.x) * fit : x,
      )
      .addScaledVector(
        frame.up,
        widen ? sample.hero.y + (y - sample.hero.y) * fit : y,
      )
      .addScaledVector(frame.tangent, (z - sample.hero.z) * (widen ? fit : 1));
  return {
    position: point(sample.camera.position, true),
    target: point(sample.camera.target),
    up: frame.up.clone(),
  };
}
