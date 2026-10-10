import * as T from 'three';
import { shatterlineRouteSpace } from './route-space.js';
const hash = (x, z) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const smooth = (t) => t * t * (3 - 2 * t);
const noise = (x, z) => {
  const i = Math.floor(x),
    j = Math.floor(z),
    u = smooth(x - i),
    v = smooth(z - j);
  return T.MathUtils.lerp(
    T.MathUtils.lerp(hash(i, j), hash(i + 1, j), u),
    T.MathUtils.lerp(hash(i, j + 1), hash(i + 1, j + 1), u),
    v,
  );
};
const fbm = (x, z) =>
  noise(x, z) * 0.58 +
  noise(x * 2.07, z * 2.07) * 0.28 +
  noise(x * 4.31, z * 4.31) * 0.14;
const terrainFrames = new WeakMap();
const mountainProfiles = new WeakMap();
// The distant massif has its own drainage and tectonic grain. In particular it
// never samples the local launch ramps, receiving shelves or inversion profile.
function mountainHeight(track, x, z) {
  let profile = mountainProfiles.get(track);
  if (!profile) {
    const start = track.sample(0).position,
      end = track.sample(track.length).position;
    profile = {
      start: start.y,
      end: end.y,
      length: track.spineZAt ? track.spineZAt(track.sourceLength) : 11050,
    };
    mountainProfiles.set(track, profile);
  }
  const progress = T.MathUtils.clamp(z / profile.length, 0, 1);
  const grade = T.MathUtils.lerp(
    profile.start - 330,
    profile.end - 390,
    Math.pow(progress, 1.08),
  );
  const warp = (fbm(x * 0.00023 + 7, z * 0.00026) - 0.5) * 1250;
  const across = x + (z - profile.length * 0.5) * 0.15 + warp;
  const spine = (centre, width, phase, height) => {
    const centreline =
      centre +
      Math.sin(z * 0.00041 + phase) * 650 +
      Math.sin(z * 0.00097 + phase) * 170;
    const ridge = Math.max(0, 1 - Math.abs(across - centreline) / width);
    // Unequal triangular peaks and deep transverse drainage cut the crest.
    const station = z * 0.00047 + phase,
      cell = Math.floor(station),
      t = station - cell;
    const crest = T.MathUtils.lerp(
      0.38 + hash(cell, phase) * 0.82,
      0.38 + hash(cell + 1, phase) * 0.82,
      t,
    );
    const gully = Math.pow(
      Math.max(
        0,
        1 - Math.abs(Math.sin(z * 0.00112 + across * 0.00036 + phase)) * 2.7,
      ),
      2,
    );
    return height * Math.pow(ridge, 1.35) * (crest - gully * 0.38);
  };
  const ranges =
    spine(2800, 2650, 0.9, 1440) +
    spine(-4900, 3000, 3.2, 1150) +
    spine(8400, 3900, 7.1, 1760);
  const fractures =
    (Math.abs(noise(x * 0.00105 + z * 0.00029, z * 0.00134) * 2 - 1) - 0.45) *
    170;
  const channels = Math.pow(
    Math.max(
      0,
      1 -
        Math.abs(
          Math.sin(
            z * 0.0017 +
              x * 0.00051 +
              (noise(x * 0.0004, z * 0.0004) - 0.5) * 1.7,
          ),
        ) *
          3.1,
    ),
    2,
  );
  const rearRise =
    z > profile.length ? Math.min(1, (z - profile.length) / 2200) : 0;
  return (
    grade +
    ranges +
    (fbm(x * 0.00051, z * 0.00062) - 0.5) * 270 +
    fractures -
    channels * 155 +
    rearRise * 380
  );
}
function worldFrame(track, z) {
  let cache = terrainFrames.get(track);
  if (!cache) {
    cache = new Map();
    terrainFrames.set(track, cache);
  }
  const key = Math.round(z * 2) / 2;
  if (!cache.has(key)) {
    const source = track.sourceAtSpineZ
        ? track.sourceAtSpineZ(key)
        : T.MathUtils.clamp(key, 0, track.sourceLength ?? 11050),
      distance = track.distanceAt(source);
    cache.set(key, { source, distance, frame: track.sample(distance) });
  }
  return cache.get(key);
}
/** Continuous authored bedrock height used by visible terrain and foundation roots. */
export function shatterlineGroundHeight(track, x, z) {
  const { source, distance, frame: f } = worldFrame(track, z),
    worldEnd = track.spineZAt ? track.spineZAt(track.sourceLength) : 11050;
  const lateral = x - f.position.x,
    ax = Math.abs(lateral),
    side = Math.sign(lateral);
  const broad = fbm(x * 0.00065, z * 0.00075),
    detail = fbm(x * 0.0041, z * 0.0041);
  if (z < 0)
    return T.MathUtils.lerp(
      f.position.y - 190 - 0.18 * z + (broad - 0.5) * 310,
      mountainHeight(track, x, z),
      T.MathUtils.smoothstep(-z, 0, 1800),
    );
  if (z > worldEnd) {
    const descent =
      track.sample(track.length).position.y - 210 - (z - worldEnd) * 0.024;
    const near =
      descent +
      (broad - 0.5) * 430 +
      (detail - 0.5) * 34 +
      Math.min(450, Math.abs(x) * 0.035);
    return T.MathUtils.lerp(
      near,
      mountainHeight(track, x, z),
      T.MathUtils.smoothstep(z - worldEnd, 0, 1800),
    );
  }
  let y = f.position.y - 210;
  if (ax > 62) {
    const blend = T.MathUtils.smoothstep(ax, 62, 600);
    // The reachable ravine is fixed. The independent massif takes over only
    // beyond600m, so earlier corridor/contact verification remains applicable.
    const mountain =
      f.position.y -
      90 +
      (side > 0 ? Math.min(720, ax * 0.13) : -Math.min(800, ax * 0.17));
    y = T.MathUtils.lerp(
      f.position.y - 200,
      mountain - 150 + (broad - 0.5) * 245 + (detail - 0.5) * 32,
      blend,
    );
  }
  const severance =
    Math.exp(-(((source - 1990) / 370) ** 4)) * Math.exp(-((ax / 1200) ** 2));
  const crown =
    Math.exp(-(((source - 4645) / 650) ** 4)) * Math.exp(-((ax / 1700) ** 2));
  y -= severance * 590 + crown * 390;
  for (const section of track.descents ?? []) {
    if (distance < section.start - 100 || distance > section.end + 100)
      continue;
    const enter = T.MathUtils.smoothstep(
        distance,
        section.start - 100,
        section.start + 120,
      ),
      leave =
        1 -
        T.MathUtils.smoothstep(distance, section.end - 120, section.end + 100);
    y -=
      enter *
      leave *
      (section.kind === 'inversion'
        ? 450
        : section.kind === 'corkscrew'
          ? 260
          : 150) *
      Math.exp(-((ax / 850) ** 2));
  }
  if (source > 8700) {
    const blend = T.MathUtils.smoothstep(source, 8700, 9630),
      finishY = track.sample(track.finishDistance).position.y;
    const basin =
      finishY -
      160 +
      (10420 - source) * 0.13 +
      (broad - 0.5) * 100 +
      (detail - 0.5) * 16;
    y = T.MathUtils.lerp(
      y,
      ax < 62 ? Math.min(basin, f.position.y - 200) : basin,
      blend,
    );
  }
  if (ax > 620)
    y = T.MathUtils.lerp(
      y,
      mountainHeight(track, x, z),
      T.MathUtils.smoothstep(ax, 620, 2600),
    );
  return shatterlineRouteSpace(track).excavate(
    x,
    z,
    ax < 62 ? Math.min(y, f.position.y - 195) : y,
  );
}
/** Continuous lower geology with broad eroded relief and three independently cut valleys. */
export function createShatterlineTerrainGeometry(
  track,
  { collision = false } = {},
) {
  const positions = [],
    colors = [],
    indices = [],
    count = Math.ceil(track.length / 36);
  const offsets = [
    -7200, -5600, -4400, -3350, -2540, -1860, -1280, -850, -550, -330, -180,
    -100, -62, -28, 0, 28, 62, 100, 180, 330, 550, 850, 1280, 1860, 2540, 3350,
    4400, 5600, 7200,
  ];
  if (!collision) {
    // Similar physical cell sizes retain transverse gullies instead of turning
    // the entire far valley into a few kilometer-wide ruled strips.
    const outer = [];
    for (let x = 850; x < 18000; x += x < 6500 ? 180 : 310) outer.push(x);
    outer.push(18000);
    offsets.splice(
      0,
      offsets.length,
      ...outer.toReversed().map((x) => -x),
      ...offsets.filter((x) => Math.abs(x) < 850),
      ...outer,
    );
  }
  const rows = [];
  if (!collision)
    for (let z = -4000; z < 0; z += 160)
      rows.push({ position: new T.Vector3(track.sample(0).position.x, 0, z) });
  for (let i = 0; i <= count; i++) {
    const distance = (i / count) * track.length,
      frame = track.sample(distance);
    frame.position.z = track.spineZAt(track.sourceAt(distance));
    rows.push(frame);
  }
  const worldEnd = track.spineZAt ? track.spineZAt(track.sourceLength) : 11050;
  if (!collision)
    for (let z = worldEnd + 160; z <= worldEnd + 15000; z += 160)
      rows.push({
        position: new T.Vector3(track.sample(track.length).position.x, 0, z),
      });
  for (const f of rows) {
    for (const lateral of offsets) {
      const x = f.position.x + lateral,
        z = f.position.z,
        y = shatterlineGroundHeight(track, x, z),
        broad = fbm(x * 0.00065, z * 0.00075);
      positions.push(x, y, z);
      const t = 0.88 + (broad - 0.5) * 0.19,
        far = T.MathUtils.smoothstep(Math.abs(lateral), 850, 7000);
      colors.push(
        t * (1 - far * 0.12),
        t * (0.99 - far * 0.07),
        t * (0.96 - far * 0.01),
      );
    }
  }
  for (let i = 0; i < rows.length - 1; i++)
    for (let k = 0; k < offsets.length - 1; k++) {
      const a = i * offsets.length + k,
        b = a + 1,
        c = a + offsets.length,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function createShatterlineTerrainTriangles(track) {
  const geometry = createShatterlineTerrainGeometry(track, { collision: true }),
    p = geometry.attributes.position,
    ix = geometry.index.array,
    triangles = [];
  for (let i = 0; i < ix.length; i += 3)
    triangles.push({
      id: `shatterline-ridge-${Math.floor((p.getX(ix[i]) + p.getX(ix[i + 1]) + p.getX(ix[i + 2])) / 3000)}-${Math.floor((p.getZ(ix[i]) + p.getZ(ix[i + 1]) + p.getZ(ix[i + 2])) / 1800)}`,
      kind: 'terrain',
      points: [ix[i], ix[i + 1], ix[i + 2]].map((n) => [
        p.getX(n),
        p.getY(n),
        p.getZ(n),
      ]),
    });
  geometry.dispose();
  return triangles;
}
