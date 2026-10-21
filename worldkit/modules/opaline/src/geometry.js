import * as T from 'three';

const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

function stoneNoise(x, y, z, seed) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  const hash = (a, b, c) => {
    const q =
      Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed * 0.113) * 43758.5453;
    return q - Math.floor(q);
  };
  const lower = T.MathUtils.lerp(
    T.MathUtils.lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx),
    T.MathUtils.lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx),
    fy,
  );
  const upper = T.MathUtils.lerp(
    T.MathUtils.lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx),
    T.MathUtils.lerp(
      hash(ix, iy + 1, iz + 1),
      hash(ix + 1, iy + 1, iz + 1),
      fx,
    ),
    fy,
  );
  return T.MathUtils.lerp(lower, upper, fz);
}

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
  form,
} = {}) {
  validate(detail, { width, height, depth });
  if (!Number.isFinite(seed))
    throw new RangeError('Opaline seed must be finite');
  if (!['terrace', 'spire', 'shelf'].includes(profile))
    throw new RangeError('Opaline profile must be terrace, spire or shelf');
  const shape =
    form ??
    (profile === 'spire'
      ? 'split-pinnacle'
      : profile === 'shelf'
        ? 'cantilever'
        : 'cutbank');
  if (
    ![
      'cutbank',
      'folded-bastion',
      'eroded-bowl',
      'needle',
      'split-pinnacle',
      'cantilever',
    ].includes(shape)
  )
    throw new RangeError('Unknown Opaline mineral form');
  const high = detail === 'high',
    sides = high ? 64 : 32;
  // Exact ledge stations are shared by both LODs. Broad fracture planes are
  // polygonal; fine surface grains belong to the material, never vertex noise.
  const lowHeights = [
    0, 0.07, 0.14, 0.23, 0.25, 0.28, 0.32, 0.37, 0.41, 0.45, 0.49, 0.53, 0.59,
    0.62, 0.65, 0.69, 0.73, 0.76, 0.8, 0.84, 0.88, 0.91, 0.94, 0.97, 1,
  ];
  const profiles = {
    cutbank: [
      1, 0.97, 0.88, 0.79, 1.02, 1, 0.96, 0.89, 0.79, 0.75, 0.78, 0.91, 0.94,
      0.9, 0.86, 0.78, 0.76, 0.82, 0.87, 0.86, 0.85, 0.82, 0.8, 0.78, 0.75,
    ],
    'folded-bastion': [
      1, 0.88, 0.79, 0.72, 0.93, 0.99, 0.96, 0.9, 0.78, 0.72, 0.74, 0.91, 0.95,
      0.91, 0.84, 0.78, 0.71, 0.84, 0.93, 0.94, 0.88, 0.82, 0.78, 0.83, 0.79,
    ],
    'eroded-bowl': [
      0.7, 0.72, 0.73, 0.74, 0.82, 0.91, 0.95, 0.98, 1.01, 1.02, 1, 0.98, 0.97,
      0.98, 1, 0.97, 0.94, 0.93, 0.94, 0.95, 0.95, 0.97, 1.01, 1.02, 1,
    ],
    cantilever: [
      0.5, 0.49, 0.5, 0.53, 0.56, 0.6, 0.63, 0.67, 0.68, 0.67, 0.65, 0.66, 0.7,
      0.72, 0.73, 0.76, 0.83, 0.98, 1.05, 1.06, 1.02, 0.98, 0.96, 0.94, 0.9,
    ],
  };
  const sectionRadii = profiles[shape] ?? profiles['folded-bastion'];
  const heights = [...lowHeights];
  if (high) {
    for (let i = 0; i < lowHeights.length - 1; i++)
      heights.push((lowHeights[i] + lowHeights[i + 1]) * 0.5);
    for (let i = 0; i < 8; i++)
      heights.push(lowHeights[i * 3] * 0.75 + lowHeights[i * 3 + 1] * 0.25);
    heights.sort((a, b) => a - b);
  }
  const rings = heights.length - 1,
    phase = seed * 0.731,
    positions = [],
    uvs = [],
    indices = [];
  const rib = shape === 'needle' || shape === 'split-pinnacle';
  const curveX = Math.sin(phase) * width * (rib ? 0.23 : 0.12),
    curveZ = Math.cos(phase * 0.8) * depth * (rib ? 0.14 : 0.08);
  const maxTop =
    shape === 'eroded-bowl'
      ? 0.66
      : shape === 'needle'
        ? 0.84
        : shape === 'split-pinnacle'
          ? 0.74
          : 0.97;
  const cornerRadii = Array.from(
    { length: 16 },
    (_, i) =>
      0.94 +
      Math.sin(i * 0.93 + phase) * 0.105 +
      Math.cos(i * 1.7 - phase) * 0.065,
  );
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
    function contour(corner) {
      const i = corner % 16,
        angle = (i / 16) * TAU;
      const sector =
        0.38 + 0.62 * (0.5 + 0.5 * Math.sin(angle + phase + t * 2.2));
      let envelope =
        0.97 - 0.22 * t + (sectionRadius - (0.97 - 0.22 * t)) * sector;
      if (shape === 'cantilever' || shape === 'eroded-bowl')
        envelope = sectionRadius;
      if (shape === 'needle')
        envelope =
          0.81 -
          0.45 * t -
          0.12 * smooth(T.MathUtils.clamp((t - 0.78) / 0.22, 0, 1)) +
          (sectionRadius - (0.97 - 0.22 * t)) * 0.12;
      if (shape === 'split-pinnacle')
        envelope =
          0.9 -
          0.22 * t -
          0.2 * smooth(T.MathUtils.clamp((t - 0.72) / 0.28, 0, 1)) +
          (sectionRadius - (0.97 - 0.22 * t)) * 0.25;
      const fracture =
        Math.pow(0.5 + 0.5 * Math.cos(angle * 2 - phase), 4) *
        0.07 *
        Math.sin(Math.PI * t);
      const radius = envelope * (cornerRadii[i] - fracture);
      let x = Math.cos(angle) * width * 0.5 * radius,
        z = Math.sin(angle) * depth * 0.5 * radius;
      if (shape === 'cutbank') z = Math.min(z, depth * 0.33 * (1 - 0.12 * t));
      if (shape === 'needle') x *= 0.72;
      if (shape === 'split-pinnacle') z *= 0.83;
      let rim =
        1 +
        Math.sin(angle * 2 + phase) * 0.045 +
        Math.cos(angle * 3 - phase) * 0.025;
      if (shape === 'needle')
        rim = 0.79 + 0.21 * Math.pow(0.5 + 0.5 * Math.cos(angle - phase), 2);
      if (shape === 'split-pinnacle')
        rim =
          0.76 + 0.24 * Math.pow(Math.abs(Math.cos(angle + phase * 0.25)), 3);
      if (shape === 'eroded-bowl')
        rim =
          0.93 +
          Math.sin(angle * 2 + phase) * 0.045 +
          Math.cos(angle * 3) * 0.025;
      const y =
        t * height * rim +
        Math.sin(Math.PI * t) *
          height *
          (Math.sin(angle + phase) * 0.075 +
            Math.sin(angle * 2 - phase) * 0.035);
      return [x, y, z];
    }
    for (let column = 0; column <= sides; column++) {
      const segment = (column / sides) * 16,
        corner = Math.floor(segment),
        fraction = segment - corner;
      const a = contour(corner),
        b = contour(corner + 1);
      const x = T.MathUtils.lerp(a[0], b[0], fraction),
        y = T.MathUtils.lerp(a[1], b[1], fraction),
        z = T.MathUtils.lerp(a[2], b[2], fraction);
      // A few open, vertical erosion seams cut across the broad planar faces.
      // Their depth varies by face and height; they are not repeated fluting.
      const channel =
        Math.pow(Math.sin(Math.PI * fraction), 8) *
        (0.012 + 0.018 * Math.max(0, Math.sin(t * 9 + corner * 1.7 + phase))) *
        Math.sin(Math.PI * t);
      const brokenStratum =
        (Math.sin(t * 29 + corner * 1.7) * 0.004 +
          Math.sin(t * 53 - corner) * 0.003) *
        Math.sin(Math.PI * fraction);
      const relief = stoneNoise(x * 0.055, y * 0.07, z * 0.055, seed) - 0.5;
      const grit = stoneNoise(x * 0.16, y * 0.19, z * 0.16, seed + 61) - 0.5;
      const fracture = Math.pow(
        Math.max(
          0,
          1 -
            Math.abs(x * 0.73 + z * 0.52 + Math.sin(y * 0.035 + phase) * 5) /
              3.6,
        ),
        2,
      );
      const displacement =
        (relief * 3.8 + grit * 1.05 - fracture * 2.7) * Math.sin(Math.PI * t);
      const radialLength = Math.hypot(x, z) || 1;
      positions.push(
        x * (1 - channel + brokenStratum) +
          leanX +
          (x / radialLength) * displacement,
        y,
        z * (1 - channel + brokenStratum) +
          leanZ +
          (z / radialLength) * displacement,
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
    const centerY = Math.pow(Math.sin(angle), 0.72) * height;
    const frame = new T.Vector2(
      height * Math.cos(angle),
      width * 0.5 * Math.sin(angle),
    ).normalize();
    const girth =
      thickness *
      (1 +
        Math.sin(angle * 4 + phase) * 0.25 +
        Math.sin(angle * 9 - phase) * 0.055 +
        Math.pow(Math.sin(angle), 2) * 0.55);
    for (let column = 0; column <= sides; column++) {
      const around = (column / sides) * TAU;
      const wrinkle =
        1 +
        Math.sin(around * 3 + angle * 7 + phase) * 0.095 +
        Math.cos(around * 7 - angle * 13) * 0.048;
      const archErosion =
        stoneNoise(
          Math.cos(around) * 3,
          angle * 5,
          Math.sin(around) * 3,
          seed,
        ) - 0.5;
      const radial =
        Math.sign(Math.cos(around)) *
        Math.pow(Math.abs(Math.cos(around)), 0.5) *
        girth *
        (wrinkle + archErosion * 0.1);
      positions.push(
        centerX + frame.x * radial,
        centerY + frame.y * radial,
        Math.sign(Math.sin(around)) *
          Math.pow(Math.abs(Math.sin(around)), 0.5) *
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
