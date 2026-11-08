import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Matrix3, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLifetime } from '../../core/lifecycle.js';
import { createOrielTrack } from './track/model.js';
import { createGardenSector } from './environment/garden-sector.js';
import manifest from '../../../assets/levels/oriel/blender/garden-sector/manifest.json' with { type: 'json' };
const source = (path) => new URL(`../../../${path}`, import.meta.url);
const bytes = await readFile(source(manifest.export.path));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parse = () =>
  new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
function watch(scene) {
  const resources = new Map();
  scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const item of [mesh.geometry, ...[].concat(mesh.material)]) {
      if (resources.has(item)) continue;
      resources.set(item, 0);
      item.addEventListener('dispose', () =>
        resources.set(item, resources.get(item) + 1),
      );
    }
  });
  return resources;
}
test('Oriel contour gardens match route, legacy terrain and actual export provenance', async () => {
  assert.equal(manifest.geometryVersion, createOrielTrack().geometryVersion);
  assert.equal(hash(bytes), manifest.export.sha256);
  assert.equal(
    hash(
      await readFile(
        source('assets/levels/oriel/blender/ground/height-field.json'),
      ),
    ),
    manifest.terrainSHA256,
  );
  assert.equal(
    hash(
      await readFile(
        source('assets/levels/oriel/blender/garden-sector/route-guides.json'),
      ),
    ),
    manifest.routeGuidesSHA256,
  );
});
test('Oriel contour-garden vertices preserve the whole route envelope and assets release once', async () => {
  const track = createOrielTrack(),
    lifetime = createLifetime();
  let resources;
  const sector = await createGardenSector({
    track,
    lifetime,
    loadAsset: async () => {
      const asset = await parse();
      resources = watch(asset.scene);
      return asset;
    },
  });
  try {
    sector.group.updateMatrixWorld(true);
    const samples = [];
    for (let s = 0; s < track.length; s += 6)
      samples.push(track.sample(s).position);
    let nearest = Infinity;
    const point = new Vector3();
    sector.group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        assert.ok(point.toArray().every(Number.isFinite));
        for (const sample of samples)
          nearest = Math.min(nearest, point.distanceToSquared(sample));
      }
    });
    // Six-metre physical stations bound distance to the continuous centreline
    // conservatively by another three metres between neighbouring samples.
    assert.ok(
      Math.sqrt(nearest) - 3 >= 100,
      `new garden vertex within rig corridor: ${Math.sqrt(nearest) - 3}m`,
    );
    for (const place of [
      ...sector.plantingAnchors,
      ...sector.civicPlacements,
    ]) {
      assert.ok(place.position.toArray().every(Number.isFinite));
      assert.ok(Math.abs(place.quaternion.length() - 1) < 1e-6);
    }
    const center = sector.plantingAnchors[0].position;
    assert.ok(sector.reservation.contains(center));
    const opposite = center.clone();
    opposite.x = -opposite.x;
    opposite.y = 2000 - opposite.y;
    assert.equal(sector.reservation.contains(opposite), false);
  } finally {
    sector.dispose();
    sector.dispose();
    lifetime.dispose();
  }
  assert.ok([...resources.values()].every((count) => count === 1));
});
test('Oriel contour gardens release all decoded geometry/materials on first finish failure', async () => {
  const lifetime = createLifetime();
  let resources;
  await assert.rejects(
    createGardenSector({
      track: createOrielTrack(),
      lifetime,
      loadAsset: async () => {
        const asset = await parse();
        resources = watch(asset.scene);
        return asset;
      },
      stoneMaps: {
        apply() {
          throw new Error('finish unavailable');
        },
      },
    }),
    /finish unavailable/,
  );
  lifetime.dispose();
  assert.ok([...resources.values()].every((count) => count === 1));
});

test('Oriel contour soil shares legacy UVs and smooth normals without owning its borrowed material', async () => {
  const lifetime = createLifetime();
  const borrowed = new MeshStandardMaterial();
  let borrowedDisposals = 0;
  borrowed.addEventListener('dispose', () => borrowedDisposals++);
  const sector = await createGardenSector({
    track: createOrielTrack(),
    lifetime,
    terrainMaterial: borrowed,
    loadAsset: parse,
  });
  const normals = new Map();
  let soilMeshes = 0;
  try {
    sector.group.updateMatrixWorld(true);
    sector.group.traverse((mesh) => {
      if (!mesh.isMesh || mesh.material !== borrowed) return;
      soilMeshes++;
      const { position, normal, uv } = mesh.geometry.attributes;
      const transform = new Matrix3().getNormalMatrix(mesh.matrixWorld);
      const point = new Vector3(),
        direction = new Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        direction
          .fromBufferAttribute(normal, i)
          .applyMatrix3(transform)
          .normalize();
        assert.ok(
          Math.abs(
            uv.getX(i) * Math.PI * 2 - Math.atan2(point.x, 1000 - point.y),
          ) < 0.00005,
          'legacy circumferential UV',
        );
        assert.ok(
          Math.abs(uv.getY(i) * 4800 - 2400 - point.z) < 0.01,
          'legacy axial UV',
        );
        const key = point
          .toArray()
          .map((value) => Math.round(value * 10000))
          .join(':');
        const previous = normals.get(key);
        if (previous)
          assert.ok(
            previous.dot(direction) > 0.999,
            'soil normals remain smooth across export/material batches',
          );
        else normals.set(key, direction.clone());
      }
    });
    assert.equal(soilMeshes, 2);
  } finally {
    sector.dispose();
    lifetime.dispose();
  }
  assert.equal(borrowedDisposals, 0);
  borrowed.dispose();
});
