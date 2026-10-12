import * as T from 'three';
import profile from './ocean-profile.json' with { type: 'json' };
import { createLeviathanPath } from './leviathan/path.js';

export const NACRE_OCEAN_PROFILE = profile;
export const NACRE_WAVE_HEIGHT_BOUND = profile.waves.reduce(
  (height, wave) => height + wave.amplitude * (1 + wave.sharpness),
  0,
);
export const NACRE_WAVE_HORIZONTAL_BOUND = profile.waves.reduce(
  (distance, wave) => distance + wave.amplitude * wave.steepness,
  0,
);
// Operator-norm bound before sheltering. Along with the shelter's maximum
// gradient this bounds the Jacobian away from folding, including transition rings.
export const NACRE_WAVE_HORIZONTAL_GRADIENT_BOUND = profile.waves.reduce(
  (slope, wave) =>
    slope +
    wave.amplitude *
      wave.steepness *
      ((Math.PI * 2) / wave.wavelength +
        (Math.PI * wave.group.depth) / wave.group.wavelength),
  0,
);
const amplitudeSum = profile.waves.reduce(
  (sum, wave) => sum + wave.amplitude,
  0,
);
const waves = profile.waves.map((wave) => ({
  ...wave,
  direction: wave.direction.map((v) => v / Math.hypot(...wave.direction)),
  k: (Math.PI * 2) / wave.wavelength,
  group: {
    ...wave.group,
    direction: wave.group.direction.map(
      (v) => v / Math.hypot(...wave.group.direction),
    ),
    k: (Math.PI * 2) / wave.group.wavelength,
  },
}));

// Coordinates parameterize the undisplaced mesh. dx/dz remain exact derivatives
// of height with respect to those coordinates; normal includes horizontal motion.
// A vec3-like array [strength, dStrength/dx, dStrength/dz] also accepts a varying
// shelter so the CPU reference can verify the GPU's complete transition normal.
export function sampleNacreSwell(x, z, time = 0, shelter = 1, resolution = 0) {
  const mask = typeof shelter === 'number' ? [shelter, 0, 0] : shelter;
  const detail =
    typeof resolution === 'number' ? [resolution, 0, 0] : resolution;
  const displacement = new T.Vector3();
  const tangentX = new T.Vector3();
  const tangentZ = new T.Vector3();
  let crest = 0;
  for (const wave of waves) {
    const [ux, uz] = wave.direction;
    const [gx, gz] = wave.group.direction;
    const phase = wave.k * (ux * x + uz * z - wave.speed * time) + wave.phase;
    const groupPhase =
      wave.group.k * (gx * x + gz * z - wave.group.speed * time) +
      wave.group.phase;
    const halfDepth = wave.group.depth * 0.5;
    const groupEnvelope = 1 - halfDepth + halfDepth * Math.sin(groupPhase);
    const groupSlope = halfDepth * wave.group.k * Math.cos(groupPhase);
    // Retain the long rollers at the horizon; remove only wavelengths the
    // local triangles cannot represent, rather than flattening the whole sea.
    const spacing = Math.max(detail[0], 0.001);
    const bandPhase = T.MathUtils.clamp(
      (wave.wavelength / spacing - 2) / 3,
      0,
      1,
    );
    const band = bandPhase * bandPhase * (3 - 2 * bandPhase);
    const bandSlope =
      (-2 * bandPhase * (1 - bandPhase) * wave.wavelength) /
      (spacing * spacing);
    const envelope = groupEnvelope * band;
    const ex = groupSlope * gx * band + groupEnvelope * bandSlope * detail[1],
      ez = groupSlope * gz * band + groupEnvelope * bandSlope * detail[2];
    const s = Math.sin(phase),
      c = Math.cos(phase);
    const height = wave.amplitude * (s - wave.sharpness * Math.cos(2 * phase));
    const heightSlope =
      wave.amplitude * wave.k * (c + 2 * wave.sharpness * Math.sin(2 * phase));
    const horizontal = wave.amplitude * wave.steepness;
    const hx = horizontal * (ex * c - envelope * wave.k * s * ux);
    const hz = horizontal * (ez * c - envelope * wave.k * s * uz);
    displacement.x += envelope * horizontal * c * ux;
    displacement.y += envelope * height;
    displacement.z += envelope * horizontal * c * uz;
    tangentX.x += hx * ux;
    tangentX.y += envelope * heightSlope * ux + ex * height;
    tangentX.z += hx * uz;
    tangentZ.x += hz * ux;
    tangentZ.y += envelope * heightSlope * uz + ez * height;
    tangentZ.z += hz * uz;
    crest += (envelope * Math.max(0, s) ** 5 * wave.amplitude) / amplitudeSum;
  }
  tangentX.multiplyScalar(mask[0]).addScaledVector(displacement, mask[1]);
  tangentZ.multiplyScalar(mask[0]).addScaledVector(displacement, mask[2]);
  tangentX.x += 1;
  tangentZ.z += 1;
  displacement.multiplyScalar(mask[0]);
  const jacobian = tangentX.x * tangentZ.z - tangentX.z * tangentZ.x;
  const normal = new T.Vector3().crossVectors(tangentZ, tangentX).normalize();
  return {
    height: displacement.y,
    dx: tangentX.y,
    dz: tangentZ.y,
    crest: crest * mask[0],
    displacement,
    normal,
    tangentX,
    tangentZ,
    jacobian,
    compression: T.MathUtils.clamp(1 - jacobian, 0, 1),
  };
}

// Generated from exactly the same wave/group constants as the CPU and Blender.
// Only evaluate per vertex: interpolate the normal and breaking-wave signals.
export const NACRE_WAVE_GLSL = `
struct NacreOcean {
  vec3 displacement;
  vec3 normal;
  float crest;
  float compression;
};
NacreOcean nacreOcean(vec2 p,float t,vec3 shelter,vec3 resolution) {
  vec3 displacement=vec3(0.);
  vec3 tangentX=vec3(0.);
  vec3 tangentZ=vec3(0.);
  float crest=0.;
  ${waves
    .map((wave) => {
      const number = (value) => Number(value).toFixed(9);
      const vec2 = (value) => `vec2(${value.map(number).join(',')})`;
      return `{
        vec2 direction=${vec2(wave.direction)};
        vec2 groupDirection=${vec2(wave.group.direction)};
        float phase=${number(wave.k)}*(dot(direction,p)-${number(wave.speed)}*t)+${number(wave.phase)};
        float groupPhase=${number(wave.group.k)}*(dot(groupDirection,p)-${number(wave.group.speed)}*t)+${number(wave.group.phase)};
        float groupEnvelope=${number(1 - wave.group.depth * 0.5)}+${number(wave.group.depth * 0.5)}*sin(groupPhase);
        vec2 groupSlope=${number(wave.group.depth * 0.5 * wave.group.k)}*cos(groupPhase)*groupDirection;
        float spacing=max(resolution.x,.001);
        float bandPhase=clamp((${number(wave.wavelength)}/spacing-2.)/3.,0.,1.);
        float band=bandPhase*bandPhase*(3.-2.*bandPhase);
        float bandDerivative=-2.*bandPhase*(1.-bandPhase)*${number(wave.wavelength)}/(spacing*spacing);
        float envelope=groupEnvelope*band;
        vec2 envelopeSlope=groupSlope*band+groupEnvelope*bandDerivative*resolution.yz;
        float s=sin(phase),c=cos(phase);
        float height=${number(wave.amplitude)}*(s-${number(wave.sharpness)}*cos(2.*phase));
        float heightSlope=${number(wave.amplitude * wave.k)}*(c+${number(2 * wave.sharpness)}*sin(2.*phase));
        vec2 horizontalSlope=${number(wave.amplitude * wave.steepness)}*(envelopeSlope*c-envelope*${number(wave.k)}*s*direction);
        displacement+=envelope*vec3(${number(wave.amplitude * wave.steepness)}*c*direction.x,height,${number(wave.amplitude * wave.steepness)}*c*direction.y);
        tangentX+=vec3(horizontalSlope.x*direction.x,envelope*heightSlope*direction.x+envelopeSlope.x*height,horizontalSlope.x*direction.y);
        tangentZ+=vec3(horizontalSlope.y*direction.x,envelope*heightSlope*direction.y+envelopeSlope.y*height,horizontalSlope.y*direction.y);
        crest+=envelope*pow(max(0.,s),5.)*${number(wave.amplitude / amplitudeSum)};
      }`;
    })
    .join('\n')}
  tangentX=tangentX*shelter.x+displacement*shelter.y+vec3(1.,0.,0.);
  tangentZ=tangentZ*shelter.x+displacement*shelter.z+vec3(0.,0.,1.);
  float jacobian=tangentX.x*tangentZ.z-tangentX.z*tangentZ.x;
  NacreOcean result;
  result.displacement=displacement*shelter.x;
  result.normal=normalize(cross(tangentZ,tangentX));
  result.crest=crest*shelter.x;
  result.compression=clamp(1.-jacobian,0.,1.);
  return result;
}`;

// Protect only the physical deck footprint plus the mesh interpolation guard.
// High bridges and deep submerged road do not create calm water above/below them.
// The minimum banked edge clearance limits nearby swell height, recovering to the
// full storm immediately outside this narrow corridor. Gaps contain no deck.
export function createNacreWaveShelter(track) {
  if (!track) return () => 1;
  const protection = profile.roadShelter;
  const inner = track.width / 2 + protection.meshGuard;
  const outer = inner + protection.recoveryWidth;
  const buckets = new Map();
  const cell = outer;
  const waterY = track.waterY ?? 0;
  for (
    let distance = 0;
    distance < track.length;
    distance += protection.sampleStep
  ) {
    if (track.isGap?.(distance)) continue;
    const frame = track.sample(distance);
    const edgeHeight = (Math.abs(frame.right.y) * track.width) / 2;
    const clearance = Math.max(
      0,
      Math.abs(frame.position.y - waterY) - edgeHeight - protection.deckMargin,
    );
    const strength = Math.min(1, clearance / NACRE_WAVE_HEIGHT_BOUND);
    if (strength >= 1) continue;
    const point = frame.position;
    const key = `${Math.floor(point.x / cell)},${Math.floor(point.z / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ x: point.x, z: point.z, strength });
  }
  const pools = createLeviathanPath(track).contacts.map(
    (contact) => contact.position,
  );
  return (x, z) => {
    let strength = 1;
    const ix = Math.floor(x / cell),
      iz = Math.floor(z / cell);
    for (let i = ix - 1; i <= ix + 1; i++)
      for (let j = iz - 1; j <= iz + 1; j++)
        for (const point of buckets.get(`${i},${j}`) ?? []) {
          const fade = T.MathUtils.smoothstep(
            Math.hypot(x - point.x, z - point.z),
            inner,
            outer,
          );
          strength = Math.min(
            strength,
            T.MathUtils.lerp(point.strength, 1, fade),
          );
        }
    for (const pool of pools)
      strength = Math.min(
        strength,
        T.MathUtils.smoothstep(
          Math.hypot(x - pool.x, z - pool.z),
          protection.contactFlatRadius,
          protection.contactFullRadius,
        ),
      );
    return strength;
  };
}

function axisCoordinates(extent, detailedExtent, spacing) {
  const positive = [0];
  let point = 0,
    step = spacing;
  while (point < extent) {
    if (point > detailedExtent)
      step = Math.min(profile.mesh.farSpacing, step * 1.18);
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
  const shelterAt = createNacreWaveShelter(track);
  const positions = [],
    shelter = [],
    resolution = [],
    indices = [];
  const axisSpacing = (axis) =>
    axis.map((value, index) =>
      Math.max(
        index > 0 ? value - axis[index - 1] : 0,
        index < axis.length - 1 ? axis[index + 1] - value : 0,
      ),
    );
  const xSpacing = axisSpacing(xs),
    zSpacing = axisSpacing(zs);
  const derivative = (axis, values, index) => {
    const before = Math.max(0, index - 1),
      after = Math.min(axis.length - 1, index + 1);
    return (values[after] - values[before]) / (axis[after] - axis[before]);
  };
  for (let j = 0; j < zs.length; j++)
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i],
        z = zs[j];
      const wx = x + center.x,
        wz = z + center.z;
      positions.push(x, 0, z);
      shelter.push(
        shelterAt(wx, wz),
        shelterAt(wx + 0.5, wz) - shelterAt(wx - 0.5, wz),
        shelterAt(wx, wz + 0.5) - shelterAt(wx, wz - 0.5),
      );
      const xDominant = xSpacing[i] >= zSpacing[j];
      resolution.push(
        Math.max(xSpacing[i], zSpacing[j]),
        xDominant ? derivative(xs, xSpacing, i) : 0,
        xDominant ? 0 : derivative(zs, zSpacing, j),
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
  geometry.setAttribute(
    'waveResolution',
    new T.Float32BufferAttribute(resolution, 3),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.boundingBox.min.x -= NACRE_WAVE_HORIZONTAL_BOUND;
  geometry.boundingBox.max.x += NACRE_WAVE_HORIZONTAL_BOUND;
  geometry.boundingBox.min.z -= NACRE_WAVE_HORIZONTAL_BOUND;
  geometry.boundingBox.max.z += NACRE_WAVE_HORIZONTAL_BOUND;
  geometry.boundingBox.min.y = -NACRE_WAVE_HEIGHT_BOUND;
  geometry.boundingBox.max.y = NACRE_WAVE_HEIGHT_BOUND;
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
    new T.Sphere(),
  );
  return geometry;
}
