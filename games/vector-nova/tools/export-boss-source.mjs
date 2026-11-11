import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Box3, Matrix3, Matrix4, Vector3 } from 'three';
import { createBossTarget } from '../src/ships/boss-targets.js';
import { getBossHull } from '../src/ships/boss-hulls.js';

// CPU-only snapshot of authored geometry. The optional Blender finish pipeline
// consumes this file; no browser, current factory or production asset changes.
const options = { ship: 'goliath', quality: 'high', out: null, match: null };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--help') {
    console.log(
      'node tools/export-boss-source.mjs --ship goliath|wraith|bulwark [--quality high|low] [--out FILE] [--match REGEX]',
    );
    process.exit(0);
  }
  const [key, value] = process.argv[i].replace(/^--/, '').split('=');
  if (!Object.hasOwn(options, key))
    throw new Error('Unknown option: ' + process.argv[i]);
  options[key] = value ?? process.argv[++i];
}
if (
  !['goliath', 'wraith', 'bulwark'].includes(options.ship) ||
  !['high', 'low'].includes(options.quality)
)
  throw new Error('Unknown ship or quality');
const filter = options.match ? new RegExp(options.match, 'i') : null;
const target = createBossTarget(options.ship, {
  quality: options.quality,
  reducedMotion: true,
});
const body = target.group.children.find((child) =>
  child.name.endsWith('chassis'),
);
if (!body) throw new Error('Cannot locate boss chassis');
try {
  target.group.updateMatrixWorld(true);
  const inverse = target.group.matrixWorld.clone().invert();
  const surfaces = [],
    surfaceIndices = new Map(),
    meshes = [];
  const materialIndex = (material) => {
    if (surfaceIndices.has(material)) return surfaceIndices.get(material);
    const index = surfaces.length;
    surfaceIndices.set(material, index);
    surfaces.push({
      name: material.name,
      finish: material.userData.bossFinish ?? null,
      color: material.color.toArray(),
      metalness: material.metalness ?? 0,
      roughness: material.roughness ?? 0.5,
      clearcoat: material.clearcoat ?? 0,
      clearcoatRoughness: material.clearcoatRoughness ?? 0,
      anisotropy: material.anisotropy ?? 0,
      anisotropyRotation: material.anisotropyRotation ?? 0,
      ior: material.ior ?? 1.5,
      side: material.side,
      emissive: material.emissive?.toArray() ?? [0, 0, 0],
      emissiveIntensity: material.emissiveIntensity ?? 0,
      opacity: material.opacity,
      transparent: material.transparent,
    });
    return index;
  };
  const point = new Vector3(),
    normal = new Vector3(),
    instance = new Matrix4();
  function snapshot(object, transform, suffix = '') {
    if (filter && !filter.test(object.name)) return;
    const geometry = object.geometry,
      p = geometry.attributes.position,
      n = geometry.attributes.normal;
    if (!p || !n)
      throw new Error('Position and normals required: ' + object.name);
    const normalMatrix = new Matrix3().getNormalMatrix(transform);
    const positions = [],
      normals = [];
    for (let vertex = 0; vertex < p.count; vertex++) {
      point.fromBufferAttribute(p, vertex).applyMatrix4(transform);
      normal.fromBufferAttribute(n, vertex).applyNormalMatrix(normalMatrix);
      positions.push(...point.toArray());
      normals.push(...normal.toArray());
    }
    const indices = geometry.index
      ? Array.from(geometry.index.array)
      : Array.from({ length: p.count }, (_, index) => index);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: indices.length, materialIndex: 0 }];
    for (const entry of groups) {
      const surface = materials[entry.materialIndex ?? 0];
      const triangles = indices.slice(entry.start, entry.start + entry.count);
      if (triangles.length % 3 || !triangles.length)
        throw new Error('Triangle group required: ' + object.name);
      meshes.push({
        name:
          object.name +
          suffix +
          (groups.length > 1 ? ' / surface ' + entry.materialIndex : ''),
        contactPart: object.userData.contactPart ?? null,
        material: materialIndex(surface),
        positions,
        normals,
        indices: triangles,
      });
    }
  }
  body.traverse((object) => {
    if (!object.isMesh) return;
    const transform = inverse.clone().multiply(object.matrixWorld);
    if (object.isInstancedMesh) {
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, instance);
        snapshot(
          object,
          transform.clone().multiply(instance),
          ' / instance ' + index,
        );
      }
    } else snapshot(object, transform);
  });
  if (!meshes.length) throw new Error('No meshes matched');
  const anchors = target.group.children
    .filter((child) => /^Exhaust_[LRC]$/.test(child.name))
    .map((child) => ({
      name: child.name,
      position: child.position.toArray(),
      quaternion: child.quaternion.toArray(),
    }));
  const bounds = new Box3().setFromObject(body);
  const document = {
    format: 'vector-nova-boss-source',
    version: 1,
    ship: options.ship,
    quality: options.quality,
    chassisName: body.name,
    coordinates:
      'Three.js metres: +Y up, +Z forward; Blender importer maps (x,y,z) to (x,-z,y)',
    hullSha256: getBossHull(options.ship).hullSha256,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    anchors,
    surfaces,
    meshes,
  };
  document.sourceSha256 = createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex');
  const out = resolve(
    options.out ?? '.experiments/boss-finish/' + options.ship + '/source.json',
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(document));
  console.log(
    JSON.stringify({
      out,
      ship: options.ship,
      meshes: meshes.length,
      materials: surfaces.length,
      triangles: meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0),
      bounds: document.bounds,
      sourceSha256: document.sourceSha256,
    }),
  );
} finally {
  target.dispose();
}
