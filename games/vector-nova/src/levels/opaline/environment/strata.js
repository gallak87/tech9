import * as T from 'three';
import { sampleOpalineSurfBank } from '../track/surf.js';

const SURF_BREAK_OFFSETS = [
  0, 0.15, 8, 17, 27, 40, 50, 65, 82, 101, 125, 145, 169,
];
const SURF_BREAK_RISES = [
  0, 4, 18, 50, 76, 102, 120, 130, 142, 148, 125, 90, -155,
];

// Continuous piecewise strata faults: broad planar breaks, not a corrugated
// sine tube. This field is shared by rendered terrain and CPU contacts.
function fault(value) {
  const cell = Math.floor(value),
    t = value - cell;
  const hash = (n) => {
    const h = Math.sin(n * 127.1 + 91.7) * 43758.5453;
    return (h - Math.floor(h)) * 2 - 1;
  };
  return T.MathUtils.lerp(hash(cell), hash(cell + 1), t);
}

/** The mineral shelf continues into its own eroded mass. Shared with CPU terrain contacts. */
export function createShelfBankGeometry(track, { start, end, side, step = 4 }) {
  if (
    ![-1, 1].includes(side) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  )
    throw new Error('Invalid mineral bank span');
  const outer = side < 0;
  // The first vertex is the exact edge of the driving triangles; no overlaid deck.
  const profile = outer
    ? [
        [16, 0],
        [17, -1],
        [19, -3],
        [18, -12],
        [20, -29],
        [24, -42],
        [21, -57],
        [30, -72],
        [26, -93],
        [38, -110],
        [35, -155],
        [70, -155],
      ]
    : [
        [16, 0],
        [18, 0.7],
        [23, 3],
        [28, 9],
        [38, 13],
        [35, 28],
        [53, 32],
        [58, 64],
        [78, 72],
        [70, 110],
        [115, 118],
        [152, 98],
        [190, -155],
      ];
  const count = Math.ceil((end - start) / step),
    positions = [],
    uv = [],
    smoothIndices = [],
    fractureIndices = [],
    cols = profile.length;
  for (let row = 0; row <= count; row++) {
    const s = start + ((end - start) * row) / count,
      f = track.sample(s);
    const surf = !outer && sampleOpalineSurfBank(track, s);
    const taper = Math.min(
      1,
      Math.max(0, (s - start) / 38),
      Math.max(0, (end - s) / 38),
    );
    const envelope = taper * taper * (3 - 2 * taper);
    const fold =
      Math.sin(s * 0.011) +
      0.44 * Math.sin(s * 0.029 + 1.8) +
      0.18 * Math.cos(s * 0.073);
    const heightScale = outer
      ? 1
      : 0.65 + 0.32 * Math.sin(s * 0.004 + 1.5) + 0.2 * Math.sin(s * 0.009);
    for (let column = 0; column < cols; column++) {
      const [x, y] = profile[column],
        influence = Math.min(1, column / 3);
      const folded =
        16 +
        (x - 16) * (0.6 + 0.4 * envelope) +
        fold * influence * (outer ? 5.5 : 8);
      // Fold variation must not move the bank inside the declared driving skin.
      let lateral =
        side * (column === 0 ? 16 : Math.max(16 + (x - 16) * 0.35, folded));
      let h = y;
      if (!outer && column > 1) h *= heightScale * (0.42 + 0.58 * envelope);
      if (column > 0)
        h +=
          (Math.sin(s * 0.065 + column * 1.4) * 0.7 + fold * 0.9) * influence;
      if (surf) {
        // The smooth lower band is a separate, authored deck. This skin starts
        // at its exact outer edge; a steep rough break guides the narrowing exit.
        lateral =
          surf.max +
          SURF_BREAK_OFFSETS[column] * (0.75 + 0.25 * envelope) +
          (column > 2
            ? Math.max(-SURF_BREAK_OFFSETS[column] * 0.3, fold * influence * 5)
            : 0);
        h =
          surf.height +
          SURF_BREAK_RISES[column] *
            (column < 3 ? 1 : heightScale * (0.6 + 0.4 * envelope));
        if (column > 2)
          h += Math.sin(s * 0.065 + column * 1.4) * 0.7 + fold * 0.9;
      }
      // Preserve the exact running edge, surf join and low overhang clearance.
      // Upper ledges erode at medium scale; their stepped faces remain solid.
      if (column > 3 && column < cols - 1) {
        const weight = Math.min(1, (column - 3) / 4);
        lateral += side * fault(s / 47) * 5 * weight;
        h += fault(s / 34) * 8 * weight;
      }
      const p = f.position
        .clone()
        .addScaledVector(f.right, lateral)
        .addScaledVector(f.up, h);
      // Deep footings terminate under the water plane independent of road elevation.
      if (column === cols - 1) p.y = -110 - 8 * Math.sin(s * 0.018);
      positions.push(...p.toArray());
      uv.push(lateral / 16, s / 16);
      if (row < count && column < cols - 1) {
        const n = row * cols + column;
        const fracture = outer && [5, 9].includes(column);
        const indices = fracture ? fractureIndices : smoothIndices;
        if (side > 0)
          indices.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
        else indices.push(n, n + 1, n + cols, n + 1, n + cols + 1, n + cols);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex([...smoothIndices, ...fractureIndices]);
  geometry.addGroup(0, smoothIndices.length, 0);
  geometry.addGroup(smoothIndices.length, fractureIndices.length, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { opalineBank: true, side, start, end };
  return geometry;
}
