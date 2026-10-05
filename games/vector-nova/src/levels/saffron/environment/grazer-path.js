import * as T from 'three';
import { horizontalFrame, UP } from './geometry.js';
import { grazerExposure } from '../grazer.js';

export const GRAZER_GROUND_SAMPLES = 96;

/** Authored world-space transect through the open dune field beside the Vista. */
export function createGrazerPath(track, survey) {
  const a = horizontalFrame(track, track.landmarks.vistaStart + 500);
  const b = horizontalFrame(track, track.landmarks.vistaEnd + 150);
  const start = a.position.addScaledVector(a.right, -260);
  const end = b.position.addScaledVector(b.right, -350);
  const forward = end.clone().sub(start).setY(0).normalize();
  const right = UP.clone().cross(forward).normalize();
  const length = end.clone().sub(start).setY(0).length();
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
