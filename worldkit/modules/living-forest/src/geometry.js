import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function randomSource(seed = 13) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Freshly authored fluted wood. Radii follow the supplied curve control points. */
export function createWoodGeometry(
  points,
  radii,
  { segments = 24, sides = 18, lobes = 7, seed = 0, fluting = 0.2 } = {},
) {
  const curve = new T.CatmullRomCurve3(
    points.map((p) => (p.isVector3 ? p.clone() : new T.Vector3(...p))),
  );
  const frames = curve.computeFrenetFrames(segments, false);
  const length = curve.getLength();
  const positions = [],
    uvs = [],
    colors = [],
    indices = [];
  for (let j = 0; j <= segments; j++) {
    const t = j / segments;
    const center = curve.getPointAt(t);
    const rt = t * (radii.length - 1),
      ri = Math.min(radii.length - 2, Math.floor(rt));
    const radius = T.MathUtils.lerp(radii[ri], radii[ri + 1], rt - ri);
    for (let k = 0; k <= sides; k++) {
      const angle = (k / sides) * Math.PI * 2;
      const flute = Math.cos(angle * lobes + Math.sin(t * 4 + seed) * 0.28);
      const rib =
        1 +
        fluting * flute +
        0.035 * Math.sin(angle * (lobes + 3) + t * 11 + seed);
      const normal = frames.normals[j]
        .clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(frames.binormals[j], Math.sin(angle));
      const p = center.clone().addScaledVector(normal, radius * rib);
      positions.push(p.x, p.y, p.z);
      uvs.push((k / sides) * Math.max(1, radii[0] * 1.5), (t * length) / 11);
      // Creases remain dark at distance; broad ridges catch cool daylight.
      const valley = T.MathUtils.smoothstep(flute, -0.95, -0.2);
      const brightness = 0.38 + valley * 0.62;
      const moss = 0.03 * (1 + Math.sin(angle * 3 + t * 13 + seed));
      colors.push(brightness * (1 - moss), brightness, brightness * 0.9);
      if (j < segments && k < sides) {
        const a = j * (sides + 1) + k,
          b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  // Caps are embedded in parent wood, but close roots and tips for reliable shadows.
  for (const end of [0, segments]) {
    const start = end * (sides + 1);
    const center = curve.getPointAt(end / segments),
      index = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    uvs.push(0.5, 0.5);
    colors.push(0.72, 0.75, 0.66);
    for (let k = 0; k < sides; k++)
      if (end === 0) indices.push(index, start + k + 1, start + k);
      else indices.push(index, start + k, start + k + 1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Broad sculpted blade, with a lifted central rib, swept tip and scalloped edge. */
export function createLeafGeometry({
  length = 9,
  width = 3.5,
  curl = 1,
  detail = 'high',
  tint = [1, 1, 1],
  segments = detail === 'high' ? 6 : 3,
  ribs = detail === 'high' ? 4 : 2,
} = {}) {
  const rows = segments,
    columns = ribs;
  const positions = [],
    uvs = [],
    colors = [],
    indices = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const outline = Math.pow(
      Math.sin(Math.PI * Math.max(0.015, Math.min(0.985, t))),
      0.72,
    );
    for (let k = 0; k <= columns; k++) {
      const side = (k / columns) * 2 - 1;
      const x =
        side * width * 0.5 * outline * (1 + 0.055 * Math.sin(t * 8 * Math.PI));
      const y =
        Math.sin(t * Math.PI) * length * 0.13 -
        t * t * length * 0.17 * curl +
        (1 - side * side) * outline * width * 0.16;
      positions.push(x, y, t * length);
      uvs.push(t, (side + 1) * 0.5);
      const value = 0.72 + (1 - Math.abs(side)) * 0.18 + t * 0.1;
      colors.push(tint[0] * value, tint[1] * value, tint[2] * value);
      if (j < rows && k < columns) {
        const a = j * (columns + 1) + k,
          b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A gently bent full-image card, stem anchored at bottom centre (local origin). */
export function createFoliageSprayGeometry({
  length = 16,
  width = 16,
  bend = 1.4,
  tint = [1, 1, 1],
} = {}) {
  const positions = [],
    colors = [],
    uvs = [],
    indices = [];
  for (let row = 0; row < 3; row++) {
    const t = row / 2;
    for (let side = 0; side < 2; side++) {
      positions.push(
        (side - 0.5) * width,
        Math.sin(t * Math.PI) * bend,
        t * length,
      );
      uvs.push(side, t);
      const value = 0.84 + t * 0.16;
      colors.push(tint[0] * value, tint[1] * value, tint[2] * value);
    }
    if (row < 2) {
      const a = row * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function mergeParts(parts) {
  if (!parts.length)
    throw new Error('Living Forest geometry requires at least one part');
  const result = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function createRockGeometry(seed = 0, detail = 'high') {
  const geometry = new T.IcosahedronGeometry(1, detail === 'high' ? 3 : 1);
  const p = geometry.attributes.position,
    colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const noise =
      Math.sin(x * 5 + seed) * Math.sin(z * 4 - seed) * 0.12 +
      Math.sin(y * 11 + x * 4) * 0.045;
    p.setXYZ(
      i,
      x * (1 + noise) * 5.5,
      (y + 1) * 3.8 * (1 + noise),
      z * (1 + noise) * 4.6,
    );
    const moss = Math.max(0, y) * 0.5;
    colors.push(0.5 - moss * 0.12, 0.59 + moss * 0.14, 0.57 - moss * 0.04);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
