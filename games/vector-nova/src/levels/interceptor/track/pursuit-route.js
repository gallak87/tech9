import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const UP = new T.Vector3(0, 1, 0);
const RIGHT = new T.Vector3(1, 0, 0);
const FORWARD = new T.Vector3(0, 0, 1);
const wrap = (s, length) => T.MathUtils.euclideanModulo(s, length);
export const smooth = (value) => {
  const t = T.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const envelope = (s, a, b, c, d) =>
  smooth((s - a) / (b - a)) * (1 - smooth((s - c) / (d - c)));

function upright(position, tangent) {
  const right = new T.Vector3().crossVectors(UP, tangent).normalize();
  const up = new T.Vector3().crossVectors(tangent, right).normalize();
  return {
    position,
    tangent,
    right,
    up,
    quaternion: new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    ),
    bank: 0,
    roll: 0,
  };
}

// Mission-local supported road, not a ship/camera animation. The same swept
// frames feed the running skin, girder, rails, collision and magnetic body.
// Arc-length remapping keeps 300 km/h meaningful through the vertical reach.
export function createPursuitRoute(base, { heightAt, rollAt, moments }) {
  const rawPoint = (distance) => {
    const p = base.sample(wrap(distance, base.length)).position;
    p.y += heightAt(wrap(distance, base.length) / base.length);
    return p;
  };
  const count = Math.ceil(base.length * 2),
    step = base.length / count,
    distances = [0];
  let previous = rawPoint(0);
  for (let index = 1; index <= count; index++) {
    const next = rawPoint(index * step);
    distances.push(distances.at(-1) + previous.distanceTo(next));
    previous = next;
  }
  const length = distances.at(-1);
  const routeDistance = (source) => {
    if (source === base.length) return length;
    const f = wrap(source, base.length) / step,
      i = Math.floor(f);
    return T.MathUtils.lerp(distances[i], distances[i + 1], f - i);
  };
  const sourceDistance = (distance) => {
    const d = wrap(distance, length);
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] <= d) lo = mid;
      else hi = mid;
    }
    return (
      (lo + (d - distances[lo]) / (distances[lo + 1] - distances[lo])) * step
    );
  };
  const positionAt = (s) => rawPoint(sourceDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.4)
      .sub(positionAt(s - 0.4))
      .normalize();
  const frameCount = Math.ceil(length),
    frameStep = length / frameCount,
    reference = createReferenceFrames(
      Array.from({ length: frameCount + 1 }, (_, i) =>
        tangentAt(i * frameStep),
      ),
      frameStep,
    );
  // A broad, periodic curvature window removes the little edge kicks caused by
  // using a ±1 m curvature estimate at Catmull control points and the seam.
  const bankAt = (s) => {
    const tangent = tangentAt(s),
      right = new T.Vector3().crossVectors(UP, tangent).normalize();
    const curvature =
      tangentAt(s + 24)
        .sub(tangentAt(s - 24))
        .dot(right) / 48;
    return T.MathUtils.clamp(-curvature * 82, -0.38, 0.38);
  };
  const banks = Array.from({ length: frameCount }, (_, i) => {
    const s = i * frameStep;
    let bank = 0;
    for (let offset = -24; offset <= 24; offset += 6)
      bank += bankAt(s + offset);
    return bank / 9;
  });
  banks.push(banks[0]);
  function sample(s) {
    const d = wrap(s, length),
      f = d / frameStep,
      i = Math.floor(f),
      tangent = tangentAt(d),
      bank =
        T.MathUtils.lerp(banks[i], banks[i + 1], f - i) +
        rollAt(sourceDistance(d) / base.length);
    const rotation = reference[i]
      .clone()
      .slerp(reference[i + 1], f - i)
      .multiply(new T.Quaternion().setFromAxisAngle(FORWARD, bank));
    const right = RIGHT.clone().applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new T.Vector3().crossVectors(tangent, right).normalize();
    return {
      position: positionAt(d),
      tangent,
      right,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      curvature:
        tangentAt(d + 1)
          .sub(tangentAt(d - 1))
          .dot(right) * 0.5,
      bank,
      roll: bank,
    };
  }
  const remap = (distance) => routeDistance(distance);
  const bounds = new T.Box3()
    .setFromPoints(
      Array.from({ length: frameCount }, (_, i) => positionAt(i * frameStep)),
    )
    .expandByVector(new T.Vector3(650, 320, 650));
  return {
    ...base,
    length,
    finishDistance: length,
    sample,
    // Static buildings remain plumb through rolled districts. Ground retains
    // original biome water/earth elevations; neither sampler changes support.
    scenerySample: (s) => {
      const frame = upright(positionAt(s), tangentAt(s));
      return {
        ...frame,
        curvature:
          tangentAt(s + 1)
            .sub(tangentAt(s - 1))
            .dot(frame.right) * 0.5,
      };
    },
    groundSample: (s) => {
      const f = base.sample(sourceDistance(s));
      return { ...f, ...upright(f.position, f.tangent) };
    },
    routeMoments: moments.map(({ start, end, ...moment }) => ({
      ...moment,
      start: routeDistance(start * base.length),
      end: routeDistance(end * base.length),
    })),
    sections: base.sections.map((section) => ({
      ...section,
      start: remap(section.start),
      end: remap(section.end),
      showcase: remap(section.showcase),
    })),
    checkpoints: base.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      distance: remap(checkpoint.distance),
    })),
    cutGates: base.cutGates.map(remap),
    scenarios: Object.fromEntries(
      Object.entries(base.scenarios).map(([id, scenario]) => [
        id,
        { ...scenario, distance: remap(scenario.distance) },
      ]),
    ),
    bounds,
  };
}
