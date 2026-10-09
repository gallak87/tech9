import * as T from 'three';
import { boxProfile } from '../../../track/geometry.js';

// Shared authored dimensions and tessellation for rendering and physical contact.
export const SAFFRON_SOLIDS = Object.freeze({
  version: 'saffron-wide-solids-v1',
  step: 3.2,
  top: [
    [-16, 0],
    [16, 0],
  ],
  underside: [
    [16, 0],
    [17.5, -0.75],
    [17.1, -3.2],
    [13.2, -3.6],
    [-13.2, -3.6],
    [-17.1, -3.2],
    [-17.5, -0.75],
    [-16, 0],
  ],
  vane: [
    [-6.3, 0],
    [-4.6, 0.85],
    [4.9, 0.65],
    [6.3, 0.12],
    [4.7, -0.15],
    [-4.8, -0.2],
  ],
});
export function roadRuns(track) {
  const runs = [];
  let start = 0;
  for (const jump of track.jumps.filter((j) => !j.optional)) {
    runs.push([start, jump.takeoff]);
    start = jump.landingStart;
  }
  runs.push([start, track.length]);
  return runs;
}
export const toeProfile = (side) => boxProfile(side * 16.48, 0.18, 0.68, 0.75);
export function createBaffleGeometry() {
  const shape = new T.Shape();
  for (const [i, [x, y]] of SAFFRON_SOLIDS.vane.entries())
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  shape.closePath();
  return new T.ExtrudeGeometry(shape, {
    depth: 0.75,
    bevelEnabled: false,
    curveSegments: 1,
  })
    .rotateY(Math.PI / 2)
    .translate(-0.375, 0, 0);
}
export function bafflePlacements(track) {
  const vanes = [],
    clamps = [];
  for (let s = 5; s < track.length; s += 16) {
    if (
      track.isGap(s) ||
      track.jumps.some(
        (j) =>
          !j.optional &&
          (Math.abs(s - j.takeoff) < 8 || Math.abs(s - j.landingStart) < 8),
      )
    )
      continue;
    for (const side of [-1, 1]) {
      for (const y of [0.96, 2.1])
        vanes.push({ s, x: side * 17.65, y, scale: [1, 1, 1] });
      clamps.push({
        s: s - 3.8,
        x: side * 17.2,
        y: 0.94,
        scale: [0.48, 1.5, 0.9],
      });
    }
  }
  return { vanes, clamps };
}
export function receivingBeacons(track) {
  return track.jumps.flatMap((j) =>
    [j.takeoff - 35, j.takeoff - 18, j.takeoff - 3, j.landingStart + 4].flatMap(
      (s) =>
        [-1, 1].map((side) => ({
          s,
          x: side * 17.8,
          y: 2.3,
          scale: [0.75, 4.6, 0.75],
        })),
    ),
  );
}
export function fixtureMatrix(track, item) {
  const frame = track.sample(item.s);
  return new T.Matrix4().compose(
    frame.position
      .clone()
      .addScaledVector(frame.right, item.x)
      .addScaledVector(frame.up, item.y),
    frame.quaternion,
    new T.Vector3(...item.scale),
  );
}
// Close the real thick ribbon at structural breaks. Both views use these faces.
export function deckEndGeometry(track) {
  const positions = [];
  const profile = SAFFRON_SOLIDS.underside;
  const faces = T.ShapeUtils.triangulateShape(
    profile.map(([x, y]) => new T.Vector2(x, y)),
    [],
  );
  for (const jump of track.jumps.filter((j) => !j.optional))
    for (const s of [jump.takeoff, jump.landingStart]) {
      const frame = track.sample(s);
      for (const indices of faces)
        for (const index of indices) {
          const [x, y] = profile[index];
          positions.push(
            ...frame.position
              .clone()
              .addScaledVector(frame.right, x)
              .addScaledVector(frame.up, y)
              .toArray(),
          );
        }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
