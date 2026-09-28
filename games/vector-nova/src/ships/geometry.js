import * as THREE from 'three';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';

// Original editable geometry for Kestrel. Dimensions are metres. Each station
// is [z, centreX, halfWidth, centreY, roofHeight, bellyDepth].
export function sectionAt(stations, z) {
  let i = 0;
  while (i < stations.length - 2 && stations[i + 1][0] < z) i++;
  const a = stations[Math.max(0, i - 1)];
  const b = stations[i];
  const c = stations[i + 1];
  const d = stations[Math.min(stations.length - 1, i + 2)];
  const t = THREE.MathUtils.clamp((z - b[0]) / (c[0] - b[0]), 0, 1);
  const t2 = t * t,
    t3 = t2 * t;
  const out = [z];
  for (let k = 1; k < 6; k++) {
    const span = c[0] - b[0];
    const m0 = ((c[k] - a[k]) / (c[0] - a[0])) * span;
    const m1 = ((d[k] - b[k]) / (d[0] - b[0])) * span;
    out.push(
      (2 * t3 - 3 * t2 + 1) * b[k] +
        (t3 - 2 * t2 + t) * m0 +
        (-2 * t3 + 3 * t2) * c[k] +
        (t3 - t2) * m1,
    );
  }
  return out;
}

export function shellPoint(stations, z, angle, offset = 0, exponent = 0.72) {
  const s = sectionAt(stations, z),
    c = Math.cos(angle),
    t = Math.sin(angle);
  const rx = Math.max(0.006, s[2]) + offset;
  const ry = Math.max(0.006, t >= 0 ? s[4] : s[5]) + offset;
  return new THREE.Vector3(
    s[1] + Math.sign(c) * Math.abs(c) ** exponent * rx,
    s[3] + Math.sign(t) * Math.abs(t) ** exponent * ry,
    z,
  );
}

export function shell(
  stations,
  {
    from = stations[0][0],
    to = stations.at(-1)[0],
    sides = 36,
    steps = 58,
    exponent = 0.72,
    offset = 0,
  } = {},
) {
  const positions = [],
    uv = [],
    indices = [];
  for (let row = 0; row <= steps; row++) {
    const z = THREE.MathUtils.lerp(from, to, row / steps);
    for (let col = 0; col <= sides; col++) {
      positions.push(
        ...shellPoint(
          stations,
          z,
          (col / sides) * Math.PI * 2,
          offset,
          exponent,
        ).toArray(),
      );
      uv.push(col / sides, (z - from) / (to - from));
    }
  }
  for (let row = 0; row < steps; row++)
    for (let col = 0; col < sides; col++) {
      const a = row * (sides + 1) + col,
        b = a + 1,
        c = b + sides + 1,
        d = c - 1;
      indices.push(a, b, c, a, c, d);
    }
  // Separate cap vertices preserve the machined edge instead of ballooning it.
  for (const [z, flip] of [
    [from, true],
    [to, false],
  ]) {
    const start = positions.length / 3,
      s = sectionAt(stations, z);
    positions.push(s[1], s[3], z);
    uv.push(0.5, 0.5);
    for (let col = 0; col < sides; col++) {
      const angle = (col / sides) * Math.PI * 2;
      positions.push(
        ...shellPoint(stations, z, angle, offset, exponent).toArray(),
      );
      uv.push(Math.cos(angle) * 0.5 + 0.5, Math.sin(angle) * 0.5 + 0.5);
    }
    for (let col = 0; col < sides; col++) {
      const b = start + col + 1,
        c = start + ((col + 1) % sides) + 1;
      indices.push(start, flip ? c : b, flip ? b : c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let row = 0; row <= steps; row++) {
    const a = row * (sides + 1),
      b = a + sides;
    const v = new THREE.Vector3()
      .fromBufferAttribute(normals, a)
      .add(new THREE.Vector3().fromBufferAttribute(normals, b))
      .normalize();
    normals.setXYZ(a, v.x, v.y, v.z);
    normals.setXYZ(b, v.x, v.y, v.z);
  }
  return geometry;
}

// A curved skin follows the hull precisely; usable for enamel markings and
// thin metal inlays without flat floating rectangles.
export function skin(
  stations,
  z0,
  z1,
  angle0,
  angle1,
  offset = 0.014,
  steps = 24,
) {
  const positions = [],
    uv = [],
    indices = [],
    columns = 6;
  for (let row = 0; row <= steps; row++)
    for (let col = 0; col <= columns; col++) {
      positions.push(
        ...shellPoint(
          stations,
          THREE.MathUtils.lerp(z0, z1, row / steps),
          THREE.MathUtils.lerp(angle0, angle1, col / columns),
          offset,
        ).toArray(),
      );
      uv.push(col / columns, row / steps);
    }
  for (let row = 0; row < steps; row++)
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col;
      indices.push(
        a,
        a + 1,
        a + columns + 2,
        a,
        a + columns + 2,
        a + columns + 1,
      );
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function transformed(
  geometry,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return geometry;
}

export function reflect(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.scale(-1, 1, 1);
  for (const attr of Object.values(g.attributes)) {
    for (let v = 0; v < attr.count; v += 3)
      for (let k = 0; k < attr.itemSize; k++) {
        const a = (v + 1) * attr.itemSize + k,
          b = (v + 2) * attr.itemSize + k;
        const temp = attr.array[a];
        attr.array[a] = attr.array[b];
        attr.array[b] = temp;
      }
  }
  return g;
}

export function combine(parts) {
  const normalized = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    for (const key of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv)
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          new Float32Array(g.attributes.position.count * 2),
          2,
        ),
      );
    return g;
  });
  const result = mergeGeometries(normalized, false);
  normalized.forEach((g) => g.dispose());
  parts.forEach((g) => g.dispose());
  return result;
}

export function pipe(points, radius = 0.025) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    Math.max(12, points.length * 5),
    radius,
    7,
    false,
  );
}

export function axialTube(x, y, z, radius, wall, length, curveSegments = 36) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius - wall, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.016,
    bevelThickness: 0.016,
    curveSegments,
  });
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const smooth = mergeVertices(raw, 0.00001);
  smooth.computeVertexNormals();
  raw.dispose();
  return transformed(smooth, x, y, z);
}

export function plate(outline, depth = 0.05, radius = 0.02) {
  const shape = new THREE.Shape();
  shape.moveTo(...outline[0]);
  for (const p of outline.slice(1)) shape.lineTo(...p);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: radius,
    bevelThickness: radius,
    bevelSegments: 2,
    steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}
