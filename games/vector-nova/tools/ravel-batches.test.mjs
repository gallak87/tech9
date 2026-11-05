import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
} from 'three';
import { batchRavelRoad } from '../src/levels/ravel/track/batches.js';

function chunk(material, x = 0, deforming = false, driving = true) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [x - 1, -1, -10, x + 1, -1, -10, x + 1, 1, -10, x - 1, 1, -10],
      3,
    ),
  );
  geometry.setAttribute(
    'roadCoord',
    new Float32BufferAttribute([x, -1, x + 2, -1, x + 2, 1, x, 1], 2),
  );
  for (const name of [
    'ravelWave',
    'ravelWaveUp',
    'ravelDs',
    'ravelDx',
    'ravelUpDs',
    'ravelGradient',
  ]) {
    geometry.setAttribute(
      name,
      new Float32BufferAttribute([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3], 3),
    );
  }
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 12;
  const mesh = new Mesh(geometry, material);
  mesh.name = `Ravel membrane chunk ${x}`;
  mesh.userData = { drivingSurface: driving, roadSurface: driving, deforming };
  return mesh;
}
function release(entries, batches, materials) {
  for (const batch of batches) batch.dispose();
  for (const mesh of entries) mesh.geometry.dispose();
  for (const material of materials) material.dispose();
}

test('road chunks retain exact packed attributes, indices and padded instance bounds', () => {
  const material = new MeshStandardMaterial();
  const entries = [chunk(material, 0, true), chunk(material, 12, true)];
  const snapshots = entries.map((mesh) => ({
    position: Array.from(mesh.geometry.attributes.position.array),
    sphere: mesh.geometry.boundingSphere.clone(),
  }));
  const batches = batchRavelRoad(entries);
  try {
    assert.equal(batches.length, 1);
    const batch = batches[0];
    assert.equal(batch.name, entries[0].name);
    assert.equal(batch.geometry.attributes.position.count, 8);
    assert.equal(batch.geometry.index.count, 12);
    assert.deepEqual(
      Array.from(batch.geometry.index.array),
      [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
    );
    for (const [name, attribute] of Object.entries(
      entries[0].geometry.attributes,
    )) {
      const packed = batch.geometry.attributes[name];
      assert.equal(packed.itemSize, attribute.itemSize);
      assert.deepEqual(
        Array.from(packed.array),
        entries.flatMap((mesh) =>
          Array.from(mesh.geometry.attributes[name].array),
        ),
      );
      assert.ok(Array.from(packed.array).every(Number.isFinite));
    }
    for (let i = 0; i < entries.length; i++) {
      const sphere = batch.getBoundingSphereAt(i, new Sphere());
      assert.ok(
        sphere.equals(snapshots[i].sphere),
        'the existing +12m wave margin is copied exactly',
      );
      assert.ok(batch.getMatrixAt(i, new Matrix4()).equals(new Matrix4()));
      assert.deepEqual(
        Array.from(entries[i].geometry.attributes.position.array),
        snapshots[i].position,
      );
    }
    entries[0].geometry.attributes.position.setX(0, 999);
    entries[0].geometry.boundingSphere.radius = 999;
    assert.equal(
      batch.geometry.attributes.position.getX(0),
      snapshots[0].position[0],
    );
    assert.equal(
      batch.getBoundingSphereAt(0, new Sphere()).radius,
      snapshots[0].sphere.radius,
    );
  } finally {
    release(entries, batches, [material]);
  }
});

test('four road materials use at most eight driving batches with static and moving passes separated', () => {
  const materials = Array.from({ length: 4 }, () => new MeshStandardMaterial());
  const entries = materials.flatMap((material) => [
    chunk(material, 0, false),
    chunk(material, 10, false),
    chunk(material, 20, true),
    chunk(material, 30, true),
  ]);
  const batches = batchRavelRoad(entries);
  try {
    assert.equal(batches.length, 8);
    for (const batch of batches) {
      assert.equal(batch.userData.chunkCount, 2);
      assert.equal(batch.perObjectFrustumCulled, true);
      assert.equal(batch.sortObjects, false);
      assert.equal(batch.userData.aoExclude, batch.userData.deforming);
      assert.equal(batch.receiveShadow, !batch.userData.deforming);
      assert.equal(
        batch.material,
        entries.find((mesh) => mesh.material === batch.material).material,
      );
    }
    const driving = chunk(materials[0], 0, false);
    const seam = chunk(materials[0], 0, false, false);
    const split = batchRavelRoad([driving, seam]);
    assert.equal(split.length, 2, 'seams do not acquire driving-surface flags');
    release([driving, seam], split, []);
  } finally {
    release(entries, batches, materials);
  }
});

test('per-chunk culling excludes distant road while retaining the visible chunk', () => {
  const material = new MeshStandardMaterial();
  const entries = [chunk(material, 0), chunk(material, 10000)];
  const batches = batchRavelRoad(entries);
  try {
    const batch = batches[0];
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld();
    batch.updateMatrixWorld();
    batch.onBeforeRender(null, new Scene(), camera, batch.geometry, material);
    assert.equal(batch._multiDrawCount, 1);
    assert.equal(batch._multiDrawCounts[0], entries[0].geometry.index.count);
    camera.position.x = 10000;
    camera.updateMatrixWorld();
    batch.onBeforeRender(null, new Scene(), camera, batch.geometry, material);
    assert.equal(batch._multiDrawCount, 1);
    assert.equal(
      batch._multiDrawStarts[0],
      6 * batch.geometry.index.array.BYTES_PER_ELEMENT,
    );
  } finally {
    release(entries, batches, [material]);
  }
});

test('batch disposal releases owned buffers and textures without disposing borrowed sources or materials', () => {
  const material = new MeshStandardMaterial();
  const source = chunk(material);
  let sourceDisposed = 0,
    materialDisposed = 0,
    packedDisposed = 0,
    textureDisposed = 0;
  source.geometry.addEventListener('dispose', () => sourceDisposed++);
  material.addEventListener('dispose', () => materialDisposed++);
  const [batch] = batchRavelRoad([source]);
  batch.geometry.addEventListener('dispose', () => packedDisposed++);
  batch._matricesTexture.addEventListener('dispose', () => textureDisposed++);
  batch._indirectTexture.addEventListener('dispose', () => textureDisposed++);
  batch.dispose();
  assert.equal(packedDisposed, 1);
  assert.equal(textureDisposed, 2);
  assert.equal(sourceDisposed, 0);
  assert.equal(materialDisposed, 0);
  source.geometry.dispose();
  material.dispose();
  assert.deepEqual(batchRavelRoad([]), []);
});
