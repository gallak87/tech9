import * as T from 'three';

// Irregular unit meshes are shared by instances; silhouettes, not texture grids,
// carry the natural forms. Shapes fit the same conservative unit envelopes.
export function createBasaltSpire(variant = 0) {
  const vertices = [];
  const sides = 9,
    rings = 9;
  function point(ring, side) {
    const t = ring / rings;
    const angle = (side / sides) * Math.PI * 2;
    const lobe =
      0.78 +
      0.12 * Math.sin(angle * 3 + variant) +
      0.07 * Math.cos(angle * 5 - variant);
    const profile =
      Math.pow(1 - t, 0.52) * (0.84 + 0.11 * Math.cos(t * 12 + variant));
    const radius = (0.035 + profile) * lobe;
    return [
      Math.cos(angle) * radius + Math.sin(t * 4 + variant) * t * 0.12,
      t - 0.5,
      Math.sin(angle) * radius + Math.cos(t * 5 - variant) * t * 0.1,
    ];
  }
  function triangle(a, b, c) {
    vertices.push(...a, ...b, ...c);
  }
  for (let r = 0; r < rings; r += 1)
    for (let s = 0; s < sides; s += 1) {
      const a = point(r, s),
        b = point(r, s + 1),
        c = point(r + 1, s),
        d = point(r + 1, s + 1);
      triangle(a, c, b);
      triangle(b, c, d);
    }
  for (let s = 0; s < sides; s += 1) {
    triangle([0, -0.5, 0], point(0, s), point(0, s + 1));
    triangle(point(rings, s), [0, 0.5, 0], point(rings, s + 1));
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createReefRock(variant = 0) {
  const geometry = new T.IcosahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const weathering =
      0.78 +
      0.12 *
        Math.sin(x * 5.2 + y * 3.1 + variant) *
        Math.cos(z * 4.7 - variant) +
      0.07 * Math.cos(y * 7.1 + z * 2.3);
    p.setXYZ(i, x * weathering, y * (0.82 + weathering * 0.15), z * weathering);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createSeaFan(rays = 12, steps = 4) {
  const positions = [],
    colors = [];
  function point(radial, ray) {
    const r = radial / steps;
    const a = -1.24 + (ray / rays) * 2.48;
    const fringe = 1 + 0.075 * Math.sin(a * 16) + 0.03 * Math.cos(a * 29);
    return [
      Math.sin(a) * r * fringe,
      Math.cos(a) * r * fringe,
      Math.sin(a * 2.5) * r * r * 0.19,
    ];
  }
  function vertex(p, radius) {
    positions.push(...p);
    const edge = T.MathUtils.smoothstep(radius, 0.65, 1);
    const color = new T.Color('#476e65').lerp(
      new T.Color('#c5ddca'),
      edge * 0.8,
    );
    colors.push(color.r, color.g, color.b);
  }
  for (let r = 0; r < steps; r += 1)
    for (let s = 0; s < rays; s += 1) {
      const a = point(r, s),
        b = point(r, s + 1),
        c = point(r + 1, s),
        d = point(r + 1, s + 1);
      vertex(a, r / steps);
      vertex(c, (r + 1) / steps);
      vertex(b, r / steps);
      vertex(b, r / steps);
      vertex(c, (r + 1) / steps);
      vertex(d, (r + 1) / steps);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createFanEdge() {
  const vertices = [];
  const point = (ray, radius) => {
    const a = -1.24 + (ray / 24) * 2.48;
    const fringe = 1 + 0.075 * Math.sin(a * 16) + 0.03 * Math.cos(a * 29);
    return [
      Math.sin(a) * radius * fringe,
      Math.cos(a) * radius * fringe,
      Math.sin(a * 2.5) * radius * radius * 0.19,
    ];
  };
  for (let ray = 0; ray < 24; ray += 1) {
    const a = point(ray, 0.958),
      b = point(ray + 1, 0.958),
      c = point(ray, 1),
      d = point(ray + 1, 1);
    vertices.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createReefRibbon() {
  const vertices = [];
  const point = (row, across) => {
    const t = row / 18;
    const width = 0.02 + 0.24 * Math.sin(t * Math.PI) ** 0.65;
    return [
      Math.sin(t * 2.7) * 0.29 + across * width,
      t,
      Math.sin(t * 4.1) * 0.15 + t * t * 0.13 + across * across * 0.04,
    ];
  };
  for (let row = 0; row < 18; row += 1)
    for (let side = -1; side < 1; side += 1) {
      const a = point(row, side),
        b = point(row, side + 1),
        c = point(row + 1, side),
        d = point(row + 1, side + 1);
      vertices.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
