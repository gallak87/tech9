import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLevel2Track } from '../track/model.js';
import { createRouteClearance } from '../../../environment/placement.js';
import { createOrbitalEnvironment } from './index.js';
import { createParts } from './geometry.js';

test('beveled unit shells match the authored unit dimensions so facade detail stays outside', () => {
  const parts = createParts();
  parts.add('panel', 'ceramic', [0, 0, 0]);
  const size = parts.entries[0].geometry.boundingBox.getSize(
    new THREE.Vector3(),
  );
  for (const axis of ['x', 'y', 'z'])
    assert.ok(Math.abs(size[axis] - 1) < 1e-6, axis);
  parts.dispose();
});

test('every complete orbital assembly clears the rolled road, ship, and camera for the full circuit', () => {
  const track = createLevel2Track();
  const environment = createOrbitalEnvironment(track);
  const report = environment.userData.clearanceReport;
  const clearance = createRouteClearance(track);
  assert.ok(report.sampleCount >= 560);
  assert.equal(report.placements.length, 14);
  let checked = 0;
  for (const site of report.placements) {
    for (const [min, max] of site.bounds) {
      assert.equal(
        clearance.clears(
          (min[0] + max[0]) / 2,
          (min[2] + max[2]) / 2,
          max[0] - min[0],
          max[2] - min[2],
          max[1],
          0,
          min[1],
        ),
        true,
        `${site.name} part ${checked} meets driving envelope`,
      );
      checked += 1;
    }
  }
  assert.ok(
    checked > 2000,
    'clearance covers construction details as well as major hulls',
  );
  assert.equal(checked, environment.userData.metrics.primitiveCount);
  environment.userData.dispose();
});

test('orbital scenery stays within source budget and detail visibility preserves major silhouettes', () => {
  const track = createLevel2Track();
  const environment = createOrbitalEnvironment(track);
  const { meshCount, triangleCount } = environment.userData.metrics;
  assert.ok(meshCount <= 180, `${meshCount} draw batches`);
  assert.ok(triangleCount < 550000, `${triangleCount} source triangles`);
  environment.userData.update(new THREE.Vector3(5000, 5000, 5000), 0);
  let structures = 0,
    hiddenDetails = 0;
  environment.traverse((node) => {
    if (!node.isMesh) return;
    assert.ok(node.geometry.attributes.position.array.every(Number.isFinite));
    if (node.name.endsWith(':structure')) {
      assert.equal(node.visible, true);
      structures += 1;
    } else if (!node.visible) hiddenDetails += 1;
  });
  assert.ok(structures > 50);
  assert.ok(hiddenDetails > 10);
  const borrowedProbe = new THREE.Texture();
  let borrowedDisposals = 0;
  borrowedProbe.addEventListener('dispose', () => {
    borrowedDisposals += 1;
  });
  environment.userData.setReflection(borrowedProbe);
  const geometries = new Set(),
    materials = new Set();
  const textures = new Set();
  let disposedGeometries = 0,
    disposedMaterials = 0;
  let disposedTextures = 0;
  environment.traverse((node) => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    materials.add(node.material);
  });
  for (const geometry of geometries)
    geometry.addEventListener('dispose', () => {
      disposedGeometries += 1;
    });
  for (const material of materials) {
    assert.equal(material.envMap, borrowedProbe);
    for (const value of Object.values(material))
      if (value?.isTexture && value !== borrowedProbe) textures.add(value);
    material.addEventListener('dispose', () => {
      disposedMaterials += 1;
    });
  }
  assert.equal(textures.size, environment.userData.metrics.textures);
  for (const texture of textures)
    texture.addEventListener('dispose', () => {
      disposedTextures += 1;
    });
  environment.userData.dispose();
  environment.userData.dispose();
  assert.equal(disposedGeometries, geometries.size);
  assert.equal(disposedMaterials, materials.size);
  assert.equal(disposedTextures, textures.size);
  assert.equal(
    borrowedDisposals,
    0,
    'renderer retains ownership of the shared scene reflection',
  );
  borrowedProbe.dispose();
  assert.equal(borrowedDisposals, 1);
});
