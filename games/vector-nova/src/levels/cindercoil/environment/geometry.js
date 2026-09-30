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

export function createCalderaTerrain(track, material) {
  const center = track.bounds.getCenter(new T.Vector3());
  center.y = 0;
  const route = Array.from(
    { length: Math.ceil(track.length / 12) },
    (_, i) => track.sample(i * 12).position,
  );
  const size = 3400;
  const geometry = new T.PlaneGeometry(size, size, 148, 148).rotateX(
    -Math.PI / 2,
  );
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const cold = new T.Color('#515e6d'),
    pale = new T.Color('#89939a'),
    warm = new T.Color('#665f5c');
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i) + center.x,
      z = positions.getZ(i) + center.z;
    const radius = Math.hypot(x - center.x, z - center.z);
    const a = Math.atan2(z - center.z, x - center.x);
    const rim = 680 + 95 * Math.sin(a * 3.1) + 47 * Math.cos(a * 7);
    const radial = T.MathUtils.smoothstep(radius, rim - 140, rim + 410);
    const strata =
      23 * Math.sin(x * 0.014 + z * 0.007) +
      13 * Math.sin(z * 0.028 - x * 0.009);
    let y =
      -45 + radial * (440 + 80 * Math.sin(a * 5)) + strata * (0.21 + radial);
    const shelf = Math.floor(y / 34) * 34;
    y = T.MathUtils.lerp(y, shelf, radial * 0.52);
    for (const point of route) {
      const d = Math.hypot(x - point.x, z - point.z);
      if (d < 82) y = Math.min(y, point.y - 50 + Math.max(0, d - 35) * 0.18);
    }
    positions.setXYZ(i, x, y, z);
    const color = cold
      .clone()
      .lerp(pale, radial * 0.52 + 0.1 * Math.sin(x * 0.035))
      .lerp(warm, Math.max(0, -y) / 220);
    colors.set(color.toArray(), i * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Cindercoil / layered caldera floor and ash rim';
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
