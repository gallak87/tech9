import * as T from 'three';
import profile from './ocean-profile.json' with { type: 'json' };
import { createLeviathanPath } from './leviathan/path.js';

export const NACRE_OCEAN_PROFILE = profile;
export const NACRE_WAVE_HEIGHT_BOUND = profile.waves.reduce(
  (height, wave) => height + wave.amplitude * (1 + wave.sharpness),
  0,
);

// CPU reference for Blender parity, clearance and deterministic motion checks.
export function sampleNacreSwell(x, z, time = 0, shelter = 1) {
  let height = 0,
    dx = 0,
    dz = 0,
    crest = 0;
  for (const wave of profile.waves) {
    const length = Math.hypot(...wave.direction);
    const ux = wave.direction[0] / length,
      uz = wave.direction[1] / length;
    const k = (Math.PI * 2) / wave.wavelength;
    const phase = k * (ux * x + uz * z - wave.speed * time) + wave.phase;
    const shaped = Math.sin(phase) - wave.sharpness * Math.cos(2 * phase);
    const derivative =
      wave.amplitude *
      k *
      (Math.cos(phase) + 2 * wave.sharpness * Math.sin(2 * phase));
    height += wave.amplitude * shaped;
    dx += derivative * ux;
    dz += derivative * uz;
    crest += (Math.max(0, Math.sin(phase)) ** 8 * wave.amplitude) / 18.3;
  }
  return {
    height: height * shelter,
    dx: dx * shelter,
    dz: dz * shelter,
    crest: crest * shelter,
  };
}

export const NACRE_WAVE_GLSL = `
vec4 nacreSwell(vec2 p,float t) {
  vec4 result=vec4(0.);
  ${profile.waves
    .map((wave) => {
      const length = Math.hypot(...wave.direction);
      const [x, z] = wave.direction.map((value) => value / length);
      const number = (value) => Number(value).toFixed(9);
      return `{vec2 direction=vec2(${number(x)},${number(z)});
      float phase=${number((Math.PI * 2) / wave.wavelength)}*(dot(direction,p)-${number(wave.speed)}*t)+${number(wave.phase)};
      float s=sin(phase);
      result.x+=${number(wave.amplitude)}*(s-${number(wave.sharpness)}*cos(2.*phase));
      result.yz+=${number((wave.amplitude * Math.PI * 2) / wave.wavelength)}*(cos(phase)+${number(2 * wave.sharpness)}*sin(2.*phase))*direction;
      result.w+=pow(max(0.,s),8.)*${number(wave.amplitude / 18.3)};}`;
    })
    .join('\n')}
  return result;
}`;

// Mean sea level stays exact within the road's reserved water corridor. Sparse
// world-space buckets keep the static mesh's shelter lookup inexpensive.
export function createNacreWaveShelter(track) {
  if (!track) return () => 1;
  const buckets = new Map(),
    cell = 200;
  for (let distance = 0; distance < track.length; distance += 10) {
    const point = track.sample(distance).position;
    const key = `${Math.floor(point.x / cell)},${Math.floor(point.z / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(point);
  }
  // Reserve mean-level landing pools for the single leviathan's authored breach.
  const pools = createLeviathanPath(track).contacts.map(
    (contact) => contact.position,
  );
  return (x, z) => {
    let nearest = Infinity;
    const ix = Math.floor(x / cell),
      iz = Math.floor(z / cell);
    for (let i = ix - 1; i <= ix + 1; i++)
      for (let j = iz - 1; j <= iz + 1; j++) {
        for (const p of buckets.get(`${i},${j}`) ?? [])
          nearest = Math.min(nearest, Math.hypot(x - p.x, z - p.z));
      }
    let strength = T.MathUtils.smoothstep(
      nearest,
      profile.roadShelter.flatRadius,
      profile.roadShelter.fullRadius,
    );
    for (const pool of pools)
      strength *= T.MathUtils.smoothstep(
        Math.hypot(x - pool.x, z - pool.z),
        80,
        130,
      );
    return strength;
  };
}

function axisCoordinates(extent, detailedExtent, spacing) {
  const positive = [0];
  let point = 0,
    step = spacing;
  while (point < extent) {
    if (point > detailedExtent) step *= 1.22;
    point = Math.min(extent, point + step);
    positive.push(point);
  }
  return [
    ...positive
      .slice(1)
      .reverse()
      .map((value) => -value),
    ...positive,
  ];
}

export function createNacreOceanGeometry(size, track, quality = 'high') {
  const center = track?.bounds.getCenter(new T.Vector3()) ?? new T.Vector3();
  const span =
    track?.bounds.getSize(new T.Vector3()) ?? new T.Vector3(1700, 0, 1200);
  const spacing =
    quality === 'low' ? profile.mesh.lowSpacing : profile.mesh.highSpacing;
  const xs = axisCoordinates(
    size / 2,
    span.x / 2 + profile.mesh.detailedMargin,
    spacing,
  );
  const zs = axisCoordinates(
    size / 2,
    span.z / 2 + profile.mesh.detailedMargin,
    spacing,
  );
  const roadShelterAt = createNacreWaveShelter(track);
  const fullDetailRadius = Math.max(span.x, span.z) / 2 + 400;
  const shelterAt = (x, z) =>
    roadShelterAt(x, z) *
    (1 -
      T.MathUtils.smoothstep(
        Math.hypot(x - center.x, z - center.z),
        fullDetailRadius,
        fullDetailRadius + 1000,
      ));
  const positions = [],
    shelter = [],
    indices = [];
  for (const z of zs)
    for (const x of xs) {
      const wx = x + center.x,
        wz = z + center.z;
      positions.push(x, 0, z);
      shelter.push(
        shelterAt(wx, wz),
        (shelterAt(wx + 1, wz) - shelterAt(wx - 1, wz)) * 0.5,
        (shelterAt(wx, wz + 1) - shelterAt(wx, wz - 1)) * 0.5,
      );
    }
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const a = j * xs.length + i,
        b = a + 1,
        c = a + xs.length,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'waveShelter',
    new T.Float32BufferAttribute(shelter, 3),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.boundingBox.min.y = -NACRE_WAVE_HEIGHT_BOUND;
  geometry.boundingBox.max.y = NACRE_WAVE_HEIGHT_BOUND;
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
    new T.Sphere(),
  );
  return geometry;
}
