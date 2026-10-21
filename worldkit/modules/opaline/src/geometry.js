import * as T from 'three';

const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

function validate(detail, dimensions) {
  if (!['high', 'low'].includes(detail))
    throw new RangeError('Opaline detail must be high or low');
  for (const [key, value] of Object.entries(dimensions))
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(`Opaline ${key} must be finite and positive`);
}

function finish(positions, uvs, indices, rings, sides) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // A duplicated UV seam must not become a visible lighting seam.
  const normals = geometry.attributes.normal;
  const n = new T.Vector3();
  for (let row = 0; row <= rings; row++) {
    const first = row * (sides + 1),
      last = first + sides;
    n.set(
      normals.getX(first) + normals.getX(last),
      normals.getY(first) + normals.getY(last),
      normals.getZ(first) + normals.getZ(last),
    ).normalize();
    normals.setXYZ(first, n.x, n.y, n.z);
    normals.setXYZ(last, n.x, n.y, n.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function connectRings(indices, rings, sides) {
  const stride = sides + 1;
  for (let row = 0; row < rings; row++)
    for (let column = 0; column < sides; column++) {
      const a = row * stride + column,
        b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
}

/**
 * Closed, seeded ceramic geology. Dimensions are nominal metres; contour
 * deviations remain within ~18%. Base is y=0; x/z are centered. No collision
 * surface is implied: the consumer places these beside its authored route.
 */
export function createOpalineMassGeometry({
  seed = 7319,
  width = 100,
  height = 80,
  depth = 90,
  detail = 'high',
  profile = 'terrace',
} = {}) {
  validate(detail, { width, height, depth });
  if (!Number.isFinite(seed))
    throw new RangeError('Opaline seed must be finite');
  if (!['terrace', 'spire', 'shelf'].includes(profile))
    throw new RangeError('Opaline profile must be terrace, spire or shelf');
  const high = detail === 'high',
    sides = high ? 64 : 32;
  // Preserve the authored break heights in both LODs: uniformly spaced low
  // rings rounded away the overhang lips and made distant masses look soft.
  const lowHeights = [
    0, 0.07, 0.14, 0.23, 0.25, 0.28, 0.32, 0.37, 0.41, 0.45, 0.49, 0.53, 0.59,
    0.62, 0.65, 0.69, 0.73, 0.76, 0.8, 0.84, 0.88, 0.91, 0.94, 0.97, 1,
  ];
  const sectionRadii = [
    1, 0.91, 0.78, 0.71, 0.96, 1.02, 0.94, 0.87, 0.65, 0.62, 0.65, 0.88, 0.91,
    0.84, 0.77, 0.66, 0.63, 0.82, 0.86, 0.82, 0.77, 0.73, 0.68, 0.71, 0.63,
  ];
  const heights = [...lowHeights];
  if (high) {
    for (let i = 0; i < lowHeights.length - 1; i++)
      heights.push((lowHeights[i] + lowHeights[i + 1]) * 0.5);
    for (let i = 0; i < 8; i++)
      heights.push(lowHeights[i * 3] * 0.75 + lowHeights[i * 3 + 1] * 0.25);
    heights.sort((a, b) => a - b);
  }
  const rings = heights.length - 1;
  const phase = seed * 0.731,
    positions = [],
    uvs = [],
    indices = [];
  const curveX = Math.sin(phase) * width * 0.22,
    curveZ = Math.cos(phase * 0.8) * depth * 0.15;
  const maxTop = profile === 'spire' ? 0.84 : 1;
  for (let row = 0; row <= rings; row++) {
    const t = heights[row];
    let section = 0;
    while (section < lowHeights.length - 2 && lowHeights[section + 1] < t)
      section++;
    const local =
      (t - lowHeights[section]) /
      (lowHeights[section + 1] - lowHeights[section]);
    const sectionRadius = T.MathUtils.lerp(
      sectionRadii[section],
      sectionRadii[section + 1],
      local,
    );
    const leanX = curveX * t * t,
      leanZ = curveZ * t * t;
    for (let column = 0; column <= sides; column++) {
      const angle = (column / sides) * TAU;
      const sector =
        0.3 +
        0.7 * Math.pow(0.5 + 0.5 * Math.sin(angle + phase + t * 4.5), 0.65);
      let envelope =
        0.96 - 0.3 * t + (sectionRadius - (0.96 - 0.3 * t)) * sector;
      if (profile === 'shelf')
        envelope *= 0.62 + 0.48 * smooth(Math.min(1, t / 0.72));
      if (profile === 'spire') {
        const ribTaper =
          0.92 -
          0.45 * t -
          0.2 * smooth(T.MathUtils.clamp((t - 0.76) / 0.24, 0, 1));
        envelope = ribTaper + (sectionRadius - (0.96 - 0.3 * t)) * 0.45;
      }
      const broadFold =
        Math.sin(angle * 3 + phase) * 0.13 +
        Math.cos(angle * 5 - phase * 0.6 + t * 0.6) * 0.08;
      const fissure =
        Math.pow(
          0.5 + 0.5 * Math.sin(angle * 5 + phase + Math.sin(t * 5) * 0.45),
          7,
        ) * 0.18;
      const split =
        Math.pow(0.5 + 0.5 * Math.cos(angle * 9 - phase + t * 0.8), 9) * 0.075;
      const striation =
        Math.sin(t * 36 + Math.sin(angle * 2 + phase) * 2.4) * 0.017 +
        Math.cos(t * 71 + angle * 5) * 0.008;
      const radius = envelope * (1 + broadFold - fissure - split + striation);
      const brokenRim =
        Math.sin(angle * 3 + phase) * 0.065 +
        Math.cos(angle * 5 - phase) * 0.038;
      let y =
        t * height * (1 + brokenRim) +
        Math.sin(Math.PI * t) * height * Math.sin(angle * 2 + phase) * 0.065;
      if (profile === 'spire')
        y =
          t *
          height *
          (0.83 + 0.17 * Math.pow(0.5 + 0.5 * Math.cos(angle * 3 + phase), 2));
      positions.push(
        Math.cos(angle) * width * 0.5 * radius + leanX,
        y,
        Math.sin(angle) * depth * 0.5 * radius + leanZ,
      );
      uvs.push((column / sides) * (width + depth) * 0.035, t * height * 0.07);
    }
  }
  connectRings(indices, rings, sides);
  const bottom = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);
  const top = positions.length / 3;
  positions.push(curveX, height * maxTop, curveZ);
  uvs.push(0.5, 0.5);
  const last = rings * (sides + 1);
  for (let column = 0; column < sides; column++) {
    indices.push(bottom, column, column + 1);
    indices.push(top, last + column + 1, last + column);
  }
  return finish(positions, uvs, indices, rings, sides);
}

/**
 * A closed eroded arch standing in the XY plane, open along Z. Width is the
 * centerline span; thickness is radial shell thickness, depth is full Z depth.
 * It is a sculptural mass, not a transparent or collision surface.
 */
export function createOpalineArchGeometry({
  seed = 7319,
  width = 160,
  height = 95,
  depth = 55,
  thickness = 18,
  detail = 'high',
} = {}) {
  validate(detail, { width, height, depth, thickness });
  if (!Number.isFinite(seed))
    throw new RangeError('Opaline seed must be finite');
  const high = detail === 'high',
    rings = high ? 80 : 32,
    sides = high ? 24 : 12;
  const positions = [],
    uvs = [],
    indices = [],
    phase = seed * 0.731;
  for (let row = 0; row <= rings; row++) {
    const t = row / rings,
      angle = t * Math.PI;
    const centerX =
      Math.cos(angle) * width * 0.5 +
      Math.sin(angle) * Math.sin(angle * 3 + phase) * width * 0.045;
    const centerY = Math.sin(angle) * height;
    const frame = new T.Vector2(
      height * Math.cos(angle),
      width * 0.5 * Math.sin(angle),
    ).normalize();
    const girth =
      thickness *
      (1 +
        Math.sin(angle * 4 + phase) * 0.25 +
        Math.sin(angle * 9 - phase) * 0.055);
    for (let column = 0; column <= sides; column++) {
      const around = (column / sides) * TAU;
      const wrinkle =
        1 +
        Math.sin(around * 3 + angle * 7 + phase) * 0.095 +
        Math.cos(around * 7 - angle * 13) * 0.048;
      const radial =
        Math.sign(Math.cos(around)) *
        Math.pow(Math.abs(Math.cos(around)), 0.7) *
        girth *
        wrinkle;
      positions.push(
        centerX + frame.x * radial,
        centerY + frame.y * radial,
        Math.sign(Math.sin(around)) *
          Math.pow(Math.abs(Math.sin(around)), 0.7) *
          depth *
          0.5 *
          wrinkle,
      );
      uvs.push(t * (width + height) * 0.07, (column / sides) * depth * 0.14);
    }
  }
  connectRings(indices, rings, sides);
  const start = positions.length / 3;
  positions.push(width * 0.5, 0, 0);
  uvs.push(0.5, 0.5);
  const end = positions.length / 3;
  positions.push(-width * 0.5, 0, 0);
  uvs.push(0.5, 0.5);
  const last = rings * (sides + 1);
  for (let column = 0; column < sides; column++) {
    indices.push(start, column, column + 1);
    indices.push(end, last + column + 1, last + column);
  }
  return finish(positions, uvs, indices, rings, sides);
}
