import * as T from 'three';
import { horizontalFrame, UP } from './geometry.js';
import { grazerExposure } from '../grazer.js';

export const GRAZER_GROUND_SAMPLES = 96;

/** Distant right-to-left crossing ahead of the Vista approach. */
export function grazerTransect(track) {
  const approach = horizontalFrame(track, track.landmarks.vistaStart + 320);
  // The route's upright +X basis is screen-left from its +Z chase direction.
  const forward = approach.right;
  const start = approach.position
    .addScaledVector(approach.forward, 1050)
    .addScaledVector(forward, -300);
  const right = UP.clone().cross(forward).normalize();
  return { start, forward, right, length: 1000 };
}

export function createGrazerPath(track, survey) {
  const { start, forward, right, length } = grazerTransect(track);
  const quaternion = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(right, UP, forward),
  );
  const minimum = -600;
  const span = length + 800;
  const ground = Array.from({ length: GRAZER_GROUND_SAMPLES }, (_, i) => {
    const p = start
      .clone()
      .addScaledVector(
        forward,
        minimum + (span * i) / (GRAZER_GROUND_SAMPLES - 1),
      );
    return survey.heightAt(p.x, p.z);
  });
  function heightAt(distance) {
    const t =
      T.MathUtils.clamp((distance - minimum) / span, 0, 1) *
      (ground.length - 1);
    const i = Math.min(ground.length - 2, Math.floor(t));
    return T.MathUtils.lerp(ground[i], ground[i + 1], t - i);
  }
  return {
    start,
    forward,
    right,
    quaternion,
    length,
    minimum,
    span,
    ground,
    heightAt,
  };
}

/** CPU equivalent of the vertex pose for geometry/clearance verification. */
export function grazerVertexAt(path, age, travel, vertex, motion = 1) {
  const lag = Math.max(0, -vertex.z);
  const burial = T.MathUtils.smoothstep(lag, 80, 300) * 64;
  const sway =
    Math.sin(lag * 0.007 - age * 0.22) *
    T.MathUtils.smoothstep(lag, 50, 360) *
    3 *
    motion;
  const p = path.start
    .clone()
    .addScaledVector(path.forward, travel + vertex.z)
    .addScaledVector(path.right, vertex.x + sway);
  p.y =
    path.heightAt(travel + vertex.z) +
    vertex.y -
    58 +
    60 * grazerExposure(age, vertex.z, path.length / 20) -
    burial;
  return p;
}
