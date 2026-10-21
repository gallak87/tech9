import * as T from 'three';

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
        [18, -1.6],
        [24, -4],
        [29, -9],
        [27, -15],
        [46, -18],
        [41, -29],
        [60, -35],
        [56, -53],
        [82, -63],
        [80, -108],
        [125, -155],
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
    indices = [],
    cols = profile.length;
  for (let row = 0; row <= count; row++) {
    const s = start + ((end - start) * row) / count,
      f = track.sample(s);
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
      const lateral =
        side * (column === 0 ? 16 : Math.max(16 + (x - 16) * 0.35, folded));
      let h = y;
      if (!outer && column > 1) h *= heightScale * (0.42 + 0.58 * envelope);
      if (column > 0)
        h +=
          (Math.sin(s * 0.065 + column * 1.4) * 0.7 + fold * 0.9) * influence;
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
        if (side > 0)
          indices.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1);
        else indices.push(n, n + 1, n + cols, n + 1, n + cols + 1, n + cols);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, indices.length, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { opalineBank: true, side, start, end };
  return geometry;
}
