import * as T from 'three';

const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);

/** Long, asymmetric ridge spines, expressed relative to the factory footprint. */
export function createColossusLandform(track) {
  const center = track.bounds.getCenter(new T.Vector3()),
    size = track.bounds.getSize(new T.Vector3()),
    span = Math.max(2400, size.x, size.z);
  const ridge = (points, width, shoulder) => ({
    points: points.map(([x, z, h]) => ({
      x: center.x + x * span,
      z: center.z + z * span,
      h,
    })),
    width,
    shoulder,
  });
  // One dominant summit with a long falling shoulder, then separate lower
  // ranges. These are connected crests, never individually scaled boulders.
  const ridges = [
    ridge(
      [
        [-2.5, -1.95, 360],
        [-1.71, -1.68, 1320],
        [-1.18, -1.47, 2480],
        [-0.72, -1.32, 1630],
        [-0.36, -1.47, 2070],
        [0.02, -1.24, 1170],
        [0.48, -1.36, 1640],
        [1.12, -1.13, 380],
      ],
      span * 0.67,
      0.16,
    ),
    ridge(
      [
        [1.63, -1.72, 360],
        [1.35, -0.87, 1260],
        [1.62, -0.32, 1840],
        [1.43, 0.23, 970],
        [1.75, 0.91, 1490],
        [2.3, 1.65, 290],
      ],
      span * 0.58,
      -0.17,
    ),
    ridge(
      [
        [-2.15, 0.29, 270],
        [-1.58, 0.83, 1350],
        [-1.02, 1.01, 820],
        [-0.61, 1.39, 1420],
        [0.13, 1.76, 710],
        [0.84, 1.97, 270],
      ],
      span * 0.56,
      0.15,
    ),
    // Unequal descending buttresses put real shoulders and intermediate
    // silhouettes in front of the main range instead of one long planar face.
    ridge(
      [
        [-1.19, -1.4, 2110],
        [-1.05, -1.03, 1490],
        [-0.9, -0.73, 720],
        [-0.99, -0.34, 300],
      ],
      span * 0.3,
      -0.22,
    ),
    ridge(
      [
        [-0.35, -1.39, 1830],
        [-0.23, -1.02, 1120],
        [0.02, -0.79, 690],
        [0.28, -0.56, 180],
      ],
      span * 0.27,
      0.18,
    ),
    // A separate low shoulder seats the upper works in the excavated ground.
    ridge(
      [
        [-0.91, -0.5, 350],
        [-0.52, -0.63, 840],
        [-0.21, -0.57, 630],
        [0.31, -0.61, 750],
        [0.74, -0.59, 230],
      ],
      span * 0.35,
      0.12,
    ),
  ];
  // Irregular, broad drainages descend between the buttresses. Their heads
  // start below the crests, so folds break the faces without adding sawteeth.
  const drainages = [
    [
      [-1.55, -1.42, 0, 150],
      [-1.47, -1.08, 410, 270],
      [-1.16, -0.6, 180, 380],
    ],
    [
      [-0.82, -1.25, 0, 100],
      [-0.7, -0.98, 440, 220],
      [-0.39, -0.65, 200, 330],
    ],
    [
      [0.06, -1.22, 0, 120],
      [0.23, -0.98, 330, 270],
      [0.44, -0.63, 120, 390],
    ],
    [
      [1.48, -0.5, 0, 110],
      [1.2, -0.23, 330, 260],
      [0.99, 0.13, 130, 320],
    ],
    [
      [-1.41, 0.77, 0, 100],
      [-1.15, 0.56, 280, 240],
      [-0.87, 0.46, 100, 300],
    ],
  ].map((points) =>
    points.map(([x, z, depth, width]) => ({
      x: center.x + x * span,
      z: center.z + z * span,
      depth,
      width,
    })),
  );
  const heightAt = (x, z) => {
    let relief = 0;
    for (const r of ridges) {
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i],
          b = r.points[i + 1],
          dx = b.x - a.x,
          dz = b.z - a.z,
          length = Math.hypot(dx, dz),
          t = T.MathUtils.clamp(
            ((x - a.x) * dx + (z - a.z) * dz) / (length * length),
            0,
            1,
          ),
          distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t, 95) - 95,
          signed = ((x - a.x) * dz - (z - a.z) * dx) / length,
          crest = T.MathUtils.lerp(a.h, b.h, t);
        // Unequal slopes and long gullies give each crest a steep face and a
        // broad talus apron. Overlapping continuous segment fields meet at
        // watershed creases without a nearest-segment ownership discontinuity.
        const side = Math.tanh(signed / 180),
          width = r.width * (1 + side * r.shoulder),
          run = distance / width;
        if (run >= 1) continue;
        const flank = 1 - run,
          face = flank ** (1.48 + side * 0.18);
        relief = Math.max(relief, crest * face);
      }
    }
    let erosion = 0;
    for (const drainage of drainages)
      for (let i = 0; i < drainage.length - 1; i++) {
        const a = drainage[i],
          b = drainage[i + 1],
          dx = b.x - a.x,
          dz = b.z - a.z,
          t = T.MathUtils.clamp(
            ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz),
            0,
            1,
          ),
          distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t),
          width = T.MathUtils.lerp(a.width, b.width, t),
          depth = T.MathUtils.lerp(a.depth, b.depth, t);
        erosion = Math.max(erosion, depth * (1 - smooth(0, width, distance)));
      }
    // Broad, low alluvial ground connects the foothills, with a deliberate
    // opening towards the southern valley and no raised perimeter wall.
    const apron =
      60 +
      44 * Math.sin((x - center.x) * 0.00047 + 0.6) +
      34 * Math.cos((z - center.z) * 0.00056 - 0.4);
    return apron + Math.max(0, relief - erosion);
  };
  return { heightAt, center, span };
}

/** A stitched outer landscape; its inner boundary exactly matches the quarry. */
export function createColossusMountains(track, quarry) {
  const group = new T.Group();
  group.name = 'Colossus / connected mountain ranges';
  const { bounds, axes } = quarry,
    center = track.bounds.getCenter(new T.Vector3()),
    reach = 11500;
  const extend = (inner, min, max) => {
    const before = [],
      after = [];
    // Resolve the actual ridge mass at 65 m; only the low far plain uses
    // large cells. A 150 m grid aliased diagonal crests into rhythmic teeth.
    let value = inner[0];
    while (value > min) {
      value = Math.max(min, value - (value - inner[0] > -4200 ? 65 : 240));
      before.push(value);
    }
    before.reverse();
    value = inner.at(-1);
    while (value < max) {
      value = Math.min(max, value + (value - inner.at(-1) < 4200 ? 65 : 240));
      after.push(value);
    }
    return [...before, ...inner, ...after];
  };
  const xs = extend(axes.x, center.x - reach, center.x + reach),
    zs = extend(axes.z, center.z - reach, center.z + reach),
    regions = [[], [], [], []],
    normals = [[], [], [], []];
  const geometries = [],
    vertices = new Map();
  const vertex = (ix, iz) => {
    const key = iz * xs.length + ix;
    if (!vertices.has(key)) {
      const x = xs[ix],
        z = zs[iz],
        ex =
          (xs[Math.min(xs.length - 1, ix + 1)] - xs[Math.max(0, ix - 1)]) / 2,
        ez =
          (zs[Math.min(zs.length - 1, iz + 1)] - zs[Math.max(0, iz - 1)]) / 2,
        normal = new T.Vector3(
          (quarry.heightAt(x - ex, z) - quarry.heightAt(x + ex, z)) / (2 * ex),
          1,
          (quarry.heightAt(x, z - ez) - quarry.heightAt(x, z + ez)) / (2 * ez),
        ).normalize();
      vertices.set(key, {
        position: [x, quarry.heightAt(x, z), z],
        normal: normal.toArray(),
      });
    }
    return vertices.get(key);
  };
  // The four connected strips cull independently. Their shared vertex heights
  // and normals use the same world field; no repeated mountain mesh is used.
  for (let iz = 0; iz < zs.length - 1; iz++)
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const x0 = xs[ix],
        x1 = xs[ix + 1],
        z0 = zs[iz],
        z1 = zs[iz + 1];
      const region =
        z1 <= bounds.min.z
          ? 0
          : z0 >= bounds.max.z
            ? 1
            : x1 <= bounds.min.x
              ? 2
              : x0 >= bounds.max.x
                ? 3
                : -1;
      if (region < 0) continue;
      const a = vertex(ix, iz),
        b = vertex(ix, iz + 1),
        c = vertex(ix + 1, iz),
        d = vertex(ix + 1, iz + 1);
      for (const v of [a, b, c, c, b, d]) {
        regions[region].push(...v.position);
        normals[region].push(...v.normal);
      }
    }
  for (const [i, positions] of regions.entries()) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'normal',
      new T.Float32BufferAttribute(normals[i], 3),
    );
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const mesh = new T.Mesh(geometry, quarry.material);
    mesh.name = `Colossus / mountain watershed ${i + 1}`;
    mesh.receiveShadow = true;
    // The ranges are beyond the factory shadow volume; their broad slopes
    // receive the same sunlight without expanding the near shadow map.
    group.add(mesh);
  }
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      geometries.forEach((g) => g.dispose());
    },
  };
}
