import * as T from 'three';

export function seededRandom(seed = 6193) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function disposeOwned(group, extraGroups = [], extraMaterials = []) {
  const geometries = new Set();
  const materials = new Set(extraMaterials);
  const textures = new Set();
  for (const root of [group, ...extraGroups])
    root?.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [node.material].flat().filter(Boolean))
        materials.add(material);
    });
  for (const material of materials) {
    for (const [key, value] of Object.entries(material))
      if (value?.isTexture && key !== 'envMap') textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  group.clear();
}

function terrainNoise(x, z) {
  const hash = (a, b) => {
    const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const ix = Math.floor(x),
    iz = Math.floor(z);
  let fx = x - ix,
    fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  return T.MathUtils.lerp(
    T.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), fx),
    T.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx),
    fz,
  );
}

export function createCalderaHeight(track) {
  const center = track.bounds.getCenter(new T.Vector3());
  const route = Array.from(
    { length: Math.ceil(track.length / 10) },
    (_, i) => track.sample(i * 10).position,
  );
  const basin = track.landmarks.basin;
  const rupture = track.landmarks.rupture;
  return (x, z) => {
    const radius = Math.hypot(x - center.x, z - center.z);
    const a = Math.atan2(z - center.z, x - center.x);
    const warp = terrainNoise(x * 0.0023, z * 0.0023) * 180;
    const rim = 670 + 68 * Math.sin(a * 3.1) + warp;
    const radial = T.MathUtils.smoothstep(radius, rim - 230, rim + 390);
    const broad = terrainNoise(x * 0.005, z * 0.005);
    const mid = terrainNoise(x * 0.017 + broad * 2, z * 0.017 - broad);
    const fine = terrainNoise(x * 0.045, z * 0.045);
    let y =
      -49 +
      radial * (360 + broad * 220) +
      (mid - 0.5) * (12 + radial * 82) +
      (fine - 0.5) * (5 + radial * 22);
    const mounds = [
      [310, -180, 210, 230],
      [-360, -470, 125, 180],
      [100, 290, 154, 210],
      [-320, 210, 145, 130],
    ];
    for (const [mx, mz, height, width] of mounds) {
      const distance = Math.hypot(x - mx, z - mz) / width;
      y += Math.exp(-distance * distance * 1.8) * height * (0.6 + broad * 0.65);
    }
    const poolDistance = Math.hypot(
      (x - basin.center[0]) / (basin.radius * 1.6),
      (z - basin.center[2]) / (basin.radius * 1.23),
    );
    const plungeDistance = Math.hypot(
      (x - rupture.position[0] - 95) / 143,
      (z - rupture.position[2]) / 205,
    );
    const pool = Math.min(poolDistance, plungeDistance);
    y = T.MathUtils.lerp(
      -49 + (fine - 0.5) * 5,
      y,
      T.MathUtils.smoothstep(pool, 0.78, 1.23),
    );
    for (const point of route) {
      const d = Math.hypot(x - point.x, z - point.z);
      if (d < 86) y = Math.min(y, point.y - 55 + Math.max(0, d - 35) * 0.15);
    }
    return y;
  };
}

export function createCalderaTerrain(
  track,
  material,
  heightAt = createCalderaHeight(track),
) {
  const center = track.bounds.getCenter(new T.Vector3());
  const geometry = new T.PlaneGeometry(3200, 3200, 192, 192).rotateX(
    -Math.PI / 2,
  );
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const cold = new T.Color('#3b4248'),
    ash = new T.Color('#6b6a65'),
    oxide = new T.Color('#48382e');
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i) + center.x,
      z = positions.getZ(i) + center.z;
    const y = heightAt(x, z);
    positions.setXYZ(i, x, y, z);
    const n = terrainNoise(x * 0.008, z * 0.008);
    const color = cold
      .clone()
      .lerp(ash, Math.pow(n, 2) * 0.66)
      .lerp(oxide, Math.max(0, 0.35 - n));
    colors.set(color.toArray(), i * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Cindercoil / weathered caldera, scoria slopes and ash shelves';
  mesh.receiveShadow = true;
  return mesh;
}

export function createLavaPool(radiusX, radiusZ, material, seed = 3) {
  const random = seededRandom(seed);
  const segments = 96,
    rings = 14;
  const outline = Array.from(
    { length: segments },
    () => 0.94 + random() * 0.09,
  );
  const vertices = [],
    indices = [];
  for (let r = 0; r <= rings; r += 1)
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2,
        t = r / rings;
      const edge = outline[i % segments];
      vertices.push(
        Math.cos(a) * radiusX * t * edge,
        -0.7 + Math.sin(a * 7 + r * 0.7) * 0.6 * t,
        Math.sin(a) * radiusZ * t * edge,
      );
    }
  for (let r = 0; r < rings; r += 1)
    for (let i = 0; i < segments; i += 1) {
      const a = r * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Cindercoil / rough crusted molten basin';
  return mesh;
}
