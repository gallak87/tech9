import * as T from 'three';
import { createSurfaceProjector } from '../../../pickups/surface-projector.js';
import { sheetGeometry } from './surface.js';

/** Paint clips against the same triangles as the working sheet, not a second curved mesh. */
export function createColossusPaint(track) {
  const sheets = [];
  for (const run of track.runs)
    for (let a = run.start; a < run.end - 0.01; a += 150)
      sheets.push(
        new T.Mesh(sheetGeometry(track, a, Math.min(run.end, a + 150))),
      );
  const projector = createSurfaceProjector(track, sheets);
  for (const sheet of sheets) {
    sheet.geometry.dispose();
    sheet.material.dispose();
  }
  return {
    rectangle(start, end, { min = -36, max = 36, lift = 0.05 } = {}) {
      const geometry = projector.geometry(
        [
          [
            [min, start],
            [max, start],
            [max, end],
            [min, end],
          ],
        ],
        lift,
      );
      const attr = geometry.attributes.roadCoord;
      for (let i = 0; i < attr.count; i++)
        attr.setXY(i, attr.getY(i), attr.getX(i));
      return geometry;
    },
    dispose: () => projector.dispose(),
  };
}

/** Closed, presentation-only machine casing swept outside the driving envelope. */
export function housingGeometry(track, start, end, profile) {
  const area = profile.reduce((sum, a, i) => {
    const b = profile[(i + 1) % profile.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  if (area < 0) profile = [...profile].reverse();
  const positions = [],
    indices = [],
    rows = Math.ceil((end - start) / 8),
    n = profile.length;
  // Duplicate profile corners for hard machined edges, smooth only along the sweep.
  for (let face = 0; face < n; face++) {
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const frame = track.sample(T.MathUtils.lerp(start, end, row / rows));
      for (const [x, y] of [profile[face], profile[(face + 1) % n]])
        positions.push(
          ...frame.position
            .clone()
            .addScaledVector(frame.right, x)
            .addScaledVector(frame.up, y)
            .toArray(),
        );
      if (row < rows) {
        const a = base + row * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const caps = T.ShapeUtils.triangulateShape(
    profile.map(([x, y]) => new T.Vector2(x, y)),
    [],
  );
  for (const [distance, reverse] of [
    [start, true],
    [end, false],
  ]) {
    const frame = track.sample(distance),
      base = positions.length / 3;
    for (const [x, y] of profile)
      positions.push(
        ...frame.position
          .clone()
          .addScaledVector(frame.right, x)
          .addScaledVector(frame.up, y)
          .toArray(),
      );
    for (const triangle of caps)
      indices.push(
        ...(reverse ? [...triangle].reverse() : triangle).map((i) => i + base),
      );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
